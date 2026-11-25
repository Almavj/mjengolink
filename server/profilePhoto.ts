import { createSupabaseAdminClient } from "./_core/supabase";
import type { User } from "../drizzle/schema";

const BUCKET = "profile-photos";
const MAX_BYTES = 5 * 1024 * 1024;

export const AVATAR_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

type AvatarOwner = Pick<User, "authUserId" | "avatarPath">;

function extension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export function decodeAvatar(base64: string) {
  const data = base64.replace(/^data:image\/[a-z]+;base64,/, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error("The image data is invalid");
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length || buffer.length > MAX_BYTES) throw new Error("Choose an image smaller than 5 MB");
  return buffer;
}

export async function uploadAvatar(owner: AvatarOwner, base64: string, contentType: string) {
  const buffer = decodeAvatar(base64);
  const path = `${owner.authUserId}/avatar-${Date.now()}.${extension(contentType)}`;
  const { error } = await createSupabaseAdminClient().storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(error.message);
  if (owner.avatarPath && owner.avatarPath !== path) {
    await createSupabaseAdminClient().storage.from(BUCKET).remove([owner.avatarPath]);
  }
  return path;
}

export async function removeAvatar(owner: AvatarOwner) {
  if (!owner.avatarPath) return;
  await createSupabaseAdminClient().storage.from(BUCKET).remove([owner.avatarPath]);
}

export async function getAvatarUrl(owner: AvatarOwner) {
  if (!owner.avatarPath) return null;
  const { data, error } = await createSupabaseAdminClient().storage
    .from(BUCKET)
    .createSignedUrl(owner.avatarPath, 60 * 60);
  return error || !data?.signedUrl ? null : data.signedUrl;
}
