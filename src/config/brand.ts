// The ONLY place the brand lives (design.md §3). Everything visible reads from here.
// Rebrand = change these defaults (or the env vars) and replace the files in public/brand/.
// tests/brand.test.ts fails if the brand name appears anywhere else in src/.

function env(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value.trim() : fallback;
}

// NEXT_PUBLIC_* must be read with literal property names so Next.js can inline them in the browser bundle.
const name = env(process.env.NEXT_PUBLIC_BRAND_NAME, "RiverKings");

export const brand = {
  name,
  shortName: env(process.env.NEXT_PUBLIC_BRAND_SHORT, name),
  tagline: env(process.env.NEXT_PUBLIC_BRAND_TAGLINE, "Play-money poker tournaments"),
  description: env(
    process.env.NEXT_PUBLIC_BRAND_DESCRIPTION,
    "Free No-Limit Texas Hold'em tournaments against real players. Play money only: no real money is wagered or won.",
  ),
  domain: env(process.env.NEXT_PUBLIC_BRAND_DOMAIN, "localhost:3000"),
  supportEmail: env(process.env.NEXT_PUBLIC_SUPPORT_EMAIL, "support@example.com"),
  emailFromName: env(process.env.EMAIL_FROM_NAME, name),
  logo: {
    mark: "/brand/mark.svg", // square emblem, used in the header and as the icon
  },
} as const;

export type Brand = typeof brand;
