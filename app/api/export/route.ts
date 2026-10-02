import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB, connectAppDB } from "@/lib/db";
import { getAppUserModel } from "@/models/AppUser";
import { isUserOnline } from "@/lib/presence";
import { requireRole, EXPORT_ROLES } from "@/lib/authz";
import { fetchSyncStatus, sumMonthlyBySource } from "@/lib/ad-sources/store";
import {
  buildMonthlyRevenue,
  resolveYear,
  type RevenueFigures,
} from "@/lib/revenue-monthly";

function escapeCSV(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCSV(headers: string[], rows: unknown[][]): string {
  const BOM = "﻿";
  const headerLine = headers.map(escapeCSV).join(",");
  const dataLines = rows.map((row) => row.map(escapeCSV).join(","));
  return BOM + [headerLine, ...dataLines].join("\r\n");
}

/** 収支分析の画面と同じ月別集計。取り込めていない欄は空にする（見本の数字では埋めない） */
async function exportRevenue(yearParam: string | null) {
  const resolved = resolveYear(yearParam, new Date());
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error },
      { status: 400 },
    );
  }

  try {
    await connectDB();
    const [monthly, { lastSuccess }] = await Promise.all([
      sumMonthlyBySource(resolved.year),
      fetchSyncStatus(),
    ]);
    const { rows, totals } = buildMonthlyRevenue({
      year: resolved.year,
      monthly,
      lastSuccess,
    });

    // 画面（formatYen）と同じく円単位に丸める。AdMob の収益は円未満の端数つきで入ってくる
    const yen = (v: number | null) => (v === null ? null : Math.round(v));
    const figures = (f: RevenueFigures) => [
      yen(f.chargeRevenue),
      yen(f.adRevenue),
      yen(f.total),
      yen(f.cost),
      yen(f.profit),
    ];
    const headers = [
      "年月",
      "課金の手取り",
      "広告収益",
      "収益合計",
      "広告費",
      "粗利",
    ];
    const csvRows =
      rows.length === 0
        ? []
        : [
            ...rows.map((r) => [r.yearMonth, ...figures(r)]),
            ["合計", ...figures(totals)],
          ];

    return new NextResponse(buildCSV(headers, csvRows), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="revenue-${resolved.year}-${Date.now()}.csv"`,
      },
    });
  } catch (err) {
    console.error("[export] 収益データの取得に失敗しました", {
      year: resolved.year,
      err,
    });
    return NextResponse.json(
      { success: false, error: "収益データの取得に失敗しました" },
      { status: 500 },
    );
  }
}

/** アプリの全ユーザー。取れなければ見本の行で埋めずに 500 を返す */
async function exportCustomers() {
  try {
    const appDb = await connectAppDB();
    if (!appDb) {
      throw new Error("APP_MONGODB_URI が未設定です");
    }
    const AppUser = getAppUserModel(appDb);
    // 全件を読むので、CSV に使う項目だけに絞る
    const users = await AppUser.find(
      {},
      {
        email: 1,
        displayName: 1,
        isOnline: 1,
        lastSocketAt: 1,
        isPaid: 1,
        createdAt: 1,
        lastAppOpenAt: 1,
      },
    )
      .sort({ createdAt: -1 })
      .lean();

    const day = (d?: Date | string | null) =>
      d ? new Date(d).toISOString().slice(0, 10) : "";
    const headers = [
      "ユーザーID",
      "メール",
      "名前",
      "ステータス",
      "プラン",
      "登録日",
      "最終ログイン",
    ];
    const csvRows = users.map((u) => [
      String(u._id),
      u.email,
      u.displayName ?? "",
      isUserOnline(u) ? "online" : "offline",
      u.isPaid ? "プレミアム" : "フリー",
      day(u.createdAt),
      day(u.lastAppOpenAt),
    ]);

    return new NextResponse(buildCSV(headers, csvRows), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="customers-${Date.now()}.csv"`,
      },
    });
  } catch (err) {
    console.error("[export] 顧客データの取得に失敗しました", { err });
    return NextResponse.json(
      { success: false, error: "顧客データの取得に失敗しました" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  const forbidden = requireRole(session, EXPORT_ROLES);
  if (forbidden) return forbidden;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (type === "revenue") {
    return exportRevenue(searchParams.get("year"));
  }

  if (type === "customers") {
    return exportCustomers();
  }

  return NextResponse.json(
    {
      success: false,
      error: "Invalid type. Use ?type=revenue or ?type=customers",
    },
    { status: 400 },
  );
}
