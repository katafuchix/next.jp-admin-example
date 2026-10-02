/*
 * グラフの色（DADS のカラーパレットから）。recharts は CSS 変数を読まないので、ここに値で置く。
 * 系列の色は白地で 3:1 以上、軸の文字は 4.5:1 以上。
 */
export const CHART = {
  /** 主系列（Blue 800） */
  blue: "#0031d8",
  /** 2つ目の系列（Green 600） */
  green: "#259d63",
  /** 3つ目の系列（Purple 600） */
  purple: "#8843e1",
  /** その他（Solid Gray 536） */
  gray: "#666666",
  /** 不明・未入力（Solid Gray 200） */
  lightGray: "#cccccc",
  /** 目盛り線 */
  grid: "#e6e6e6",
  /** 軸の文字 */
  axis: "#666666",
  /** ツールチップの枠 */
  tooltipBorder: "#cccccc",
} as const;

/** ツールチップの見た目（全グラフ共通） */
export const CHART_TOOLTIP_STYLE = {
  borderRadius: "8px",
  border: `1px solid ${CHART.tooltipBorder}`,
  fontSize: "12px",
};
