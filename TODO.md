# MjengoLink delivery checklist

## Working pilot shell
- [x] A responsive web app identifies itself as MjengoLink and is grounded in the Eldoret/Uasin Gishu pilot.
- [x] The interface uses the selected Kijiji Modernism system: Mjengo Green, terracotta, warm sand, Kenyan stripe, woven dividers, and field-label typography.
- [x] The app is usable at mobile and desktop widths without requiring a separate native build.

## Client workflow
- [x] An authenticated client can enter the client workspace and see server-backed jobs, matches, and work-in-progress context.
- [x] A client can open a job-posting form containing trade, description, estate/location, proposed pay, start date, and contact preference.
- [x] Submitting a valid job creates a database record, applies trade/availability/proximity matching, and shows a confirmation message.
- [x] A client can inspect nearby fundi cards with trade, experience, approximate distance, response time, rating count, and trust wording.
- [x] A client can move an owned job through the server-validated Posted, Interested, Accepted, Assigned, In progress, Completed and Cancelled lifecycle and access a completion/rating action.
- [x] A client can cancel an open owned job; the server enforces ownership and terminal-state rules.
- [x] A client can edit an owned open job while it is Posted or Interested; completed, assigned, in-progress and cancelled jobs are protected from editing.

## Fundi workflow
- [x] An authenticated fundi can enter the Kazi board and see relevant server-backed jobs with trade, approximate distance, start date, budget, and location.
- [x] Trade and search filters change the visible opportunity list.
- [x] A fundi can express interest in an open opportunity; the response is persisted and reflected in the dashboard.
- [x] A fundi can edit contact details, trade skills, experience, service area, summary and availability in a persisted profile.
- [x] A fundi can toggle availability; only available workers are eligible for matching alerts.
- [x] The UI never presents ratings as professional certification or an identity guarantee.

## Admin workflow
- [x] Only a server-granted admin account can enter the admin view; the UI no longer exposes a client-side admin switch.
- [x] The admin view exposes database-backed platform metrics, account/job oversight, a moderation queue, and report-resolution controls.
- [x] The admin view clearly separates moderation from user-facing job matching.

## Email notifications
- [x] The system models three roles: client, fundi, and admin, with separate responsibilities.
- [x] A new job sends one client confirmation, alerts only available fundis with a matching trade, and sends one admin oversight alert.
- [x] The server exposes `POST /api/notifications/job-created` and safely reports provider setup status.
- [x] Resend delivery is supported through server-side `RESEND_API_KEY`, `EMAIL_FROM`, and optional `EMAIL_REPLY_TO` settings.

## Persistence and delivery
- [x] Supabase Auth accounts and application roles are linked to Supabase PostgreSQL fundi profiles, skills, jobs, responses, ratings/comments and reports.
- [x] Supabase setup SQL enables row-level security and provisions private profile-photo and job-attachment buckets.
- [x] A manual estate/landmark location is accepted when GPS coordinates are unavailable; when approximate coordinates exist, matching uses configurable radius and Haversine distance without exposing live precise locations.
- [x] The app serves the `/` and `/404` routes.
- [x] TypeScript diagnostics and production build pass.

## Remaining pilot boundary
The proposal explicitly excludes payments/escrow, automated identity-document verification, insurance, formal trade certification, dispute adjudication, payroll, contractor tendering and government employment-database integration; these remain out of scope. Richer notification preferences can be added as a later increment. Real email delivery requires a verified sender domain, a configured Resend API key, and a real `EMAIL_FROM` value; the placeholder sender is intentionally treated as unconfigured.
