import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import { Admin } from "@/models/Admin";
import { generateSecret, generateURI, verify } from "otplib";
import { z } from "zod";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "認証が必要です" },
      { status: 401 },
    );
  }

  await connectDB();
  const admin = await Admin.findById(session.user.id);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "ユーザーが見つかりません" },
      { status: 404 },
    );
  }

  const secret = await generateSecret();
  const otpauth = await generateURI({
    strategy: "totp",
    label: admin.email,
    issuer: "管理画面",
    secret,
  });

  return NextResponse.json({ success: true, secret, otpauth });
}

const postSchema = z.object({
  secret: z.string().min(1),
  token: z.string().length(6, "6桁のコードを入力してください"),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "認証が必要です" },
      { status: 401 },
    );
  }

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "入力値が不正です";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }

  const { secret, token } = parsed.data;

  const result = await verify({ strategy: "totp", token, secret });
  if (!result.valid) {
    return NextResponse.json(
      { success: false, error: "コードが正しくありません" },
      { status: 400 },
    );
  }

  await connectDB();
  await Admin.updateOne(
    { _id: session.user.id },
    { twoFactorEnabled: true, twoFactorSecret: secret },
  );

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "認証が必要です" },
      { status: 401 },
    );
  }

  await connectDB();
  await Admin.updateOne(
    { _id: session.user.id },
    { twoFactorEnabled: false, twoFactorSecret: null },
  );

  return NextResponse.json({ success: true });
}
