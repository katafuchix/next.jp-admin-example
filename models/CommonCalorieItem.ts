import { Schema, type Connection, type Model } from "mongoose";

/**
 * アプリ側 `commoncalorieitems` コレクション（care/server 側の食事データ）。
 * AppUser/HealthLog と異なり、このコレクションは管理画面から作成・更新・削除も行う
 * （運用上、食事データの精査・修正を管理画面側で行うため）。
 */
export interface INutrition {
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fiber?: number | null;
  sugar?: number | null;
}

export interface ICommonCalorieItem {
  _id: string;
  name: string;
  calories: number;
  nutrition?: INutrition;
  source?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const NutritionSchema = new Schema<INutrition>(
  {
    protein: { type: Number, default: null },
    carbs: { type: Number, default: null },
    fat: { type: Number, default: null },
    fiber: { type: Number, default: null },
    sugar: { type: Number, default: null },
  },
  { _id: true },
);

const CommonCalorieItemSchema = new Schema<ICommonCalorieItem>(
  {
    name: { type: String, required: true },
    calories: { type: Number, required: true },
    nutrition: { type: NutritionSchema },
    source: { type: String, default: "manual" },
  },
  { timestamps: true, collection: "commoncalorieitems" },
);

export function getCommonCalorieItemModel(
  conn: Connection,
): Model<ICommonCalorieItem> {
  return (
    (conn.models.CommonCalorieItem as Model<ICommonCalorieItem> | undefined) ??
    conn.model<ICommonCalorieItem>(
      "CommonCalorieItem",
      CommonCalorieItemSchema,
    )
  );
}
