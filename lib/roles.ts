import type { AdminRole } from "@/models/Admin";

/**
 * models/Admin.tsで定義済みだった4種のロールを
 * 「操作の種類（読み取り/書き込み/エクスポート/問い合わせ対応/管理者管理）ごとにどのロールを許可するか」で割り振る。
 * サーバー側（lib/authz.ts）とクライアント側（画面のボタン表示制御）の両方から参照する。
 */

/**
 * 書き込み系操作（作成・更新・削除・送信）を許可するロール。
 * ANALYST（分析閲覧）は名称の通り閲覧専用、SUPPORT（サポート）は
 * 問い合わせ対応のみ書き込みを許可する（別途 INQUIRY_WRITE_ROLES を使用）。
 */
export const WRITE_ROLES: AdminRole[] = ["SUPER_ADMIN", "OPERATOR"];

/** 問い合わせ対応はSUPPORTロールにも書き込みを許可する */
export const INQUIRY_WRITE_ROLES: AdminRole[] = [
  "SUPER_ADMIN",
  "OPERATOR",
  "SUPPORT",
];

/** 顧客データのエクスポートはSUPPORTには許可しない（閲覧のみのANALYSTは可） */
export const EXPORT_ROLES: AdminRole[] = ["SUPER_ADMIN", "OPERATOR", "ANALYST"];

export const SUPER_ADMIN_ONLY: AdminRole[] = ["SUPER_ADMIN"];
