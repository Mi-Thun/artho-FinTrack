import { signOut } from "@/lib/auth";

// Where requireUserId sends a session whose user row is gone. Route handlers can write
// cookies, so this is where the stale session actually gets cleared.
export async function GET() {
  await signOut({ redirectTo: "/login" });
}
