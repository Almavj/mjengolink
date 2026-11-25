import { afterEach, describe, expect, it, vi } from "vitest";
import { sendAuthEmail } from "./emailNotifications";

describe("Brevo authentication email delivery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function stubBrevo(body: unknown, status = 200) {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify(body),
      { status, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("reports a safe provider code when Brevo rejects delivery", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "MjengoLink <notifications@example.com>");
    stubBrevo({ code: "invalid_parameter" }, 400);

    await expect(sendAuthEmail({
      to: "member@example.com",
      subject: "Confirm your email",
      text: "Confirm your email",
      html: "<p>Confirm your email</p>",
    })).rejects.toMatchObject({
      name: "EmailDeliveryError",
      code: "BREVO_INVALID_PARAMETER",
      message: "Brevo rejected the email request with HTTP 400",
    });
  });

  it("surfaces the provider's message so the rejected field can be identified", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "MjengoLink <notifications@example.com>");
    stubBrevo({ code: "invalid_parameter", message: "Invalid sender address", errors: { sender: ["Enter a valid email address"] } }, 400);

    await expect(sendAuthEmail({
      to: "member@example.com",
      subject: "Confirm your email",
      text: "Confirm your email",
      html: "<p>Confirm your email</p>",
    })).rejects.toMatchObject({
      code: "BREVO_INVALID_PARAMETER",
      message: "Brevo rejected the email request with HTTP 400: Invalid sender address; Enter a valid email address",
    });
  });

  it("sends a Brevo SMTP payload with a parsed sender and omits an invalid replyTo", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "MjengoLink <notifications@example.com>");
    vi.stubEnv("EMAIL_REPLY_TO", "MjengoLink Support");
    const fetchMock = stubBrevo({ messageId: "email-id" });

    await expect(sendAuthEmail({
      to: "member@example.com",
      subject: "Confirm your email",
      text: "Confirm your email",
      html: "<p>Confirm your email</p>",
    })).resolves.toBeUndefined();

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((options.headers as Record<string, string>)["api-key"]).toBe("test-key");
    const payload = JSON.parse(options.body as string);
    expect(payload.sender).toEqual({ name: "MjengoLink", email: "notifications@example.com" });
    expect(payload.to).toEqual([{ email: "member@example.com" }]);
    expect(payload.htmlContent).toBe("<p>Confirm your email</p>");
    expect(payload).not.toHaveProperty("replyTo");
  });

  it("includes a valid optional replyTo in the Brevo payload", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "notifications@example.com");
    vi.stubEnv("EMAIL_REPLY_TO", "support@example.com");
    const fetchMock = stubBrevo({ messageId: "email-id" });

    await sendAuthEmail({
      to: "member@example.com",
      subject: "Confirm your email",
      text: "Confirm your email",
      html: "<p>Confirm your email</p>",
    });

    const options = fetchMock.mock.calls[0]?.[1] as { body: string };
    const payload = JSON.parse(options.body);
    expect(payload.sender).toEqual({ name: "MjengoLink", email: "notifications@example.com" });
    expect(payload.replyTo).toEqual({ email: "support@example.com" });
  });
});
