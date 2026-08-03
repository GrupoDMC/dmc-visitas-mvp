import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { Toast } from "@/components/ui/toast";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";

export default async function LayoutApp({ children }: { children: React.ReactNode; }) {
  const sesion = await getSesion();
  if (!sesion) redirect("/salir?motivo=deshabilitada");
  const sidebarStyle = { "--sidebar-width": "calc(var(--spacing) * 55)", "--header-height": "calc(var(--spacing) * 12)", }
  return (
  <SidebarProvider style= { sidebarStyle as React.CSSProperties }>
    <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="p-4">
          {children}
        </div>
      </SidebarInset>
    <Suspense fallback={null}>
      <Toast />
    </Suspense>
  </SidebarProvider>
  );
}
