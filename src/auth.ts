import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validation/auth";
import type { Role } from "@/generated/prisma/enums";

class InvalidLogin extends CredentialsSignin {
  code = "invalid_login";
}

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(raw) {
      const parsed = loginSchema.safeParse(raw);
      if (!parsed.success) throw new InvalidLogin();
      const user = await db.user.findUnique({ where: { email: parsed.data.email } });
      if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
        throw new InvalidLogin();
      }
      return { id: user.id, email: user.email, name: user.displayName, role: user.role };
    },
  }),
];

// Google sign-in is optional: enabled only when its env vars are present.
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google);
}

/** Picks a free display name based on the Google profile name. */
async function uniqueDisplayName(base: string): Promise<string> {
  const clean = base.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 18) || "player";
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? clean : `${clean}_${Math.floor(Math.random() * 10000)}`;
    if (!(await db.user.findUnique({ where: { displayName: candidate } }))) return candidate;
  }
  return `player_${Date.now()}`;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" }, // required by the Credentials provider
  pages: { signIn: "/login" },
  logger: {
    // A wrong password is a normal user error, not a server error.
    error(error) {
      if (error.name === "CredentialsSignin") return;
      console.error(error);
    },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Google users get a local account on first sign-in, verified by Google.
      if (account?.provider === "google" && user.email) {
        const email = user.email.toLowerCase();
        const existing = await db.user.findUnique({ where: { email } });
        if (!existing) {
          await db.user.create({
            data: {
              email,
              emailVerified: profile?.email_verified ? new Date() : null,
              displayName: await uniqueDisplayName(user.name ?? email.split("@")[0]),
              avatarUrl: user.image ?? null,
            },
          });
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        // First sign-in: load our own user record (Google users have no id yet).
        const record = await db.user.findUnique({ where: { email: (user.email ?? "").toLowerCase() } });
        if (record) {
          token.userId = record.id;
          token.role = record.role;
          token.name = record.displayName;
        }
      }
      if (account) token.provider = account.provider;
      return token;
    },
    session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      session.user.role = (token.role as Role | undefined) ?? "USER";
      return session;
    },
  },
});
