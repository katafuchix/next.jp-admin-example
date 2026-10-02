import { NextResponse } from "next/server";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  return NextResponse.json({
    ADMIN_MONGODB_URI: process.env.ADMIN_MONGODB_URI
      ? `set (starts with: ${process.env.ADMIN_MONGODB_URI.slice(0, 15)}...)`
      : "NOT SET",
    AUTH_SECRET: process.env.AUTH_SECRET ? "set" : "NOT SET",
    NODE_ENV: process.env.NODE_ENV,
  });
}
