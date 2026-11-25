# Testing and maintenance

## Commands

| Command | Purpose |
|---|---|
| `pnpm install --frozen-lockfile` | Install exact locked dependencies |
| `pnpm dev` | Full-stack development with Vite middleware |
| `pnpm dev:static` | Frontend-only Vite dev server |
| `pnpm check` | TypeScript typecheck |
| `pnpm test` | Vitest run |
| `pnpm build` | Build client and server bundles |
| `pnpm build:static` | Build only the static client |
| `pnpm start` | Serve the production build |
| `pnpm format` | Run Prettier across the repository |

Node `>=22` and pnpm `10.18.0` are expected.

## Verification baseline

The current baseline is:

```text
pnpm check  → no TypeScript errors
pnpm test   → 5 test files, 18 tests passing
pnpm build  → succeeds; Vite chunk-size warning is expected
```

The chunk-size warning is informational. The main client bundle is intentionally large because most application UI lives in `Home.tsx` and the app imports a broad Lucide icon set.

## Test setup

Vitest config: `vitest.config.ts`.

- Environment: Node.
- Includes `server/**/*.test.ts` and `server/**/*.spec.ts`.
- Aliases `@`, `@shared`, `@assets`.
- No client tests are configured.
- Test files are excluded from `tsc` by `tsconfig.json`.

### Existing suites

| File | Coverage |
|---|---|
| `server/_core/auth.test.ts` | Cookie options, HTTP-only/secure attributes, access token max age |
| `server/session.test.ts` | Cookie names and secure/same-site behaviour |
| `server/auth.logout.test.ts` | Logout clears both cookies |
| `server/auth.flows.test.ts` | Register/login/resend/reset flows, redirect validation, duplicate email, missing config, origin rejection |
| `server/emailNotifications.test.ts` | Brevo error mapping, sender/reply-to parsing, chat email content |

Mocking conventions:

- `vi.mock` / `vi.hoisted` for Supabase, DB, and email modules.
- `appRouter.createCaller(...)` for procedure-level auth tests.
- `vi.stubEnv` and `vi.unstubAllEnvs` for environment variables.
- `vi.stubGlobal("fetch", ...)` for Brevo HTTP calls.

## Coverage gaps

No automated tests currently cover:

- job lifecycle transitions;
- matching and Haversine distance;
- response decision side effects;
- ratings;
- inbox access control and messaging;
- notification creation/routing;
- admin report resolution;
- profile photo upload/remove;
- REST job-notification endpoint;
- any React component behaviour.

When changing these areas, add tests around authorization and side effects first.

## Recommended test additions

### Backend

1. `jobs.create` with duplicate date → `CONFLICT`, no insert.
2. `jobs.respond` on own job → `FORBIDDEN`.
3. `jobs.decideResponse(accept)` → other responses declined, job `Assigned`, fundi notified.
4. `inbox.open` without `Accepted` response → `BAD_REQUEST`.
5. `inbox.send` by non-participant → `FORBIDDEN`.
6. `jobs.rate` on non-completed job → `BAD_REQUEST`.
7. `notifications.markRead` with another user's ID → no effect.
8. `profile.updatePhoto` with oversized/non-image data → `BAD_REQUEST`.

### Frontend

A future frontend test setup could cover:

- signed-out state renders auth form;
- `user` role renders onboarding;
- own job hides “Show interest”;
- notification unread count and modal routing;
- accept response reveals “Open chat”;
- logout clears cache and navigates home.

## Feature-extension patterns

### Add a tRPC procedure

1. Define input with Zod in `server/routers.ts`.
2. Choose `publicProcedure`, `protectedProcedure`, or `adminProcedure`.
3. Add `requireRole` if the action is role-specific.
4. Recheck ownership with `isJobClient` or conversation access where relevant.
5. Use explicit `TRPCError` for user-facing validation.
6. Return a stable object shape.
7. Add frontend query/mutation with the correct invalidation.
8. Add tests for authorization and side effects.
9. Update [`06-api-reference.md`](./06-api-reference.md) and relevant workflow docs.

### Add a database field

1. Add it to `drizzle/schema.ts`.
2. Add it to `supabase/setup.sql` for fresh projects.
3. Add an idempotent migration in `drizzle/migrations/` for existing projects.
4. Apply the migration in Supabase before deploying code.
5. Update [`04-data-model.md`](./04-data-model.md).
6. Update any affected API outputs and UI.

Remember that Drizzle does not declare all indexes and constraints; add them in SQL.

### Add a notification type

1. Extend the `type` union in `createNotification()` and API docs.
2. Insert notifications at the correct server-side event.
3. Add an icon/routing case in `NotificationModal` and `openNotification`.
4. Decide whether an email is also required.
5. Update [`10-notifications-and-email.md`](./10-notifications-and-email.md).

### Add a new modal to `Home.tsx`

1. Add a boolean state and a small component near the other modal components.
2. Mount it in the conditional overlay section of the app shell.
3. Use `.modal-scrim` with `stopPropagation` on the inner panel.
4. Keep destructive actions explicit.
5. Invalidate affected queries after success.
6. Update [`08-frontend-guide.md`](./08-frontend-guide.md) if it changes the component map.

## Code style

- TypeScript with strict mode.
- Functional React components and `useState`/effects; no global state manager.
- Server logic uses tRPC procedures and domain helpers.
- Prefer explicit return types for domain helpers that shape API output.
- Use `TRPCError` for user-facing errors rather than plain `Error`.
- Keep secrets in environment variables and read them through `server/_core/env.ts`.
- Use the existing CSS tokens and classes in `client/src/index.css` for rendered UI.
- Keep email templates HTML-escaped.

## Documentation maintenance

`docs/` is the current source of truth. When behaviour changes, update:

| Change | Documents to review |
|---|---|
| Auth/session | `05-authentication-and-security.md`, `03-getting-started.md`, `11-deployment-and-operations.md` |
| API procedure | `06-api-reference.md`, `09-backend-guide.md` |
| Schema | `04-data-model.md`, `03-getting-started.md` |
| UI flow | `07-user-workflows.md`, `08-frontend-guide.md` |
| Email/notification | `10-notifications-and-email.md` |
| Deployment/env | `11-deployment-and-operations.md`, `03-getting-started.md` |
| New limitation | `13-known-limitations-and-roadmap.md` |

Root `NOTIFICATIONS.md`, `plan.md`, and `TODO.md` are historical artefacts and are not updated as part of normal feature work.

## Troubleshooting

| Symptom | Check |
|---|---|
| `Origin is not allowed` | `CORS_ORIGINS` exact value; frontend origin; redeploy after env change |
| Generic `An unexpected server error occurred.` | Render logs; look for plain `Error` throws or provider cause codes |
| Auth email not delivered | Brevo key/sender, verified sender, logs, spam, daily quota |
| Bell empty after job post | `0002_notifications.sql` applied; fundi matched trade/availability/radius |
| `Database is not available` | `DATABASE_URL`, Supabase pooler, network/IPv6 |
| Refresh loop or instant logout | cookie domain, HTTPS, `SameSite=None`, Supabase redirect config |
| Photo upload fails | bucket/policies, MIME type, 5 MiB decoded size, service-role key |
| Rating returns clear “no linked fundi” | older job has no response; decisions are recorded in `job_responses` |
| Stale dashboard data | check mutation invalidation and query enabled conditions |
| Old cached UI after deploy | hard refresh; Vercel build used latest `VITE_API_BASE_URL` |
