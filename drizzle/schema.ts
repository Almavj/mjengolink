import { int, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  role: varchar("role", { length: 16 }).notNull().default("user"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const localCredentials = mysqlTable("local_credentials", {
  email: varchar("email", { length: 320 }).primaryKey(),
  userId: int("userId").notNull().unique().references(() => users.id),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const workerProfiles = mysqlTable("worker_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique().references(() => users.id),
  phone: varchar("phone", { length: 32 }),
  experience: text("experience"),
  serviceArea: varchar("serviceArea", { length: 255 }).notNull().default("Eldoret"),
  availability: int("availability").notNull().default(1),
  latitudeE6: int("latitudeE6"),
  longitudeE6: int("longitudeE6"),
  summary: text("summary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const workerSkills = mysqlTable("worker_skills", {
  id: int("id").autoincrement().primaryKey(),
  workerId: int("workerId").notNull().references(() => workerProfiles.id),
  trade: varchar("trade", { length: 64 }).notNull(),
});

export const jobs = mysqlTable("jobs", {
  id: varchar("id", { length: 32 }).primaryKey(),
  clientId: int("clientId").notNull().references(() => users.id),
  title: varchar("title", { length: 160 }).notNull(),
  trade: varchar("trade", { length: 64 }).notNull(),
  description: text("description").notNull(),
  locationText: varchar("locationText", { length: 255 }).notNull(),
  latitudeE6: int("latitudeE6"),
  longitudeE6: int("longitudeE6"),
  radiusKm: int("radiusKm").notNull().default(10),
  budgetAmount: int("budgetAmount").notNull(),
  startDate: varchar("startDate", { length: 32 }).notNull(),
  contactPreference: varchar("contactPreference", { length: 32 }).notNull().default("Call me"),
  status: varchar("status", { length: 32 }).notNull().default("Posted"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const jobResponses = mysqlTable("job_responses", {
  id: int("id").autoincrement().primaryKey(),
  jobId: varchar("jobId", { length: 32 }).notNull().references(() => jobs.id),
  workerId: int("workerId").notNull().references(() => workerProfiles.id),
  status: varchar("status", { length: 24 }).notNull().default("Interested"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const ratings = mysqlTable("ratings", {
  id: int("id").autoincrement().primaryKey(),
  jobId: varchar("jobId", { length: 32 }).notNull().references(() => jobs.id),
  clientId: int("clientId").notNull().references(() => users.id),
  workerId: int("workerId").notNull().references(() => workerProfiles.id),
  score: int("score").notNull(),
  comment: text("comment"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const reports = mysqlTable("reports", {
  id: varchar("id", { length: 32 }).primaryKey(),
  reporterId: int("reporterId").notNull().references(() => users.id),
  reportedUserId: int("reportedUserId").references(() => users.id),
  reportedJobId: varchar("reportedJobId", { length: 32 }).references(() => jobs.id),
  subjectType: varchar("subjectType", { length: 32 }).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("Review"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: int("resolvedBy").references(() => users.id),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type WorkerProfile = typeof workerProfiles.$inferSelect;
export type Job = typeof jobs.$inferSelect;
