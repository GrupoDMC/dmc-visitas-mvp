import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";

export default async function TecnicoLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  if (sesion.usuario.rol !== "TECNICO") redirect("/admin");
  return <>{children}</>;
}
