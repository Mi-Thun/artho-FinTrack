import { NextResponse } from "next/server";
import type { NextAuthConfig } from "next-auth";

// Everything is protected unless it's listed here. The previous allowlist of protected
// prefixes silently left every newly added page open — a page only became protected if
// someone remembered to come back and add it.
const PUBLIC_ROUTES = ["/login", "/register"];

/** Routes a signed-in user has no business on; they get sent to the dashboard instead. */
const SIGNED_OUT_ONLY_ROUTES = ["/login", "/register"];

function matches(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      if (isLoggedIn && matches(pathname, SIGNED_OUT_ONLY_ROUTES)) {
        return NextResponse.redirect(new URL("/dashboard", nextUrl));
      }

      if (matches(pathname, PUBLIC_ROUTES)) return true;

      // Returning false redirects to `pages.signIn`.
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
