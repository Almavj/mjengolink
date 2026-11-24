# MjengoLink roles and email notification logic

MjengoLink has three user roles, each with a different responsibility:

| Role | What the role does | New-job email behavior |
|---|---|---|
| Client | Posts the construction job, reviews interest, selects a fundi, advances status, and leaves job-linked feedback. | Receives one confirmation email after the job is successfully accepted by the app. |
| Fundi | Maintains a trade profile, availability, service area, discovers suitable work, and expresses interest. | Receives an alert only when the fundi is available, one of their trades matches, and their approximate coordinates are inside the job radius when coordinates are available. Manual estate/service-area matching is used when GPS is unavailable. |
| Admin | Oversees pilot records, accounts, reports, and moderation. The admin is not part of matching. | Receives one lightweight oversight alert so a new post is visible for moderation and pilot monitoring. |

A new job must never be broadcast to every account. Broadcasting would create noise, expose client details unnecessarily, and make the platform less useful for fundis. Matching should be an intersection of `available = true`, `trade match`, and eventually `service area / approximate distance`.

New-job dispatch is initiated by the authenticated `jobs.create` procedure, which derives eligible recipients from the database after the job is inserted. The legacy `POST /api/notifications/job-created` endpoint is also authenticated and accepts only a server-verified `jobId`; it no longer trusts client-supplied recipients. Delivery uses Resend through the server-side `RESEND_API_KEY`, `EMAIL_FROM`, and optional `EMAIL_REPLY_TO` environment variables. If the provider is not configured, the job remains persisted and the response reports `providerConfigured: false` without pretending an email was sent.

Clients can edit their own jobs while they are still `Posted` or `Interested`; later lifecycle states are intentionally locked to protect matching and work records. Real delivery requires both `RESEND_API_KEY` and a verified, non-placeholder `EMAIL_FROM`; an API key alone does not enable sending.

For a later hardening increment, add notification preferences such as `new_job_alerts`, `email_enabled`, and quiet hours, plus a notification-delivery table for provider message IDs and retry/idempotency records.
