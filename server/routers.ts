import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import { conversations, jobs, jobResponses, messages, notifications, ratings, reports, users, workerProfiles, workerSkills } from "../drizzle/schema";
import { createJobId, createNotification, createReportId, findMatchingFundis, getConversationAccess, getConversationMessages, getDashboardData, getInbox, getJobResponders, getNotifications, getWorkerProfile, isJobClient, JOB_STATUSES, PILOT_TRADES } from "./mjengo";
import { assertAuthEmailConfigured, escapeHtml, notifyConversationEvent, notifyJobCreated, sendAuthEmail } from "./emailNotifications";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { endSupabaseSession, setSessionCookies } from "./_core/auth";
import { createSupabaseAdminClient, createSupabaseClient } from "./_core/supabase";
import { AVATAR_CONTENT_TYPES, getAvatarUrl, removeAvatar, uploadAvatar } from "./profilePhoto";
import type { TrpcContext } from "./_core/context";

const tradeSchema = z.enum(PILOT_TRADES);
const statusSchema = z.enum(JOB_STATUSES);
const coordinates = {
  latitudeE6: z.number().int().min(-90_000_000).max(90_000_000).nullable().optional(),
  longitudeE6: z.number().int().min(-180_000_000).max(180_000_000).nullable().optional(),
};

class AuthLinkGenerationError extends Error {
  constructor(message: string, readonly code: string, cause?: unknown) {
    super(message, { cause });
    this.name = "AuthLinkGenerationError";
  }
}

async function requestAuthLink<T>(request: () => Promise<T>, purpose: "signup" | "confirmation" | "recovery") {
  try {
    return await request();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new AuthLinkGenerationError(
      `Supabase ${purpose} link request failed before returning a response: ${detail}`,
      `SUPABASE_${purpose.toUpperCase()}_NETWORK_ERROR`,
      error,
    );
  }
}

function isExistingEmailError(error: { code?: string; message?: string }) {
  return error.code === "email_exists"
    || error.code === "user_already_exists"
    || /already (been )?registered|already exists/i.test(error.message ?? "");
}

async function findUserByEmail(email: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  return user;
}

function sendConversationEmail(payload: Parameters<typeof notifyConversationEvent>[0]) {
  void notifyConversationEvent(payload).catch(error => {
    console.warn("[notifications] conversation email failed", error instanceof Error ? error.message : error);
  });
}

function normalizeDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function requireFutureDate(value: string) {
  const dateKey = normalizeDateKey(value);
  if (!dateKey) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid start date" });
  if (dateKey < new Date().toISOString().slice(0, 10)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The start date cannot be in the past" });
  }
  return dateKey;
}

function requireRole(role: string | null | undefined, allowed: string[]) {
  const normalized = role === "user" ? "client" : role;
  if (!normalized) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  if (!allowed.includes(normalized)) throw new TRPCError({ code: "FORBIDDEN", message: "This action is not available for your account role" });
  return normalized;
}

function money(value: string) {
  const amount = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) throw new Error("Enter a valid proposed pay amount");
  return Math.round(amount);
}

function getAuthRedirectUrl(req: TrpcContext["req"], authAction: "email-confirmed" | "password-reset") {
  const allowedOrigins = (process.env.CORS_ORIGINS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  const origin = req.get("origin") || allowedOrigins[0];
  if (!origin || !allowedOrigins.includes(origin)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This site is not allowed to start an authentication flow" });
  }
  const redirectUrl = new URL("/", origin);
  redirectUrl.searchParams.set("auth", authAction);
  return redirectUrl.toString();
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return null;
      return { ...ctx.user, avatarUrl: await getAvatarUrl(ctx.user) };
    }),
    register: publicProcedure.input(z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(320).transform(value => value.toLowerCase()),
      password: z.string().min(8).max(128),
      location: z.string().trim().min(2).max(255),
      role: z.enum(["client", "fundi"]).default("client"),
      phone: z.string().trim().max(32).optional(),
      trades: z.array(tradeSchema).min(1).max(6).optional(),
    })).mutation(async ({ ctx, input }) => {
      assertAuthEmailConfigured(input.email);
      const supabase = createSupabaseAdminClient();
      const redirectTo = getAuthRedirectUrl(ctx.req, "email-confirmed");
      const { data, error } = await requestAuthLink(
        () => supabase.auth.admin.generateLink({
          type: "signup",
          email: input.email,
          password: input.password,
          options: { data: { name: input.name, location: input.location, role: input.role, phone: input.phone ?? null, trades: input.trades ?? [] }, redirectTo },
        }),
        "signup",
      );
      if (error) {
        if (isExistingEmailError(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This email is already registered. If it is not verified yet, use 'Resend confirmation email' below to get a new link, or sign in if you have already confirmed it.",
          });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      }
      const actionLink = data?.properties?.action_link;
      if (!actionLink) {
        throw new AuthLinkGenerationError("Supabase did not return the expected authentication link", "SUPABASE_AUTH_LINK_MISSING");
      }
      const db = await getDb();
      if (db) {
        const where = data.user?.id ? eq(users.authUserId, data.user.id) : sql`lower(${users.email}) = ${input.email}`;
        const [account] = await db.select({ id: users.id }).from(users).where(where).limit(1);
        if (account) {
          await db.update(users).set({ location: input.location, role: input.role, updatedAt: new Date() }).where(eq(users.id, account.id));
          if (input.role === "fundi" && input.trades?.length) {
            const [existingProfile] = await db.select({ id: workerProfiles.id }).from(workerProfiles).where(eq(workerProfiles.userId, account.id)).limit(1);
            const profileValues = {
              phone: input.phone ?? null,
              serviceArea: input.location,
              availability: 1,
              updatedAt: new Date(),
            };
            let workerId = existingProfile?.id;
            if (workerId) await db.update(workerProfiles).set(profileValues).where(eq(workerProfiles.id, workerId));
            else workerId = (await db.insert(workerProfiles).values({ userId: account.id, ...profileValues }).returning({ id: workerProfiles.id }))[0]?.id;
            if (workerId) {
              await db.delete(workerSkills).where(eq(workerSkills.workerId, workerId));
              await db.insert(workerSkills).values(input.trades.map(trade => ({ workerId: workerId!, trade })));
            }
          }
        }
      }
      await sendAuthEmail({
        to: input.email,
        subject: "Confirm your MjengoLink email",
        text: `Hi ${input.name},\n\nConfirm your email address to activate your MjengoLink account:\n${actionLink}\n\nIf you did not create this account, you can ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d2925"><p>Hi ${escapeHtml(input.name)},</p><p>Confirm your email address to activate your MjengoLink account.</p><p><a href="${escapeHtml(actionLink)}" style="display:inline-block;padding:12px 18px;background:#0b5d43;color:#fff;text-decoration:none">Confirm email</a></p><p>If you did not create this account, you can ignore this email.</p></div>`,
      });
      return { success: true, confirmationRequired: true };
    }),
    login: publicProcedure.input(z.object({
      email: z.string().trim().email().max(320).transform(value => value.toLowerCase()),
      password: z.string().min(1).max(128),
    })).mutation(async ({ ctx, input }) => {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (error?.code === "email_not_confirmed" || (data.user && !data.user.email_confirmed_at)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Confirm your email address before signing in. Check your inbox for the confirmation link." });
      }
      if (error || !data.session || !data.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      setSessionCookies(ctx.req, ctx.res, data.session);
      return { success: true };
    }),
    resendConfirmation: publicProcedure.input(z.object({
      email: z.string().trim().email().max(320).transform(value => value.toLowerCase()),
    })).mutation(async ({ ctx, input }) => {
      if (!(await findUserByEmail(input.email))) return { success: true };
      assertAuthEmailConfigured(input.email);
      const supabase = createSupabaseAdminClient();
      const redirectTo = getAuthRedirectUrl(ctx.req, "email-confirmed");
      const { data, error } = await requestAuthLink(
        () => supabase.auth.admin.generateLink({
          type: "magiclink",
          email: input.email,
          options: { redirectTo },
        }),
        "confirmation",
      );
      if (error) {
        if (error.code === "user_not_found") return { success: true };
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      }
      const actionLink = data?.properties?.action_link;
      if (!actionLink) {
        throw new AuthLinkGenerationError("Supabase did not return the expected authentication link", "SUPABASE_AUTH_LINK_MISSING");
      }
      await sendAuthEmail({
        to: input.email,
        subject: "Confirm your MjengoLink email",
        text: `Confirm your email address to continue using MjengoLink:\n${actionLink}\n\nIf you did not request this email, you can ignore it.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d2925"><p>Confirm your email address to continue using MjengoLink.</p><p><a href="${escapeHtml(actionLink)}" style="display:inline-block;padding:12px 18px;background:#0b5d43;color:#fff;text-decoration:none">Confirm email</a></p><p>If you did not request this email, you can ignore it.</p></div>`,
      });
      return { success: true };
    }),
    requestPasswordReset: publicProcedure.input(z.object({
      email: z.string().trim().email().max(320).transform(value => value.toLowerCase()),
    })).mutation(async ({ ctx, input }) => {
      assertAuthEmailConfigured(input.email);
      const supabase = createSupabaseAdminClient();
      const redirectTo = getAuthRedirectUrl(ctx.req, "password-reset");
      const { data, error } = await requestAuthLink(
        () => supabase.auth.admin.generateLink({
          type: "recovery",
          email: input.email,
          options: { redirectTo },
        }),
        "recovery",
      );
      if (error) {
        if (error.code === "user_not_found") return { success: true };
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      }
      const actionLink = data?.properties?.action_link;
      if (!actionLink) {
        throw new AuthLinkGenerationError("Supabase did not return the expected authentication link", "SUPABASE_AUTH_LINK_MISSING");
      }
      await sendAuthEmail({
        to: input.email,
        subject: "Reset your MjengoLink password",
        text: `Use this secure link to reset your MjengoLink password:\n${actionLink}\n\nIf you did not request a password reset, you can ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d2925"><p>Use this secure link to reset your MjengoLink password.</p><p><a href="${escapeHtml(actionLink)}" style="display:inline-block;padding:12px 18px;background:#0b5d43;color:#fff;text-decoration:none">Reset password</a></p><p>If you did not request a password reset, you can ignore this email.</p></div>`,
      });
      return { success: true };
    }),
    updatePassword: publicProcedure.input(z.object({
      accessToken: z.string().min(1).max(4096),
      refreshToken: z.string().min(1).max(4096),
      password: z.string().min(8).max(128),
    })).mutation(async ({ input }) => {
      const supabase = createSupabaseClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: input.accessToken,
        refresh_token: input.refreshToken,
      });
      if (sessionError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This password reset link is invalid or expired. Request a new one." });
      }
      const { error } = await supabase.auth.updateUser({ password: input.password });
      if (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      }
      return { success: true };
    }),
    setRole: protectedProcedure.input(z.object({ role: z.enum(["client", "fundi"]) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role === "admin") return { role: "admin" as const };
      if (ctx.user.role !== "user" && ctx.user.role !== input.role) {
        throw new Error("Your account role is already set");
      }
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      await db.update(users).set({ role: input.role, updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
      return { role: input.role };
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      await endSupabaseSession(ctx.req, ctx.res);
      return { success: true } as const;
    }),
  }),
  dashboard: protectedProcedure.query(({ ctx }) => getDashboardData(ctx.user)),
  profile: router({
    me: protectedProcedure.query(({ ctx }) => getWorkerProfile(ctx.user.id)),
    update: protectedProcedure.input(z.object({
      phone: z.string().trim().max(32).optional(),
      experience: z.string().trim().max(500).optional(),
      serviceArea: z.string().trim().min(2).max(255),
      availability: z.boolean(),
      summary: z.string().trim().max(600).optional(),
      trades: z.array(tradeSchema).min(1).max(6),
      ...coordinates,
    })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, ["fundi", "admin"]);
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      const existing = await getWorkerProfile(ctx.user.id);
      const profileValues = {
        phone: input.phone ?? null,
        experience: input.experience ?? null,
        serviceArea: input.serviceArea,
        availability: input.availability ? 1 : 0,
        summary: input.summary ?? null,
        latitudeE6: input.latitudeE6 ?? null,
        longitudeE6: input.longitudeE6 ?? null,
        updatedAt: new Date(),
      };
      let workerId = existing?.profile.id;
      if (workerId) await db.update(workerProfiles).set(profileValues).where(eq(workerProfiles.id, workerId));
      else {
        const inserted = await db.insert(workerProfiles).values({ userId: ctx.user.id, ...profileValues }).returning({ id: workerProfiles.id });
        workerId = inserted[0]?.id;
      }
      if (!workerId) throw new Error("Unable to save fundi profile");
      await db.delete(workerSkills).where(eq(workerSkills.workerId, workerId));
      await db.insert(workerSkills).values(input.trades.map(trade => ({ workerId: workerId!, trade })));
      return getWorkerProfile(ctx.user.id);
    }),
    availability: protectedProcedure.input(z.object({ available: z.boolean() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, ["fundi"]);
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      const profile = await getWorkerProfile(ctx.user.id);
      if (!profile) throw new Error("Create your fundi profile first");
      await db.update(workerProfiles).set({ availability: input.available ? 1 : 0, updatedAt: new Date() }).where(eq(workerProfiles.userId, ctx.user.id));
      return { available: input.available };
    }),
    updatePhoto: protectedProcedure.input(z.object({
      photo: z.string().min(1).max(7_000_000),
      contentType: z.enum(AVATAR_CONTENT_TYPES),
    })).mutation(async ({ ctx, input }) => {
      let path: string;
      try {
        path = await uploadAvatar(ctx.user, input.photo, input.contentType);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "The photo could not be uploaded" });
      }
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      await db.update(users).set({ avatarPath: path, updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
      return { avatarUrl: await getAvatarUrl({ ...ctx.user, avatarPath: path }) };
    }),
    removePhoto: protectedProcedure.mutation(async ({ ctx }) => {
      await removeAvatar(ctx.user);
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      await db.update(users).set({ avatarPath: null, updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
      return { avatarUrl: null };
    }),
  }),
  jobs: router({
    create: protectedProcedure.input(z.object({
      title: z.string().trim().min(3).max(160),
      trade: tradeSchema,
      description: z.string().trim().min(10).max(3000),
      locationText: z.string().trim().min(2).max(255),
      budget: z.string().trim().min(1),
      startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid start date"),
      contactPreference: z.enum(["Call me", "Text me", "Either"]),
      radiusKm: z.number().int().min(1).max(50).default(10),
      ...coordinates,
    })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, ["client"]);
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      const startDate = requireFutureDate(input.startDate);
      const [sameDayJob] = await db.select({ id: jobs.id }).from(jobs)
        .where(and(eq(jobs.clientId, ctx.user.id), eq(jobs.startDate, startDate), ne(jobs.status, "Cancelled")))
        .limit(1);
      if (sameDayJob) throw new TRPCError({ code: "CONFLICT", message: "You already have a job scheduled for that day" });
      const jobId = createJobId();
      const budgetAmount = money(input.budget);
      await db.insert(jobs).values({
        id: jobId,
        clientId: ctx.user.id,
        title: input.title,
        trade: input.trade,
        description: input.description,
        locationText: input.locationText,
        latitudeE6: input.latitudeE6 ?? null,
        longitudeE6: input.longitudeE6 ?? null,
        radiusKm: input.radiusKm,
        budgetAmount,
        startDate,
        contactPreference: input.contactPreference,
        status: "Posted",
      });
      const matches = await findMatchingFundis(jobId);
      const admins = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
      const notification = await notifyJobCreated({
        job: { id: jobId, title: input.title, trade: input.trade, location: input.locationText, budget: `KSh ${budgetAmount.toLocaleString("en-KE")}`, startDate, description: input.description },
        client: { name: ctx.user.name ?? "MjengoLink client", email: ctx.user.email ?? "" },
        eligibleFundis: matches,
        admin: admins[0]?.email ? { name: admins[0].name ?? "MjengoLink admin", email: admins[0].email } : undefined,
      });
      return { jobId, matches: matches.length, notification };
    }),
    update: protectedProcedure.input(z.object({
      jobId: z.string().min(3).max(32),
      title: z.string().trim().min(3).max(160),
      trade: tradeSchema,
      description: z.string().trim().min(10).max(3000),
      locationText: z.string().trim().min(2).max(255),
      budget: z.string().trim().min(1),
      startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid start date"),
      contactPreference: z.enum(["Call me", "Text me", "Either"]),
      radiusKm: z.number().int().min(1).max(50).default(10),
      ...coordinates,
    })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, ["client"]);
      if (!(await isJobClient(input.jobId, ctx.user.id))) throw new Error("You can only edit your own jobs");
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
      if (!job) throw new Error("Job not found");
      if (!["Posted", "Interested"].includes(job.status)) throw new Error("Only open jobs can be edited");
      const startDate = requireFutureDate(input.startDate);
      const [sameDayJob] = await db.select({ id: jobs.id }).from(jobs)
        .where(and(eq(jobs.clientId, ctx.user.id), eq(jobs.startDate, startDate), ne(jobs.id, input.jobId), ne(jobs.status, "Cancelled")))
        .limit(1);
      if (sameDayJob) throw new TRPCError({ code: "CONFLICT", message: "You already have a job scheduled for that day" });
      const budgetAmount = money(input.budget);
      await db.update(jobs).set({ title: input.title, trade: input.trade, description: input.description, locationText: input.locationText, latitudeE6: input.latitudeE6 ?? null, longitudeE6: input.longitudeE6 ?? null, radiusKm: input.radiusKm, budgetAmount, startDate, contactPreference: input.contactPreference, updatedAt: new Date() }).where(eq(jobs.id, input.jobId));
      return { success: true as const, jobId: input.jobId };
    }),
    updateStatus: protectedProcedure.input(z.object({ jobId: z.string().min(3).max(32), status: statusSchema })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, ["client"]);
      if (!(await isJobClient(input.jobId, ctx.user.id))) throw new Error("You can only update your own jobs");
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
      if (!job) throw new Error("Job not found");
      const allowed: Record<string, string[]> = {
        Posted: ["Interested", "Assigned", "Cancelled"],
        Interested: ["Accepted", "Assigned", "Cancelled"],
        Accepted: ["Assigned", "Cancelled"],
        Assigned: ["In progress", "Cancelled"],
        "In progress": ["Completed", "Cancelled"],
        Completed: [],
        Cancelled: [],
      };
      if (!allowed[job.status]?.includes(input.status)) throw new Error(`Cannot move a ${job.status} job to ${input.status}`);
      await db.update(jobs).set({ status: input.status, updatedAt: new Date() }).where(eq(jobs.id, input.jobId));
      return { success: true as const };
    }),
    respond: protectedProcedure.input(z.object({ jobId: z.string().min(3).max(32) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, ["fundi"]);
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      const profile = await getWorkerProfile(ctx.user.id);
      if (!profile) throw new Error("Create your fundi profile before responding to jobs");
      const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
      if (!job || ["Completed", "Cancelled"].includes(job.status)) throw new Error("This job is no longer open");
      if (job.clientId === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot show interest in a job you posted" });
      const jobStartDate = requireFutureDate(job.startDate);
      const [sameDayResponse] = await db.select({ id: jobResponses.id }).from(jobResponses)
        .innerJoin(jobs, eq(jobResponses.jobId, jobs.id))
        .where(and(eq(jobResponses.workerId, profile.profile.id), eq(jobs.startDate, jobStartDate), ne(jobs.id, input.jobId), ne(jobs.status, "Cancelled"), ne(jobs.status, "Completed")))
        .limit(1);
      if (sameDayResponse) throw new TRPCError({ code: "CONFLICT", message: "You already have a job response for that day" });
      const [existing] = await db.select().from(jobResponses).where(and(eq(jobResponses.jobId, input.jobId), eq(jobResponses.workerId, profile.profile.id))).limit(1);
      if (!existing) {
        await db.insert(jobResponses).values({ jobId: input.jobId, workerId: profile.profile.id, status: "Interested" });
        await createNotification({
          userId: job.clientId,
          type: "interest",
          title: "New interest in your job",
          body: `${ctx.user.name ?? ctx.user.email ?? "A fundi"} showed interest in ${job.title}.`,
          jobId: job.id,
        });
      }
      if (job.status === "Posted") await db.update(jobs).set({ status: "Interested", updatedAt: new Date() }).where(eq(jobs.id, input.jobId));
      return { success: true as const };
    }),
    responses: protectedProcedure.input(z.object({ jobId: z.string().min(3).max(32) })).query(async ({ ctx, input }) => {
      requireRole(ctx.user.role, ["client"]);
      if (!(await isJobClient(input.jobId, ctx.user.id))) throw new TRPCError({ code: "FORBIDDEN", message: "You can only review responses to your own jobs" });
      return getJobResponders(input.jobId);
    }),
    decideResponse: protectedProcedure.input(z.object({
      jobId: z.string().min(3).max(32),
      workerId: z.number().int().positive(),
      decision: z.enum(["accept", "decline"]),
    })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, ["client"]);
      if (!(await isJobClient(input.jobId, ctx.user.id))) throw new TRPCError({ code: "FORBIDDEN", message: "You can only decide on responses to your own jobs" });
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      const [response] = await db.select().from(jobResponses)
        .where(and(eq(jobResponses.jobId, input.jobId), eq(jobResponses.workerId, input.workerId)))
        .limit(1);
      if (!response) throw new TRPCError({ code: "NOT_FOUND", message: "That response no longer exists" });
      const [worker] = await db.select({ userId: workerProfiles.userId, name: users.name, email: users.email })
        .from(workerProfiles).innerJoin(users, eq(workerProfiles.userId, users.id))
        .where(eq(workerProfiles.id, input.workerId)).limit(1);
      const [job] = await db.select({ title: jobs.title }).from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
      const jobTitle = job?.title ?? "your job";
      const actorName = ctx.user.name ?? ctx.user.email ?? "The client";
      if (input.decision === "accept") {
        await db.update(jobResponses).set({ status: "Declined" })
          .where(and(eq(jobResponses.jobId, input.jobId), ne(jobResponses.id, response.id)));
        await db.update(jobResponses).set({ status: "Accepted" }).where(eq(jobResponses.id, response.id));
        await db.update(jobs).set({ status: "Assigned", updatedAt: new Date() }).where(eq(jobs.id, input.jobId));
        if (worker) {
          await createNotification({
            userId: worker.userId,
            type: "decision",
            title: "You got the job",
            body: `${actorName} accepted your interest in ${jobTitle}. Open the inbox to agree the details.`,
            jobId: input.jobId,
          });
          sendConversationEmail({
            recipient: { name: worker.name ?? worker.email ?? "Fundi", email: worker.email ?? "" },
            actorName,
            job: { id: input.jobId, title: jobTitle },
            kind: "accepted",
          });
        }
      } else {
        await db.update(jobResponses).set({ status: "Declined" }).where(eq(jobResponses.id, response.id));
        if (worker) {
          await createNotification({
            userId: worker.userId,
            type: "decision",
            title: "Interest updated",
            body: `${actorName} declined your interest in ${jobTitle}.`,
            jobId: input.jobId,
          });
        }
      }
      return { success: true as const };
    }),
    rate: protectedProcedure.input(z.object({ jobId: z.string().min(3).max(32), score: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, ["client"]);
      if (!(await isJobClient(input.jobId, ctx.user.id))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only rate your own jobs" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
      const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
      if (!job || job.status !== "Completed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Feedback is available after the job is completed" });
      }
      const [accepted] = await db.select().from(jobResponses)
        .where(and(eq(jobResponses.jobId, input.jobId), eq(jobResponses.status, "Accepted")))
        .orderBy(desc(jobResponses.createdAt)).limit(1);
      const [latest] = accepted ? [null] : await db.select().from(jobResponses)
        .where(eq(jobResponses.jobId, input.jobId))
        .orderBy(desc(jobResponses.createdAt)).limit(1);
      const response = accepted ?? latest;
      if (!response) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This job has no linked fundi to rate. Show interest must be recorded before feedback." });
      }
      const [existing] = await db.select().from(ratings).where(and(eq(ratings.jobId, input.jobId), eq(ratings.clientId, ctx.user.id))).limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "This job has already been rated" });
      await db.insert(ratings).values({ jobId: input.jobId, clientId: ctx.user.id, workerId: response.workerId, score: input.score, comment: input.comment ?? null });
      return { success: true as const };
    }),
    report: protectedProcedure.input(z.object({ jobId: z.string().min(3).max(32).optional(), reportedUserId: z.number().int().positive().optional(), subjectType: z.enum(["Profile", "Job post", "Conduct"]), reason: z.string().trim().min(5).max(1000) })).mutation(async ({ ctx, input }) => {
      if (!input.jobId && !input.reportedUserId) throw new Error("Choose a job or account to report");
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      await db.insert(reports).values({ id: createReportId(), reporterId: ctx.user.id, reportedJobId: input.jobId ?? null, reportedUserId: input.reportedUserId ?? null, subjectType: input.subjectType, reason: input.reason, status: "Review" });
      return { success: true as const };
    }),
  }),
  inbox: router({
    list: protectedProcedure.query(({ ctx }) => getInbox(ctx.user)),
    open: protectedProcedure.input(z.object({
      jobId: z.string().min(3).max(32),
      workerId: z.number().int().positive(),
    })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, ["client"]);
      if (!(await isJobClient(input.jobId, ctx.user.id))) throw new TRPCError({ code: "FORBIDDEN", message: "You can only open a chat for your own job" });
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      const [response] = await db.select().from(jobResponses)
        .where(and(eq(jobResponses.jobId, input.jobId), eq(jobResponses.workerId, input.workerId)))
        .limit(1);
      if (!response || response.status !== "Accepted") throw new TRPCError({ code: "BAD_REQUEST", message: "Accept the fundi before opening a chat" });
      const [worker] = await db.select({ userId: workerProfiles.userId, name: users.name, email: users.email })
        .from(workerProfiles).innerJoin(users, eq(workerProfiles.userId, users.id))
        .where(eq(workerProfiles.id, input.workerId)).limit(1);
      const [job] = await db.select({ title: jobs.title }).from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
      const [existing] = await db.select().from(conversations)
        .where(and(eq(conversations.jobId, input.jobId), eq(conversations.workerId, input.workerId)))
        .limit(1);
      if (existing) return { conversationId: existing.id };
      const [created] = await db.insert(conversations).values({ jobId: input.jobId, clientId: ctx.user.id, workerId: input.workerId }).returning({ id: conversations.id });
      if (!created) throw new Error("Unable to open the conversation");
      const actorName = ctx.user.name ?? ctx.user.email ?? "The client";
      const jobTitle = job?.title ?? "your job";
      if (worker) {
        await createNotification({
          userId: worker.userId,
          type: "chat",
          title: "Client opened a chat",
          body: `${actorName} opened a private chat about ${jobTitle}.`,
          jobId: input.jobId,
          conversationId: created.id,
        });
        sendConversationEmail({
          recipient: { name: worker.name ?? worker.email ?? "Fundi", email: worker.email ?? "" },
          actorName,
          job: { id: input.jobId, title: jobTitle },
          kind: "chat",
        });
      }
      return { conversationId: created.id };
    }),
    messages: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const conversation = await getConversationAccess(input.conversationId, ctx.user);
      if (!conversation) throw new TRPCError({ code: "FORBIDDEN", message: "This conversation is not available to your account" });
      return getConversationMessages(input.conversationId, ctx.user);
    }),
    send: protectedProcedure.input(z.object({
      conversationId: z.number().int().positive(),
      body: z.string().trim().min(1).max(2000),
    })).mutation(async ({ ctx, input }) => {
      const conversation = await getConversationAccess(input.conversationId, ctx.user);
      if (!conversation) throw new TRPCError({ code: "FORBIDDEN", message: "This conversation is not available to your account" });
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      await db.insert(messages).values({ conversationId: input.conversationId, senderId: ctx.user.id, body: input.body });
      await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, input.conversationId));
      const [worker] = await db.select({ userId: workerProfiles.userId, name: users.name, email: users.email })
        .from(workerProfiles).innerJoin(users, eq(workerProfiles.userId, users.id))
        .where(eq(workerProfiles.id, conversation.workerId)).limit(1);
      const [client] = ctx.user.id !== conversation.clientId
        ? await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, conversation.clientId)).limit(1)
        : [undefined];
      const isClientSender = ctx.user.id === conversation.clientId;
      const recipient = isClientSender ? worker : client;
      const recipientUserId = isClientSender ? worker?.userId : conversation.clientId;
      if (recipient && recipientUserId && recipientUserId !== ctx.user.id) {
        const [job] = await db.select({ title: jobs.title }).from(jobs).where(eq(jobs.id, conversation.jobId)).limit(1);
        const senderName = ctx.user.name ?? ctx.user.email ?? "A MjengoLink member";
        await createNotification({
          userId: recipientUserId,
          type: "message",
          title: `New message from ${senderName}`,
          body: input.body,
          jobId: conversation.jobId,
          conversationId: conversation.id,
        });
        sendConversationEmail({
          recipient: { name: recipient.name ?? recipient.email ?? "MjengoLink member", email: recipient.email ?? "" },
          actorName: senderName,
          job: { id: conversation.jobId, title: job?.title ?? "your job" },
          kind: "message",
          message: input.body,
        });
      }
      return { success: true as const };
    }),
    markRead: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const conversation = await getConversationAccess(input.conversationId, ctx.user);
      if (!conversation) throw new TRPCError({ code: "FORBIDDEN", message: "This conversation is not available to your account" });
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      await db.update(messages).set({ readAt: new Date() })
        .where(and(eq(messages.conversationId, input.conversationId), ne(messages.senderId, ctx.user.id), isNull(messages.readAt)));
      await db.update(notifications).set({ readAt: new Date() })
        .where(and(eq(notifications.userId, ctx.user.id), eq(notifications.conversationId, input.conversationId), isNull(notifications.readAt)));
      return { success: true as const };
    }),
  }),
  notifications: router({
    list: protectedProcedure.query(({ ctx }) => getNotifications(ctx.user.id)),
    markRead: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
      await db.update(notifications).set({ readAt: new Date() })
        .where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)));
      return { success: true as const };
    }),
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
      await db.update(notifications).set({ readAt: new Date() })
        .where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt)));
      return { success: true as const };
    }),
  }),
  admin: router({
    resolveReport: adminProcedure.input(z.object({ reportId: z.string().min(3).max(32) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      await db.update(reports).set({ status: "Resolved", resolvedAt: new Date(), resolvedBy: ctx.user.id }).where(eq(reports.id, input.reportId));
      return { success: true as const };
    }),
  }),
});

export type AppRouter = typeof appRouter;
