"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  TrendingUp,
  Megaphone,
  Coins,
  Bell,
  Users,
  BarChart3,
  Globe,
  MessageSquare,
  Mail,
  Settings,
  LogOut,
  ChevronRight,
  UserCog,
  Shield,
  Menu,
  X,
  Apple,
  Sparkles,
} from "lucide-react";

const navItems = [
  {
    href: "/",
    label: "ダッシュボード",
    icon: LayoutDashboard,
    roles: ["SUPER_ADMIN", "OPERATOR", "ANALYST", "SUPPORT"],
  },
  {
    href: "/revenue",
    label: "収支分析",
    icon: TrendingUp,
    roles: ["SUPER_ADMIN", "OPERATOR", "ANALYST"],
  },
  {
    href: "/ads",
    label: "広告データ",
    icon: Megaphone,
    roles: ["SUPER_ADMIN", "OPERATOR", "ANALYST"],
  },
  {
    href: "/points",
    label: "ポイント管理",
    icon: Coins,
    roles: ["SUPER_ADMIN", "OPERATOR"],
  },
  {
    href: "/notifications",
    label: "通知管理",
    icon: Bell,
    roles: ["SUPER_ADMIN", "OPERATOR"],
  },
  {
    href: "/customers",
    label: "顧客管理",
    icon: Users,
    roles: ["SUPER_ADMIN", "OPERATOR", "SUPPORT"],
  },
  {
    href: "/analytics",
    label: "顧客分析",
    icon: BarChart3,
    roles: ["SUPER_ADMIN", "OPERATOR", "ANALYST"],
  },
  {
    href: "/common-calorie-items",
    label: "食事データ",
    icon: Apple,
    roles: ["SUPER_ADMIN", "OPERATOR"],
  },
  {
    href: "/campaigns",
    label: "キャンペーン管理",
    icon: Sparkles,
    roles: ["SUPER_ADMIN", "OPERATOR"],
  },
  {
    href: "/lp",
    label: "LP効果分析",
    icon: Globe,
    roles: ["SUPER_ADMIN", "OPERATOR", "ANALYST"],
  },
  {
    href: "/inquiries",
    label: "問い合わせ",
    icon: MessageSquare,
    roles: ["SUPER_ADMIN", "OPERATOR", "SUPPORT"],
  },
  {
    href: "/newsletter",
    label: "メルマガ",
    icon: Mail,
    roles: ["SUPER_ADMIN", "OPERATOR"],
  },
];

interface SidebarProps {
  userName: string;
  userRole: string;
}

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: "システム管理者",
  OPERATOR: "運営担当",
  ANALYST: "分析閲覧",
  SUPPORT: "カスタマーサポート",
};

export function Sidebar({ userName, userRole }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const visibleItems = navItems.filter((item) => item.roles.includes(userRole));
  const close = () => setMobileOpen(false);

  return (
    <>
      {/* モバイル用トップバー（常時表示） */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3">
        <button
          className="w-10 h-10 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer"
          onClick={() => setMobileOpen(true)}
          aria-label="メニューを開く"
        >
          <Menu className="w-5 h-5 text-slate-600" />
        </button>
        <span className="text-base font-bold text-slate-900">管理画面</span>
      </div>

      {/* モバイル オーバーレイ */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-30"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* サイドバー本体 */}
      <aside
        className={cn(
          "w-64 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col h-screen",
          // モバイル: fixed + スライドイン、デスクトップ: sticky
          "fixed lg:sticky top-0 z-50 transition-transform duration-200 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* モバイル 閉じるボタン */}
        <button
          className="lg:hidden absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer"
          onClick={close}
          aria-label="メニューを閉じる"
        >
          <X className="w-4 h-4 text-slate-600" />
        </button>

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200">
          <p className="text-base font-bold text-slate-900 truncate">
            管理画面
          </p>
          <p className="text-xs text-slate-500">アプリ運営管理システム</p>
        </div>

        {/* Nav */}
        <nav
          aria-label="メインナビゲーション"
          className="flex-1 px-3 py-4 overflow-y-auto"
        >
          <ul className="space-y-0.5">
            {visibleItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={close}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm underline-offset-[3px] transition-colors",
                      isActive
                        ? "bg-primary-50 text-primary-500 font-bold"
                        : "text-body hover:bg-slate-50 hover:underline active:bg-slate-100",
                    )}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {isActive && (
                      <ChevronRight className="w-3 h-3 ml-auto" aria-hidden="true" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          {(userRole === "SUPER_ADMIN" || userRole === "OPERATOR") && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <p className="px-4 mb-1 text-xs font-bold text-slate-600">
                設定
              </p>
              {userRole === "SUPER_ADMIN" && (
                <Link
                  href="/settings"
                  onClick={close}
                  aria-current={pathname === "/settings" ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm underline-offset-[3px] transition-colors",
                    pathname === "/settings"
                      ? "bg-primary-50 text-primary-500 font-bold"
                      : "text-body hover:bg-slate-50 hover:underline active:bg-slate-100",
                  )}
                >
                  <Settings className="w-4 h-4 flex-shrink-0" />
                  <span>管理者設定</span>
                </Link>
              )}
              <Link
                href="/audit-logs"
                onClick={close}
                aria-current={pathname === "/audit-logs" ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm underline-offset-[3px] transition-colors",
                  pathname === "/audit-logs"
                    ? "bg-primary-50 text-primary-500 font-bold"
                    : "text-body hover:bg-slate-50 hover:underline active:bg-slate-100",
                )}
              >
                <Shield className="w-4 h-4 flex-shrink-0" />
                <span>監査ログ</span>
              </Link>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-slate-200 mt-auto">
          <div className="flex items-center gap-3 px-4 py-2 mb-1">
            <div
              className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0"
              role="img"
              aria-label={userName}
            >
              <span className="text-primary-500 text-sm font-bold">
                {userName.charAt(0)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">
                {userName}
              </p>
              <p className="text-xs text-slate-500">
                {roleLabel[userRole] ?? userRole}
              </p>
            </div>
          </div>
          <Link
            href="/profile"
            onClick={close}
            aria-current={pathname === "/profile" ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm underline-offset-[3px] transition-colors",
              pathname === "/profile"
                ? "bg-primary-50 text-primary-500 font-bold"
                : "text-body hover:bg-slate-50 hover:underline active:bg-slate-100",
            )}
          >
            <UserCog className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">プロフィール / セキュリティ</span>
          </Link>
          <button
            onClick={() => logout()}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm text-body underline-offset-[3px] hover:bg-slate-50 hover:underline active:bg-slate-100 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span>ログアウト</span>
          </button>
        </div>
      </aside>
    </>
  );
}
