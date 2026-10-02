import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { Admin } from "@/models/Admin";
import { z } from "zod";

process.env.AUTH_TRUST_HOST = "true";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        await connectDB();
        const admin = await Admin.findOne({
          email: parsed.data.email,
          isActive: true,
        });
        if (!admin) return null;

        // ロックアウトチェック
        if (admin.lockedUntil && admin.lockedUntil > new Date()) return null;

        const valid = await bcrypt.compare(
          parsed.data.password,
          admin.passwordHash,
        );
        if (!valid) {
          const failCount = admin.loginFailCount + 1;
          const update: Record<string, unknown> = { loginFailCount: failCount };
          if (failCount >= 5) {
            update.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30分ロック
          }
          await Admin.updateOne({ _id: admin._id }, update);
          return null;
        }

        await Admin.updateOne(
          { _id: admin._id },
          { loginFailCount: 0, lockedUntil: null, lastLoginAt: new Date() },
        );

        return {
          id: admin._id.toString(),
          email: admin.email,
          name: admin.name,
          role: admin.role,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      (session.user as { role?: string }).role = token.role as string;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
