import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { brand } from "@/config/brand";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { getCurrentUser } from "@/lib/session";
import { ThemeToggle } from "./ThemeToggle";

function Logo() {
  return (
    <Link href="/" aria-label={`${brand.name}, home`} className="flex items-center gap-2.5 font-[family-name:var(--font-heading-face)] text-[20px] font-semibold tracking-tight text-ink no-underline sm:gap-3 sm:text-[26px]">
      <Image src={brand.logo.mark} alt="" width={48} height={48} priority className="h-9 w-9 sm:h-12 sm:w-12" />
      <span>{brand.shortName}</span>
    </Link>
  );
}

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-line bg-surface">
      {/* Phones: logo + account on the first row, menu below. Desktop: one row. */}
      <div className="page-x flex min-h-[72px] flex-wrap items-center gap-x-3 gap-y-1 py-3 sm:min-h-[88px] lg:gap-x-10">
        <Logo />
        <nav
          aria-label="Main"
          className="order-3 flex w-full gap-x-8 font-[family-name:var(--font-heading-face)] text-[17px] font-medium tracking-[0.04em] sm:text-[19px] lg:order-none lg:w-auto"
        >
          <Link href="/" className="py-2.5 text-ink no-underline">Home</Link>
          <Link href="/contests" className="py-2.5 text-ink no-underline">Tournaments</Link>
          {user?.role === "ADMIN" ? <Link href="/admin" className="py-2.5 text-ink no-underline">Admin</Link> : null}
        </nav>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-2 text-[15px] sm:gap-x-4 sm:text-[17px]">
          {user ? (
            <>
              <Link href="/settings" className="flex items-center gap-2.5 rounded-full" title={`${user.displayName} · Settings`}>
                <Avatar name={user.displayName} src={user.avatarUrl} />
                <span className="sr-only">{user.displayName}, settings</span>
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="min-h-11 px-2 font-[family-name:var(--font-heading-face)] font-medium text-ink hover:text-accent">Log out</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="px-2 py-2.5 font-[family-name:var(--font-heading-face)] font-medium text-ink no-underline sm:px-4">Log in</Link>
              <ButtonLink href="/signup" size="sm">Sign up</ButtonLink>
            </>
          )}
          <ThemeToggle />
        </div>
      </div>
      {user && !user.emailVerified ? (
        <div className="page-x border-t border-line bg-accent-soft py-2 text-center text-[15px] text-accent">
          Please verify your email to register for tournaments. <Link href="/verify" className="font-semibold text-accent underline">Resend link</Link>
        </div>
      ) : null}
    </header>
  );
}
