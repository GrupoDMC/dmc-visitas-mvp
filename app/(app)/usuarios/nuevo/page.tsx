import type { Metadata } from "next";
import { requerirAdmin } from "@/lib/auth";
import { tecnicosActivos } from "@/lib/db/tecnicos";
import { Encabezado } from "@/components/ui/encabezado";
import { FormularioUsuario } from "@/components/usuarios/formulario-usuario";

export const metadata: Metadata = { title: "Nuevo usuario" };

export default async function PaginaNuevoUsuario() {
  await requerirAdmin();

  const tecnicos = await tecnicosActivos();

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo="Nuevo usuario"
        descripcion="Se crea en Supabase Auth y queda habilitado de una, con una contraseña temporal que se dicta por teléfono."
        volverA={{ href: "/usuarios", etiqueta: "Usuarios" }}
      />

      <FormularioUsuario tecnicos={tecnicos} />
    </div>
  );
}
