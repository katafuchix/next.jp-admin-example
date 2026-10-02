import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { connectAppDB, connectDB } from "@/lib/db"
import { getAppUserModel } from "@/models/AppUser"
import { getBuddyPointLogModel } from "@/models/BuddyPointLog"
import { getIapPurchaseBindingModel } from "@/models/IapPurchaseBinding"
import PointTransaction from "@/models/PointTransaction"

interface ActivityItem {
  id: string
  type: "register" | "login" | "point_add" | "point_use" | "purchase"
  description: string
  createdAt: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1)
  const limit = Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20)

  const appDB = await connectAppDB()
  if (!appDB) {
    return NextResponse.json(
      { success: false, error: "APP_MONGODB_URI が未設定のため取得できません" },
      { status: 503 }
    )
  }

  const AppUser = getAppUserModel(appDB)
  const user = await AppUser.findById(id)
    .select("createdAt lastAppOpenAt")
    .lean()
    .catch(() => null)
  if (!user) {
    return NextResponse.json({ success: false, error: "顧客が見つかりません" }, { status: 404 })
  }

  const activities: ActivityItem[] = []

  if (user.createdAt) {
    activities.push({
      id: "register",
      type: "register",
      description: "アカウント登録",
      createdAt: new Date(user.createdAt).toISOString(),
    })
  }

  if (user.lastAppOpenAt) {
    activities.push({
      id: "last-login",
      type: "login",
      description: "最終ログイン",
      createdAt: new Date(user.lastAppOpenAt).toISOString(),
    })
  }

  // care側の実ログ（健康記録・連続記録・実績・ガチャ・課金等）
  try {
    const BuddyPointLog = getBuddyPointLogModel(appDB)
    const pointLogs = await BuddyPointLog.find({ userId: id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
    for (const p of pointLogs) {
      const label = p.type === "earn" ? "ポイント獲得" : "ポイント消費"
      const detail = p.description ? `：${p.description}` : `（${p.source}）`
      activities.push({
        id: (p._id as { toString(): string }).toString(),
        type: p.type === "earn" ? "point_add" : "point_use",
        description: `${label} ${p.amount >= 0 ? "+" : ""}${p.amount}pt${detail}`,
        createdAt:
          p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
      })
    }
  } catch {
    // 取得できなくても他のアクティビティは返す
  }

  try {
    const IapPurchaseBinding = getIapPurchaseBindingModel(appDB)
    const purchases = await IapPurchaseBinding.find({ ownerUserId: id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
    for (const pu of purchases) {
      activities.push({
        id: (pu._id as { toString(): string }).toString(),
        type: "purchase",
        description: `課金（${pu.platform}${pu.productId ? `：${pu.productId}` : ""}）`,
        createdAt:
          pu.createdAt instanceof Date ? pu.createdAt.toISOString() : String(pu.createdAt),
      })
    }
  } catch {
    // 取得できなくても他のアクティビティは返す
  }

  // 管理者によるポイント手動調整（このダッシュボード上の操作履歴）
  try {
    await connectDB()
    const transactions = await PointTransaction.find({ userId: id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
    for (const t of transactions) {
      activities.push({
        id: (t._id as { toString(): string }).toString(),
        type: t.amount >= 0 ? "point_add" : "point_use",
        description: `[管理者操作] ポイント${t.amount >= 0 ? "加算" : "使用"} ${t.amount >= 0 ? "+" : ""}${t.amount}pt（${t.reason}）`,
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      })
    }
  } catch {
    // ポイント履歴が取得できなくても他のアクティビティは返す
  }

  activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const total = activities.length
  const paged = activities.slice((page - 1) * limit, page * limit)

  return NextResponse.json({
    success: true,
    data: paged,
    meta: { total, page, limit },
  })
}
