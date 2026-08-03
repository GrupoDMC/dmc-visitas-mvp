import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { nombreRol, requerirAdmin } from "@/lib/auth";
import { cambiarActivoUsuarioAccion } from "@/lib/acciones/usuarios";
import { obtenerUsuario } from "@/lib/db/usuarios";
import {
  BotonReactivar,
  DialogoDesactivar,
} from "@/components/ui/dialogo-desactivar";
import { Encabezado } from "@/components/ui/encabezado";
import { SinDato } from "@/components/ui/tabla";
import { DialogoRestablecerClave } from "@/components/usuarios/dialogo-restablecer-clave";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const usuario = await obtenerUsuario(id);
  return { title: usuario ? usuario.nombre : "Usuario" };
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-sm text-suave">{etiqueta}</dt>
      <dd className="min-w-0 text-right text-sm text-texto">{children}</dd>
    </div>
  );
}

export default async function PaginaUsuario({ params }: Props) {
  const sesion = await requerirAdmin();

  const { id } = await params;
  const usuario = await obtenerUsuario(id);
  if (!usuario) notFound();

  const esUnoMismo = usuario.id === sesion.userId;

  return (
    <div className="mx-auto max-w-2xl">
      <Encabezado
        titulo={usuario.nombre}
        descripcion={esUnoMismo ? "Esta es tu cuenta." : undefined}
        volverA={{ href: "/usuarios", etiqueta: "Usuarios" }}
        acciones={
          <>
            <DialogoRestablecerClave id={usuario.id} nombre={usuario.nombre} />
            {esUnoMismo ? null : usuario.activo ? (
              <DialogoDesactivar
                accion={cambiarActivoUsuarioAccion}
                id={usuario.id}
                titulo={`¿Desactivar a ${usuario.nombre}?`}
                nombre={usuario.nombre}
                visitasAbiertas={0}
                descripcion={`${usuario.nombre} deja de poder ingresar a la app. No se borra la cuenta de Supabase Auth: se puede reactivar cuando haga falta.`}
              />
            ) : (
              <BotonReactivar accion={cambiarActivoUsuarioAccion} id={usuario.id} />
            )}
          </>
        }
      />

      <div className="rounded-card border border-borde bg-superficie shadow-tarjeta">
        <dl className="divide-y divide-borde">
          <Dato etiqueta="Correo">{usuario.correo}</Dato>
          <Dato etiqueta="Rol">{nombreRol(usuario.rol)}</Dato>
          <Dato etiqueta="Técnico vinculado">
            {usuario.tecnico ? (
              `${usuario.tecnico.apellidos}, ${usuario.tecnico.nombres}`
            ) : (
              <SinDato />
            )}
          </Dato>
          <Dato etiqueta="Estado">{usuario.activo ? "Activo" : "Inactivo"}</Dato>
        </dl>
      </div>
    </div>
  );
}
