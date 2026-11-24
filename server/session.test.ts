import { describe, expect, it } from "vitest";
import { getSessionCookieOptions } from "./_core/cookies";
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from "./_core/auth";

describe("Supabase auth cookie settings", () => {
  it("uses separate HTTP-only cookies for access and refresh tokens", () => {
    expect(ACCESS_TOKEN_COOKIE_NAME).toBe("mjengolink_access_token");
    expect(REFRESH_TOKEN_COOKIE_NAME).toBe("mjengolink_refresh_token");
    const request = (secure: boolean, protocol: string) => ({
      protocol, secure, headers: {}, get: () => undefined,
    }) as never;
    expect(getSessionCookieOptions(request(true, "https"))).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax" });
    expect(getSessionCookieOptions(request(false, "http"))).toMatchObject({ secure: false, httpOnly: true, sameSite: "lax" });
  });
});
