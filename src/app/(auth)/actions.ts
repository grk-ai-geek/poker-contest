"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { AUTH_LIMITS, clientIp, hit } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/session";
import { signUpSchema } from "@/lib/validation/auth";
import { resendWaitSeconds, sendVerificationEmail } from "@/lib/verification";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  success?: string;
};

/** Same-site paths only, so a tampered form can't send users to another website after login. */
function safeRedirect(value: FormDataEntryValue | null): string {
  const target = String(value || "/");
  return target.startsWith("/") && !target.startsWith("//") && !target.startsWith("/\\") ? target : "/";
}

/** Development allows more attempts (automated tests log in many times); production uses the real limits. */
async function limited(key: string, rule: { limit: number; windowMs: number }): Promise<string | null> {
  const scale = process.env.NODE_ENV === "production" ? 1 : 20;
  const r = hit(key, rule.limit * scale, rule.windowMs);
  return r.ok ? null : `Too many attempts. Please try again in ${Math.max(1, Math.ceil(r.retryAfterSec / 60))} minute(s).`;
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const tooMany = await limited(`signup:${await clientIp()}`, AUTH_LIMITS.signup);
  if (tooMany) return { error: tooMany };
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { fieldErrors };
  }
  const { email, password, displayName } = parsed.data;

  const [emailTaken, nameTaken] = await Promise.all([
    db.user.findUnique({ where: { email } }),
    db.user.findUnique({ where: { displayName } }),
  ]);
  if (emailTaken) return { fieldErrors: { email: ["An account with this email already exists."] } };
  if (nameTaken) return { fieldErrors: { displayName: ["This display name is taken."] } };

  await db.user.create({ data: { email, displayName, passwordHash: await hashPassword(password) } });
  try {
    await sendVerificationEmail({ email, displayName });
  } catch (error) {
    // The account exists either way; the user can resend the link after logging in.
    console.error("[email] verification email failed:", error);
    return { success: "Account created, but we couldn't send the verification email. Log in and use “Resend link”." };
  }

  return { success: "Account created. Check your email for a verification link, then log in." };
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const tooMany =
    (await limited(`login:${await clientIp()}`, AUTH_LIMITS.login)) ?? (email ? await limited(`login-email:${email}`, AUTH_LIMITS.loginPerEmail) : null);
  if (tooMany) return { error: tooMany };
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeRedirect(formData.get("callbackUrl")),
    });
    return {};
  } catch (error) {
    // signIn redirects by throwing; only auth failures are handled here.
    if (error instanceof AuthError) return { error: "Wrong email or password." };
    throw error;
  }
}

export async function googleSignInAction(formData: FormData) {
  await signIn("google", { redirectTo: safeRedirect(formData.get("callbackUrl")) });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}

export async function resendVerificationAction(): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in first." };
  if (user.emailVerified) return { success: "Your email is already verified." };
  const tooMany = await limited(`resend:${await clientIp()}`, AUTH_LIMITS.resend);
  if (tooMany) return { error: tooMany };
  const wait = await resendWaitSeconds(user.email);
  if (wait > 0) return { error: `Please wait ${wait} seconds before requesting another link.` };
  try {
    await sendVerificationEmail(user);
  } catch (error) {
    console.error("[email] verification email failed:", error);
    return { error: "We couldn't send the email right now. Please try again in a few minutes." };
  }
  return { success: "Verification link sent. Check your email." };
}
