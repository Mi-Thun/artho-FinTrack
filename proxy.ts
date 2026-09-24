import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Runs on everything except static assets and metadata files. An allowlist of
  // protected prefixes meant every new page was unprotected until someone remembered to
  // add it here — `/budgets`, `/profile`, and `/subscription` all shipped
  // that way. Inverting it makes "protected" the default and the exceptions explicit;
  // `lib/auth.config.ts` holds the list of routes that stay public.
  //
  // API routes are excluded because each one authenticates itself, and server actions
  // are POSTs to the page they live on — so they keep proxy coverage from this matcher,
  // and every action additionally calls requireUserId(). Proxy is defence in depth here,
  // never the only check.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
