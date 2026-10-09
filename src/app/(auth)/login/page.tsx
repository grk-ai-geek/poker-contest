import Link from "next/link";
import { googleSignInAction } from "../actions";
import { LoginForm } from "./LoginForm";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { callbackUrl } = await searchParams;
  // Only allow same-site relative redirects.
  const target = typeof callbackUrl === "string" && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

  return (
    <Card className="mx-auto flex w-full max-w-md flex-col gap-5 p-6">
      <h1 className="text-[32px] font-medium leading-tight">Log in</h1>
      <LoginForm callbackUrl={target} />
      {googleEnabled ? (
        <form action={googleSignInAction}>
          <input type="hidden" name="callbackUrl" value={target} />
          <Button type="submit" variant="outline" className="w-full">Continue with Google</Button>
        </form>
      ) : null}
      <p className="text-sm text-ink-2">
        New here? <Link href="/signup" className="font-semibold text-accent">Create an account</Link>
      </p>
    </Card>
  );
}
