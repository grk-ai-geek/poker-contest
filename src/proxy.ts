import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Fast first check on protected pages. Pages and actions still call
// requireUser()/requireAdmin(), which re-check against the database.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user;

  if (!user) {
    const login = new URL("/login", req.nextUrl);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }
  if (pathname.startsWith("/admin") && user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/settings"],
};
