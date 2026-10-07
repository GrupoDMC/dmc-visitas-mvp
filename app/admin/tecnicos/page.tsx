import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Los técnicos ahora son una pestaña de Usuarios; esta ruta queda para los
// enlaces y marcadores que ya existían.
export default function TecnicosPage() {
  redirect("/admin/usuarios?vista=tecnicos");
}
