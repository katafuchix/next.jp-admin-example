import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectAppDB } from "@/lib/db";
import { getAppUserModel } from "@/models/AppUser";
import { getBuddyPointLogModel } from "@/models/BuddyPointLog";
import { isUserOnline, ONLINE_FRESH_MS } from "@/lib/presence";
import { computeLoginStreak } from "@/lib/login-streak";

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
  const status = searchParams.get("status") ?? "";
  const gender = searchParams.get("gender") ?? "";
  const residence = searchParams.get("residence") ?? "";
  const plan = searchParams.get("plan") ?? "";
  const ageMin = searchParams.get("ageMin");
  const ageMax = searchParams.get("ageMax");
  const inactiveDays = searchParams.get("inactiveDays");
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

  const AppUser = getAppUserModel(appDB);
  const freshSince = new Date(Date.now() - ONLINE_FRESH_MS);

  const conditions: Record<string, unknown>[] = [];
  if (search) {
    conditions.push({
      $or: [
        { displayName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    });
  }
  if (status === "online") {
    conditions.push({ isOnline: true, lastSocketAt: { $gte: freshSince } });
  } else if (status === "offline") {
    conditions.push({
      $or: [
        { isOnline: { $ne: true } },
        { lastSocketAt: { $lt: freshSince } },
        { lastSocketAt: null },
      ],
    });
  }
  if (gender) {
    conditions.push({ gender });
  }
  if (residence) {
    conditions.push({ prefecture: residence });
  }
  if (plan === "paid") {
    conditions.push({ isPaid: true });
  } else if (plan === "free") {
    conditions.push({ isPaid: { $ne: true } });
  }
  const ageMinNum = ageMin ? parseInt(ageMin, 10) : NaN;
  const ageMaxNum = ageMax ? parseInt(ageMax, 10) : NaN;
  if (!Number.isNaN(ageMinNum)) {
    conditions.push({ age: { $gte: ageMinNum } });
  }
  if (!Number.isNaN(ageMaxNum)) {
    conditions.push({ age: { $lte: ageMaxNum } });
  }
  const inactiveDaysNum = inactiveDays ? parseInt(inactiveDays, 10) : NaN;
  if (!Number.isNaN(inactiveDaysNum) && inactiveDaysNum > 0) {
    const inactiveSince = new Date(
      Date.now() - inactiveDaysNum * 24 * 60 * 60 * 1000,
    );
    conditions.push({
      $or: [{ lastAppOpenAt: { $lt: inactiveSince } }, { lastAppOpenAt: null }],
    });
  }
  const query = conditions.length > 0 ? { $and: conditions } : {};

  const [total, users] = await Promise.all([
    AppUser.countDocuments(query),
    AppUser.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const BuddyPointLog = getBuddyPointLogModel(appDB);
  const loginLogs = await BuddyPointLog.find({
    userId: { $in: users.map((u) => u._id) },
    source: "login_bonus",
  })
    .select("userId createdAt")
    .lean();
  const loginDatesByUser = new Map<string, Date[]>();
  for (const log of loginLogs) {
    const key = String(log.userId);
    const dates = loginDatesByUser.get(key) ?? [];
    dates.push(new Date(log.createdAt));
    loginDatesByUser.set(key, dates);
  }

  const data = users.map((u) => {
    const lastAppOpenAt = u.lastAppOpenAt ?? null;
    const { currentStreakDays } = computeLoginStreak(
      loginDatesByUser.get(String(u._id)) ?? [],
    );
    return {
      userId: String(u._id),
      email: u.email,
      name: u.displayName ?? "",
      status: isUserOnline(u) ? "online" : "offline",
      plan: u.isPaid ? "プレミアム" : "フリー",
      createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : "",
      lastLoginAt: lastAppOpenAt ? new Date(lastAppOpenAt).toISOString() : "",
      loginStreakDays: currentStreakDays,
      age: u.age ?? null,
      gender: u.gender ?? null,
      residence: u.prefecture ?? null,
    };
  });

  return NextResponse.json({
    success: true,
    data,
    meta: { total, page, limit },
  });
}
