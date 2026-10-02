"use client";

import { useState } from "react";
import { useAppSession } from "@/app/session-context";
import { Shield, User, CheckCircle, XCircle, X } from "lucide-react";

type AlertType = "success" | "error";

interface Alert {
  type: AlertType;
  message: string;
}

export default function ProfilePage() {
  const session = useAppSession();
  const user = session?.user as
    | {
        id?: string;
        name?: string | null;
        email?: string | null;
        role?: string;
      }
    | undefined;

  // パスワード変更フォーム
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordAlert, setPasswordAlert] = useState<Alert | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // 2FA
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFAAlert, setTwoFAAlert] = useState<Alert | null>(null);
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [otpSecret, setOtpSecret] = useState("");
  const [otpauth, setOtpauth] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [modalAlert, setModalAlert] = useState<Alert | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const roleLabel: Record<string, string> = {
    SUPER_ADMIN: "システム管理者",
    OPERATOR: "運営担当",
    ANALYST: "分析閲覧",
    SUPPORT: "カスタマーサポート",
  };

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordAlert(null);

    if (newPassword !== confirmPassword) {
      setPasswordAlert({
        type: "error",
        message: "新しいパスワードが一致しません",
      });
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await fetch("/admin/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setPasswordAlert({
          type: "success",
          message: "パスワードを変更しました",
        });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPasswordAlert({
          type: "error",
          message: data.error ?? "変更に失敗しました",
        });
      }
    } catch {
      setPasswordAlert({ type: "error", message: "通信エラーが発生しました" });
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleSetup2FA() {
    setTwoFAAlert(null);
    setModalAlert(null);
    setOtpToken("");
    setTwoFALoading(true);
    try {
      const res = await fetch("/admin/api/auth/setup-2fa");
      const data = await res.json();
      if (data.success) {
        setOtpSecret(data.secret);
        setOtpauth(data.otpauth);
        setShowModal(true);
      } else {
        setTwoFAAlert({
          type: "error",
          message: data.error ?? "セットアップの開始に失敗しました",
        });
      }
    } catch {
      setTwoFAAlert({ type: "error", message: "通信エラーが発生しました" });
    } finally {
      setTwoFALoading(false);
    }
  }

  async function handleVerify2FA(e: React.FormEvent) {
    e.preventDefault();
    setModalAlert(null);
    setModalLoading(true);
    try {
      const res = await fetch("/admin/api/auth/setup-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: otpSecret, token: otpToken }),
      });
      const data = await res.json();
      if (data.success) {
        setTwoFAEnabled(true);
        setShowModal(false);
        setTwoFAAlert({
          type: "success",
          message: "2段階認証を有効にしました",
        });
      } else {
        setModalAlert({
          type: "error",
          message: data.error ?? "検証に失敗しました",
        });
      }
    } catch {
      setModalAlert({ type: "error", message: "通信エラーが発生しました" });
    } finally {
      setModalLoading(false);
    }
  }

  async function handleDisable2FA() {
    setTwoFAAlert(null);
    setTwoFALoading(true);
    try {
      const res = await fetch("/admin/api/auth/setup-2fa", {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setTwoFAEnabled(false);
        setTwoFAAlert({
          type: "success",
          message: "2段階認証を無効にしました",
        });
      } else {
        setTwoFAAlert({
          type: "error",
          message: data.error ?? "無効化に失敗しました",
        });
      }
    } catch {
      setTwoFAAlert({ type: "error", message: "通信エラーが発生しました" });
    } finally {
      setTwoFALoading(false);
    }
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-12 sm:pt-8 md:pt-12">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 mb-6 sm:mb-10">
          プロフィール / セキュリティ
        </h1>

        {/* セクション1: プロフィール情報 */}
        <section className="mb-8">
          <h2 className="text-base font-semibold text-slate-700 mb-3">
            プロフィール情報
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4 mb-6">
              <div
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0"
                role="img"
                aria-label={user?.name ?? "ユーザー"}
              >
                <span className="text-primary-500 text-xl font-medium">
                  {(user?.name ?? "A").charAt(0)}
                </span>
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  {user?.name ?? "—"}
                </p>
                <p className="text-sm text-slate-500">{user?.email ?? "—"}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                  ロール
                </p>
                <p className="text-sm text-slate-900">
                  {roleLabel[user?.role ?? ""] ?? user?.role ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                  2FA ステータス
                </p>
                <div className="flex items-center gap-1.5">
                  {twoFAEnabled ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm text-emerald-700">有効</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-slate-500" />
                      <span className="text-sm text-slate-500">無効</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* セクション2: パスワード変更 */}
        <section className="mb-8">
          <h2 className="text-base font-semibold text-slate-700 mb-3">
            パスワード変更
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
            {passwordAlert && (
              <div
                className={`flex items-start gap-3 p-4 rounded-lg mb-5 border ${
                  passwordAlert.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-red-50 border-red-200 text-red-800"
                }`}
              >
                {passwordAlert.type === "success" ? (
                  <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                )}
                <p className="text-sm">{passwordAlert.message}</p>
              </div>
            )}
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="leading-normal">
                <label
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                  htmlFor="current-password"
                >
                  現在のパスワード
                </label>
                <input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg outline-none caret-primary-500 bg-white text-slate-900 hover:border-black"
                  placeholder="現在のパスワード"
                />
              </div>
              <div className="leading-normal">
                <label
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                  htmlFor="new-password"
                >
                  新しいパスワード
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg outline-none caret-primary-500 bg-white text-slate-900 hover:border-black"
                  placeholder="8文字以上・英数字混在"
                />
              </div>
              <div className="leading-normal">
                <label
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                  htmlFor="confirm-password"
                >
                  確認用パスワード
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg outline-none caret-primary-500 bg-white text-slate-900 hover:border-black"
                  placeholder="新しいパスワードを再入力"
                />
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer disabled:bg-slate-300 disabled:text-slate-50 disabled:no-underline disabled:cursor-not-allowed transition-colors w-full sm:w-auto"
                >
                  {passwordLoading ? "変更中..." : "変更する"}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* セクション3: 2段階認証 */}
        <section>
          <h2 className="text-base font-semibold text-slate-700 mb-3">
            2段階認証（2FA）
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
            {twoFAAlert && (
              <div
                className={`flex items-start gap-3 p-4 rounded-lg mb-5 border ${
                  twoFAAlert.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-red-50 border-red-200 text-red-800"
                }`}
              >
                {twoFAAlert.type === "success" ? (
                  <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                )}
                <p className="text-sm">{twoFAAlert.message}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-900 mb-1">
                  現在のステータス
                </p>
                <div className="flex items-center gap-2">
                  {twoFAEnabled ? (
                    <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-medium">
                      <CheckCircle className="w-3.5 h-3.5" />
                      有効
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-medium">
                      <XCircle className="w-3.5 h-3.5" />
                      無効
                    </span>
                  )}
                </div>
              </div>
              <div className="sm:flex-shrink-0">
                {twoFAEnabled ? (
                  <button
                    onClick={handleDisable2FA}
                    disabled={twoFALoading}
                    className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-white text-primary-500 border border-current rounded-lg hover:bg-primary-200 hover:text-primary-700 hover:underline underline-offset-[3px] active:bg-primary-300 cursor-pointer disabled:bg-white disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed transition-colors w-full sm:w-auto"
                  >
                    {twoFALoading ? "処理中..." : "2FA を無効にする"}
                  </button>
                ) : (
                  <button
                    onClick={handleSetup2FA}
                    disabled={twoFALoading}
                    className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer disabled:bg-slate-300 disabled:text-slate-50 disabled:no-underline disabled:cursor-not-allowed transition-colors w-full sm:w-auto"
                  >
                    <Shield className="w-4 h-4" />
                    {twoFALoading ? "準備中..." : "2FA を設定する"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* 2FAセットアップモーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowModal(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-slate-900">
                2段階認証のセットアップ
              </h3>
              <button
                onClick={() => setShowModal(false)}
                aria-label="閉じる"
                className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 text-slate-500 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalAlert && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg mb-5">
                <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">{modalAlert.message}</p>
              </div>
            )}

            <ol className="space-y-5">
              <li>
                <p className="text-sm font-medium text-slate-700 mb-3">
                  1. 認証アプリ（Google Authenticator
                  など）でQRコードをスキャンしてください
                </p>
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`}
                    alt="2FA QRコード"
                    width={200}
                    height={200}
                    className="rounded-lg border border-slate-200"
                  />
                </div>
              </li>
              <li>
                <form onSubmit={handleVerify2FA}>
                  <p className="text-sm font-medium text-slate-700 mb-2">
                    2. 認証アプリに表示された6桁のコードを入力してください
                  </p>
                  <div className="leading-normal mb-4">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={otpToken}
                      onChange={(e) =>
                        setOtpToken(e.target.value.replace(/\D/g, ""))
                      }
                      required
                      placeholder="123456"
                      className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg outline-none caret-primary-500 bg-white text-slate-900 tracking-widest text-center text-lg hover:border-black"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={modalLoading || otpToken.length !== 6}
                    className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer disabled:bg-slate-300 disabled:text-slate-50 disabled:no-underline disabled:cursor-not-allowed transition-colors"
                  >
                    {modalLoading ? "検証中..." : "有効化する"}
                  </button>
                </form>
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
