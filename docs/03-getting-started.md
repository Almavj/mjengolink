# Getting started

## Prerequisites

| Requirement | Version / notes |
|---|---|
| Node.js | `>=22` (see `package.json`) |
| pnpm | `10.18.0` is pinned in `package.json` |
| Supabase project | PostgreSQL, Auth, and Storage |
| Brevo account | Only needed for real email delivery |
| Render / Vercel accounts | Only needed for production deployment |

## 1. Install dependencies

```bash
pnpm install --frozen-lockfile
```

## 2. Create the database schema

### Fresh Supabase project

Run [`../supabase/setup.sql`](../supabase/setup.sql) in the Supabase SQL Editor. It creates:

- All application tables and indexes.
- The auth-to-profile sync trigger and one-time backfill.
- `updatedAt` triggers.
- Row-level security and revoked direct access for `anon` and `authenticated`.
- Private `profile-photos` and `job-attachments` buckets with per-user policies.

This file is the canonical schema for a new database.

### Existing database

If the database was created before profile photos, conversations, messages, or notifications existed, apply the incremental migrations in order:

```text
drizzle/migrations/0001_profile_conversations.sql
drizzle/migrations/0002_notifications.sql
```

`0001` adds `users.location`, `users.avatar_path`, conversations, messages, the auth sync function/trigger, the updated-at trigger, and the private `profile-photos` bucket/policies.

`0002` adds the `notifications` table, index, RLS, and privilege revocation.

There is no `drizzle-kit` migration runner. These SQL files are applied manually in the Supabase SQL Editor.

## 3. Configure environment variables

Copy `.env.example` to `.env` and fill in the values. Keep this file local; it is gitignored.

```bash
cp .env.example .env
```

### Server variables

| Variable | Required for | Notes |
|---|---|---|
| `SUPABASE_URL` | All Supabase clients | Project URL |
| `SUPABASE_ANON_KEY` | Login, session verification, password update | Server-side in this codebase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auth link generation, sign-out, Storage helpers | **Secret**; never expose to the browser |
| `DATABASE_URL` | Application data | Supabase PostgreSQL connection string. For IPv4-only hosts use the Session pooler on port 5432. **Secret** |
| `CORS_ORIGINS` | Browser requests with an `Origin` header | Comma-separated exact origins, e.g. `https://mjengolink.vercel.app` |
| `BREVO_API_KEY` | Email delivery | **Secret** |
| `EMAIL_FROM` | Email delivery | Verified Brevo sender; `Name <email>` or bare email |
| `EMAIL_REPLY_TO` | Optional reply-to header | Ignored when invalid |
| `PORT` | Server listen port | Optional; defaults to `3000` |
| `NODE_ENV` | Runtime mode | Set by scripts: `development` for `pnpm dev`, `production` for `pnpm start` |

### Client variables

| Variable | Required for | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | Vercel frontend calling Render API | API **origin** only, e.g. `https://your-api.onrender.com`. Leave empty for same-origin development. Baked into the bundle at build time |

Example local full-stack `.env`:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://...
CORS_ORIGINS=http://localhost:3000
BREVO_API_KEY=your-brevo-key
EMAIL_FROM=MjengoLink <verified@example.com>
EMAIL_REPLY_TO=
VITE_API_BASE_URL=
```

Do not paste real keys into issues, chat, screenshots, or documentation.

## 4. Configure Supabase Auth

In Supabase → Authentication → URL Configuration:

- **Site URL:** the exact frontend origin, for example `https://mjengolink.vercel.app`.
- **Redirect URLs:** add `<frontend-origin>/**`.

Auth confirmations must remain enabled. Supabase generates confirmation and recovery links, but Brevo sends the actual messages.

## 5. Grant an admin account

1. Register and confirm a normal account.
2. In the Supabase SQL Editor, set that account's application role:

```sql
update public.users
set role = 'admin', "updatedAt" = now()
where email = lower('admin@example.com');
```

Admin is not selectable during sign-up or onboarding.

## 6. Run the app

### Full-stack development server

```bash
pnpm dev
```

This starts Express with Vite middleware on `http://localhost:3000` (or `$PORT`) and supports hot reload.

### Static-only frontend development

```bash
pnpm dev:static
```

This is useful when the API is already running elsewhere and `VITE_API_BASE_URL` points to it.

## 7. Verify the installation

```bash
pnpm check
pnpm test
pnpm build
```

Expected result:

- `pnpm check` — no TypeScript errors.
- `pnpm test` — 5 test files, 18 tests passing.
- `pnpm build` — client assets in `dist/public/`, server bundle at `dist/index.js`. A Vite chunk-size warning is expected and non-fatal.

## 8. First-use smoke test

1. Register a **client** with your own name and location. Confirm the email.
2. Register a **fundi** with a trade and location. Confirm the email.
3. Complete the fundi profile and keep availability on.
4. As the client, post a job with a future start date.
5. Confirm:
   - The fundi sees a new-job notification in the Bell menu.
   - The client receives a confirmation email if Brevo is configured.
6. As the fundi, show interest.
7. Confirm the client sees an interest notification.
8. As the client, review the response and accept the fundi.
9. Confirm the fundi sees a decision notification and acceptance email.
10. Open the private chat as the client and send a message.
11. Confirm the fundi sees a message notification and email.
12. Move the job to `Completed` and submit a rating.

## Common setup problems

| Symptom | Likely cause |
|---|---|
| `Origin is not allowed` | The browser origin is missing from `CORS_ORIGINS` |
| Confirmation link redirects to localhost | Supabase Site URL still points to localhost |
| Auth emails never arrive | Missing Brevo key, unverified sender, or placeholder `EMAIL_FROM` |
| `Database is not available` | Missing or invalid `DATABASE_URL` |
| Bell menu shows no notifications | `0002_notifications.sql` was not applied, or no triggering event occurred |
| Profile photo upload fails | `profile-photos` bucket/policies missing, or file is not JPEG/PNG/WebP under 5 MiB |
| Signed out immediately after login | Cross-site cookie configuration or Supabase redirect configuration is wrong |
