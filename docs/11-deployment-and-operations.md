# Deployment and operations

## Production topology

```text
Vercel:  static React app (dist/public)
Render:  Express + tRPC API (dist/index.js)
Supabase: Auth + PostgreSQL + Storage
Brevo:   transactional email
```

The frontend calls `VITE_API_BASE_URL + /api/trpc` with credentials. The API allows only origins listed in `CORS_ORIGINS`.

Pushing to `main` triggers deployment in the configured Render/Vercel projects. Use deliberate commits and obtain approval before pushing production changes.

## Render API service

Defined in `render.yaml`:

| Setting | Value |
|---|---|
| Service type | Web service |
| Name | `mjengolink-api` |
| Runtime | Node |
| Plan | Free |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Start command | `pnpm start` |
| Health check | `/api/health` |

Environment variables (all `sync: false`, so set them manually):

| Variable | Value guidance |
|---|---|
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret |
| `DATABASE_URL` | Supabase PostgreSQL URI; use Session pooler on port 5432 for IPv4-only hosts |
| `CORS_ORIGINS` | Exact frontend origin, e.g. `https://mjengolink.vercel.app` |
| `BREVO_API_KEY` | Server-only Brevo key |
| `EMAIL_FROM` | Verified sender, e.g. `MjengoLink <machariaallan881@gmail.com>` |
| `EMAIL_REPLY_TO` | Optional; often left empty |

Never place these values in the repository, docs, screenshots, or browser-side configuration.

## Vercel frontend

Defined in `vercel.json`:

| Setting | Value |
|---|---|
| Build command | `pnpm build:static` |
| Output directory | `dist/public` |
| Rewrite | all paths → `/index.html` |

Set `VITE_API_BASE_URL` to the Render API **origin**, without `/api`:

```text
https://mjengolink-backend.onrender.com
```

Changing this value requires a redeploy because Vite inlines it at build time.

## Supabase configuration

### SQL

For a fresh project run `supabase/setup.sql` once in the SQL Editor.

For an existing project, in order:

1. `drizzle/migrations/0001_profile_conversations.sql`
2. `drizzle/migrations/0002_notifications.sql`

The second migration depends on `conversations` from the first.

### Auth URL configuration

In Supabase → Authentication → URL Configuration:

- **Site URL:** exact frontend origin, e.g. `https://mjengolink.vercel.app`.
- **Redirect URLs:** `https://mjengolink.vercel.app/**`.

A localhost Site URL makes deployed confirmation and recovery links redirect to localhost.

Keep email confirmations enabled.

### Admin account

1. Register and confirm the account.
2. Set `public.users.role = 'admin'` in SQL.
3. Sign out and back in so `auth.me` reflects the new role.

Admin cannot be selected during registration or onboarding.

### Storage

Ensure the private `profile-photos` bucket exists with the per-user policies from the SQL. `job-attachments` is provisioned but unused.

### Connection string

For Render or other IPv4-only hosts, use Supabase **Session pooler** on port 5432. The Direct connection may require IPv6.

## Email production notes

- Verify the Brevo sender address or domain.
- Use a real `EMAIL_FROM`; placeholders intentionally disable or reject delivery.
- Keep Supabase email confirmations enabled; Supabase generates links but Brevo delivers them.
- If Brevo click tracking wraps Supabase URLs, disable click tracking to expose raw links.
- Monitor Brevo daily limits and delivery logs.
- Do not expose the Brevo API key.

## Cookie behavior in production

Production cookies use `Secure` and `SameSite=None`, and the client sends `credentials: "include"`. This supports Vercel → Render cross-site requests.

For the most reliable cookie behaviour, use custom domains on the same parent domain. If sessions repeatedly disappear, verify:

- HTTPS on both frontend and API;
- exact `CORS_ORIGINS`;
- Supabase Site URL and redirect URLs;
- cookie attributes in browser developer tools;
- no conflicting proxy or domain settings.

## Pre-deploy checklist

Run locally:

```bash
pnpm check
pnpm test
pnpm build
```

Then confirm:

- [ ] SQL migrations for the current schema change have been applied in Supabase.
- [ ] `CORS_ORIGINS` contains the exact frontend origin.
- [ ] `VITE_API_BASE_URL` contains the API origin without `/api`.
- [ ] Supabase Site URL and redirect URLs point to the frontend.
- [ ] Brevo key and verified sender are set on the backend only.
- [ ] `DATABASE_URL` and service-role key are server-only.
- [ ] No secrets are committed in the diff.
- [ ] `GET /api/health` returns `{ "status": "ok" }`.
- [ ] Auth confirmation and password reset work with a fresh test email.
- [ ] Notification Bell works for client and fundi accounts.
- [ ] Profile photo upload works if Storage changed.
- [ ] Rollback point is known.

## Post-deploy smoke test

1. Open the frontend and check browser console for `Origin is not allowed`.
2. Sign in as a client.
3. Sign in as a fundi in another browser profile.
4. Post a job with a future date.
5. Verify the fundi Bell notification and client confirmation email.
6. Show interest as the fundi; verify the client Bell notification.
7. Accept the fundi; verify decision notification and email.
8. Open chat and send messages both ways.
9. Advance the job to `Completed` and leave a rating.
10. Check Render logs for unexpected `INTERNAL_SERVER_ERROR` entries.

## Observability

- Render health check: `/api/health`.
- tRPC errors are logged only for `INTERNAL_SERVER_ERROR`; root causes and provider `code` values are unwrapped.
- React Query errors are logged in the browser as `[API Query Error]` and `[API Mutation Error]`.
- Conversation email failures produce `[notifications] conversation email failed` warnings and are non-fatal.

## Rollback

Rollback is a git operation plus redeploy:

1. Identify the last known-good commit.
2. Revert or redeploy that commit on both Render and Vercel.
3. If the change included a database migration, decide separately whether to reverse it. Avoid destructive SQL rollback unless data loss is acceptable.
4. Re-run the smoke test.

Schema changes and application code deploy independently: a new backend version that expects a missing table will fail. Always apply additive SQL first.

## Docker alternative

`Dockerfile` builds a full-stack image on Node 22:

```bash
docker build -t mjengolink .
docker run -p 3000:3000 --env-file .env mjengolink
```

The container serves both the API and built client. It still needs the same Supabase, Brevo, CORS, and database configuration.
