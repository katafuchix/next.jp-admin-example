import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import { Admin } from "@/models/Admin";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { NextResponse } from "next/server";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "8文字以上で入力してください")
    .regex(/^(?=.*[a-zA-Z])(?=.*[0-9])/, "英数字を混在させてください"),
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "入力値が不正です";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  await connectDB();
  const admin = await Admin.findById(session.user.id).select("+passwordHash");
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "ユーザーが見つかりません" },
      { status: 404 },
    );
  }

  const isValid = await bcrypt.compare(currentPassword, admin.passwordHash);
  if (!isValid) {
    return NextResponse.json(
      { success: false, error: "現在のパスワードが正しくありません" },
      { status: 400 },
    );
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await Admin.updateOne({ _id: admin._id }, { passwordHash: newHash });

  return NextResponse.json({ success: true });
}
