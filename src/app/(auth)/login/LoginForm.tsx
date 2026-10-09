"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "../actions";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage } from "@/components/ui/Field";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <FormMessage error={state.error} />
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" disabled={pending}>{pending ? "Logging in…" : "Log in"}</Button>
    </form>
  );
}
