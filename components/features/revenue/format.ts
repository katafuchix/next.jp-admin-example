import type { RevenueFigures } from "@/lib/revenue-monthly";
import { formatCurrency } from "@/lib/utils";

/** 値なし（その種類の媒体がまだつながっていない）は「—」 */
export function formatYen(value: number | null): string {
  return value === null ? "—" : formatCurrency(value);
}

/** 粗利率。粗利が出せないか、収益が0なら「—」 */
export function formatMargin({ profit, total }: RevenueFigures): string {
  if (profit === null || total === null || total <= 0) return "—";
  return `${((profit / total) * 100).toFixed(1)}%`;
}

/** "2026-09" → "9月" */
export function monthLabel(yearMonth: string): string {
  return `${Number(yearMonth.slice(5, 7))}月`;
}
