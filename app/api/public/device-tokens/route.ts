import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import DeviceToken from "@/models/DeviceToken";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, token, platform, segment } = body;

    if (!userId || !token || !platform) {
      return NextResponse.json(
        { success: false, error: "userId, token, platform are required" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    if (!["ios", "android", "web"].includes(platform)) {
      return NextResponse.json(
        { success: false, error: "platform must be ios, android, or web" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    await connectDB();

    await DeviceToken.updateOne(
      { token },
      {
        $set: {
          userId,
          platform,
          segment: segment ?? "all",
          isActive: true,
          lastSeenAt: new Date(),
        },
      },
      { upsert: true },
    );

    return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
