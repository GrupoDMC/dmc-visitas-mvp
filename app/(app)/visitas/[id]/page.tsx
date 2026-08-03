import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { puedeEditarVisita, puedeVerTodas, requerirSesion, type Sesion } from "@/lib/auth";
import { nombreTipoTrabajo } from "@/lib/catalogos";
import { fechaLarga, horaCorta } from "@/lib/fechas";
import { formatearRut } from "@/lib/rut";
import {
  obtenerVisita,
  ultimasVisitasDeSucursal,
  type VisitaDetalle,
} from "@/lib/db/visitas";
import { listarProblemasDeVisita } from "@/lib/db/problemas";
import { listarMaterialesDeVisita } from "@/lib/db/materiales";
import { listarFirmasDeVisita } from "@/lib/db/firmas";
import { nombreTecnico } from "@/lib/db/tecnicos";
import { BadgeEstado } from "@/components/ui/badge-estado";
import { SinDato } from "@/components/ui/tabla";
import { PanelHistorial } from "@/components/visitas/panel-historial";
import { SeccionDatosVisita } from "@/components/visitas/seccion-datos-visita";
import { SeccionTrabajoRealizado } from "@/components/visitas/seccion-trabajo-realizado";
import { SeccionProblemas } from "@/components/visitas/seccion-problemas";
import { SeccionMateriales } from "@/components/visitas/seccion-materiales";
import { SeccionFirmas } from "@/components/visitas/seccion-firmas";
import { CierreVisita } from "@/components/visitas/cierre-visita";

type Props = { params: Promise<{ id: string }> };

/**
 * `cache` de React memoiza por petición: `generateMetadata` y la página piden
 * la misma visita y la base se consulta una sola vez.
 */
const leerVisita = cache(async (id: number) => obtenerVisita(id));

/**
 * La visita, o 404.
 *
 * CONTROL DE ACCESO: un TECNICO que abre una visita que no es suya recibe 404,
 * no 403. Un 403 confirma que ese folio existe y de quién es; el 404 no dice
 * nada, y es la misma respuesta que para un folio inventado — que es
 * exactamente lo que queremos.
 *
 * El chequeo corre en el servidor, después de leer la visita. No hay forma de
 * saltearlo desde el navegador.
 */
async function leerConPermiso(id: string): Promise<{ sesion: Sesion; visita: VisitaDetalle }> {
  const resultado = await leerSiPuede(id);
  if (!resultado) notFound();
  return resultado;
}

async function leerSiPuede(
  id: string,
): Promise<{ sesion: Sesion; visita: VisitaDetalle } | null> {
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero < 1) return null;

  const [sesion, visita] = await Promise.all([
    requerirSesion(),
    leerVisita(numero),
  ]);

  if (!visita) return null;
  if (!puedeEditarVisita(sesion, visita.tecnico_id)) return null;

  return { sesion, visita };
}

/**
 * El título lleva el folio, así que pasa por el mismo permiso que la página:
 * un técnico que abre una visita ajena no tiene por qué ver ese folio ni
 * siquiera en la pestaña del navegador.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const resultado = await leerSiPuede(id);
  return { title: resultado ? resultado.visita.folio : "Visita" };
}

function Dato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-sm text-suave">{etiqueta}</dt>
      <dd className="min-w-0 text-right text-sm text-texto">{children}</dd>
    </div>
  );
}

function Telefono({ numero }: { numero: string | null }) {
  if (!numero) return <SinDato />;

  return (
    // `tel:` de verdad: el técnico está parado en la puerta y necesita llamar,
    // no leer el número para tipearlo en otra app.
    <a href={`tel:${numero}`} className="text-acento hover:underline">
      {numero}
    </a>
  );
}

export default async function PaginaVisita({ params }: Props) {
  const { id } = await params;
  const { sesion, visita } = await leerConPermiso(id);

  const [historial, problemas, materiales, firmas] = await Promise.all([
    ultimasVisitasDeSucursal(visita.sucursal_id, visita.id),
    listarProblemasDeVisita(visita.id),
    listarMaterialesDeVisita(visita.id),
    listarFirmasDeVisita(visita.id),
  ]);

  // Solo lectura para TODOS mientras está REALIZADA, no solo para el
  // técnico: reabrirla (COORDINADOR/ADMIN, con confirmación) es el único
  // camino de vuelta a poder editar, así el servidor y la pantalla coinciden
  // sin excepciones por rol.
  const soloLectura = visita.estado === "REALIZADA";
  const puedeGestionar = puedeVerTodas(sesion);

  const fecha = fechaLarga(visita.fecha_programada);
  const hora = horaCorta(visita.hora_programada);
  const trabajo = nombreTipoTrabajo(visita.tipo_trabajo);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4">
        <Link
          href="/visitas"
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-acento hover:underline"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 15l-5-5 5-5" />
          </svg>
          Visitas
        </Link>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tabular-nums text-texto">
            {visita.folio}
          </h1>
          <BadgeEstado estado={visita.estado} />
        </div>

        <p className="mt-1 text-sm text-suave">
          {trabajo ? `${trabajo} · ` : ""}
          {fecha ? (
            <>
              {fecha}
              {hora ? ` a las ${hora}` : ""}
            </>
          ) : (
            "Abierta en terreno, sin fecha agendada"
          )}
        </p>
      </div>

      {/*
        La colocación explícita en la grilla no es adorno. En escritorio el
        historial es un panel al costado; en móvil, donde todo se apila en el
        orden del HTML, tiene que quedar ARRIBA del formulario de terreno —si
        va al final, en la fase 4 queda enterrado bajo el formulario entero y
        deja de ser lo primero que el técnico ve al llegar.
      */}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
          <section aria-labelledby="ficha-sucursal">
            <h2 id="ficha-sucursal" className="mb-2 text-sm font-medium text-texto">
              Dónde
            </h2>
            <div className="rounded-base border border-borde bg-superficie shadow-tarjeta">
              <dl className="divide-y divide-borde">
                <Dato etiqueta="Cliente">
                  {visita.cliente ? (
                    <>
                      {visita.cliente.razon_social}
                      <span className="block text-xs tabular-nums text-suave">
                        {formatearRut(visita.cliente.rut)}
                      </span>
                    </>
                  ) : (
                    <SinDato />
                  )}
                </Dato>
                <Dato etiqueta="Sucursal">
                  {visita.sucursal ? (
                    <>
                      {visita.sucursal.nombre}
                      {visita.sucursal.codigo_interno ? (
                        <span className="block text-xs tabular-nums text-suave">
                          {visita.sucursal.codigo_interno}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <SinDato />
                  )}
                </Dato>
                <Dato etiqueta="Dirección">
                  {visita.sucursal?.direccion ?? <SinDato />}
                </Dato>
                <Dato etiqueta="Comuna">
                  {visita.sucursal?.comuna ?? <SinDato />}
                </Dato>
                <Dato etiqueta="Teléfono de la sucursal">
                  <Telefono numero={visita.sucursal?.telefono ?? null} />
                </Dato>
              </dl>
            </div>
          </section>

          <section aria-labelledby="contacto-visita">
            <h2 id="contacto-visita" className="mb-2 text-sm font-medium text-texto">
              Contacto de esta visita
            </h2>
            <div className="rounded-base border border-borde bg-superficie shadow-tarjeta">
              <dl className="divide-y divide-borde">
                <Dato etiqueta="Nombre">
                  {visita.contacto_nombre ?? <SinDato />}
                </Dato>
                <Dato etiqueta="Teléfono">
                  <Telefono numero={visita.contacto_telefono} />
                </Dato>
                <Dato etiqueta="Correo">
                  {visita.contacto_email ? (
                    <a
                      href={`mailto:${visita.contacto_email}`}
                      className="break-all text-acento hover:underline"
                    >
                      {visita.contacto_email}
                    </a>
                  ) : (
                    <SinDato />
                  )}
                </Dato>
                <Dato etiqueta="Técnico">
                  {visita.tecnico ? (
                    `${visita.tecnico.apellidos}, ${visita.tecnico.nombres}`
                  ) : (
                    <span className="text-encurso">Sin asignar</span>
                  )}
                </Dato>
              </dl>
            </div>
          </section>
        </div>

        <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <PanelHistorial
            visitas={historial}
            sucursal={visita.sucursal?.nombre ?? "esta sucursal"}
          />
        </aside>

        <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-2">
          {visita.descripcion_trabajo ? (
            <section aria-labelledby="descripcion-trabajo">
              <h2
                id="descripcion-trabajo"
                className="mb-2 text-sm font-medium text-texto"
              >
                Qué hay que hacer
              </h2>
              <div className="rounded-base border border-borde bg-superficie p-4 shadow-tarjeta">
                <p className="whitespace-pre-line text-sm text-texto">
                  {visita.descripcion_trabajo}
                </p>
              </div>
            </section>
          ) : null}

          <SeccionDatosVisita visita={visita} soloLectura={soloLectura} />
          <SeccionTrabajoRealizado visita={visita} soloLectura={soloLectura} />
          <SeccionProblemas
            visitaId={visita.id}
            problemas={problemas}
            soloLectura={soloLectura}
          />
          <SeccionMateriales
            visitaId={visita.id}
            materiales={materiales}
            soloLectura={soloLectura}
          />
          <SeccionFirmas
            visitaId={visita.id}
            firmas={firmas}
            soloLectura={soloLectura}
            nombreTecnicoAsignado={visita.tecnico ? nombreTecnico(visita.tecnico) : null}
          />
          <CierreVisita
            visitaId={visita.id}
            estado={visita.estado}
            puedeGestionar={puedeGestionar}
          />
        </div>
      </div>
    </div>
  );
}
