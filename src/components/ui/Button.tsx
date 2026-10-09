import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "outline" | "ghost";

type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-[family-name:var(--font-heading-face)] font-medium tracking-[0.02em] no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-50";

// Sizes live here (not in className) so they never fight with each other.
const sizes: Record<Size, string> = {
  sm: "min-h-10 px-4 text-[15px] sm:min-h-11 sm:px-6 sm:text-[16px]",
  md: "min-h-12 px-7 text-[17px]",
  lg: "min-h-14 px-9 text-[19px]",
};

const variants: Record<Variant, string> = {
  primary: "bg-accent-strong text-on-accent hover:brightness-110 hover:text-on-accent",
  outline: "border border-ink-2 bg-transparent text-ink hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />;
}
