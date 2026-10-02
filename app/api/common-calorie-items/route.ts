import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectAppDB } from "@/lib/db";
import { getCommonCalorieItemModel } from "@/models/CommonCalorieItem";
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
  const search = searchParams.get("search")?.trim() ?? "";
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

  const CommonCalorieItem = getCommonCalorieItemModel(appDB);
  const query = search ? { name: { $regex: search, $options: "i" } } : {};

  const [total, items] = await Promise.all([
    CommonCalorieItem.countDocuments(query),
    CommonCalorieItem.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const data = items.map((item) => ({
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
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const calories = Number(body.calories);
    if (!name || !Number.isFinite(calories)) {
      return NextResponse.json(
        { success: false, error: "name と calories は必須です" },
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

    const CommonCalorieItem = getCommonCalorieItemModel(appDB);
    const item = await CommonCalorieItem.create({
      name,
      calories,
      nutrition: {
        protein: numOrNull(body.nutrition?.protein),
        carbs: numOrNull(body.nutrition?.carbs),
        fat: numOrNull(body.nutrition?.fat),
        fiber: numOrNull(body.nutrition?.fiber),
        sugar: numOrNull(body.nutrition?.sugar),
      },
      source: "manual",
    });

    try {
      const AuditLog = (await import("@/models/AuditLog")).AuditLog;
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "CREATE",
        resource: "CommonCalorieItem",
        resourceId: item._id?.toString(),
        detail: { name, calories },
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
          name: item.name,
          calories: item.calories,
          nutrition: item.nutrition,
          source: item.source,
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

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
