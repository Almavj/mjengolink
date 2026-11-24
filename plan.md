# MjengoLink implementation plan

## Product approach
MjengoLink is a mobile-first, responsive web application for the Eldoret/Uasin Gishu construction-job pilot described in the attached proposal. Supabase Auth email/password accounts, a Supabase PostgreSQL/Drizzle data model and protected tRPC procedures tie client, fundi and admin actions to server identities rather than a browser role switch.

The app is implemented as a React/Vite client inside the Express/tRPC/Drizzle project. Users register or sign in with email and password, then choose client or fundi during onboarding; only a server-granted admin role can enter the control room. Jobs, fundi profiles, trade skills, responses, ratings, reports and approximate coordinates are persisted in the managed database.

## Main modules
- Authentication and role onboarding: Supabase Auth password accounts, client/fundi first-use selection, and server-derived admin access.
- Client dashboard: active-job overview, post-job modal, matched fundis, job workflow, completion and rating entry points.
- Fundi board: nearby/eligible jobs, trade and radius filtering, express-interest action, availability toggle, profile/trust summary.
- Admin view: platform metrics, moderation queue, recent activity and report resolution action.
- Shared data model: users, fundi profiles, skills, jobs, responses, ratings, reports.
- New-job notifications: client confirmation, matching available-fundi alerts, and admin oversight alert.
- Protected data layer: Drizzle tables and tRPC procedures for job ownership, lifecycle transitions, matching, profile updates, ratings and moderation.
- Approximate location matching: trade + availability filtering, configurable job radius, Haversine distance when coordinates are available, and manual estate/landmark fallback.

## Role and notification logic
The app has three roles, not three separate apps. A client creates and manages demand; a fundi supplies trade skills and responds to suitable work; an admin oversees moderation and pilot health. A new job is never emailed to every user. The client receives one confirmation, active fundis receive an alert only when a selected trade matches, and the admin receives a lightweight oversight alert. The server endpoint is provider-neutral at the application boundary and uses Resend when `RESEND_API_KEY` and a verified `EMAIL_FROM` are configured. Preview safely returns `providerConfigured: false` without claiming delivery.

## Project structure
- `client/src/pages/Home.tsx`: authenticated application shell, role onboarding, dashboard views and mutation-backed interactions.
- `client/src/index.css`: brand tokens, responsive layout, Kenyan visual language, component styling.
- `server/emailNotifications.ts`: server-side email templates, recipient fan-out, and Resend adapter.
- `server/_core/index.ts`: `/api/notifications/job-created` endpoint.
- `NOTIFICATIONS.md`: role rationale, routing rules, and production notes.
- `plan.md`: implementation and design decisions.
- `TODO.md`: acceptance-oriented delivery tracking.
- `drizzle/schema.ts`, `supabase/setup.sql`, `server/mjengo.ts` and `server/routers.ts`: persistent domain model, Supabase setup, matching helpers and protected feature API.

## Design

### Style options
- Kijiji Modernism — painted market-signage colors, woven borders, editorial asymmetry, and restrained utility UI. (0.06)
- Highlands Utility — quiet green/stone interface with survey-map notation and workshop labels. (0.04)
- Matatu Ledger — loud route-board typography, punchy red accents, and information-dense cards. (0.03)

Chosen style: **Kijiji Modernism**.

### Design movement
East African vernacular signage and market-stall utility, refined through Swiss editorial spacing rather than a glossy SaaS look.

### Core principles
1. Useful before decorative: every visual motif must help scan, filter, or understand trust.
2. Local confidence: use Kenyan place names, KSh formatting, “fundi”, “kazi”, and Mtaa/estate language in the product copy.
3. Honest trust: ratings and response counts are explicit; no fake verification claims or hidden guarantees.
4. Mobile-first practicality: large tap targets, short labels, clear state transitions, and manual location fallback.

### Color philosophy
Deep botanical green carries the “mjengo” grounding and ties the pilot to highland vegetation. Terracotta red is reserved for Kenyan-flag energy and important actions. Warm sand keeps the surface tactile and legible, while charcoal ink makes the dense operational content feel like a ledger or painted signboard.

### Layout paradigm
A left utility rail anchors desktop users, while the content is composed as an asymmetrical two-column workbench: primary workflow on the left, context and trust on the right. On mobile the rail becomes a compact header plus a bottom navigation strip. Avoid centered hero marketing layouts; the app should feel ready for work.

### Signature elements
- A top Kenyan stripe (black / red / green / sand) used as a slim orientation mark, never as a flag illustration.
- Woven-line dividers and an angled corner tab used on cards and job rows.
- Monospace “field labels” for location, job ID, distance and status timestamps.

### Interaction philosophy
Actions should feel like moving a job card through a real workflow: post, express interest, review, assign, complete, rate. Buttons use direct verbs. Confirmation is given in a compact toast, not a blocking success page. Destructive/moderation actions use explicit red language.

### Animation
Use short 150–220ms ease-out transitions for drawers, tabs, status chips and card hover. No ambient floating shapes, parallax or looping motion. The only emphasis animation is a tiny pulse on “Live jobs” and a progress sweep when a job is advanced.

### Typography system
Use `DM Sans` for interface copy and `Space Mono` for field labels, IDs and monetary values. Headings are compact, weighty and slightly condensed through letter spacing, with sentence case rather than generic all-caps marketing slogans.

### Brand essence
A fairer way for Eldoret clients and fundis to find the next job, nearby. Personality: grounded, direct, neighbourly.

### Brand voice
Headlines and CTAs sound like a helpful foreman: plainspoken, respectful, specific. Example lines: “Find the right hands for the job.” / “Kazi karibu na wewe.”

### Wordmark & logo
The mark is a paired brick-and-link monogram: two offset terracotta blocks connected by a green line, suggesting both building and matching. In the interface this is rendered as a compact brick emblem beside the MjengoLink wordmark.

### Signature brand color
`#0B5D43` — Mjengo Green.

## Runtime and persistence
The authenticated UI reads dashboard records from the managed database through tRPC. Seeded records remain only as an in-memory loading presentation fallback and are never written as user data. The app exposes `/` and `/404`; the default server command remains `pnpm dev` on port 3000. Real email delivery still requires a verified sender domain and Resend configuration.
