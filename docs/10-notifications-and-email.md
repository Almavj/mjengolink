# Notifications and email

MjengoLink has two separate notification systems:

1. **In-app notifications** — rows in `public.notifications`, shown in the Bell menu.
2. **Email delivery** — messages sent through Brevo.

They are related but independent. A notification row does not guarantee an email, and an email failure does not remove a notification.

## In-app notifications

### Table and shape

`public.notifications` stores:

- `userId` — recipient;
- `type` — `job`, `interest`, `decision`, `chat`, `message`;
- `title`, `body`;
- optional `jobId` and `conversationId`;
- `readAt`;
- `createdAt`.

`createNotification()` truncates title to 160 characters and body to 500 characters. `getNotifications()` returns the newest 50 rows for the current user.

### Event matrix

| Event | Type | Recipient | Title / body behaviour |
|---|---|---|---|
| New job posted | `job` | Each unique matching fundi | “New job matching your trade”; includes job title and location |
| Fundi shows interest | `interest` | Job client | Includes fundi name and job title |
| Client accepts | `decision` | Fundi | “You got the job” |
| Client declines | `decision` | Fundi | “Interest updated” |
| Client opens chat | `chat` | Fundi | “Client opened a chat” |
| Chat message | `message` | Other participant | “New message from …”; body is the message excerpt |

### Frontend behaviour

- `notifications.list` polls every 10 seconds.
- Unread count is the number of rows with `readAt === null`.
- First successful load sets the toast baseline without a toast.
- Later increases show `N new notification(s)` via Sonner.
- Bell opens `NotificationModal`.
- **Mark all read** calls `notifications.markAllRead`.
- Clicking an item marks it read and routes to the related chat, job, or workspace view.
- Opening a conversation calls `inbox.markRead`, which also clears notifications tied to that conversation.

### Notification delivery points

| Procedure | Event |
|---|---|
| `jobs.create` | `job` |
| `jobs.respond` | `interest` |
| `jobs.decideResponse` | `decision` |
| `inbox.open` | `chat` |
| `inbox.send` | `message` |
| `inbox.markRead` | clears conversation notifications |

## Email delivery with Brevo

### Configuration

| Variable | Required | Notes |
|---|---|---|
| `BREVO_API_KEY` | Yes for delivery | Server-only secret |
| `EMAIL_FROM` | Yes for delivery | Verified sender; bare email or `Name <email>` |
| `EMAIL_REPLY_TO` | No | Included only when valid |
| `CORS_ORIGINS` | For app links | First allowed origin becomes the link in conversation emails |

The default `notifications@mjengolink.example` sender is treated as unconfigured. `assertAuthEmailConfigured()` also rejects `your-verified-domain.example` for auth emails.

Brevo free plans have daily sending limits. Disable click tracking if Supabase URLs are wrapped in Brevo tracking links and you need the raw authentication URL.

### Endpoint

```http
POST https://api.brevo.com/v3/smtp/email
api-key: <BREVO_API_KEY>
Content-Type: application/json
```

### Sender parsing

`EMAIL_FROM` supports both forms:

```text
MjengoLink <notifications@example.com>
notifications@example.com
```

A display name defaults to `MjengoLink`.

### Error mapping

| Failure | Internal code |
|---|---|
| Network fetch failure | `BREVO_NETWORK_ERROR` |
| Provider error code | `BREVO_<PROVIDER_CODE>` |
| Non-OK response without code | `BREVO_HTTP_<status>` |
| Missing API key | `BREVO_API_KEY_MISSING` |
| Placeholder/malformed sender | `BREVO_SENDER_NOT_CONFIGURED` |
| Invalid recipient | `AUTH_EMAIL_RECIPIENT_INVALID` |

The tRPC error formatter converts `BREVO_*` causes into a safe client message and removes stack traces.

## Authentication emails

Supabase generates links; Brevo sends them. Supabase's own email sender is not used.

| Flow | Procedure | Link type | Redirect |
|---|---|---|---|
| Signup confirmation | `auth.register` | `signup` | `/?auth=email-confirmed` |
| Resend confirmation | `auth.resendConfirmation` | `magiclink` | `/?auth=email-confirmed` |
| Password reset | `auth.requestPasswordReset` | `recovery` | `/?auth=password-reset` |

Privacy rules:

- Resend confirmation for an email absent from `public.users` returns success without Supabase/Brevo calls.
- Password reset for an unknown user also returns success silently.
- Existing signup emails return a `CONFLICT` with resend guidance.

Auth email configuration is validated before Supabase link generation, so a misconfigured sender fails early rather than creating an account that cannot be contacted.

## New-job emails

`notifyJobCreated()` builds recipients after the job is inserted:

| Recipient | Purpose |
|---|---|
| Client | Confirmation that the job is live |
| Each matching fundi | New-work alert |
| First admin row, if any | Lightweight pilot oversight |

Matching is:

```text
worker_profiles.availability = 1
AND job.trade ∈ worker_skills
AND (coordinates missing OR distance <= jobs.radiusKm)
```

No broadcast to all users. This protects fundi attention and avoids exposing client details unnecessarily.

Result shape:

```json
{
  "providerConfigured": true,
  "recipientCount": 4,
  "sentCount": 4,
  "failures": 0,
  "adminOversight": true
}
```

`sendEmail()` returns `{ sent: false, reason: "provider_not_configured" }` when the key or sender is missing. The job itself remains persisted.

`Promise.allSettled` is used so one failed recipient does not cancel the others.

## Conversation emails

`notifyConversationEvent()` supports three kinds:

| Kind | Trigger | Subject |
|---|---|---|
| `accepted` | Client accepts a fundi | `You have a new MjengoLink chat · <jobId>` |
| `chat` | Client opens a conversation | `You have a new MjengoLink chat · <jobId>` |
| `message` | New chat message | `New message on MjengoLink · <jobId>` |

Each email includes:

- recipient name;
- actor name;
- job title and ID;
- an app link derived from the first `CORS_ORIGINS` value;
- for messages, a 160-character excerpt.

Conversation emails are fire-and-forget from the caller's perspective. Failures are logged with `console.warn` and do not roll back the in-app action.

## Legacy REST dispatch

`POST /api/notifications/job-created` can redispatch new-job emails for an existing job.

- Requires a valid session.
- Allows only `client` and `admin`.
- Client must own the job.
- Accepts only a server-verified `jobId`; recipients are never trusted from the request body.
- Recomputes matches and the admin recipient.
- Returns `202` with the delivery summary.

The normal application path is `jobs.create`.

## Operational notes

- Verify the Brevo sender address or domain before enabling delivery.
- Set `EMAIL_FROM` to a real address; placeholder values intentionally disable or reject sending.
- Keep Brevo API keys out of browser code, commits, logs, and screenshots.
- If confirmation links contain `sendibt2.com/tr/cl/...`, that is Brevo click tracking; disable click tracking if raw links are required.
- If users do not receive alerts, check in order: notification table migration, matching criteria, recipient profile/email, Brevo configuration, spam folder, provider quota.
