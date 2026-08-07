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
import { listarReagendamientosDeVisita } from "@/lib/db/reagendamientos";
import { nombreTecnico } from "@/lib/db/tecnicos";
import { BadgeEstado } from "@/components/ui/badge-estado";
import { SinDato } from "@/components/ui/tabla";
import { PanelHistorial } from "@/components/visitas/panel-historial";
import { HistorialReagendamientos } from "@/components/visitas/historial-reagendamientos";
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

  const [historial, problemas, materiales, firmas, reagendamientos] = await Promise.all([
    ultimasVisitasDeSucursal(visita.sucursal_id, visita.id),
    listarProblemasDeVisita(visita.id),
    listarMaterialesDeVisita(visita.id),
    listarFirmasDeVisita(visita.id),
    listarReagendamientosDeVisita(visita.id),
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

        <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-2">

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