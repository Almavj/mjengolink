import { afterEach, describe, expect, it, vi } from "vitest";
import { sendAuthEmail } from "./emailNotifications";

describe("Resend authentication email delivery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports a safe provider code when Resend rejects delivery", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "MjengoLink <notifications@example.com>");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ name: "validation_error" }),
      { status: 422, headers: { "content-type": "application/json" } },
    )));

    await expect(sendAuthEmail({
      to: "member@example.com",
      subject: "Confirm your email",
      text: "Confirm your email",
      html: "<p>Confirm your email</p>",
    })).rejects.toMatchObject({
      name: "EmailDeliveryError",
      code: "RESEND_VALIDATION_ERROR",
      message: "Resend rejected the email request with HTTP 422",
    });
  });

  it("surfaces the provider's validation message so the rejected field can be identified", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "MjengoLink <notifications@example.com>");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ name: "validation_error", message: "Invalid `reply_to` field", errors: [{ message: "Enter a valid email address" }] }),
      { status: 422, headers: { "content-type": "application/json" } },
    )));

    await expect(sendAuthEmail({
      to: "member@example.com",
      subject: "Confirm your email",
      text: "Confirm your email",
      html: "<p>Confirm your email</p>",
    })).rejects.toMatchObject({
      code: "RESEND_VALIDATION_ERROR",
      message: "Resend rejected the email request with HTTP 422: Invalid `reply_to` field; Enter a valid email address",
    });
  });

  it("omits an invalid optional reply_to instead of sending it to Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "MjengoLink <notifications@example.com>");
    vi.stubEnv("EMAIL_REPLY_TO", "MjengoLink Support");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-id" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendAuthEmail({
      to: "member@example.com",
      subject: "Confirm your email",
      text: "Confirm your email",
      html: "<p>Confirm your email</p>",
    })).resolves.toBeUndefined();

    const options = fetchMock.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(options.body)).not.toHaveProperty("reply_to");
  });
});
