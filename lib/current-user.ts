import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Sessions are stateless JWTs, so a cookie outlives the user row it names — reset the
// database and the browser still claims an id that no longer exists. Every write then
// fails on a foreign key (Account_userId_fkey and friends) instead of asking the person
// to sign in again, so the id is checked against the database once per request.
const userExists = cache(async (id: string) => {
  const user = await db.user.findUnique({ where: { id }, select: { id: true } });
  return user !== null;
});

export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  // A server component can't clear the cookie itself, and /login bounces anyone the
  // middleware still thinks is signed in, so hand off to a route that signs out.
  if (!(await userExists(session.user.id))) redirect("/session-expired");
  return session.user.id;
}
