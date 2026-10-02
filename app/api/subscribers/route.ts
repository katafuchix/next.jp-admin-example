import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Subscriber from "@/models/Subscriber";
import { requireRole, WRITE_ROLES } from "@/lib/authz";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const isSubscribedParam = searchParams.get("isSubscribed");

  try {
    await connectDB();

    const filter: Record<string, unknown> = {};
    if (isSubscribedParam !== null) {
      filter.isSubscribed = isSubscribedParam === "true";
    }

    const total = await Subscriber.countDocuments(filter);
    const docs = await Subscriber.find(filter)
      .sort({ subscribedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const data = docs.map((s) => ({
      id: s._id.toString(),
      email: s.email,
      name: s.name ?? null,
      isSubscribed: s.isSubscribed,
      tags: s.tags,
      subscribedAt:
        s.subscribedAt instanceof Date
          ? s.subscribedAt.toISOString()
          : String(s.subscribedAt),
      unsubscribedAt: s.unsubscribedAt
        ? s.unsubscribedAt instanceof Date
          ? s.unsubscribedAt.toISOString()
          : String(s.unsubscribedAt)
        : null,
      createdAt:
        s.createdAt instanceof Date
          ? s.createdAt.toISOString()
          : String(s.createdAt),
    }));

    return NextResponse.json({
      success: true,
      data,
      meta: { total, page, limit },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  const forbidden = requireRole(session, WRITE_ROLES);
  if (forbidden) return forbidden;

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json(
      { success: false, error: "email is required" },
      { status: 400 },
    );
  }

  try {
    await connectDB();

    const result = await Subscriber.deleteOne({ email: email.toLowerCase() });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, error: "Subscriber not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
