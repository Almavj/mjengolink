# MjengoLink

React / Express / tRPC / Drizzle application for the MjengoLink Eldoret pilot.

- `pnpm dev`: development server; honors `PORT` (default 3000).
- `pnpm build` / `pnpm start`: build and serve `dist/index.js` and `dist/public/`.
- `pnpm db:migrate`: apply checked-in migrations. `pnpm db:push`: generate and apply new schema changes.
- `pnpm check` / `pnpm test`: types and application tests.

Configure `DATABASE_URL` and `APP_SESSION_SECRET` in `.env` before starting the server. Generate a secret with `openssl rand -hex 32` (64 hex characters). Apply migrations with `pnpm db:migrate`, then run `pnpm dev`. Users can create an account with their name, email and password or sign in with an existing local account.

Passwords are stored as scrypt hashes and sessions use an HTTP-only cookie signed with `APP_SESSION_SECRET`. To grant administrator access, create the local account first, then set its `users.role` to `admin` directly in the database; role selection is not exposed during sign-up.
