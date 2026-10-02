/**
 * アプリ（care）が buddypointlogs.source に書く値の表示名。
 * 本番の記録（2026-09-25 時点）に出てくる値をすべて載せている。知らない値はそのまま出す。
 */
const SOURCE_LABELS: Record<string, string> = {
  login_bonus: "ログインボーナス",
  health_data: "健康データの記録",
  meal: "食事の記録",
  exercise: "運動の記録",
  achievement: "実績の達成",
  offerwall: "オファーウォール",
  gacha: "ガチャ",
  gift_id_on_demand: "デジタルギフトへの交換",
  gift_id_on_demand_refund: "ギフト交換の払い戻し",
  ai_feature_unlock: "AI機能の解放",
};

export function pointSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
