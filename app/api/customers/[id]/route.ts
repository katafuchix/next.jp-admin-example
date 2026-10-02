import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectAppDB } from "@/lib/db";
import { connectDB } from "@/lib/db";
import PointTransaction from "@/models/PointTransaction";
import mongoose from "mongoose";
import { getAppUserModel } from "@/models/AppUser";
import { getBuddyPointLogModel } from "@/models/BuddyPointLog";
import { getIapPurchaseBindingModel } from "@/models/IapPurchaseBinding";
import { getLatestWeights, calculateBmi } from "@/lib/customer-metrics";
import { isUserOnline } from "@/lib/presence";
import { requireRole, WRITE_ROLES, SUPER_ADMIN_ONLY } from "@/lib/authz";
import { computeLoginStreak } from "@/lib/login-streak";
import { deleteAppUserWithRelatedData } from "@/lib/app-user-deletion";
import { recordAppUserWithdrawal } from "@/lib/app-user-withdrawal";

export async function GET(
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

  const { id } = await params;

  const appDB = await connectAppDB();
  if (!appDB) {
    return NextResponse.json(
      {
        success: false,
        error: "APP_MONGODB_URI が未設定のため取得できません",
      },
      { status: 503 },
    );
  }

  const AppUser = getAppUserModel(appDB);
  const user = await AppUser.findById(id)
    .lean()
    .catch(() => null);
  if (!user) {
    return NextResponse.json(
      { success: false, error: "顧客が見つかりません" },
      { status: 404 },
    );
  }

  const lastAppOpenAt = user.lastAppOpenAt ?? null;

  const weightMap = await getLatestWeights(appDB, [id]);
  const weight = weightMap.get(id) ?? null;
  const bmi = calculateBmi(user.height, weight);

  const BuddyPointLog = getBuddyPointLogModel(appDB);
  const loginLogs = await BuddyPointLog.find({
    userId: id,
    source: "login_bonus",
  })
    .select("createdAt")
    .lean();
  const { currentStreakDays } = computeLoginStreak(
    loginLogs.map((log) => new Date(log.createdAt)),
  );

  const purchases = await getIapPurchaseBindingModel(appDB)
    .find({ ownerUserId: id })
    .select("platform")
    .lean();
  const purchasePlatforms = [...new Set(purchases.map((p) => p.platform))];

  return NextResponse.json({
    success: true,
    data: {
      id,
      email: user.email,
      name: user.displayName ?? "",
      status: isUserOnline(user) ? "online" : "offline",
      plan: user.isPaid ? "プレミアム" : "フリー",
      points: user.buddyPoints ?? 0,
      // 課金額はアプリ側に保存されていない（購入の記録だけがある）ので出せない
      totalCharge: null,
      purchaseCount: purchases.length,
      purchasePlatforms,
      createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : "",
      lastLoginAt: lastAppOpenAt ? new Date(lastAppOpenAt).toISOString() : "",
      loginStreakDays: currentStreakDays,
      // 端末OS・アプリの版はアプリ側に記録されていないので出せない
      deviceOs: null,
      appVersion: null,
      age: user.age ?? null,
      gender: user.gender ?? null,
      height: user.height ?? null,
      residence: user.prefecture ?? null,
      weight,
      bmi,
    },
  });
}

export async function PATCH(
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

  const { id } = await params;

  let body: { delta?: number; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { delta, reason } = body;
  if (typeof delta !== "number" || delta === 0) {
    return NextResponse.json(
      { success: false, error: "delta must be a non-zero number" },
      { status: 400 },
    );
  }
  if (!reason || reason.trim() === "") {
    return NextResponse.json(
      { success: false, error: "reason is required" },
      { status: 400 },
    );
  }

  const appDB = await connectAppDB();
  if (!appDB) {
    return NextResponse.json(
      {
        success: false,
        error: "APP_MONGODB_URI が未設定のため更新できません",
      },
      { status: 503 },
    );
  }

  const AppUser = getAppUserModel(appDB);
  const before = await AppUser.findById(id)
    .select("buddyPoints")
    .lean()
    .catch(() => null);
  if (!before) {
    return NextResponse.json(
      { success: false, error: "顧客が見つかりません" },
      { status: 404 },
    );
  }

  const currentPoints = before.buddyPoints ?? 0;
  if (currentPoints + delta < 0) {
    return NextResponse.json(
      { success: false, error: "ポイントが不足しています" },
      { status: 400 },
    );
  }

  const updated = await AppUser.findByIdAndUpdate(
    id,
    { $inc: { buddyPoints: delta } },
    { new: true },
  )
    .select("buddyPoints")
    .lean();
  const newPoints = updated?.buddyPoints ?? currentPoints + delta;

  // ポイントトランザクション記録（Admin DB）
  try {
    await connectDB();
    await PointTransaction.create({
      userId: id,
      type: delta > 0 ? "manual_add" : "manual_sub",
      amount: delta,
      reason: reason.trim(),
      adminId: session.user.id
        ? new mongoose.Types.ObjectId(session.user.id as string)
        : undefined,
    });
  } catch {
    // トランザクション記録失敗は無視（ポイント変更自体は成功させる）
  }

  return NextResponse.json({
    success: true,
    data: { id, delta, reason, newPoints },
  });
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
  // 顧客の削除は取り消せないため SUPER_ADMIN に限る
  const forbidden = requireRole(session, SUPER_ADMIN_ONLY);
  if (forbidden) return forbidden;

  try {
    const { id } = await params;

    const appDB = await connectAppDB();
    if (!appDB) {
      return NextResponse.json(
        {
          success: false,
          error: "APP_MONGODB_URI が未設定のため削除できません",
        },
        { status: 503 },
      );
    }

    const AppUser = getAppUserModel(appDB);
    const user = await AppUser.findById(id)
      .select("email displayName createdAt isPaid")
      .lean()
      .catch(() => null);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "顧客が見つかりません" },
        { status: 404 },
      );
    }

    // 消すと登録日も課金状態も分からなくなるので、先に退会として記録する。
    // 記録できないまま消すと退会数から漏れるので、そのときは削除しない
    try {
      await recordAppUserWithdrawal(appDB, {
        userId: String(user._id),
        withdrawnAt: new Date(),
        signedUpAt: user.createdAt ?? null,
        wasPaid: user.isPaid === true,
        source: "admin",
      });
    } catch (err) {
      console.error("[customers] 退会の記録に失敗しました", { id, err });
      return NextResponse.json(
        {
          success: false,
          error: "退会の記録に失敗したため、削除を中止しました",
        },
        { status: 500 },
      );
    }

    // アプリの退会処理と同じ範囲で削除する（削除後は同じメールアドレスで再登録できる）
    const deleted = await deleteAppUserWithRelatedData(appDB, String(user._id));
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "顧客が見つかりません" },
        { status: 404 },
      );
    }

    try {
      await connectDB();
      const AuditLog = (await import("@/models/AuditLog")).AuditLog;
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "DELETE",
        resource: "AppUser",
        resourceId: id,
        detail: { email: user.email, displayName: user.displayName ?? "" },
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      });
    } catch {
      // AuditLog失敗は無視（削除自体は成功させる）
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
