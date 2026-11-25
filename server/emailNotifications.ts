import { ENV } from "./_core/env";

type Recipient = { name: string; email: string; distance?: string };

type JobCreatedPayload = {
  job: { id: string; title: string; trade: string; location: string; budget: string; startDate: string; description: string };
  client: Recipient;
  eligibleFundis: Recipient[];
  admin?: Recipient;
};

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseSender(value: string) {
  const match = value.trim().match(/^(?:(.+?)\s*)?<\s*([^<>]+?)\s*>$/);
  return {
    name: match?.[1]?.trim() || "MjengoLink",
    email: (match?.[2] ?? value).trim(),
  };
}

class EmailDeliveryError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function textForFundi(payload: JobCreatedPayload, fundi: Recipient) {
  const { job } = payload;
  return `Hi ${fundi.name},\n\nA new ${job.trade.toLowerCase()} job is available near you on MjengoLink.\n\n${job.title}\nLocation: ${job.location}\nApproximate distance: ${fundi.distance ?? "nearby"}\nProposed pay: ${job.budget}\nStart: ${job.startDate}\n\nOpen MjengoLink to read the brief and show interest. Confirm the site, scope and price directly before accepting.\n\nKazi karibu na wewe.\nMjengoLink`;
}

function htmlForFundi(payload: JobCreatedPayload, fundi: Recipient) {
  const { job } = payload;
  return `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d2925"><p>Hi ${escapeHtml(fundi.name)},</p><p>A new <strong>${escapeHtml(job.trade.toLowerCase())}</strong> job is available near you on MjengoLink.</p><div style="border-left:4px solid #0b5d43;padding:10px 14px;background:#e1eee7"><strong>${escapeHtml(job.title)}</strong><br>Location: ${escapeHtml(job.location)}<br>Approximate distance: ${escapeHtml(fundi.distance ?? "nearby")}<br>Proposed pay: ${escapeHtml(job.budget)}<br>Start: ${escapeHtml(job.startDate)}</div><p>Open MjengoLink to read the brief and show interest. Confirm the site, scope and price directly before accepting.</p><p>Kazi karibu na wewe.<br>MjengoLink</p></div>`;
}

function textForClient(payload: JobCreatedPayload) {
  const { job } = payload;
  return `Hi ${payload.client.name},\n\nYour MjengoLink job is live.\n\n${job.id} · ${job.title}\nTrade: ${job.trade}\nLocation: ${job.location}\nProposed pay: ${job.budget}\nStart: ${job.startDate}\n\nWe will show it to available fundis whose trade matches. Review interest and confirm the scope, price and site directly before work begins.\n\nMjengoLink`;
}

function htmlForClient(payload: JobCreatedPayload) {
  const { job } = payload;
  return `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d2925"><p>Hi ${escapeHtml(payload.client.name)},</p><p>Your MjengoLink job is live.</p><div style="border-left:4px solid #0b5d43;padding:10px 14px;background:#e1eee7"><strong>${escapeHtml(job.id)} · ${escapeHtml(job.title)}</strong><br>Trade: ${escapeHtml(job.trade)}<br>Location: ${escapeHtml(job.location)}<br>Proposed pay: ${escapeHtml(job.budget)}<br>Start: ${escapeHtml(job.startDate)}</div><p>We will show it to available fundis whose trade matches. Review interest and confirm the scope, price and site directly before work begins.</p><p>MjengoLink</p></div>`;
}

function textForAdmin(payload: JobCreatedPayload) {
  const { job } = payload;
  return `A new MjengoLink job was posted.\n\n${job.id} · ${job.title}\nTrade: ${job.trade}\nLocation: ${job.location}\nProposed pay: ${job.budget}\nEligible active fundis notified: ${payload.eligibleFundis.length}\n\nReview the admin control room for pilot oversight.`;
}

function htmlForAdmin(payload: JobCreatedPayload) {
  const { job } = payload;
  return `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d2925"><p>A new MjengoLink job was posted.</p><div style="border-left:4px solid #b7432d;padding:10px 14px;background:#f4e2dc"><strong>${escapeHtml(job.id)} · ${escapeHtml(job.title)}</strong><br>Trade: ${escapeHtml(job.trade)}<br>Location: ${escapeHtml(job.location)}<br>Proposed pay: ${escapeHtml(job.budget)}<br>Eligible active fundis notified: ${payload.eligibleFundis.length}</div><p>Review the admin control room for pilot oversight.</p></div>`;
}

async function deliverEmail(input: { to: string; subject: string; text: string; html: string }) {
  let response: Response;
  const sender = parseSender(ENV.emailFrom);
  const replyTo = ENV.emailReplyTo.trim();
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "api-key": ENV.brevoApiKey, "content-type": "application/json" },
      body: JSON.stringify({
        sender,
        to: [{ email: input.to }],
        subject: input.subject,
        textContent: input.text,
        htmlContent: input.html,
        ...(replyTo && isEmail(replyTo) ? { replyTo: { email: replyTo } } : {}),
      }),
    });
  } catch {
    throw new EmailDeliveryError("Brevo request failed before receiving a response", "BREVO_NETWORK_ERROR");
  }
  if (!response.ok) {
    let providerCode: string | undefined;
    let providerDetail: string | undefined;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object") {
        const code = "code" in body && (typeof body.code === "string" || typeof body.code === "number") ? String(body.code) : undefined;
        if (code && /^[a-z0-9_-]{1,64}$/i.test(code)) {
          providerCode = code.toUpperCase().replaceAll("-", "_");
        }
        if ("message" in body && typeof body.message === "string") providerDetail = body.message;
        if ("errors" in body && body.errors && typeof body.errors === "object") {
          const errors = Object.values(body.errors)
            .flat()
            .map((error: unknown) => typeof error === "string" ? error : undefined)
            .filter((message): message is string => Boolean(message));
          if (errors.length) providerDetail = [providerDetail, ...errors].filter(Boolean).join("; ");
        }
      }
    } catch {
      // The HTTP status remains useful when the provider response isn't JSON.
    }
    const code = providerCode ? `BREVO_${providerCode}` : `BREVO_HTTP_${response.status}`;
    const suffix = providerDetail ? `: ${providerDetail}` : "";
    throw new EmailDeliveryError(`Brevo rejected the email request with HTTP ${response.status}${suffix}`, code);
  }
}

async function sendEmail(input: { to: Recipient; subject: string; text: string; html: string }) {
  if (!ENV.brevoApiKey || ENV.emailFrom.includes("mjengolink.example")) return { sent: false, reason: "provider_not_configured" as const };
  if (!isEmail(input.to.email)) return { sent: false, reason: "invalid_recipient" as const };

  await deliverEmail({ ...input, to: input.to.email });
  return { sent: true as const, reason: "sent" as const };
}

export function assertAuthEmailConfigured(to: string) {
  if (!ENV.brevoApiKey) {
    throw new EmailDeliveryError("BREVO_API_KEY is missing from the backend environment", "BREVO_API_KEY_MISSING");
  }
  if (ENV.emailFrom.includes("your-verified-domain.example") || ENV.emailFrom.includes("mjengolink.example")) {
    throw new EmailDeliveryError("EMAIL_FROM must use a verified sender address", "BREVO_SENDER_NOT_CONFIGURED");
  }
  const senderAddress = parseSender(ENV.emailFrom).email;
  if (!isEmail(senderAddress)) {
    throw new EmailDeliveryError("EMAIL_FROM must be an address or a 'Name <address>' sender", "BREVO_SENDER_NOT_CONFIGURED");
  }
  if (!isEmail(to)) {
    throw new EmailDeliveryError("The authentication email recipient is invalid", "AUTH_EMAIL_RECIPIENT_INVALID");
  }
}

export async function sendAuthEmail(input: { to: string; subject: string; text: string; html: string }) {
  assertAuthEmailConfigured(input.to);
  await deliverEmail(input);
}

export async function notifyJobCreated(payload: JobCreatedPayload) {
  const recipients = [
    { to: payload.client, subject: `Your MjengoLink job is live · ${payload.job.id}`, text: textForClient(payload), html: htmlForClient(payload) },
    ...payload.eligibleFundis.map((fundi) => ({ to: fundi, subject: `New ${payload.job.trade.toLowerCase()} kazi near ${payload.job.location}`, text: textForFundi(payload, fundi), html: htmlForFundi(payload, fundi) })),
    ...(payload.admin ? [{ to: payload.admin, subject: `Admin alert · new MjengoLink job ${payload.job.id}`, text: textForAdmin(payload), html: htmlForAdmin(payload) }] : []),
  ];

  const results = await Promise.allSettled(recipients.map(sendEmail));
  const sentCount = results.filter((result) => result.status === "fulfilled" && result.value.sent).length;
  const failures = results.filter((result) => result.status === "rejected").length;
  return { providerConfigured: Boolean(ENV.brevoApiKey && !ENV.emailFrom.includes("mjengolink.example")), recipientCount: recipients.length, sentCount, failures, adminOversight: Boolean(payload.admin) };
}

export type { JobCreatedPayload };
