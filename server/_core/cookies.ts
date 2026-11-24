import type { CookieOptions, Request } from "express";

export function getSessionCookieOptions(req: Request): CookieOptions {
  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: req.secure || forwardedProtocol === "https" || process.env.NODE_ENV === "production",
  };
}
