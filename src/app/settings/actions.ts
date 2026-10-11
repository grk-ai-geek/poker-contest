"use server";

import { revalidatePath } from "next/cache";
import { AVATAR_MAX_BYTES, avatarUrlFor, sniffImageType } from "@/lib/avatar";
import { db } from "@/lib/db";
import { hit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/session";

export type AvatarState = { error?: string; success?: string };

export async function uploadAvatarAction(_prev: AvatarState, formData: FormData): Promise<AvatarState> {
  const user = await requireUser();
  if (!hit(`avatar:${user.id}`, 10, 60 * 60 * 1000).ok) return { error: "Too many uploads. Please try again later." };
  const file = formData.get("avatar");
  if (!(file instanceof Blob) || file.size === 0) return { error: "Choose a picture first." };
  if (file.size > AVATAR_MAX_BYTES) return { error: "That picture is too large." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType) return { error: "Please use a JPEG, PNG or WebP picture." };

  const saved = await db.userAvatar.upsert({
    where: { userId: user.id },
    create: { userId: user.id, data: bytes, contentType },
    update: { data: bytes, contentType },
  });
  await db.user.update({ where: { id: user.id }, data: { avatarUrl: avatarUrlFor(user.id, saved.updatedAt) } });
  revalidatePath("/", "layout");
  return { success: "Profile picture updated." };
}

export async function removeAvatarAction(): Promise<AvatarState> {
  const user = await requireUser();
  await db.userAvatar.deleteMany({ where: { userId: user.id } });
  await db.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
  revalidatePath("/", "layout");
  return { success: "Profile picture removed." };
}
