# Known limitations and roadmap

This document records current boundaries honestly. Some are deliberate product decisions; others are technical debt worth addressing.

## Deliberate product boundaries

The pilot explicitly does not include:

- payments, escrow, invoicing, or payroll;
- identity-document verification;
- insurance;
- formal trade certification;
- dispute adjudication or contract enforcement;
- contractor tendering;
- government employment-database integration;
- mobile push notifications;
- notification preference controls or quiet hours.

Ratings are job-linked feedback. The UI states that they do not represent certification or identity guarantees.

## Current technical limitations

### API and authorization

| Limitation | Impact | Suggested direction |
|---|---|---|
| `dashboard.accounts` returns all users' name/email/role to any authenticated caller | Broad visibility inside the pilot | Restrict to admins or a redacted directory shape |
| `jobs.respond` does not recheck trade/radius | A fundi can respond to a job outside their profile match | Decide whether matching should be a hard eligibility rule; if so, enforce server-side |
| `jobs.respond` allows `Assigned` and `In progress` jobs | Interest can be recorded after assignment | Reject non-open statuses if the product requires a single active fundi |
| `jobs.decideResponse` has no job-status precondition | A response can be accepted on a terminal or unrelated state | Add explicit transition checks |
| `jobs.report` does not validate that target IDs exist | Reports can reference arbitrary IDs | Add target existence checks |
| `admin.resolveReport` and `notifications.markRead` succeed for missing IDs | Updates are idempotent but opaque | Return `NOT_FOUND` if callers need feedback |
| No backend rate limiting | Auth/email endpoints can be abused | Add per-IP/per-account throttling |

### Error handling

Several procedures still throw plain `Error(...)`:

- `money()` parse failures;
- `auth.setRole` already-set role;
- profile database errors;
- `jobs.update` ownership and status errors;
- `inbox.open` conversation creation failure;
- `jobs.report` missing target.

These become generic `INTERNAL_SERVER_ERROR` messages. Convert user-facing cases to `TRPCError` with appropriate codes.

### Data model

- Drizzle schema does not declare many SQL constraints, indexes, cascade rules, or the `auth.users` foreign key. A Drizzle-generated schema could weaken production structure.
- `drizzle/relations.ts` is empty.
- There is no migration runner; SQL is applied manually.
- `0001` drops the legacy `serviceArea` default but does not backfill existing rows.
- `notifications.jobId` and `conversationId` are plain columns in Drizzle but cascade FKs in SQL.
- SQL uses identity columns where Drizzle uses `serial`.

### Inbox

- `getInbox()` selects messages without an explicit `ORDER BY` before choosing the last message. Add `orderBy(messages.createdAt)` for deterministic previews.
- Chat is intentionally client-initiated. Fundis cannot start conversations with clients directly.
- There is no attachment support in chat; the `job-attachments` bucket is provisioned but unused.

### Notifications and email

- Notification list is capped at 50 rows; older records are not archived.
- No push notifications or email digest.
- No per-user notification preferences.
- Conversation emails are fire-and-forget; delivery is not retried or persisted.
- Provider message IDs and delivery receipts are not stored.
- Job-notification result reports counts but not individual failures.
- Brevo click tracking can rewrite Supabase URLs; disable it when raw links are required.
- Unknown emails on resend/reset are silently accepted to prevent enumeration; this is intentional.

### Frontend

- Most UI is concentrated in a very large `Home.tsx`, producing a large client bundle.
- Only `/` and `/404` are real routes; navigation is state-based.
- Client overview “View all” uses DOM `nth-of-type` clicks instead of `setActiveNav`.
- Fundi directory “Filters”, opportunity “Save job”, and admin “View report” controls are inert.
- No report-submission form exists despite the server procedure.
- Photo size is checked only after upload; the client validates MIME type only.
- Sonner uses `next-themes` while the app uses a separate local theme provider.
- A generated shadcn component layer and alternative `DashboardLayout` are unused.
- No frontend tests are configured.

### Operations

- Pushing to `main` triggers deployment; maintainer approval should precede production pushes.
- Production depends on exact external configuration: Supabase Site URL, redirect URLs, `CORS_ORIGINS`, `VITE_API_BASE_URL`, Brevo sender, and Storage policies.
- Render free-plan cold starts can make first requests slow.
- Build logs may contain `ELIFECYCLE Command failed` lines alongside successful startup messages; verify with `/api/health` and actual requests rather than one log line.
- There is no structured logging or alerting beyond Render logs and browser console logs.

## Suggested roadmap

### Priority 1 — correctness and safety

1. Convert remaining plain validation errors to `TRPCError`.
2. Add `ORDER BY` to inbox last-message selection.
3. Restrict `dashboard.accounts` to admins or redacted data.
4. Add tests for job lifecycle, inbox access, notifications, and profile photos.
5. Document and verify a stable migration procedure.

### Priority 2 — product completeness

1. Add a report-submission UI connected to `jobs.report`.
2. Enforce or explicitly document response eligibility after assignment.
3. Add notification preferences and delivery history.
4. Add client-side image size validation before upload.
5. Replace DOM `nth-of-type` navigation with explicit state.
6. Remove or wire up inert buttons.

### Priority 3 — maintainability

1. Split `Home.tsx` into feature modules and route components.
2. Introduce code splitting to reduce the main chunk.
3. Remove unused scaffold components or label them clearly as design-system reference.
4. Add frontend testing infrastructure.
5. Add Drizzle relations and consider generating SQL checks from a single schema source.
6. Add structured server logging with request IDs.

### Later possibilities

- Push notifications via Web Push.
- Email digests and quiet hours.
- Attachment support using the existing private `job-attachments` bucket.
- Dispute workflow, still outside the current pilot boundary.
- Payment and escrow integration, only if the pilot scope changes.

## Historical documents

The root files remain useful context:

- `NOTIFICATIONS.md` — original role and anti-broadcast rationale.
- `plan.md` — design direction and pilot scope.
- `TODO.md` — delivery checklist and out-of-scope list.

They are not maintained as current API or operations references.
