import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { notifyJobCreated } from "../emailNotifications";
import { getDb } from "../db";
import { jobs, users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { findMatchingFundis } from "../mjengo";
import { authenticateRequest } from "./auth";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.post("/api/notifications/job-created", async (req, res) => {
    let user;
    try {
      user = await authenticateRequest(req);
    } catch (error) {
      console.error("[Notifications] Authentication failed:", error);
      res.status(500).json({ error: "Unable to authenticate request" });
      return;
    }
    try {
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!["client", "admin"].includes(user.role)) {
        res.status(403).json({ error: "Only clients and admins can dispatch notifications" });
        return;
      }
      const jobId = typeof req.body?.jobId === "string" ? req.body.jobId : "";
      const db = await getDb();
      if (!db || !jobId) {
        res.status(400).json({ error: "jobId is required" });
        return;
      }
      const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
      if (!job || (user.role !== "admin" && job.clientId !== user.id)) {
        res.status(403).json({ error: "You cannot dispatch notifications for this job" });
        return;
      }
      const matches = await findMatchingFundis(job.id);
      const admins = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
      const result = await notifyJobCreated({
        job: { id: job.id, title: job.title, trade: job.trade, location: job.locationText, budget: `KSh ${job.budgetAmount.toLocaleString("en-KE")}`, startDate: job.startDate, description: job.description },
        client: { name: user.name ?? "MjengoLink client", email: user.email ?? "" },
        eligibleFundis: matches,
        admin: admins[0]?.email ? { name: admins[0].name ?? "MjengoLink admin", email: admins[0].email } : undefined,
      });
      res.status(202).json(result);
    } catch (error) {
      console.error("[Notifications] Failed to dispatch new-job emails:", error);
      res.status(502).json({ providerConfigured: true, recipientCount: 0, sentCount: 0, failures: 1 });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
