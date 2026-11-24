import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "./db";
import { jobs, jobResponses, ratings, reports, users, workerProfiles, workerSkills } from "../drizzle/schema";
import type { User } from "../drizzle/schema";

export const PILOT_TRADES = ["Masonry", "Plumbing", "Electrical", "Painting", "Carpentry", "Welding"] as const;
export const JOB_STATUSES = ["Posted", "Interested", "Accepted", "Assigned", "In progress", "Completed", "Cancelled"] as const;

export type DashboardJob = {
  id: string;
  title: string;
  trade: string;
  location: string;
  distance: string;
  budget: string;
  startDate: string;
  status: string;
  description: string;
  posted: string;
  matched: number;
  interested: number;
  responders: string[];
  client: string;
};

export type DashboardFundi = {
  id: string;
  name: string;
  email: string;
  trade: string;
  trades: string[];
  location: string;
  distance: string;
  experience: string;
  rating: number;
  ratings: number;
  initials: string;
  tone: string;
  response: string;
  available: boolean;
  note: string;
};

function formatBudget(amount: number) {
  return `KSh ${amount.toLocaleString("en-KE")}`;
}

function formatDistance(km: number | null) {
  return km === null ? "Area match" : `${km.toFixed(1)} km`;
}

function haversineKm(aLatE6: number | null, aLngE6: number | null, bLatE6: number | null, bLngE6: number | null) {
  if (aLatE6 === null || aLngE6 === null || bLatE6 === null || bLngE6 === null) return null;
  const lat1 = aLatE6 / 1_000_000;
  const lon1 = aLngE6 / 1_000_000;
  const lat2 = bLatE6 / 1_000_000;
  const lon2 = bLngE6 / 1_000_000;
  const earthRadius = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function initials(name: string) {
  return name.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase();
}

function relativeDate(date: Date | null) {
  if (!date) return "Recently";
  const hours = Math.max(0, Math.round((Date.now() - date.getTime()) / 3_600_000));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export async function getDashboardData(currentUser: User) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const role = currentUser.role === "admin" ? "admin" : currentUser.role === "fundi" ? "fundi" : "client";
  const allUserRows = await db.select().from(users);
  const allJobRows = await db.select().from(jobs);
  const jobRows = role === "client"
    ? await db.select({ job: jobs, clientName: users.name }).from(jobs).innerJoin(users, eq(jobs.clientId, users.id)).where(eq(jobs.clientId, currentUser.id)).orderBy(desc(jobs.createdAt))
    : await db.select({ job: jobs, clientName: users.name }).from(jobs).innerJoin(users, eq(jobs.clientId, users.id)).orderBy(desc(jobs.createdAt));
  const responseRows = await db.select().from(jobResponses);
  const profileRows = await db.select({ profile: workerProfiles, user: users }).from(workerProfiles).innerJoin(users, eq(workerProfiles.userId, users.id));
  const skillRows = await db.select().from(workerSkills);
  const ratingRows = await db.select().from(ratings);

  const profileById = new Map(profileRows.map(row => [row.profile.id, row]));
  const currentWorkerProfileId = profileRows.find(row => row.profile.userId === currentUser.id)?.profile.id;
  const skillsByWorker = new Map<number, string[]>();
  for (const row of skillRows) skillsByWorker.set(row.workerId, [...(skillsByWorker.get(row.workerId) ?? []), row.trade]);
  const ratingsByWorker = new Map<number, { total: number; count: number }>();
  for (const row of ratingRows) {
    const item = ratingsByWorker.get(row.workerId) ?? { total: 0, count: 0 };
    item.total += row.score;
    item.count += 1;
    ratingsByWorker.set(row.workerId, item);
  }

  const dashboardJobs: DashboardJob[] = jobRows.map(({ job, clientName }) => {
    const jobResponses = responseRows.filter(response => response.jobId === job.id);
    const matching = profileRows.filter(({ profile }) => {
      const workerTrades = skillsByWorker.get(profile.id) ?? [];
      const distance = haversineKm(job.latitudeE6, job.longitudeE6, profile.latitudeE6, profile.longitudeE6);
      const tradeMatches = workerTrades.includes(job.trade);
      const areaMatches = distance === null || distance <= job.radiusKm;
      return tradeMatches && Boolean(profile.availability) && areaMatches;
    });
    return {
      id: job.id,
      title: job.title,
      trade: job.trade,
      location: job.locationText,
      distance: "—",
      budget: formatBudget(job.budgetAmount),
      startDate: job.startDate,
      status: job.status,
      description: job.description,
      posted: relativeDate(job.createdAt),
      matched: matching.length,
      interested: jobResponses.length,
      responders: jobResponses.map(response => response.workerId === currentWorkerProfileId ? "current-fundi" : `worker-${response.workerId}`),
      client: clientName ?? "MjengoLink client",
    };
  });

  const dashboardFundis: DashboardFundi[] = profileRows.map(({ profile, user }) => {
    const workerRatings = ratingsByWorker.get(profile.id) ?? { total: 0, count: 0 };
    const workerTrades = skillsByWorker.get(profile.id) ?? [];
    const primaryTrade = workerTrades[0] ?? "General construction";
    return {
      id: `worker-${profile.id}`,
      name: user.name ?? "Unnamed fundi",
      email: user.email ?? "",
      trade: primaryTrade,
      trades: workerTrades.length ? workerTrades : [primaryTrade],
      location: profile.serviceArea,
      distance: "Area match",
      experience: profile.experience ?? "Experience not yet added",
      rating: workerRatings.count ? Number((workerRatings.total / workerRatings.count).toFixed(1)) : 0,
      ratings: workerRatings.count,
      initials: initials(user.name ?? "Fundi"),
      tone: profile.id % 3 === 0 ? "terracotta" : profile.id % 3 === 1 ? "green" : "mustard",
      response: "Response history will appear after activity",
      available: Boolean(profile.availability),
      note: profile.summary ?? "This fundi has not added a work summary yet.",
    };
  });

  const reportRows = currentUser.role === "admin" ? await db.select().from(reports).orderBy(desc(reports.createdAt)) : [];
  return {
    role,
    jobs: dashboardJobs,
    fundis: dashboardFundis,
    reports: reportRows.map(report => ({
      id: report.id,
      subject: report.reportedJobId ? `Job: ${report.reportedJobId}` : "Reported account",
      type: report.subjectType,
      reason: report.reason,
      date: relativeDate(report.createdAt),
      status: report.status === "Resolved" ? "Resolved" : "Review",
    })),
    metrics: {
      registeredUsers: allUserRows.length,
      fundiUsers: allUserRows.filter(user => user.role === "fundi").length,
      clientUsers: allUserRows.filter(user => user.role === "client" || user.role === "user").length,
      jobsPosted: allJobRows.length,
      openJobs: allJobRows.filter(job => !["Completed", "Cancelled"].includes(job.status)).length,
      completedJobs: allJobRows.filter(job => job.status === "Completed").length,
      openReports: reportRows.filter(report => report.status !== "Resolved").length,
    },
    accounts: allUserRows.map(user => ({ id: user.id, name: user.name ?? "Unnamed member", role: user.role === "admin" ? "Admin" : user.role === "fundi" ? "Fundi" : "Client", email: user.email ?? "", status: "Active" as const })),
  };
}

export async function findMatchingFundis(jobId: string) {
  const db = await getDb();
  if (!db) return [];
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return [];
  const profiles = await db.select({ profile: workerProfiles, user: users }).from(workerProfiles).innerJoin(users, eq(workerProfiles.userId, users.id));
  const skills = await db.select().from(workerSkills);
  const skillsByWorker = new Map<number, string[]>();
  for (const skill of skills) skillsByWorker.set(skill.workerId, [...(skillsByWorker.get(skill.workerId) ?? []), skill.trade]);
  return profiles.filter(({ profile }) => {
    const distance = haversineKm(job.latitudeE6, job.longitudeE6, profile.latitudeE6, profile.longitudeE6);
    return Boolean(profile.availability) && (skillsByWorker.get(profile.id) ?? []).includes(job.trade) && (distance === null || distance <= job.radiusKm);
  }).map(({ profile, user }) => ({
    name: user.name ?? "Fundi",
    email: user.email ?? "",
    distance: formatDistance(haversineKm(job.latitudeE6, job.longitudeE6, profile.latitudeE6, profile.longitudeE6)),
  }));
}

export function createJobId() {
  return `ML-${nanoid(8).toUpperCase()}`;
}

export function createReportId() {
  return `R-${nanoid(8).toUpperCase()}`;
}

export async function getWorkerProfile(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [profile] = await db.select({ profile: workerProfiles, user: users }).from(workerProfiles).innerJoin(users, eq(workerProfiles.userId, users.id)).where(eq(workerProfiles.userId, userId)).limit(1);
  if (!profile) return null;
  const skills = await db.select().from(workerSkills).where(eq(workerSkills.workerId, profile.profile.id));
  return { ...profile, skills: skills.map(skill => skill.trade) };
}

export async function isJobClient(jobId: string, userId: number) {
  const db = await getDb();
  if (!db) return false;
  const [job] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.clientId, userId))).limit(1);
  return Boolean(job);
}
