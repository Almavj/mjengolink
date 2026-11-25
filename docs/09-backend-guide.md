# Backend guide

## Server files

| File | Responsibility |
|---|---|
| `server/_core/index.ts` | Express bootstrap, CORS, REST endpoints, tRPC mount, static/dev serving |
| `server/_core/trpc.ts` | tRPC initialisation, error formatter, procedure guards |
| `server/_core/context.ts` | Per-request tRPC context with authenticated user |
| `server/_core/auth.ts` | Cookie session parsing, Supabase verification/refresh, logout |
| `server/_core/cookies.ts` | Cookie options |
| `server/_core/supabase.ts` | Anon and admin Supabase clients |
| `server/_core/env.ts` | Lazy environment getters |
| `server/_core/vite.ts` | Vite middleware in dev, static SPA in production |
| `server/_core/systemRouter.ts` | `system.health` |
| `server/routers.ts` | All feature routers and procedures |
| `server/mjengo.ts` | Domain helpers |
| `server/db.ts` | Lazy Drizzle/Postgres connection |
| `server/emailNotifications.ts` | Brevo adapter and email templates |
| `server/profilePhoto.ts` | Supabase Storage avatar helpers |

## Bootstrap sequence

1. Import `dotenv/config`.
2. Create Express app and HTTP server.
3. Apply CORS middleware.
4. Apply JSON and URL-encoded parsers with a 50 MB limit.
5. Register `GET /api/health`.
6. Register `POST /api/notifications/job-created`.
7. Mount tRPC at `/api/trpc`.
8. Mount Vite middleware (development) or static files (production).
9. Validate `PORT`, default to `3000`, and listen on `0.0.0.0`.

## CORS implementation

`CORS_ORIGINS` is split on commas, trimmed, and empties removed.

```text
no Origin header       → pass through
allowed Origin         → reflect origin + credentials + Vary: Origin
disallowed Origin      → 403 { error: "Origin is not allowed" }
OPTIONS preflight      → 204, GET/POST/OPTIONS, headers echoed, max-age 600
```

## tRPC setup

- Transformer: `superjson`.
- `publicProcedure`: no session requirement.
- `protectedProcedure`: `UNAUTHORIZED` when `ctx.user` is missing.
- `adminProcedure`: `FORBIDDEN` when `ctx.user.role !== "admin"`.

The error formatter changes only `INTERNAL_SERVER_ERROR`:

| Cause | Client message |
|---|---|
| `BREVO_*` | `We couldn't send the email right now. Please try again later.` |
| `SUPABASE_*` | `We couldn't start the authentication flow. Please try again later.` |
| other | `An unexpected server error occurred.` |

Stack traces are always removed.

## Router namespaces

| Router | Procedures |
|---|---|
| `system` | `health` |
| `auth` | `me`, `register`, `login`, `resendConfirmation`, `requestPasswordReset`, `updatePassword`, `setRole`, `logout` |
| `dashboard` | index query |
| `profile` | `me`, `update`, `availability`, `updatePhoto`, `removePhoto` |
| `jobs` | `create`, `update`, `updateStatus`, `respond`, `responses`, `decideResponse`, `rate`, `report` |
| `inbox` | `list`, `open`, `messages`, `send`, `markRead` |
| `notifications` | `list`, `markRead`, `markAllRead` |
| `admin` | `resolveReport` |

See [`06-api-reference.md`](./06-api-reference.md) for inputs, outputs, and authorization rules.

## Local validators in `routers.ts`

| Helper | Purpose |
|---|---|
| `tradeSchema`, `statusSchema` | Zod enums over domain constants |
| `coordinates` | Optional nullable E6 lat/lng with degree bounds |
| `normalizeDateKey`, `requireFutureDate` | Strict `YYYY-MM-DD` validation; rejects past dates |
| `money` | Strips non-numeric characters, requires positive amount ≤1 billion, rounds to integer |
| `requireRole` | Role allowlist with legacy `user` → `client` normalization |
| `findUserByEmail` | Case-insensitive lookup in `public.users` |
| `isExistingEmailError` | Detects Supabase duplicate-account errors |
| `requestAuthLink` | Wraps Supabase link failures with `SUPABASE_*` codes |
| `getAuthRedirectUrl` | Validates origin and builds auth redirect |
| `sendConversationEmail` | Fire-and-forget conversation email with `console.warn` on failure |

## Domain helpers in `mjengo.ts`

### Constants

- `PILOT_TRADES`: Masonry, Plumbing, Electrical, Painting, Carpentry, Welding.
- `JOB_STATUSES`: Posted, Interested, Accepted, Assigned, In progress, Completed, Cancelled.

### Formatting and geometry

- `formatBudget` — `KSh` + `en-KE` locale formatting.
- `formatDistance` — distance text or `Area match`.
- `haversineKm` — Earth radius 6371 km, E6 coordinates, returns `null` when coordinates are missing.
- `initials` — up to two name initials.
- `relativeDate` — relative timestamp strings.

### Dashboard

`getDashboardData(user)`:

- clients: own jobs only;
- fundis/admins: all jobs;
- reports: admin only;
- metrics: real counts from users, jobs, ratings, and reports;
- fundis: profile, skills, ratings, availability, avatar URL;
- accounts: all user names/emails/roles/status.

### Matching

`findMatchingFundis(jobId)` returns users where:

```text
worker_profile.availability is truthy
AND worker_skills contains job.trade
AND (coordinates are missing OR haversine distance <= jobs.radiusKm)
```

It returns `{ userId, name, email, distance }`. It does not check job status or `users.role`.

### Ownership and access

- `isJobClient(jobId, userId)` — job owner check.
- `participantWorkerId(user)` — resolves a fundi's worker profile.
- `getConversationAccess(conversationId, user)` — ensures the user is client or worker in the thread.

### Inbox and notifications

- `getInbox(user)` — conversations by role, other party, last message, unread count.
- `getConversationMessages(conversationId, user)` — ordered messages with `mine` flag.
- `createNotification(input)` — inserts a notification with truncated title/body.
- `getNotifications(userId)` — latest 50 notifications with `isRead` and relative date.

## Email delivery

`server/emailNotifications.ts` talks directly to Brevo:

```http
POST https://api.brevo.com/v3/smtp/email
api-key: <BREVO_API_KEY>
```

Payload includes:

- `sender` from `EMAIL_FROM`, parsed as either bare email or `Name <email>`;
- one recipient;
- subject;
- `textContent`;
- `htmlContent`;
- optional `replyTo` only when it parses as a valid email.

Provider failures are normalised to `BREVO_*` codes. HTML from user data is escaped.

See [`10-notifications-and-email.md`](./10-notifications-and-email.md).

## Profile photos

`server/profilePhoto.ts`:

- bucket: `profile-photos`;
- max decoded size: 5 MiB;
- MIME types: JPEG, PNG, WebP;
- upload path: `<authUserId>/avatar-<timestamp>.<ext>`;
- previous object removed on replacement;
- one-hour signed URLs via the admin client.

The service-role client bypasses RLS; Storage policies exist for direct authenticated access but the app does not use that path.

## Database access

`server/db.ts` lazily creates a Drizzle client:

```text
DATABASE_URL set → drizzle(postgres(DATABASE_URL))
DATABASE_URL missing → getDb() returns null
```

Some procedures throw when `getDb()` returns null; some helpers degrade silently (`findMatchingFundis → []`, `isJobClient → false`, `createNotification → no-op`).

## Side-effect patterns

### Job creation

```text
validate → insert job → find matches → create in-app notifications
→ send Brevo emails → return { jobId, matches, notification }
```

Email failures are counted in the response, not thrown. The job remains persisted.

### Response decision

```text
load response → load worker + job
→ accept: decline others, accept chosen, mark job Assigned, notify + email
→ decline: decline chosen, notify
```

### Chat message

```text
check access → insert message → bump conversation timestamp
→ resolve recipient → create notification → send email → return success
```

Conversation emails are fire-and-forget; failures are logged only.

## Testing seams

The backend is tested with Vitest by mocking Supabase, database, env, and `fetch`:

- cookie/session tests;
- logout cookie-clearing test;
- auth flow tests;
- Brevo adapter tests.

There are currently no automated tests for job lifecycle, matching, ratings, inbox, notifications, admin actions, or Storage. See [`12-testing-and-maintenance.md`](./12-testing-and-maintenance.md).
