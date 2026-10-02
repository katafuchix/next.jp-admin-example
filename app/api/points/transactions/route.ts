import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import PointTransaction from "@/models/PointTransaction";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") ?? undefined;
    const type = searchParams.get("type") ?? undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10));

    const filter: Record<string, unknown> = {};
    if (userId) filter.userId = userId;
    if (type) filter.type = type;

    const skip = (page - 1) * limit;

    const [total, docs] = await Promise.all([
      PointTransaction.countDocuments(filter),
      PointTransaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const data = docs.map((d) => ({
      id: (d._id as { toString(): string }).toString(),
      userId: d.userId,
      type: d.type,
      amount: d.amount,
      reason: d.reason,
      adminId: d.adminId?.toString() ?? null,
      relatedRuleId: d.relatedRuleId?.toString() ?? null,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
      updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : String(d.updatedAt),
    }));

    return NextResponse.json({
      success: true,
      data,
      meta: { total, page, limit },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
