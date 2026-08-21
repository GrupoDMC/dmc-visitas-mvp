import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";

export default async function Home() {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  redirect(sesion.usuario.rol === "TECNICO" ? "/tecnico" : "/admin");
}
