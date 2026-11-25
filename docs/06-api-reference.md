# API reference

MjengoLink exposes two HTTP surfaces:

- **tRPC API** at `/api/trpc` — the application's main API, used by the React client.
- **Small REST endpoints** for health checks and legacy job-notification dispatch.

All request bodies are JSON. tRPC uses `superjson`, so `Date` objects survive serialization. The client sends cookies with every request (`credentials: "include"`).

---

## 1. Conventions

### Base paths

| Surface | Path | Purpose |
|---|---|---|
| tRPC | `/api/trpc/<router>.<procedure>` | Queries and mutations used by the app |
| REST | `/api/health` | Render health check |
| REST | `/api/notifications/job-created` | Authenticated, server-verified email dispatch for a job |

### Procedure types

| Type | Meaning |
|---|---|
| Public | No MjengoLink session required |
| Protected | A valid Supabase session and matching `public.users` row are required |
| Admin | Protected plus `users.role === "admin"` |

### Authorization helpers

- `protectedProcedure` rejects unauthenticated requests with `UNAUTHORIZED`.
- `adminProcedure` rejects non-admins with `FORBIDDEN`.
- `requireRole(role, allowedRoles)` in `server/routers.ts` enforces role-specific actions. Legacy role `user` is treated as `client`.
- `isJobClient(jobId, userId)` in `server/mjengo.ts` enforces job ownership.
- `getConversationAccess(conversationId, user)` in `server/mjengo.ts` enforces chat participation.

### Error formatting

`tRPC INTERNAL_SERVER_ERROR` messages are sanitized in `server/_core/trpc.ts`:

| Cause prefix | Client-visible message |
|---|---|
| `BREVO_*` | `We couldn't send the email right now. Please try again later.` |
| `SUPABASE_*` | `We couldn't start the authentication flow. Please try again later.` |
| Anything else | `An unexpected server error occurred.` |

Explicit `TRPCError` messages for `BAD_REQUEST`, `CONFLICT`, `FORBIDDEN`, `NOT_FOUND`, and similar codes are passed through.

> Maintenance note: several procedures still throw plain `Error(...)` for validation problems. Those become generic `INTERNAL_SERVER_ERROR` responses. Prefer `TRPCError` when changing these procedures.

---

## 2. REST endpoints

### `GET /api/health`

- **Auth:** none.
- **Response:** `{ "status": "ok" }`.
- **Used by:** `render.yaml` health check.

### `POST /api/notifications/job-created`

Legacy authenticated email-dispatch endpoint in `server/_core/index.ts`.

- **Auth:** cookie session required.
- **Allowed roles:** `client`, `admin`.
- **Input:** `{ "jobId": "ML-..." }`.
- **Ownership:** client must own the job; admins may dispatch any job.
- **Side effects:** finds matching fundis, optionally includes the first admin, sends Brevo emails.
- **Response `202`:**

```json
{
  "providerConfigured": true,
  "recipientCount": 4,
  "sentCount": 4,
  "failures": 0,
  "adminOversight": true
}
```

- **Errors:** `401` unauthenticated, `403` wrong role or wrong job, `400` missing `jobId`, `502` dispatch failure.

The normal frontend path is `jobs.create`, which also creates in-app notifications. This REST endpoint is retained for compatibility and manual/server-triggered redispatch.

---

## 3. `system`

### `system.health`

- **Type:** public query
- **Input:** `{ timestamp: number }`
- **Output:** `{ ok: true }`
- **Notes:** `timestamp` is validated but unused.

---

## 4. `auth`

### `auth.me`

- **Type:** public query
- **Output:** `null` when signed out; otherwise the current `users` row plus:
  - `avatarUrl: string | null` — one-hour signed URL for a private profile photo.
- **Side effects:** generates a Storage signed URL when a photo exists.

### `auth.register`

- **Type:** public mutation
- **Input:**

| Field | Rules |
|---|---|
| `name` | 2–120 chars, trimmed |
| `email` | valid email, ≤320 chars, lowercased |
| `password` | 8–128 chars |
| `location` | 2–255 chars, trimmed |
| `role` | `client` or `fundi`, default `client` |
| `phone` | optional, ≤32 chars |
| `trades` | optional, 1–6 values from `PILOT_TRADES` |

- **Flow:**
  1. Validate Brevo sender configuration.
  2. Validate the browser origin against `CORS_ORIGINS`.
  3. Generate a Supabase signup link with `name`, `location`, `role`, `phone`, and `trades` in user metadata.
  4. If an application user already exists, update its location/role and fundi profile data.
  5. Send the confirmation link with Brevo.
- **Output:** `{ success: true, confirmationRequired: true }`.
- **Notable errors:** `CONFLICT` for an existing email, `BAD_REQUEST` for Supabase rejection or disallowed origin, `BREVO_*` / `SUPABASE_*` mapped errors.

### `auth.login`

- **Type:** public mutation
- **Input:** `{ email, password }`.
- **Output:** `{ success: true }`.
- **Side effects:** sets access and refresh cookies.
- **Errors:** `FORBIDDEN` if the email is unconfirmed; `UNAUTHORIZED` for invalid credentials.

### `auth.resendConfirmation`

- **Type:** public mutation
- **Input:** `{ email }`.
- **Privacy behaviour:** returns `{ success: true }` without Supabase or Brevo calls when the email is absent from `public.users`.
- **Side effects:** generates a magic link and sends a confirmation email when the user exists.
- **Output:** `{ success: true }`.

### `auth.requestPasswordReset`

- **Type:** public mutation
- **Input:** `{ email }`.
- **Side effects:** generates a Supabase recovery link and sends it through Brevo.
- **Privacy behaviour:** unknown users return success silently.
- **Output:** `{ success: true }`.

### `auth.updatePassword`

- **Type:** public mutation
- **Input:** `{ accessToken, refreshToken, password }`.
- **Flow:** applies the recovery-link session, then updates the password.
- **Output:** `{ success: true }`.
- **Note:** does not sign the user in; the user must log in afterwards.

### `auth.setRole`

- **Type:** protected mutation
- **Input:** `{ role: "client" | "fundi" }`.
- **Output:** `{ role }`.
- **Rules:**
  - Admin accounts return `{ role: "admin" }` without a write.
  - A role can only be chosen while it is unset (`user`) or already the requested role.
  - Attempting to change an established role produces a generic server error. Prefer keeping role changes as a deliberate support operation.

### `auth.logout`

- **Type:** public mutation
- **Side effects:** calls Supabase admin sign-out for the access token, then clears both cookies in a `finally` block.
- **Output:** `{ success: true }`.

---

## 5. `dashboard`

### `dashboard`

- **Type:** protected query
- **Output:**

```ts
{
  role: "client" | "fundi" | "admin";
  jobs: DashboardJob[];
  fundis: DashboardFundi[];
  reports: Array<{ id, subject, type, reason, date, status }>;
  metrics: {
    registeredUsers: number;
    fundiUsers: number;
    clientUsers: number;
    jobsPosted: number;
    openJobs: number;
    completedJobs: number;
    openReports: number;
    fundisWithTrade: number;
    jobsWithLocation: number;
    ratedJobs: number;
  };
  accounts: Array<{ id, name, role, email, status: "Active" }>;
}
```

- **Visibility:**
  - Clients see only their own jobs.
  - Fundis and admins see all jobs.
  - `reports` are populated only for admins.
  - `accounts` currently contains all users for every authenticated role. Treat this as a known exposure boundary; do not add sensitive fields to it without a UI/API review.

---

## 6. `profile`

### `profile.me`

- **Type:** protected query
- **Output:** `{ profile, user, skills } | null`.
- **Notes:** returns the fundi profile belonging to the current user, if one exists.

### `profile.update`

- **Type:** protected mutation
- **Roles:** `fundi`, `admin`
- **Input:**

| Field | Rules |
|---|---|
| `serviceArea` | 2–255 chars |
| `availability` | boolean |
| `trades` | 1–6 `PILOT_TRADES` values |
| `phone` | optional, ≤32 chars |
| `experience` | optional, ≤500 chars |
| `summary` | optional, ≤600 chars |
| `latitudeE6`, `longitudeE6` | optional E6 coordinates |

- **Side effects:** upserts one `workerProfiles` row, replaces all `workerSkills` rows.
- **Output:** refreshed `getWorkerProfile` result.

### `profile.availability`

- **Type:** protected mutation
- **Roles:** `fundi` only
- **Input:** `{ available: boolean }`
- **Output:** `{ available }`
- **Error:** plain error if no fundi profile exists.

### `profile.updatePhoto`

- **Type:** protected mutation
- **Input:** `{ photo: base64 data URL, contentType: "image/jpeg" | "image/png" | "image/webp" }`
- **Limits:** decoded file ≤5 MiB.
- **Side effects:** uploads to private `profile-photos` bucket under `<authUserId>/`, deletes the previous object, stores `avatarPath` on `users`.
- **Output:** `{ avatarUrl }` — one-hour signed URL.

### `profile.removePhoto`

- **Type:** protected mutation
- **Side effects:** removes the Storage object when present and clears `avatarPath`.
- **Output:** `{ avatarUrl: null }`.

---

## 7. `jobs`

### `jobs.create`

- **Type:** protected mutation
- **Roles:** `client`
- **Input:**

| Field | Rules |
|---|---|
| `title` | 3–160 chars |
| `trade` | one of `PILOT_TRADES` |
| `description` | 10–3000 chars |
| `locationText` | 2–255 chars |
| `budget` | string parsed to a positive number ≤1,000,000,000 |
| `startDate` | `YYYY-MM-DD`, not in the past |
| `contactPreference` | `Call me`, `Text me`, `Either` |
| `radiusKm` | integer 1–50, default 10 |
| `latitudeE6`, `longitudeE6` | optional E6 coordinates |

- **Business rules:**
  - A client may not have another non-cancelled job on the same start date.
  - New jobs start as `Posted`.
- **Side effects:**
  - Inserts the job.
  - Creates one `job` in-app notification per unique matching fundi user.
  - Sends Brevo confirmation, fundi alerts, and optional admin oversight email.
- **Output:** `{ jobId, matches, notification }`.

### `jobs.update`

- **Type:** protected mutation
- **Roles:** `client`, job owner
- **Input:** `create` fields plus `jobId`.
- **Rules:** job must be `Posted` or `Interested`; future-date and same-day conflict checks still apply.
- **Output:** `{ success: true, jobId }`.

### `jobs.updateStatus`

- **Type:** protected mutation
- **Roles:** `client`, job owner
- **Input:** `{ jobId, status }`
- **Allowed transitions:**

| From | To |
|---|---|
| `Posted` | `Interested`, `Assigned`, `Cancelled` |
| `Interested` | `Accepted`, `Assigned`, `Cancelled` |
| `Accepted` | `Assigned`, `Cancelled` |
| `Assigned` | `In progress`, `Cancelled` |
| `In progress` | `Completed`, `Cancelled` |
| `Completed`, `Cancelled` | none |

- **Output:** `{ success: true }`.

### `jobs.respond`

- **Type:** protected mutation
- **Roles:** `fundi`
- **Input:** `{ jobId }`
- **Rules:**
  - The fundi must have a worker profile.
  - The job must exist and not be `Completed` or `Cancelled`.
  - The fundi cannot respond to their own job.
  - The stored start date must not be in the past.
  - One open response per fundi per start date.
  - Duplicate responses to the same job are a no-op.
- **Side effects:** inserts `Interested` response, notifies the client, moves a `Posted` job to `Interested`.
- **Output:** `{ success: true }`.
- **Boundary:** the server does not re-check trade or radius at response time; matching controls alerts and dashboard ranking, not eligibility to respond.

### `jobs.responses`

- **Type:** protected query
- **Roles:** `client`, job owner
- **Input:** `{ jobId }`
- **Output:** `JobResponder[]` — responder profile fields plus `workerId`, `userId`, `responseId`, `responseStatus`.
- **Order:** newest responses first.

### `jobs.decideResponse`

- **Type:** protected mutation
- **Roles:** `client`, job owner
- **Input:** `{ jobId, workerId, decision: "accept" | "decline" }`
- **Accept effects:**
  - Every other response for the job becomes `Declined`.
  - Chosen response becomes `Accepted`.
  - Job status becomes `Assigned`.
  - Fundi receives a `decision` notification and an acceptance email.
- **Decline effects:** chosen response becomes `Declined`; fundi receives a `decision` notification.
- **Output:** `{ success: true }`.

### `jobs.rate`

- **Type:** protected mutation
- **Roles:** `client`, job owner
- **Input:** `{ jobId, score: 1–5, comment?: string ≤1000 }`
- **Rules:** job must be `Completed`; one rating per client per job.
- **Target selection:** most recent `Accepted` response, otherwise most recent response of any status.
- **Output:** `{ success: true }`.

### `jobs.report`

- **Type:** protected mutation
- **Input:** `{ subjectType: "Profile" | "Job post" | "Conduct", reason: 5–1000 chars, jobId?, reportedUserId? }`
- **Rules:** at least one of `jobId` or `reportedUserId` is required.
- **Side effects:** inserts a report with status `Review` and an `R-` prefixed ID.
- **Output:** `{ success: true }`.

---

## 8. `inbox`

Chat is deliberately client-initiated. A fundi can only use conversations that already exist.

### `inbox.list`

- **Type:** protected query
- **Output:** `InboxConversation[]` with `id`, `jobId`, `jobTitle`, `otherParty`, `otherPartyRole`, `lastMessage`, `lastMessageAt`, and `unreadCount`.
- **Selection:** fundis see conversations where they are the worker; everyone else sees conversations where they are the client.

### `inbox.open`

- **Type:** protected mutation
- **Roles:** `client`, job owner
- **Input:** `{ jobId, workerId }`
- **Rules:** an `Accepted` response must exist.
- **Side effects:** creates or reuses one conversation per job+worker, notifies the fundi, sends a chat email on first creation.
- **Output:** `{ conversationId }`.

### `inbox.messages`

- **Type:** protected query
- **Input:** `{ conversationId }`
- **Access:** participant only.
- **Output:** `InboxMessage[]` ordered oldest to newest.

### `inbox.send`

- **Type:** protected mutation
- **Input:** `{ conversationId, body: 1–2000 chars }`
- **Access:** participant only.
- **Side effects:** inserts message, updates conversation timestamp, notifies and emails the other participant.
- **Output:** `{ success: true }`.

### `inbox.markRead`

- **Type:** protected mutation
- **Input:** `{ conversationId }`
- **Access:** participant only.
- **Side effects:** marks unread messages from others as read and clears related unread notifications for that conversation.
- **Output:** `{ success: true }`.

---

## 9. `notifications`

### `notifications.list`

- **Type:** protected query
- **Output:** up to 50 newest notifications for the current user.

```ts
{
  id: number;
  type: "job" | "interest" | "decision" | "chat" | "message";
  title: string;
  body: string;
  jobId: string | null;
  conversationId: number | null;
  isRead: boolean;
  createdAt: string;
}
```

### `notifications.markRead`

- **Type:** protected mutation
- **Input:** `{ id }`
- **Side effects:** marks that notification read only if it belongs to the current user.
- **Output:** `{ success: true }`.

### `notifications.markAllRead`

- **Type:** protected mutation
- **Side effects:** marks all unread notifications for the current user as read.
- **Output:** `{ success: true }`.

---

## 10. `admin`

### `admin.resolveReport`

- **Type:** admin mutation
- **Input:** `{ reportId }`
- **Side effects:** sets `status = "Resolved"`, `resolvedAt`, and `resolvedBy`.
- **Output:** `{ success: true }`.
- **Note:** succeeds even when the ID does not exist; it is an idempotent update by design.

---

## 11. Identity, coordinates, and date formats

### Identity

- IDs on jobs are `ML-` plus 8 uppercase nanoid characters, for example `ML-A1B2C3D4`.
- IDs on reports are `R-` plus 8 uppercase nanoid characters.
- Internal numeric IDs are used for users, profiles, conversations, messages, notifications, ratings, and reports' database primary key.

### Coordinates

Latitude and longitude are accepted as integer E6 values:

```text
latitudeE6  = round(latitude  * 1_000_000)
longitudeE6 = round(longitude * 1_000_000)
```

Example: `0.051420° N, 35.269680° E` becomes `51420` and `35269680`.

### Dates

`startDate` must be `YYYY-MM-DD`. The server validates the calendar date and rejects past dates. Today is allowed. The same-day uniqueness rule applies per client for jobs and per fundi for responses.
