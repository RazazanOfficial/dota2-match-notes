import { redirect } from "next/navigation";
import { backendSession } from "@/lib/backend/server";
export const dynamic = "force-dynamic";
export default async function MyProfilePage() {
 const user = await backendSession();
 if (!user) redirect("/");
 redirect(`/user/${user.steamAccountId}`);
}
