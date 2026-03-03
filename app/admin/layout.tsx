import type { Metadata } from "next";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";

export const metadata: Metadata = {
  title: "Admin - MeowSMS",
  description: "Admin panel for MeowSMS virtual number service",
};

// Check if user is admin on server side
async function isAdmin(): Promise<boolean> {
  try {
    const session = await authClient.getSession();
    return (session?.data?.user as { isAdmin?: boolean } | undefined)?.isAdmin ?? false;
  } catch {
    return false;
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await isAdmin();

  // If not admin, could redirect. For now, we'll let the client-side check handle it
  // Add a redirect logic if needed

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full">
        <AdminSidebar />
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <h1 className="text-lg font-semibold">Admin Panel</h1>
          </header>
          <main className="flex flex-1 flex-col gap-4 p-4 pt-6">
            {!admin && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-4 text-sm">
                Access denied. You need admin privileges to view this page.
              </div>
            )}
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
