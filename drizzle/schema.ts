import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  authUserId: uuid("auth_user_id").notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  role: varchar("role", { length: 16 }).notNull().default("user"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const workerProfiles = pgTable("worker_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  phone: varchar("phone", { length: 32 }),
  experience: text("experience"),
  serviceArea: varchar("serviceArea", { length: 255 }).notNull().default("Eldoret"),
  availability: integer("availability").notNull().default(1),
  latitudeE6: integer("latitudeE6"),
  longitudeE6: integer("longitudeE6"),
  summary: text("summary"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const workerSkills = pgTable("worker_skills", {
  id: serial("id").primaryKey(),
  workerId: integer("workerId").notNull().references(() => workerProfiles.id, { onDelete: "cascade" }),
  trade: varchar("trade", { length: 64 }).notNull(),
}, table => [unique("worker_skills_worker_trade_unique").on(table.workerId, table.trade)]);

export const jobs = pgTable("jobs", {
  id: varchar("id", { length: 32 }).primaryKey(),
  clientId: integer("clientId").notNull().references(() => users.id),
  title: varchar("title", { length: 160 }).notNull(),
  trade: varchar("trade", { length: 64 }).notNull(),
  description: text("description").notNull(),
  locationText: varchar("locationText", { length: 255 }).notNull(),
  latitudeE6: integer("latitudeE6"),
  longitudeE6: integer("longitudeE6"),
  radiusKm: integer("radiusKm").notNull().default(10),
  budgetAmount: integer("budgetAmount").notNull(),
  startDate: varchar("startDate", { length: 32 }).notNull(),
  contactPreference: varchar("contactPreference", { length: 32 }).notNull().default("Call me"),
  status: varchar("status", { length: 32 }).notNull().default("Posted"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const jobResponses = pgTable("job_responses", {
  id: serial("id").primaryKey(),
  jobId: varchar("jobId", { length: 32 }).notNull().references(() => jobs.id, { onDelete: "cascade" }),
  workerId: integer("workerId").notNull().references(() => workerProfiles.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 24 }).notNull().default("Interested"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, table => [unique("job_responses_job_worker_unique").on(table.jobId, table.workerId)]);

export const ratings = pgTable("ratings", {
  id: serial("id").primaryKey(),
  jobId: varchar("jobId", { length: 32 }).notNull().references(() => jobs.id),
  clientId: integer("clientId").notNull().references(() => users.id),
  workerId: integer("workerId").notNull().references(() => workerProfiles.id),
  score: integer("score").notNull(),
  comment: text("comment"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, table => [unique("ratings_job_client_unique").on(table.jobId, table.clientId)]);

export const reports = pgTable("reports", {
  id: varchar("id", { length: 32 }).primaryKey(),
  reporterId: integer("reporterId").notNull().references(() => users.id),
  reportedUserId: integer("reportedUserId").references(() => users.id),
  reportedJobId: varchar("reportedJobId", { length: 32 }).references(() => jobs.id),
  subjectType: varchar("subjectType", { length: 32 }).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("Review"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt", { withTimezone: true }),
  resolvedBy: integer("resolvedBy").references(() => users.id),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type WorkerProfile = typeof workerProfiles.$inferSelect;
export type Job = typeof jobs.$inferSelect;
