# Documentation index

This set documents the MjengoLink source code as it currently stands. It is source-controlled and is not part of the website build.

## Reading order

| Order | Document | Best for |
|---:|---|---|
| 1 | [`01-project-overview.md`](./01-project-overview.md) | Purpose, roles, vocabulary, scope |
| 2 | [`02-architecture.md`](./02-architecture.md) | Runtime topology and request lifecycle |
| 3 | [`03-getting-started.md`](./03-getting-started.md) | Local setup and first-use smoke test |
| 4 | [`04-data-model.md`](./04-data-model.md) | Tables, constraints, RLS, Storage |
| 5 | [`05-authentication-and-security.md`](./05-authentication-and-security.md) | Sessions, roles, guards, privacy |
| 6 | [`06-api-reference.md`](./06-api-reference.md) | Every endpoint and procedure |
| 7 | [`07-user-workflows.md`](./07-user-workflows.md) | End-to-end journeys by role |
| 8 | [`08-frontend-guide.md`](./08-frontend-guide.md) | React structure, state, styling |
| 9 | [`09-backend-guide.md`](./09-backend-guide.md) | Server internals and helpers |
| 10 | [`10-notifications-and-email.md`](./10-notifications-and-email.md) | Bell notifications and Brevo |
| 11 | [`11-deployment-and-operations.md`](./11-deployment-and-operations.md) | Render, Vercel, Supabase, production |
| 12 | [`12-testing-and-maintenance.md`](./12-testing-and-maintenance.md) | Tests, commands, extension patterns |
| 13 | [`13-known-limitations-and-roadmap.md`](./13-known-limitations-and-roadmap.md) | Current boundaries and next work |

## Quick answers

| Question | Document |
|---|---|
| How do I run the app locally? | `03-getting-started.md` |
| What SQL must I apply? | `03-getting-started.md`, `04-data-model.md` |
| How are sessions stored? | `05-authentication-and-security.md` |
| Why did a fundi not get an alert? | `10-notifications-and-email.md` |
| What does `jobs.decideResponse` do? | `06-api-reference.md`, `07-user-workflows.md` |
| How is a profile photo stored? | `04-data-model.md`, `09-backend-guide.md` |
| What environment variables are required? | `03-getting-started.md`, `11-deployment-and-operations.md` |
| What is not implemented yet? | `13-known-limitations-and-roadmap.md` |

## Diagram list

- Architecture topology — `02-architecture.md`
- Request lifecycle — `02-architecture.md`
- Entity relationships — `04-data-model.md`
- End-to-end notification sequence — `07-user-workflows.md`

## Source of truth

| Concern | Authoritative source |
|---|---|
| Runtime schema, constraints, indexes | `supabase/setup.sql` and migrations |
| Typed query shapes | `drizzle/schema.ts` |
| API behaviour | `server/routers.ts` and `server/_core/index.ts` |
| UI behaviour | `client/src/pages/Home.tsx` |
| Visual language | `client/src/index.css` |
| Deployment settings | `render.yaml`, `vercel.json`, `.env.example` |

When code changes, update the matching document listed in [`12-testing-and-maintenance.md`](./12-testing-and-maintenance.md).

## Historical root documents

`NOTIFICATIONS.md`, `plan.md`, and `TODO.md` at the repository root are retained as design/delivery history. They are not the current reference for API or operations questions.
