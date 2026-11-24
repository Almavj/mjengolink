import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, getSessionUserId, hashPassword, verifyPassword } from "./auth";

afterEach(() => vi.unstubAllEnvs());

describe("local authentication", () => {
  it("hashes passwords and rejects mismatches", async () => {
    const password = "correct horse battery staple";
    const passwordHash = await hashPassword(password);

    expect(passwordHash).not.toContain(password);
    await expect(verifyPassword(password, passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("incorrect password", passwordHash)).resolves.toBe(false);
    await expect(verifyPassword(password, undefined)).resolves.toBe(false);
  });

  it("signs sessions for local user IDs and rejects tampered tokens", async () => {
    vi.stubEnv("APP_SESSION_SECRET", "test-session-secret-with-at-least-32-characters");
    const token = await createSessionToken(42);

    await expect(getSessionUserId(token)).resolves.toBe(42);
    await expect(getSessionUserId(`${token}tampered`)).resolves.toBeNull();
  });
});
