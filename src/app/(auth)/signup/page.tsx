import Link from "next/link";
import { SignUpForm } from "./SignUpForm";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <Card className="mx-auto flex w-full max-w-md flex-col gap-5 p-6">
      <div>
        <h1 className="text-[32px] font-medium leading-tight">Create your account</h1>
        <p className="mt-1 text-ink-2">Free play-money poker tournaments. No real money involved.</p>
      </div>
      <SignUpForm />
      <p className="text-sm text-ink-2">
        Already have an account? <Link href="/login" className="font-semibold text-accent">Log in</Link>
      </p>
    </Card>
  );
}
