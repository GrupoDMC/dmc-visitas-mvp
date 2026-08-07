import Link from "next/link";
import { esTecnico, nombreRol, requerirSesion } from "@/lib/auth";
import { navegacionPara } from "@/lib/navegacion";

export default async function PaginaInicio() {
  const sesion = await requerirSesion();
  const secciones = navegacionPara(sesion.rol);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-heading text-2xl font-semibold text-texto">
        Hola, {sesion.nombre}
      </h1>
      <p className="mt-1 text-sm text-suave">
        Entraste como {nombreRol(sesion.rol)}.{" "}
        {esTecnico(sesion)
          ? "Vas a ver solo las visitas asignadas a vos."
          : "Vas a ver todas las visitas del equipo."}
      </p>

      <div className="mt-6 overflow-hidden rounded-card border border-borde bg-superficie shadow-tarjeta">
        <div className="flex items-center gap-2 border-b border-borde bg-fondo px-4 py-3">
          <span className="size-1.5 rounded-full bg-realizada" aria-hidden />
          <h2 className="text-sm font-medium text-texto">Tu sesión</h2>
        </div>
        <dl className="divide-y divide-borde text-sm">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-suave">Nombre</dt>
            <dd className="text-right font-medium text-texto">{sesion.nombre}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-suave">Rol</dt>
            <dd className="text-right font-medium text-texto">{nombreRol(sesion.rol)}</dd>
          </div>
          {sesion.tecnicoId !== null ? (
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-suave">Ficha de técnico</dt>
              <dd className="text-right font-medium tabular-nums text-texto">
                #{sesion.tecnicoId}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      {secciones.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-texto">Ir a</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {secciones.map((seccion) => (
              <li key={seccion.href}>
                <Link
                  href={seccion.href}
                  className="flex min-h-16 items-center justify-center rounded-card border border-borde bg-superficie px-3 text-center text-sm font-medium text-texto shadow-tarjeta transition-colors hover:border-acento hover:bg-acento-suave hover:text-acento"
                >
                  {seccion.etiqueta}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
