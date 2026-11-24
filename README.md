# MjengoLink

TypeScript React / Express / tRPC / Drizzle application for the MjengoLink Eldoret pilot, using Supabase Auth and PostgreSQL.

- `pnpm dev`: development server; honors `PORT` (default 3000).
- `pnpm build` / `pnpm start`: build and serve `dist/index.js` and `dist/public/`.
- `pnpm check` / `pnpm test`: types and application tests.

1. Create a Supabase project and open its SQL Editor.
2. Paste and run [`supabase/setup.sql`](./supabase/setup.sql) to create the tables, auth profile trigger, security policies, and private storage buckets.
3. Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and a Supabase PostgreSQL connection URI as `DATABASE_URL` to `.env`. For IPv4-only hosts, select the Supabase **Session pooler** connection (port 5432); the Direct connection requires IPv6 unless your project has IPv4 support enabled. Keep the connection string server-side; never expose it in browser code.
4. Configure Supabase Auth email confirmation and redirect URLs for your Vercel frontend, then run `pnpm dev`.

## Deploy frontend to Vercel and API to Render

- **Render backend:** create a Web Service from this repository using `pnpm install --frozen-lockfile && pnpm build` as the build command and `pnpm start` as the start command. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATABASE_URL`, and `CORS_ORIGINS` in Render. Set `CORS_ORIGINS` to the exact Vercel site origin (for example, `https://your-app.vercel.app`, without a path). Render provides `PORT`.
- **Vercel frontend:** set the build command to `pnpm build:static`, the output directory to `dist/public`, and `VITE_API_BASE_URL` to the Render service origin (for example, `https://your-api.onrender.com`, without `/api`). Redeploy after setting or changing it.
- The frontend sends requests to `VITE_API_BASE_URL + /api/trpc`; credentials use secure HTTP-only cookies. The backend only allows origins listed in `CORS_ORIGINS`.
- Configure Supabase Auth's site URL and allowed redirect URLs to include the Vercel deployment URL. For production, custom domains on the same parent domain provide the most reliable cross-site cookie behavior.

Sign-up and password verification use Supabase Auth. Access and refresh tokens are stored in HTTP-only cookies; production cookies are secure and use `SameSite=None` for direct Vercel-to-Render requests. Protected application data is accessed through server-side tRPC procedures, not directly from the browser. The SQL enables row-level security and denies direct table access to `anon` and `authenticated` roles. Keep `DATABASE_URL` private because the server uses it to perform authorized data operations.

To grant administrator access, create and confirm the account, then set that account's `public.users.role` to `admin` in the Supabase SQL Editor. Role selection is not exposed during sign-up.

The private `profile-photos` and `job-attachments` buckets are provisioned with per-user storage policies. The current app does not yet include file-upload screens or endpoints.
