import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Providers } from "@/app/providers";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const user = (session?.user ?? {}) as { name?: string | null; role?: string };

  return (
    <Providers session={session}>
      <div className="flex h-[100dvh] overflow-hidden">
        <Sidebar
          userName={user.name ?? "管理者"}
          userRole={user.role ?? "OPERATOR"}
        />
        <main className="flex-1 min-w-0 overflow-y-auto pt-14 lg:pt-0 pb-8">
          {children}
        </main>
      </div>
    </Providers>
  );
}
