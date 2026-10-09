import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { verificationEmail } from "@/lib/email/templates";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const RESEND_COOLDOWN_MS = 60 * 1000; // one email per minute per address

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

/** Replaces any previous token for this email and returns a fresh verification link. */
export async function createVerificationLink(email: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.verificationToken.deleteMany({ where: { email } });
  await db.verificationToken.create({
    data: { email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
  });
  return `${appUrl()}/verify?token=${token}`;
}

/** Seconds until another verification email may be sent to this address (0 = now). */
export async function resendWaitSeconds(email: string): Promise<number> {
  const latest = await db.verificationToken.findFirst({ where: { email }, orderBy: { createdAt: "desc" } });
  if (!latest) return 0;
  const waitMs = latest.createdAt.getTime() + RESEND_COOLDOWN_MS - Date.now();
  return waitMs > 0 ? Math.ceil(waitMs / 1000) : 0;
}

/** Creates a verification link and emails it via the configured provider (EMAIL_PROVIDER). */
export async function sendVerificationEmail(user: { email: string; displayName: string }): Promise<void> {
  const link = await createVerificationLink(user.email);
  await sendEmail(verificationEmail({ to: user.email, displayName: user.displayName, link }));
}

/** Marks the user's email verified. Returns false if the token is unknown or expired. */
export async function consumeVerificationToken(token: string): Promise<boolean> {
  const record = await db.verificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record) return false;
  await db.verificationToken.delete({ where: { id: record.id } });
  if (record.expiresAt < new Date()) return false;
  await db.user.update({ where: { email: record.email }, data: { emailVerified: new Date() } });
  return true;
}
