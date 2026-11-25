# Authentication and security

## Identity model

Authentication is owned by **Supabase Auth**. Application identity, role, and profile data live in `public.users`. The two are linked by `users.auth_user_id = auth.users.id`.

```text
Supabase Auth identity
  → raw_user_meta_data: name, location, role, phone, trades
  → SQL trigger sync_mjengolink_auth_user()
  → public.users row
  → tRPC context user
```

The browser never receives the service-role key or database credentials. It only holds HTTP-only cookies set by the server.

## Session cookies

Cookie names are defined in `server/_core/auth.ts`:

| Cookie | Purpose | Lifetime |
|---|---|---|
| `mjengolink_access_token` | Supabase access token | From Supabase `expires_in` |
| `mjengolink_refresh_token` | Supabase refresh token | 30 days |

Options from `server/_core/cookies.ts`:

- `httpOnly: true`
- `path: "/"`
- `sameSite: "none"` in production, `"lax"` in development
- `secure` when the request is HTTPS, forwarded as HTTPS, or `NODE_ENV=production`

The client tRPC link sends `credentials: "include"`.

## Request authentication

`authenticateRequest()` runs for every tRPC request and for the REST notification endpoint.

1. Parse the `Cookie` header. No tokens → `ctx.user = null`.
2. Verify the access token with Supabase `getUser(accessToken)`.
3. On 401/403 or no verified user, try `refreshSession(refreshToken)`.
4. On successful refresh, re-set both cookies.
5. On failed refresh, clear cookies and return signed out.
6. Load the application user by `users.authUserId = authUser.id`.
7. Missing application user → server error: `Supabase account is missing its MjengoLink profile`.

## Registration

`auth.register` requires:

| Field | Validation |
|---|---|
| `name` | 2–120 chars |
| `email` | valid, ≤320 chars, lowercased |
| `password` | 8–128 chars |
| `location` | 2–255 chars, supplied by the user |
| `role` | `client` or `fundi` |
| `phone` | optional, ≤32 chars |
| `trades` | optional, 1–6 pilot trades |

Flow:

1. Validate Brevo sender configuration **before** creating anything in Supabase.
2. Validate the request origin against `CORS_ORIGINS`.
3. Call Supabase admin `generateLink({ type: "signup", ... })` with metadata.
4. If an application user already exists, update its location/role and fundi profile data.
5. Send the Supabase-generated confirmation link through Brevo.

Existing email addresses return a `CONFLICT` message that points the user to “Resend confirmation email”.

## Login

`auth.login` uses Supabase `signInWithPassword`.

- Unconfirmed email → `FORBIDDEN` with a confirmation instruction.
- Invalid credentials → `UNAUTHORIZED`.
- Success → access and refresh cookies are set and `auth.me` is invalidated on the client.

## Resend confirmation

`auth.resendConfirmation` deliberately avoids account enumeration:

- If the email is absent from `public.users`, it returns `{ success: true }` without calling Supabase or Brevo.
- If present, it generates a magic link and sends a confirmation email.

The login UI exposes this as a Sonner toast action, not a fixed page block.

## Password reset

1. `auth.requestPasswordReset` generates a Supabase recovery link and sends it via Brevo.
2. The link redirects to `/?auth=password-reset` with hash tokens.
3. `Home.tsx` detects the hash and switches to reset mode.
4. `auth.updatePassword` applies the recovery session and sets a new password.
5. The user is returned to sign-in; no application cookies are set by the reset procedure.

Unknown emails also return success silently.

## Logout

`auth.logout`:

1. Calls Supabase admin `auth.admin.signOut(accessToken, "local")` when an access token exists.
2. Logs and ignores provider failures.
3. Clears both cookies in a `finally` block.

The frontend clears the React Query cache and calls `window.location.replace("/")`, forcing a fresh session check so a cached admin view cannot survive logout.

## Roles and authorization

### Server roles

| Role | Granted how | Capabilities |
|---|---|---|
| `user` | Default after signup | Onboarding only |
| `client` | Registration or one-time onboarding | Jobs, responses, ratings, chat creation |
| `fundi` | Registration or one-time onboarding | Profile, interest, chat participation |
| `admin` | Manual SQL update only | Moderation and oversight |

### Procedure guards

| Guard | Enforced in | Purpose |
|---|---|---|
| `protectedProcedure` | `server/_core/trpc.ts` | Requires any authenticated application user |
| `adminProcedure` | `server/_core/trpc.ts` | Requires `role === "admin"` |
| `requireRole(role, allowed)` | `server/routers.ts` | Per-action role rules; legacy `user` is treated as `client` |
| `isJobClient(jobId, userId)` | `server/mjengo.ts` | Only the client who owns a job may manage it |
| `getConversationAccess(...)` | `server/mjengo.ts` | Only conversation participants may read/write messages |

Important: hiding a button in React is never the security boundary. Every mutating procedure rechecks identity, role, and ownership.

### Key role rules

- “Show interest” is shown only to fundis and hidden on a fundi's own job postings. `jobs.respond` rejects own jobs.
- Only a job's client can review responses, accept/decline, open chat, edit, advance, or rate that job.
- Only clients can open conversations. Fundis can only use existing conversations.
- Admin is not implicitly a client in `requireRole`; admin-specific procedures use `adminProcedure`.

## Business-rule safeguards

### Job scheduling

- `startDate` must be a real `YYYY-MM-DD` date and not in the past.
- A client cannot have two non-cancelled jobs on the same start date.
- A fundi cannot have two open responses on the same start date.
- The stored date is revalidated when responding, not just when posting.

These rules are authoritative on the server. The date input `min` attribute is only a convenience.

### Job lifecycle

Allowed transitions are enforced in `jobs.updateStatus`:

| From | To |
|---|---|
| `Posted` | `Interested`, `Assigned`, `Cancelled` |
| `Interested` | `Accepted`, `Assigned`, `Cancelled` |
| `Accepted` | `Assigned`, `Cancelled` |
| `Assigned` | `In progress`, `Cancelled` |
| `In progress` | `Completed`, `Cancelled` |
| `Completed`, `Cancelled` | none |

### Chat access

- An `Accepted` response must exist before `inbox.open`.
- Conversations are unique per job and worker.
- Message reads and writes require participation.
- `inbox.markRead` clears both unread messages and related notifications for that conversation.

## CORS and origins

`CORS_ORIGINS` is a comma-separated list of exact origins.

- No `Origin` header → request passes without CORS headers.
- Allowed origin → `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`, `Vary: Origin`.
- Disallowed origin → `403 { "error": "Origin is not allowed" }`.
- Preflight `OPTIONS` → `204` with `GET, POST, OPTIONS`, requested headers, max age 600.

The same allowlist constrains authentication redirects. Auth links are built from the request origin or the first configured origin, then rejected if that origin is not allowed.

## Database and Storage security

- RLS is enabled on every application table.
- All table and sequence privileges are revoked from `anon` and `authenticated`.
- No permissive application-table policies exist.
- The service-role key is used only on the server.
- Storage objects are private. Policies restrict the first path segment to the authenticated user's UUID.
- Avatar URLs are one-hour signed URLs, not public URLs.

## Error hygiene

- Stack traces are removed from tRPC error responses.
- `BREVO_*` and `SUPABASE_*` internal causes become generic user-safe messages.
- Email templates escape user-controlled strings.
- Unknown emails on confirmation/resend return success without revealing account existence.
- Plain `Error(...)` calls still become generic `INTERNAL_SERVER_ERROR`; prefer explicit `TRPCError` for user-facing validation when modifying procedures.

## Known exposure boundaries

These are current behaviours to be aware of during reviews:

- `dashboard.accounts` returns all users' name, email, and role to every authenticated caller. Do not add sensitive fields without revisiting this.
- `jobs.respond` does not re-check trade or radius; matching controls alerts and ranking, not response eligibility.
- `jobs.decideResponse` does not require a particular current job status.
- `admin.resolveReport` and `notifications.markRead` are idempotent updates that succeed even when the target row does not exist.
- There is no backend rate limiting. The confirmation-cooldown constant in `shared/const.ts` is currently unused.
