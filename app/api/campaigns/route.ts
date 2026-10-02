import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectAppDB } from "@/lib/db";
import { getCampaignModel, type CampaignStatus } from "@/models/Campaign";
import { requireRole, WRITE_ROLES } from "@/lib/authz";

const VALID_STATUSES: CampaignStatus[] = ["draft", "published", "ended"];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const status = searchParams.get("status")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.max(
    1,
    parseInt(searchParams.get("limit") ?? "20", 10) || 20,
  );

  const appDB = await connectAppDB();
  if (!appDB) {
    return NextResponse.json({
      success: true,
      data: [],
      meta: { total: 0, page, limit },
      warning: "APP_MONGODB_URI が未設定のため取得できません",
    });
  }

  const Campaign = getCampaignModel(appDB);
  const query: Record<string, unknown> = {};
  if (search) query.title = { $regex: search, $options: "i" };
  if (status && VALID_STATUSES.includes(status as CampaignStatus)) {
    query.status = status;
  }

  const [total, items] = await Promise.all([
    Campaign.countDocuments(query),
    Campaign.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const data = items.map((item) => ({
    id: String(item._id),
    title: item.title,
    body: item.body,
    imageUrl: item.imageUrl ?? null,
    startAt: item.startAt ? new Date(item.startAt).toISOString() : "",
    endAt: item.endAt ? new Date(item.endAt).toISOString() : "",
    status: item.status,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : "",
    updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : "",
  }));

  return NextResponse.json({
    success: true,
    data,
    meta: { total, page, limit },
  });
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
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.body === "string" ? body.body.trim() : "";
    const imageUrl =
      typeof body.imageUrl === "string" && body.imageUrl.trim()
        ? body.imageUrl.trim()
        : null;
    const startAt = parseDate(body.startAt);
    const endAt = parseDate(body.endAt);
    const status: CampaignStatus = VALID_STATUSES.includes(body.status)
      ? body.status
      : "draft";

    if (!title || !content) {
      return NextResponse.json(
        { success: false, error: "タイトルと本文は必須です" },
        { status: 400 },
      );
    }
    if (!startAt || !endAt) {
      return NextResponse.json(
        { success: false, error: "開始日時・終了日時は必須です" },
        { status: 400 },
      );
    }
    if (endAt < startAt) {
      return NextResponse.json(
        { success: false, error: "終了日時は開始日時以降にしてください" },
        { status: 400 },
      );
    }

    const appDB = await connectAppDB();
    if (!appDB) {
      return NextResponse.json(
        { success: false, error: "APP_MONGODB_URI が未設定です" },
        { status: 503 },
      );
    }

    const Campaign = getCampaignModel(appDB);
    const item = await Campaign.create({
      title,
      body: content,
      imageUrl,
      startAt,
      endAt,
      status,
    });

    try {
      const AuditLog = (await import("@/models/AuditLog")).AuditLog;
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "CREATE",
        resource: "Campaign",
        resourceId: item._id?.toString(),
        detail: { title, status },
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      });
    } catch {
      // AuditLog失敗は無視
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: String(item._id),
          title: item.title,
          body: item.body,
          imageUrl: item.imageUrl ?? null,
          startAt: item.startAt.toISOString(),
          endAt: item.endAt.toISOString(),
          status: item.status,
          createdAt: item.createdAt?.toISOString() ?? "",
          updatedAt: item.updatedAt?.toISOString() ?? "",
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

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
