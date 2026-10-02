import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import LPPage from "@/models/LPPage";
import { requireRole, WRITE_ROLES } from "@/lib/authz";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);

  try {
    await connectDB();
    const total = await LPPage.countDocuments();
    const docs = await LPPage.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const data = docs.map((lp) => ({
      name: lp.name,
      slug: lp.slug,
      url: lp.url ?? "",
      isActive: lp.isActive,
      sessions: lp.sessions,
      conversions: lp.conversions,
      revenue: lp.revenue,
    }));

    return NextResponse.json({
      success: true,
      data,
      meta: { total, page, limit },
    });
  } catch {
    return NextResponse.json({
      success: true,
      data: [],
      meta: { total: 0, page, limit },
    });
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
  const forbidden = requireRole(session, WRITE_ROLES);
  if (forbidden) return forbidden;

  try {
    await connectDB();
    const body = await request.json();

    const lp = await LPPage.create({
      name: body.title ?? body.name,
      slug: body.slug,
      url: body.url ?? undefined,
      isActive: false,
      sessions: 0,
      conversions: 0,
      revenue: 0,
    });

    try {
      const { AuditLog } = await import("@/models/AuditLog");
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "CREATE",
        resource: "LPPage",
        resourceId: lp._id.toString(),
        detail: { name: lp.name, slug: lp.slug },
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      });
    } catch (err) {
      console.error("[AuditLog] CREATE LPPage の記録に失敗しました", err);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: lp._id.toString(),
          title: lp.name,
          slug: lp.slug,
          status: "draft",
          url: lp.url ?? null,
          performance: { views: 0, conversions: 0, revenue: 0, cvr: 0 },
          publishedAt: null,
          createdAt:
            lp.createdAt instanceof Date
              ? lp.createdAt.toISOString()
              : String(lp.createdAt),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
