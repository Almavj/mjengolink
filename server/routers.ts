import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import { jobs, jobResponses, ratings, reports, users, workerProfiles, workerSkills } from "../drizzle/schema";
import { createJobId, createReportId, findMatchingFundis, getDashboardData, getWorkerProfile, isJobClient, JOB_STATUSES, PILOT_TRADES } from "./mjengo";
import { notifyJobCreated } from "./emailNotifications";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { endSupabaseSession, setSessionCookies } from "./_core/auth";
import { createSupabaseClient } from "./_core/supabase";
import { CONFIRMATION_EMAIL_COOLDOWN_MSG } from "@shared/const";

const tradeSchema = z.enum(PILOT_TRADES);
const statusSchema = z.enum(JOB_STATUSES);
const coordinates = {
  latitudeE6: z.number().int().min(-90_000_000).max(90_000_000).nullable().optional(),
  longitudeE6: z.number().int().min(-180_000_000).max(180_000_000).nullable().optional(),
};

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

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    register: publicProcedure.input(z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(320).transform(value => value.toLowerCase()),
      password: z.string().min(8).max(128),
    })).mutation(async ({ ctx, input }) => {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: { data: { name: input.name } },
      });
      if (error) {
        if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.message.includes("For security purposes")) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: CONFIRMATION_EMAIL_COOLDOWN_MSG });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      }
      if (data.session) setSessionCookies(ctx.req, ctx.res, data.session);
      return { success: true, confirmationRequired: !data.session };
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
      if (error || !data.session || !data.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      setSessionCookies(ctx.req, ctx.res, data.session);
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
  }),
  jobs: router({
    create: protectedProcedure.input(z.object({
      title: z.string().trim().min(3).max(160),
      trade: tradeSchema,
      description: z.string().trim().min(10).max(3000),
      locationText: z.string().trim().min(2).max(255),
      budget: z.string().trim().min(1),
      startDate: z.string().trim().min(4).max(32),
      contactPreference: z.enum(["Call me", "Text me", "Either"]),
      radiusKm: z.number().int().min(1).max(50).default(10),
      ...coordinates,
    })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, ["client"]);
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
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
        startDate: input.startDate,
        contactPreference: input.contactPreference,
        status: "Posted",
      });
      const matches = await findMatchingFundis(jobId);
      const admins = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
      const notification = await notifyJobCreated({
        job: { id: jobId, title: input.title, trade: input.trade, location: input.locationText, budget: `KSh ${budgetAmount.toLocaleString("en-KE")}`, startDate: input.startDate, description: input.description },
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
      startDate: z.string().trim().min(4).max(32),
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
      const budgetAmount = money(input.budget);
      await db.update(jobs).set({ title: input.title, trade: input.trade, description: input.description, locationText: input.locationText, latitudeE6: input.latitudeE6 ?? null, longitudeE6: input.longitudeE6 ?? null, radiusKm: input.radiusKm, budgetAmount, startDate: input.startDate, contactPreference: input.contactPreference, updatedAt: new Date() }).where(eq(jobs.id, input.jobId));
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
      const [existing] = await db.select().from(jobResponses).where(and(eq(jobResponses.jobId, input.jobId), eq(jobResponses.workerId, profile.profile.id))).limit(1);
      if (!existing) await db.insert(jobResponses).values({ jobId: input.jobId, workerId: profile.profile.id, status: "Interested" });
      if (job.status === "Posted") await db.update(jobs).set({ status: "Interested", updatedAt: new Date() }).where(eq(jobs.id, input.jobId));
      return { success: true as const };
    }),
    rate: protectedProcedure.input(z.object({ jobId: z.string().min(3).max(32), score: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, ["client"]);
      if (!(await isJobClient(input.jobId, ctx.user.id))) throw new Error("You can only rate your own jobs");
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
      if (!job || job.status !== "Completed") throw new Error("Feedback is available after the job is completed");
      const [response] = await db.select().from(jobResponses).where(eq(jobResponses.jobId, input.jobId)).orderBy(desc(jobResponses.createdAt)).limit(1);
      if (!response) throw new Error("No fundi response is linked to this job");
      const [existing] = await db.select().from(ratings).where(and(eq(ratings.jobId, input.jobId), eq(ratings.clientId, ctx.user.id))).limit(1);
      if (existing) throw new Error("This job has already been rated");
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
