"use server";
import { signIn, signOut } from "@/auth";
import { AuthError } from "next-auth";

export async function logout() {
  await signOut({ redirectTo: "/login" });
}

export async function authenticate(_: unknown, formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: process.env.AUTH_URL || "/admin",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return "メールアドレスまたはパスワードが正しくありません";
    }
    throw error;
  }
}
