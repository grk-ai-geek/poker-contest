"use client";

import { useActionState } from "react";
import { resendVerificationAction, type FormState } from "../actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/Field";

export function ResendButton() {
  const [state, action, pending] = useActionState<FormState, FormData>(resendVerificationAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Resend verification link"}</Button>
    </form>
  );
}
