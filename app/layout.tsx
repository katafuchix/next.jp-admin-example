import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "管理画面",
  description: "アプリ運営管理システム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full bg-gray-50 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
