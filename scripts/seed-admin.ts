/**
 * 初期管理者アカウント作成スクリプト
 * 使い方: pnpm tsx scripts/seed-admin.ts
 *
 * 実行前に ADMIN_MONGODB_URI を環境変数に設定してください:
 *   export ADMIN_MONGODB_URI="mongodb+srv://..."
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const ADMIN_MONGODB_URI = process.env.ADMIN_MONGODB_URI;
if (!ADMIN_MONGODB_URI) {
  console.error("ADMIN_MONGODB_URI が設定されていません");
  process.exit(1);
}

const AdminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, required: true },
  twoFactorEnabled: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  loginFailCount: { type: Number, default: 0 },
}, { timestamps: true });

const Admin = mongoose.model("Admin", AdminSchema);

async function main() {
  await mongoose.connect(ADMIN_MONGODB_URI!);

  const email = "admin@example.com";
  const password = "ChangeMe123!";
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await Admin.findOne({ email });
  if (existing) {
    console.log("✓ 管理者アカウントは既に存在します:", email);
    await mongoose.disconnect();
    return;
  }

  await Admin.create({
    email,
    passwordHash,
    name: "システム管理者",
    role: "SUPER_ADMIN",
  });

  console.log("✓ 初期管理者アカウントを作成しました");
  console.log("  メール:", email);
  console.log("  パスワード:", password);
  console.log("  ※ ログイン後、必ずパスワードを変更してください");

  await mongoose.disconnect();
}

main().catch(console.error);
