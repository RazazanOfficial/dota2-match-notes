import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";
import { toJournalDateKey } from "@/lib/journal/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(token);

  if (!user) {
    return Response.json({ authenticated: false });
  }

  const { passwordHash, ...publicUser } = user;

  return Response.json({
    authenticated: true,
    user: {
      ...publicUser,
      registeredDate: toJournalDateKey(publicUser.createdAt),
      hasPassword: Boolean(passwordHash),
    },
  });
}
