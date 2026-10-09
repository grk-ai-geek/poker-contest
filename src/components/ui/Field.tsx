import type { ComponentProps } from "react";

/** Labelled input with optional hint and error messages. */
export function Field({
  label,
  name,
  errors,
  hint,
  ...props
}: ComponentProps<"input"> & { label: string; name: string; errors?: string[]; hint?: string }) {
  const id = `field-${name}`;
  const describedBy = errors?.length ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">{label}</label>
      <input
        id={id}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-11 rounded-md border border-field bg-surface px-3 aria-invalid:border-danger"
        {...props}
      />
      {errors?.length ? (
        <p id={`${id}-error`} className="text-[13px] text-danger">{errors.join(" ")}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (error) return <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-fg">{error}</p>;
  if (success) return <p role="status" className="rounded-md bg-success-bg px-3 py-2 text-sm text-success-fg">{success}</p>;
  return null;
}
