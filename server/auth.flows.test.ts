import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  adminGenerateLink: vi.fn(),
  signInWithPassword: vi.fn(),
  sendAuthEmail: vi.fn(),
}));

vi.mock("./_core/supabase", () => ({
  createSupabaseAdminClient: () => ({ auth: { admin: { generateLink: mocks.adminGenerateLink } } }),
  createSupabaseClient: () => ({ auth: { signInWithPassword: mocks.signInWithPassword } }),
}));

vi.mock("./emailNotifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./emailNotifications")>();
  return {
    ...actual,
    escapeHtml: (value: string) => value,
    notifyJobCreated: vi.fn(),
    sendAuthEmail: mocks.sendAuthEmail,
  };
});

import { appRouter } from "./routers";

function createContext(origin = "https://mjengolink.vercel.app"): TrpcContext {
  return {
    user: null,
    req: {
      get: (name: string) => name.toLowerCase() === "origin" ? origin : undefined,
      headers: {},
      protocol: "https",
      secure: true,
    } as Request,
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response,
  };
}

describe("email-based auth flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CORS_ORIGINS", "https://mjengolink.vercel.app");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "MjengoLink <notifications@example.com>");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends a Supabase-generated signup link through Resend", async () => {
    mocks.adminGenerateLink.mockResolvedValue({
      data: { properties: { action_link: "https://auth.example/confirm?token=signup" } },
      error: null,
    });
    const caller = appRouter.createCaller(createContext());

    await expect(caller.auth.register({
      name: "Sample User",
      email: "SAMPLE@example.com",
      password: "a-secure-password",
    })).resolves.toMatchObject({ success: true, confirmationRequired: true });

    expect(mocks.adminGenerateLink).toHaveBeenCalledWith(expect.objectContaining({
      type: "signup",
      email: "sample@example.com",
      options: { data: { name: "Sample User" }, redirectTo: "https://mjengolink.vercel.app/?auth=email-confirmed" },
    }));
    expect(mocks.sendAuthEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "sample@example.com",
      text: expect.stringContaining("https://auth.example/confirm?token=signup"),
    }));
  });

  it("rejects login when Supabase reports an unconfirmed email", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "email_not_confirmed" },
    });
    const caller = appRouter.createCaller(createContext());

    await expect(caller.auth.login({ email: "sample@example.com", password: "password" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("sends recovery links through Resend and does not reveal unknown email addresses", async () => {
    mocks.adminGenerateLink.mockResolvedValue({
      data: { properties: { action_link: "https://auth.example/recover?token=reset" } },
      error: null,
    });
    const caller = appRouter.createCaller(createContext());

    await expect(caller.auth.requestPasswordReset({ email: "sample@example.com" }))
      .resolves.toEqual({ success: true });
    expect(mocks.adminGenerateLink).toHaveBeenCalledWith(expect.objectContaining({
      type: "recovery",
      options: { redirectTo: "https://mjengolink.vercel.app/?auth=password-reset" },
    }));
    expect(mocks.sendAuthEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "sample@example.com",
      text: expect.stringContaining("https://auth.example/recover?token=reset"),
    }));

    mocks.adminGenerateLink.mockResolvedValue({ data: null, error: { code: "user_not_found" } });
    mocks.sendAuthEmail.mockClear();
    await expect(caller.auth.requestPasswordReset({ email: "missing@example.com" }))
      .resolves.toEqual({ success: true });
    expect(mocks.sendAuthEmail).not.toHaveBeenCalled();
  });

  it("rejects a misconfigured sender before creating a Supabase user", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "mjengolink");
    const caller = appRouter.createCaller(createContext());

    await expect(caller.auth.register({
      name: "Sample User",
      email: "sample@example.com",
      password: "a-secure-password",
    })).rejects.toMatchObject({ cause: { code: "RESEND_SENDER_NOT_CONFIGURED" } });

    expect(mocks.adminGenerateLink).not.toHaveBeenCalled();
    expect(mocks.sendAuthEmail).not.toHaveBeenCalled();
  });

  it("returns FORBIDDEN for a disallowed origin instead of masking it as a network error", async () => {
    const caller = appRouter.createCaller(createContext("https://not-allowed.example"));

    await expect(caller.auth.register({
      name: "Sample User",
      email: "sample@example.com",
      password: "a-secure-password",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.adminGenerateLink).not.toHaveBeenCalled();
  });

  it("preserves the original Supabase failure when generateLink throws", async () => {
    mocks.adminGenerateLink.mockRejectedValue(new Error("fetch failed"));
    const caller = appRouter.createCaller(createContext());

    await expect(caller.auth.register({
      name: "Sample User",
      email: "sample@example.com",
      password: "a-secure-password",
    })).rejects.toMatchObject({
      cause: {
        name: "AuthLinkGenerationError",
        code: "SUPABASE_SIGNUP_NETWORK_ERROR",
        message: expect.stringContaining("fetch failed"),
      },
    });
  });
});
