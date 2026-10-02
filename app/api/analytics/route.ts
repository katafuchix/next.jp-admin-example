import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectAppDB } from "@/lib/db";
import { getAppUserModel } from "@/models/AppUser";
import { getLatestWeights, calculateBmi } from "@/lib/customer-metrics";
import { PREFECTURES } from "@/lib/prefectures";

const GENDER_LABEL: Record<string, string> = {
  male: "男性",
  female: "女性",
  other: "その他",
};

const AGE_BANDS: { label: string; min: number; max: number }[] = [
  { label: "〜9歳", min: 0, max: 9 },
  { label: "10代", min: 10, max: 19 },
  { label: "20代", min: 20, max: 29 },
  { label: "30代", min: 30, max: 39 },
  { label: "40代", min: 40, max: 49 },
  { label: "50代", min: 50, max: 59 },
  { label: "60代〜", min: 60, max: Infinity },
];

const BMI_BANDS: { label: string; test: (bmi: number) => boolean }[] = [
  { label: "低体重(-18.5)", test: (bmi) => bmi < 18.5 },
  { label: "標準(18.5-25)", test: (bmi) => bmi >= 18.5 && bmi < 25 },
  { label: "肥満(25-)", test: (bmi) => bmi >= 25 },
];

const HEIGHT_BANDS: { label: string; min: number; max: number }[] = [
  { label: "〜149cm", min: 0, max: 149 },
  { label: "150-159cm", min: 150, max: 159 },
  { label: "160-169cm", min: 160, max: 169 },
  { label: "170-179cm", min: 170, max: 179 },
  { label: "180cm〜", min: 180, max: Infinity },
];

const DEFAULT_INACTIVE_DAYS = 30;
const INACTIVE_USERS_PREVIEW_LIMIT = 10;

function findBandLabel(
  bands: { label: string; min: number; max: number }[],
  value: number,
): string | null {
  const band = bands.find((b) => value >= b.min && value <= b.max);
  return band ? band.label : null;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const gender = searchParams.get("gender") ?? "";
  const plan = searchParams.get("plan") ?? "";
  const ageMin = searchParams.get("ageMin");
  const ageMax = searchParams.get("ageMax");
  const inactiveDaysParam = searchParams.get("inactiveDays");
  const inactiveDays = inactiveDaysParam
    ? parseInt(inactiveDaysParam, 10) || DEFAULT_INACTIVE_DAYS
    : DEFAULT_INACTIVE_DAYS;

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

  const conditions: Record<string, unknown>[] = [];
  if (from) {
    conditions.push({ createdAt: { $gte: new Date(from) } });
  }
  if (to) {
    conditions.push({ createdAt: { $lte: new Date(to) } });
  }
  if (gender) {
    conditions.push({ gender });
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
  const query = conditions.length > 0 ? { $and: conditions } : {};

  const users = await AppUser.find(query)
    .select("_id email displayName gender age prefecture height lastAppOpenAt")
    .lean();

  const totalUsers = users.length;

  // 男女比率
  // 絞り込み結果が単一カテゴリ(100%)のみになると、Rechartsの Pie が
  // 完全な円弧を描画できない既知の制限があるため、0件のカテゴリも
  // 常に含めて複数セクターの状態を維持する。
  const GENDER_KEYS = ["male", "female", "other", "unknown"] as const;
  const genderCounts = new Map<string, number>(
    GENDER_KEYS.map((key) => [key, 0]),
  );
  for (const u of users) {
    const key = u.gender ?? "unknown";
    genderCounts.set(key, (genderCounts.get(key) ?? 0) + 1);
  }
  const genderDistribution = GENDER_KEYS.map((key) => ({
    gender: key,
    label: key === "unknown" ? "未設定" : (GENDER_LABEL[key] ?? key),
    count: genderCounts.get(key) ?? 0,
  }));

  // 年齢層
  const ageCounts = new Map<string, number>(AGE_BANDS.map((b) => [b.label, 0]));
  let ageUnknown = 0;
  for (const u of users) {
    if (u.age == null) {
      ageUnknown++;
      continue;
    }
    const label = findBandLabel(AGE_BANDS, u.age);
    if (label) ageCounts.set(label, (ageCounts.get(label) ?? 0) + 1);
  }
  const ageDistribution = [
    ...AGE_BANDS.map((b) => ({
      band: b.label,
      count: ageCounts.get(b.label) ?? 0,
    })),
    ...(ageUnknown > 0 ? [{ band: "未設定", count: ageUnknown }] : []),
  ];

  // 居住地
  const residenceCounts = new Map<string, number>(
    PREFECTURES.map((pref) => [pref, 0]),
  );
  let residenceUnknown = 0;
  for (const u of users) {
    if (!u.prefecture) {
      residenceUnknown++;
      continue;
    }
    residenceCounts.set(
      u.prefecture,
      (residenceCounts.get(u.prefecture) ?? 0) + 1,
    );
  }
  const residenceDistribution = [
    ...PREFECTURES.map((pref) => ({
      prefecture: pref,
      count: residenceCounts.get(pref) ?? 0,
    })),
    ...(residenceUnknown > 0
      ? [{ prefecture: "未設定", count: residenceUnknown }]
      : []),
  ];

  // 身長・体重（BMI）
  const userIds = users.map((u) => u._id);
  const weightMap = await getLatestWeights(appDB, userIds);
  const bmiCounts = new Map<string, number>(BMI_BANDS.map((b) => [b.label, 0]));
  let bmiUnregistered = 0;
  const heightCounts = new Map<string, number>(
    HEIGHT_BANDS.map((b) => [b.label, 0]),
  );
  let heightUnregistered = 0;
  for (const u of users) {
    if (u.height != null) {
      const heightLabel = findBandLabel(HEIGHT_BANDS, u.height);
      if (heightLabel) {
        heightCounts.set(heightLabel, (heightCounts.get(heightLabel) ?? 0) + 1);
      }
    } else {
      heightUnregistered++;
    }

    const weight = weightMap.get(String(u._id)) ?? null;
    const bmi = calculateBmi(u.height, weight);
    if (bmi == null) {
      bmiUnregistered++;
      continue;
    }
    const bmiBand = BMI_BANDS.find((b) => b.test(bmi));
    if (bmiBand) {
      bmiCounts.set(bmiBand.label, (bmiCounts.get(bmiBand.label) ?? 0) + 1);
    }
  }
  const bmiDistribution = [
    ...BMI_BANDS.map((b) => ({
      band: b.label,
      count: bmiCounts.get(b.label) ?? 0,
    })),
    { band: "体重未登録", count: bmiUnregistered },
  ];
  const heightDistribution = [
    ...HEIGHT_BANDS.map((b) => ({
      band: b.label,
      count: heightCounts.get(b.label) ?? 0,
    })),
    ...(heightUnregistered > 0
      ? [{ band: "未設定", count: heightUnregistered }]
      : []),
  ];

  // N日以上未ログイン
  const inactiveSince = new Date(
    Date.now() - inactiveDays * 24 * 60 * 60 * 1000,
  );
  const inactiveUsersAll = users.filter((u) => {
    const last = u.lastAppOpenAt;
    return !last || new Date(last).getTime() < inactiveSince.getTime();
  });
  const inactiveUsers = {
    days: inactiveDays,
    count: inactiveUsersAll.length,
    users: inactiveUsersAll.slice(0, INACTIVE_USERS_PREVIEW_LIMIT).map((u) => ({
      userId: String(u._id),
      email: u.email,
      name: u.displayName ?? "",
      lastLoginAt: u.lastAppOpenAt
        ? new Date(u.lastAppOpenAt).toISOString()
        : "",
    })),
  };

  return NextResponse.json({
    success: true,
    data: {
      totalUsers,
      genderDistribution,
      ageDistribution,
      residenceDistribution,
      bmiDistribution,
      heightDistribution,
      inactiveUsers,
    },
  });
}
