import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function MyProfilePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(token);

  if (!user) redirect("/");
  redirect(`/user/${user.steamAccountId}`);
}
