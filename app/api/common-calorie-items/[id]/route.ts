import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectAppDB } from "@/lib/db";
import { getCommonCalorieItemModel } from "@/models/CommonCalorieItem";
import { requireRole, WRITE_ROLES } from "@/lib/authz";

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

    const update: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      update.name = body.name.trim();
    }
    if (body.calories !== undefined) {
      const calories = Number(body.calories);
      if (!Number.isFinite(calories)) {
        return NextResponse.json(
          { success: false, error: "calories が不正です" },
          { status: 400 },
        );
      }
      update.calories = calories;
    }
    if (body.nutrition && typeof body.nutrition === "object") {
      update.nutrition = {
        protein: numOrNull(body.nutrition.protein),
        carbs: numOrNull(body.nutrition.carbs),
        fat: numOrNull(body.nutrition.fat),
        fiber: numOrNull(body.nutrition.fiber),
        sugar: numOrNull(body.nutrition.sugar),
      };
    }

    const CommonCalorieItem = getCommonCalorieItemModel(appDB);
    const item = await CommonCalorieItem.findByIdAndUpdate(id, update, {
      new: true,
    }).lean();
    if (!item) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    try {
      const AuditLog = (await import("@/models/AuditLog")).AuditLog;
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "UPDATE",
        resource: "CommonCalorieItem",
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
        name: item.name,
        calories: item.calories,
        nutrition: {
          protein: item.nutrition?.protein ?? null,
          carbs: item.nutrition?.carbs ?? null,
          fat: item.nutrition?.fat ?? null,
          fiber: item.nutrition?.fiber ?? null,
          sugar: item.nutrition?.sugar ?? null,
        },
        source: item.source ?? null,
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

    const CommonCalorieItem = getCommonCalorieItemModel(appDB);
    const item = await CommonCalorieItem.findByIdAndDelete(id).lean();
    if (!item) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    try {
      const AuditLog = (await import("@/models/AuditLog")).AuditLog;
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "DELETE",
        resource: "CommonCalorieItem",
        resourceId: id,
        detail: { name: item.name },
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

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
