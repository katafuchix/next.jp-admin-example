import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Subscriber from "@/models/Subscriber";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name, tags } = body as {
      email?: string;
      name?: string;
      tags?: string[];
    };

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { success: false, error: "メールアドレスは必須です" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "メールアドレスの形式が正しくありません" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    await connectDB();

    const unsubscribeToken = crypto.randomUUID();

    const existing = await Subscriber.findOne({ email: email.toLowerCase() });

    if (existing) {
      await Subscriber.findOneAndUpdate(
        { email: email.toLowerCase() },
        {
          $set: {
            ...(name !== undefined && { name }),
            isSubscribed: true,
            subscribedAt: new Date(),
            ...(tags !== undefined && { tags }),
          },
        },
        { new: true },
      );
    } else {
      await Subscriber.findOneAndUpdate(
        { email: email.toLowerCase() },
        {
          $set: {
            ...(name !== undefined && { name }),
            isSubscribed: true,
            subscribedAt: new Date(),
            ...(tags !== undefined && { tags }),
            unsubscribeToken,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }

    return NextResponse.json(
      { success: true, message: "購読登録しました" },
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (error) {
    console.error("[subscribe] error:", error);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
