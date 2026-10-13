import { redirect } from "next/navigation";
import { getSesion, rutaSinSesion } from "@/lib/auth";

export default async function Home() {
  const sesion = await getSesion();
  if (!sesion) redirect(await rutaSinSesion());
  redirect(sesion.usuario.rol === "TECNICO" ? "/tecnico" : "/admin");
}
