import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { users } from "../../drizzle/schema";
import { COOKIE_NAME, SESSION_DURATION_MS } from "@shared/const";
import { getDb } from "../db";

const SALT_BYTES = 16;
const KEY_BYTES = 64;

async function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_BYTES, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derivePasswordKey(password, salt);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, encodedHash: string | null | undefined): Promise<boolean> {
  const parts = encodedHash?.split("$");
  const isScryptHash = parts?.length === 3 && parts[0] === "scrypt";
  const salt = isScryptHash ? Buffer.from(parts[1] ?? "", "base64url") : Buffer.alloc(SALT_BYTES);
  const expected = isScryptHash ? Buffer.from(parts[2] ?? "", "base64url") : Buffer.alloc(KEY_BYTES);
  const wellFormed = isScryptHash && salt.length === SALT_BYTES && expected.length === KEY_BYTES;
  const actual = await derivePasswordKey(password, wellFormed ? salt : Buffer.alloc(SALT_BYTES));
  return Boolean(wellFormed && timingSafeEqual(actual, expected));
}

function getSessionSecret(): Uint8Array {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("APP_SESSION_SECRET must be configured with at least 32 bytes");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: number): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("mjengolink")
    .setAudience("mjengolink")
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + SESSION_DURATION_MS) / 1000))
    .sign(getSessionSecret());
}

export async function getSessionUserId(token: string): Promise<number | null> {
  const secret = getSessionSecret();
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: "mjengolink",
      audience: "mjengolink",
    });
    const userId = Number(payload.sub);
    return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
  } catch {
    return null;
  }
}

export async function authenticateRequest(req: Request) {
  const token = parseCookieHeader(req.headers.cookie ?? "")[COOKIE_NAME];
  if (!token) return null;
  const userId = await getSessionUserId(token);
  if (userId === null) return null;

  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

export { SESSION_DURATION_MS };
