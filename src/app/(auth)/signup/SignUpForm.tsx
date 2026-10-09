"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction, type FormState } from "../actions";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage } from "@/components/ui/Field";

export function SignUpForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUpAction, {});

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage success={state.success} />
        <Link href="/login" className="font-semibold text-accent">Go to log in</Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage error={state.error} />
      <Field label="Email" name="email" type="email" autoComplete="email" required errors={state.fieldErrors?.email} />
      <Field
        label="Display name"
        name="displayName"
        autoComplete="username"
        required
        hint="Shown on leaderboards. 3–24 letters, numbers or underscores."
        errors={state.fieldErrors?.displayName}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters."
        errors={state.fieldErrors?.password}
      />
      <Button type="submit" disabled={pending}>{pending ? "Creating account…" : "Create account"}</Button>
    </form>
  );
}
