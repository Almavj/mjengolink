import { describe, expect, it } from "vitest";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "../shared/const";

describe("application session cookie", () => {
  it("uses an HTTP-only same-site application session cookie", () => {
    expect(COOKIE_NAME).toBe("mjengolink_session");
    const request = (secure: boolean, protocol: string) => ({
      protocol, secure, headers: {}, get: () => undefined,
    }) as never;
    expect(getSessionCookieOptions(request(true, "https"))).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax" });
    expect(getSessionCookieOptions(request(false, "http"))).toMatchObject({ secure: false, httpOnly: true, sameSite: "lax" });
  });
});
