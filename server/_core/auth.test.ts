import { describe, expect, it } from "vitest";
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME, setSessionCookies } from "./auth";
import type { Request, Response } from "express";

describe("Supabase session cookies", () => {
  it("stores access and refresh tokens in HTTP-only same-site cookies", () => {
    const calls: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
    const req = {
      protocol: "https",
      secure: true,
      headers: {},
      get: () => undefined,
    } as Request;
    const res = {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        calls.push({ name, value, options });
      },
    } as Response;

    setSessionCookies(req, res, {
      access_token: "access",
      refresh_token: "refresh",
      expires_in: 3600,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      name: ACCESS_TOKEN_COOKIE_NAME,
      value: "access",
      options: { maxAge: 3_600_000, secure: true, httpOnly: true, sameSite: "lax", path: "/" },
    });
    expect(calls[1]).toMatchObject({
      name: REFRESH_TOKEN_COOKIE_NAME,
      value: "refresh",
      options: { secure: true, httpOnly: true, sameSite: "lax", path: "/" },
    });
  });
});
