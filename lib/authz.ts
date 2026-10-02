import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import type { AdminRole } from "@/models/Admin";
import {
  WRITE_ROLES,
  INQUIRY_WRITE_ROLES,
  EXPORT_ROLES,
  SUPER_ADMIN_ONLY,
} from "@/lib/roles";

export { WRITE_ROLES, INQUIRY_WRITE_ROLES, EXPORT_ROLES, SUPER_ADMIN_ONLY };

/**
 * セッションのロールが許可リストに含まれているか確認する。
 * 含まれていなければ 403 Forbidden の NextResponse を返す。問題なければ null。
 */
export function requireRole(
  session: Session,
  allowedRoles: AdminRole[],
): NextResponse | null {
  const role = (session.user as { role?: string }).role as
    | AdminRole
    | undefined;
  if (!role || !allowedRoles.includes(role)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }
  return null;
}
