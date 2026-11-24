import { parse as parseCookieHeader } from "cookie";
import type { Request, Response } from "express";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";
import { createSupabaseClient } from "./supabase";
import { getSessionCookieOptions } from "./cookies";

export const ACCESS_TOKEN_COOKIE_NAME = "mjengolink_access_token";
export const REFRESH_TOKEN_COOKIE_NAME = "mjengolink_refresh_token";
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function setSessionCookies(req: Request, res: Response, session: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}) {
  const options = getSessionCookieOptions(req);
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, session.access_token, {
    ...options,
    maxAge: session.expires_in * 1000,
  });
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, session.refresh_token, {
    ...options,
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

export function clearSessionCookies(req: Request, res: Response) {
  const options = getSessionCookieOptions(req);
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, options);
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, options);
}

export async function authenticateRequest(req: Request, res: Response) {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const accessToken = cookies[ACCESS_TOKEN_COOKIE_NAME];
  const refreshToken = cookies[REFRESH_TOKEN_COOKIE_NAME];
  if (!accessToken && !refreshToken) return null;

  const supabase = createSupabaseClient();
  let authUser: SupabaseUser | null = null;
  if (accessToken) {
    const result = await supabase.auth.getUser(accessToken);
    if (result.error) {
      if (result.error.status !== 401 && result.error.status !== 403) {
        throw new Error(`Supabase authentication failed: ${result.error.message}`);
      }
    } else {
      authUser = result.data.user;
    }
  }

  if (!authUser && refreshToken) {
    const refreshed = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (refreshed.error) {
      if (refreshed.error.status !== 400 && refreshed.error.status !== 401 && refreshed.error.status !== 403) {
        throw new Error(`Supabase session refresh failed: ${refreshed.error.message}`);
      }
      clearSessionCookies(req, res);
      return null;
    }
    if (refreshed.data.session) {
      setSessionCookies(req, res, refreshed.data.session);
      authUser = refreshed.data.user;
    }
  }

  if (!authUser) {
    clearSessionCookies(req, res);
    return null;
  }

  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [user] = await db.select().from(users).where(eq(users.authUserId, authUser.id)).limit(1);
  if (!user) throw new Error("Supabase account is missing its MjengoLink profile");
  return user;
}

export async function endSupabaseSession(req: Request, res: Response) {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const accessToken = cookies[ACCESS_TOKEN_COOKIE_NAME];
  const refreshToken = cookies[REFRESH_TOKEN_COOKIE_NAME];
  try {
    if (accessToken && refreshToken) {
      const supabase = createSupabaseClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError && sessionError.status !== 400 && sessionError.status !== 401 && sessionError.status !== 403) {
        throw new Error(`Supabase sign-out failed: ${sessionError.message}`);
      }
      if (!sessionError) {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) throw new Error(`Supabase sign-out failed: ${error.message}`);
      }
    }
  } finally {
    clearSessionCookies(req, res);
  }
}

export { setSessionCookies };
