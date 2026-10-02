import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireRole, WRITE_ROLES } from "@/lib/authz";
import { connectDB } from "@/lib/db";
import { importAdRows } from "@/lib/ad-sync";
import { AD_SOURCES } from "@/lib/ad-sources/registry";
import { createMongoAdSyncStore } from "@/lib/ad-sources/store";
import { AdSourceError, type AdDailyRow } from "@/lib/ad-sources/types";

/** 媒体の日別レポートは1年分でも数十KB。nginx の本文上限（1MB）より十分小さく抑える */
const MAX_CSV_BYTES = 512 * 1024;

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * 媒体の管理画面の CSV を画面から取り込む。
 * 本文は multipart/form-data: source（媒体ID）と file（CSV）。
 * CSV に含まれる期間の行を丸ごと置き換える（同じ CSV を何度取り込んでも結果は同じ）。
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return fail(401, "Unauthorized");
  const forbidden = requireRole(session, WRITE_ROLES);
  if (forbidden) return forbidden;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "CSV ファイルを選んでください");
  }

  const source = AD_SOURCES.find(
    (s) => s.id === form.get("source") && s.parseCsv,
  );
  if (!source?.parseCsv) return fail(400, "CSV を取り込めない媒体です");

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail(400, "CSV ファイルを選んでください");
  }
  if (file.size > MAX_CSV_BYTES) {
    return fail(400, "CSV は 512KB 以下にしてください");
  }

  let rows: AdDailyRow[];
  try {
    rows = source.parseCsv(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof AdSourceError) return fail(400, err.message);
    console.error("[ads/import] CSV を読み取れませんでした", {
      source: source.id,
      fileName: file.name,
      err,
    });
    return fail(400, "CSV を読み取れませんでした");
  }

  try {
    await connectDB();
    const result = await importAdRows({
      source,
      rows,
      store: createMongoAdSyncStore(),
    });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof AdSourceError) return fail(400, err.message);
    console.error("[ads/import] 取り込みに失敗しました", {
      source: source.id,
      err,
    });
    return fail(500, "CSV の取り込みに失敗しました");
  }
}
