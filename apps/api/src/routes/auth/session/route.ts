import type { HttpRequest } from "../../../http/protocol";
import { SESSION_COOKIE } from "../../../lib/auth/config";
import { getSessionUser } from "../../../lib/auth/session";
import { requestSessionToken } from "../../../lib/auth/request";
import { toJournalDateKey } from "../../../lib/journal/timezone";


export async function GET(request: HttpRequest) {
  const token = requestSessionToken(request);
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
