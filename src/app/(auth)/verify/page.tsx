import Link from "next/link";
import { ResendButton } from "./ResendButton";
import { Card } from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/session";
import { consumeVerificationToken } from "@/lib/verification";

export const metadata = { title: "Verify email" };

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const { token } = await searchParams;

  if (typeof token === "string" && token) {
    const ok = await consumeVerificationToken(token);
    return (
      <Card className="mx-auto flex w-full max-w-md flex-col gap-4 p-6">
        <h1 className="text-[32px] font-medium leading-tight">{ok ? "Email verified" : "Link expired or invalid"}</h1>
        <p className="text-ink-2">
          {ok ? "Thanks! You can now register for contests." : "Log in and request a new verification link."}
        </p>
        <Link href={ok ? "/" : "/login"} className="font-semibold text-accent">{ok ? "Go to home" : "Log in"}</Link>
      </Card>
    );
  }

  const user = await getCurrentUser();
  return (
    <Card className="mx-auto flex w-full max-w-md flex-col gap-4 p-6">
      <h1 className="text-[32px] font-medium leading-tight">Verify your email</h1>
      {user ? (
        user.emailVerified ? (
          <p className="text-ink-2">Your email is already verified.</p>
        ) : (
          <>
            <p className="text-ink-2">We sent a link to <strong>{user.email}</strong>. It expires after 24 hours.</p>
            <ResendButton />
          </>
        )
      ) : (
        <p className="text-ink-2">
          <Link href="/login?callbackUrl=/verify" className="font-semibold text-accent">Log in</Link> to resend your verification link.
        </p>
      )}
    </Card>
  );
}
