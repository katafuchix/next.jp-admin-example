"use client";

import { SessionContextProvider } from "./session-context";
import type { Session } from "next-auth";

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  // NextAuth v5 には /api/auth/session エンドポイントが存在しない（v4のもの）。
  // SessionProvider を使うと /api/auth/session をポーリングして UnknownAction エラーが発生する。
  // SessionProvider は使わず、カスタムContextでサーバーのセッションを渡すこと。
  return (
    <SessionContextProvider session={session}>
      {children}
    </SessionContextProvider>
  );
}
