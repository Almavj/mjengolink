# MjengoLink

TypeScript React / Express / tRPC / Drizzle application for the MjengoLink Eldoret pilot, using Supabase Auth, PostgreSQL, Supabase Storage and Brevo email delivery.

## Full documentation

The complete source-controlled documentation is in [`docs/00-documentation-index.md`](./docs/00-documentation-index.md).

Start here:

- [Project overview](./docs/01-project-overview.md)
- [Architecture](./docs/02-architecture.md)
- [Getting started](./docs/03-getting-started.md)
- [Data model](./docs/04-data-model.md)
- [Authentication and security](./docs/05-authentication-and-security.md)
- [API reference](./docs/06-api-reference.md)
- [User workflows](./docs/07-user-workflows.md)
- [Frontend guide](./docs/08-frontend-guide.md)
- [Backend guide](./docs/09-backend-guide.md)
- [Notifications and email](./docs/10-notifications-and-email.md)
- [Deployment and operations](./docs/11-deployment-and-operations.md)
- [Testing and maintenance](./docs/12-testing-and-maintenance.md)
- [Known limitations and roadmap](./docs/13-known-limitations-and-roadmap.md)

`NOTIFICATIONS.md`, `plan.md`, and `TODO.md` in this directory are retained as historical design and delivery artefacts. The `docs/` set is the current source of truth.

## Quick commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Full-stack development server, default port 3000 |
| `pnpm build` / `pnpm start` | Build and serve `dist/index.js` with `dist/public/` |
| `pnpm check` | TypeScript typecheck |
| `pnpm test` | Vitest suite |
| `pnpm build:static` | Static client build for Vercel |

## Minimal setup

1. Create a Supabase project.
2. Run [`supabase/setup.sql`](./supabase/setup.sql) in the SQL Editor for a fresh database. For an existing database, apply [`drizzle/migrations/0001_profile_conversations.sql`](./drizzle/migrations/0001_profile_conversations.sql) and then [`drizzle/migrations/0002_notifications.sql`](./drizzle/migrations/0002_notifications.sql).
3. Copy `.env.example` to `.env` and set the Supabase, database, CORS, and Brevo values. Keep secrets server-side.
4. In Supabase Auth, enable email confirmations and set Site URL and redirect URLs to the frontend origin.
5. Run `pnpm check`, `pnpm test`, and `pnpm build` before deploying.

See [`docs/03-getting-started.md`](./docs/03-getting-started.md) for the full setup and smoke test.

## Deployment summary

- **Render:** runs `pnpm install --frozen-lockfile && pnpm build`, then `pnpm start`; health check `/api/health`.
- **Vercel:** runs `pnpm build:static`, serves `dist/public`, and rewrites SPA routes to `/index.html`.
- **Frontend API URL:** `VITE_API_BASE_URL` must be the Render origin without `/api`.
- **CORS:** `CORS_ORIGINS` must contain the exact frontend origin.
- **Email:** Supabase generates authentication links; Brevo delivers them. Use a verified `EMAIL_FROM`.
- **Admin:** grant access by setting `public.users.role = 'admin'` in SQL after confirming the account.

See [`docs/11-deployment-and-operations.md`](./docs/11-deployment-and-operations.md) for the production checklist.

## Security note

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `BREVO_API_KEY`, or any other secret in browser code, commits, screenshots, or documentation. Access and refresh tokens are stored in HTTP-only cookies, and application data is accessed through server-side tRPC procedures. Application tables have RLS enabled and direct `anon`/`authenticated` access is revoked.
