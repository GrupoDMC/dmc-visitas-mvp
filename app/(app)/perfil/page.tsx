import type { Metadata } from "next";
import { nombreRol, requerirSesion } from "@/lib/auth";
import { obtenerTecnico, nombreTecnico } from "@/lib/db/tecnicos";
import { Encabezado } from "@/components/ui/encabezado";
import { SinDato } from "@/components/ui/tabla";

export const metadata: Metadata = { title: "Mi perfil" };

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-sm text-suave">{etiqueta}</dt>
      <dd className="min-w-0 text-right text-sm text-texto">{children}</dd>
    </div>
  );
}

export default async function PaginaPerfil() {
  const sesion = await requerirSesion();
  const tecnico = sesion.tecnicoId ? await obtenerTecnico(sesion.tecnicoId) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <Encabezado titulo="Mi perfil" descripcion="Datos de tu cuenta." />

      <div className="rounded-card border border-borde bg-superficie shadow-tarjeta">
        <dl className="divide-y divide-borde">
          <Dato etiqueta="Nombre">{sesion.nombre}</Dato>
          <Dato etiqueta="Correo">{sesion.email}</Dato>
          <Dato etiqueta="Rol">{nombreRol(sesion.rol)}</Dato>
          {sesion.rol === "TECNICO" ? (
            <Dato etiqueta="Técnico vinculado">
              {tecnico ? nombreTecnico(tecnico) : <SinDato />}
            </Dato>
          ) : null}
        </dl>
      </div>
    </div>
  );
}
