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
});
