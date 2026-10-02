import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectAppDB } from "@/lib/db";
import { getCampaignModel, type CampaignStatus } from "@/models/Campaign";
import { requireRole, WRITE_ROLES } from "@/lib/authz";

const VALID_STATUSES: CampaignStatus[] = ["draft", "published", "ended"];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    const { id } = await params;
    const body = await request.json();

    const appDB = await connectAppDB();
    if (!appDB) {
      return NextResponse.json(
        { success: false, error: "APP_MONGODB_URI が未設定です" },
        { status: 503 },
      );
    }

    const Campaign = getCampaignModel(appDB);
    const existing = await Campaign.findById(id).lean();
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    const update: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) {
      update.title = body.title.trim();
    }
    if (typeof body.body === "string" && body.body.trim()) {
      update.body = body.body.trim();
    }
    if (body.imageUrl !== undefined) {
      update.imageUrl =
        typeof body.imageUrl === "string" && body.imageUrl.trim()
          ? body.imageUrl.trim()
          : null;
    }
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { success: false, error: "status が不正です" },
          { status: 400 },
        );
      }
      update.status = body.status;
    }

    let startAt = existing.startAt;
    let endAt = existing.endAt;
    if (body.startAt !== undefined) {
      const parsed = parseDate(body.startAt);
      if (!parsed) {
        return NextResponse.json(
          { success: false, error: "startAt が不正です" },
          { status: 400 },
        );
      }
      startAt = parsed;
      update.startAt = parsed;
    }
    if (body.endAt !== undefined) {
      const parsed = parseDate(body.endAt);
      if (!parsed) {
        return NextResponse.json(
          { success: false, error: "endAt が不正です" },
          { status: 400 },
        );
      }
      endAt = parsed;
      update.endAt = parsed;
    }
    if (endAt < startAt) {
      return NextResponse.json(
        { success: false, error: "終了日時は開始日時以降にしてください" },
        { status: 400 },
      );
    }

    const item = await Campaign.findByIdAndUpdate(id, update, {
      new: true,
    }).lean();
    if (!item) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(update, "imageUrl") &&
      existing.imageUrl &&
      existing.imageUrl !== update.imageUrl
    ) {
      const { deleteImageByPublicUrl } = await import("@/lib/storage");
      await deleteImageByPublicUrl(existing.imageUrl);
    }

    try {
      const AuditLog = (await import("@/models/AuditLog")).AuditLog;
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "UPDATE",
        resource: "Campaign",
        resourceId: id,
        detail: update,
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      });
    } catch {
      // AuditLog失敗は無視
    }

    return NextResponse.json({
      success: true,
      data: {
        id: String(item._id),
        title: item.title,
        body: item.body,
        imageUrl: item.imageUrl ?? null,
        startAt: item.startAt ? new Date(item.startAt).toISOString() : "",
        endAt: item.endAt ? new Date(item.endAt).toISOString() : "",
        status: item.status,
        createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : "",
        updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : "",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    const { id } = await params;
    const appDB = await connectAppDB();
    if (!appDB) {
      return NextResponse.json(
        { success: false, error: "APP_MONGODB_URI が未設定です" },
        { status: 503 },
      );
    }

    const Campaign = getCampaignModel(appDB);
    const item = await Campaign.findByIdAndDelete(id).lean();
    if (!item) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    if (item.imageUrl) {
      const { deleteImageByPublicUrl } = await import("@/lib/storage");
      await deleteImageByPublicUrl(item.imageUrl);
    }

    try {
      const AuditLog = (await import("@/models/AuditLog")).AuditLog;
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "DELETE",
        resource: "Campaign",
        resourceId: id,
        detail: { title: item.title },
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      });
    } catch {
      // AuditLog失敗は無視
    }

    return NextResponse.json({ success: true, data: { id } });
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
