import Link from "next/link";
import { nombreTipoTrabajo } from "@/lib/catalogos";
import { diaYMes, finDeSemanaDe, horaCorta } from "@/lib/fechas";
import type { VisitaEnListado } from "@/lib/db/visitas";
import { BadgeEstado } from "@/components/ui/badge-estado";

/**
 * Las visitas del técnico, agrupadas.
 *
 * Cada visita cae en UN grupo y solo uno; el orden de abajo es el que decide,
 * y no es alfabético sino de urgencia. Una visita de hoy que ya está EN_CURSO
 * sigue siendo trabajo de hoy, no un pendiente arrastrado.
 *
 * "Más adelante" no estaba en el encargo y existe por una razón concreta: sin
 * ese grupo, una visita agendada para dentro de tres semanas no aparecería en
 * ninguna parte y el técnico no tendría cómo saber que la tiene. Se muestra
 * solo cuando hay algo adentro.
 */
export function agrupar(visitas: VisitaEnListado[], hoy: string) {
  const finSemana = finDeSemanaDe(hoy);

  const grupos = {
    hoy: [] as VisitaEnListado[],
    semana: [] as VisitaEnListado[],
    pendientes: [] as VisitaEnListado[],
    adelante: [] as VisitaEnListado[],
  };

  for (const visita of visitas) {
    const fecha = visita.fecha_programada;

    if (fecha === hoy) grupos.hoy.push(visita);
    // Sin fecha = nació en terreno. Atrasada = quedó sin cerrar. Las dos son
    // lo mismo desde el pulgar del técnico: algo que arrastra.
    else if (fecha === null || fecha < hoy) grupos.pendientes.push(visita);
    else if (fecha <= finSemana) grupos.semana.push(visita);
    else grupos.adelante.push(visita);
  }

  return grupos;
}

function Tarjeta({
  visita,
  mostrarDia,
}: {
  visita: VisitaEnListado;
  mostrarDia: boolean;
}) {
  const hora = horaCorta(visita.hora_programada);
  const dia = diaYMes(visita.fecha_programada);
  const trabajo = nombreTipoTrabajo(visita.tipo_trabajo);

  return (
    <li>
      <Link
        href={`/visitas/${visita.id}`}
        className="flex min-h-[5.5rem] flex-col gap-2 rounded-base border border-borde bg-superficie p-3.5 shadow-tarjeta transition-colors hover:bg-fondo"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold tabular-nums text-texto">
              {hora ?? (dia && mostrarDia ? dia : "Sin hora")}
              {hora && mostrarDia && dia ? (
                <span className="ml-2 text-sm font-normal text-suave">{dia}</span>
              ) : null}
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-texto">
              {visita.cliente?.razon_social ?? "Cliente sin nombre"}
            </p>
          </div>
          <BadgeEstado estado={visita.estado} />
        </div>

        <div className="min-w-0 text-sm text-suave">
          <p className="truncate text-texto">
            {visita.sucursal?.nombre ?? "Sucursal sin nombre"}
          </p>
          {visita.sucursal?.direccion ? (
            <p className="truncate">
              {visita.sucursal.direccion}
              {visita.sucursal.comuna ? `, ${visita.sucursal.comuna}` : ""}
            </p>
          ) : visita.sucursal?.comuna ? (
            <p className="truncate">{visita.sucursal.comuna}</p>
          ) : null}
        </div>

        <p className="text-xs text-suave">
          <span className="tabular-nums">{visita.folio}</span>
          {trabajo ? ` · ${trabajo}` : ""}
        </p>
      </Link>
    </li>
  );
}

function Grupo({
  titulo,
  ayuda,
  visitas,
  mostrarDia,
}: {
  titulo: string;
  ayuda?: string;
  visitas: VisitaEnListado[];
  mostrarDia: boolean;
}) {
  if (visitas.length === 0) return null;

  return (
    <section className="mt-5 first:mt-0">
      <h2 className="text-sm font-medium text-texto">
        {titulo}
        <span className="ml-1.5 font-normal tabular-nums text-suave">
          ({visitas.length})
        </span>
      </h2>
      {ayuda ? <p className="mt-0.5 text-xs text-suave">{ayuda}</p> : null}
      <ul className="mt-2 flex flex-col gap-2">
        {visitas.map((visita) => (
          <Tarjeta key={visita.id} visita={visita} mostrarDia={mostrarDia} />
        ))}
      </ul>
    </section>
  );
}

export function TarjetasTecnico({
  visitas,
  hoy,
}: {
  visitas: VisitaEnListado[];
  hoy: string;
}) {
  const grupos = agrupar(visitas, hoy);

  return (
    <div>
      <Grupo titulo="Hoy" visitas={grupos.hoy} mostrarDia={false} />
      <Grupo titulo="Esta semana" visitas={grupos.semana} mostrarDia />
      <Grupo
        titulo="Pendientes de cerrar"
        ayuda="Quedaron abiertas de días anteriores, o las abriste vos en terreno."
        visitas={grupos.pendientes}
        mostrarDia
      />
      <Grupo titulo="Más adelante" visitas={grupos.adelante} mostrarDia />
    </div>
  );
}
