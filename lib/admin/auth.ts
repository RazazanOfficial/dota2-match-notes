import type { NextRequest } from "next/server";
import { getRequestUser } from "@/lib/auth/request";
import { AdminError } from "./errors";

export async function requireSuperAdmin(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    throw new AdminError(401, "unauthorized", "ابتدا وارد حساب شوید");
  }
  if (!user.isSuperAdmin) {
    throw new AdminError(403, "super_admin_required", "دسترسی Super Admin لازم است");
  }
  return user;
}
