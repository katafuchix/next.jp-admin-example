import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import { Admin } from "@/models/Admin";
import bcrypt from "bcryptjs";
import { requireRole, SUPER_ADMIN_ONLY } from "@/lib/authz";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  const forbidden = requireRole(session, SUPER_ADMIN_ONLY);
  if (forbidden) return forbidden;

  try {
    await connectDB();
    const admins = await Admin.find()
      .select("-passwordHash -twoFactorSecret")
      .sort({ createdAt: -1 })
      .lean();
    const data = admins.map((a) => ({ ...a, id: String(a._id) }));
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  const forbidden = requireRole(session, SUPER_ADMIN_ONLY);
  if (forbidden) return forbidden;

  try {
    await connectDB();
    const body = await request.json();
    const { email, name, role, password } = body;

    const existing = await Admin.findOne({ email });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Email already exists" },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await Admin.create({ email, name, role, passwordHash });
    const data = {
      ...admin.toObject(),
      id: admin._id.toString(),
      passwordHash: undefined,
    };

    try {
      const AuditLog = (await import("@/models/AuditLog")).AuditLog;
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "CREATE",
        resource: "Admin",
        resourceId: admin._id?.toString(),
        detail: { email, name, role },
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      });
    } catch (err) {
      console.error("[AuditLog] CREATE Admin の記録に失敗しました", err);
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
