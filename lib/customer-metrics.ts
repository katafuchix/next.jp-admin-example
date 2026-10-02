import mongoose, { type Connection, type Types } from "mongoose";
import { getHealthLogModel } from "@/models/HealthLog";

/**
 * 対象ユーザーの最新体重（kg）を HealthLog（type: 'weight'）から集計する。
 * 体重ログが無いユーザーは戻り値の Map に含まれない。
 */
export async function getLatestWeights(
  conn: Connection,
  userIds: (Types.ObjectId | string)[],
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();

  const objectIds = userIds.map((id) =>
    typeof id === "string" ? new mongoose.Types.ObjectId(id) : id,
  );

  const HealthLog = getHealthLogModel(conn);
  const rows = await HealthLog.aggregate<{
    _id: Types.ObjectId;
    weight: number;
  }>([
    { $match: { type: "weight", userId: { $in: objectIds } } },
    { $sort: { date: -1 } },
    { $group: { _id: "$userId", weight: { $first: "$data.weight" } } },
  ]);

  return new Map(rows.map((row) => [row._id.toString(), row.weight]));
}

/**
 * BMI = 体重(kg) / 身長(m)^2
 */
export function calculateBmi(
  heightCm: number | null | undefined,
  weightKg: number | null | undefined,
): number | null {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}
