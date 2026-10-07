import type { ReactNode } from "react";
import Link from "next/link";
import Tag from "@/components/Tag";
import { ESTADO_VISITA_LABEL, ESTADO_VISITA_TAG, textoMotivos } from "@/lib/ui/estado";
import { textoFechaVisita } from "@/lib/ui/fecha";
import type { Mall, Sucursal, Visita } from "@/lib/types";

/** Piezas compartidas por la ficha de una tienda y la de un cliente. */

export function Cifra({ label, n, sub }: { label: string; n: ReactNode; sub?: string }) {
  return (
    <div className="px-4 md:px-6 pt-4 md:pt-[22px] pb-4.5 border-r max-lg:border-b border-black/[.2]">
      <div className="text-[10px] tracking-[.12em] uppercase opacity-66">{label}</div>
      <div className="font-extrabold text-[28px] md:text-[34px] leading-none tracking-[-.03em] tabular-nums mt-3">{n}</div>
      {sub ? <div className="text-xs opacity-66 mt-2.5">{sub}</div> : null}
    </div>
  );
}

/** Pares «dato → valor»; los que vienen vacíos no se pintan. */
export function Datos({ filas }: { filas: [string, ReactNode][] }) {
  const con = filas.filter(([, v]) => v !== null && v !== undefined && v !== "");
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 m-0 px-4 md:px-7 py-5">
      {con.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[10px] tracking-[.12em] uppercase opacity-66">{k}</dt>
          <dd className="m-0 mt-1 text-[14px] break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="px-4 md:px-7 pt-6 pb-2 text-[11px] tracking-[.14em] uppercase font-extrabold">{titulo}</h2>
      {children}
    </section>
  );
}

/** El historial de visitas, de la más reciente a la más antigua. */
export function TablaVisitas({
  visitas,
  malls,
  sucursales,
  conTienda,
}: {
  visitas: Visita[];
  malls: Mall[];
  sucursales: Sucursal[];
  /** En la ficha de un cliente cada fila dice de qué tienda es. */
  conTienda: boolean;
}) {
  if (!visitas.length) {
    return <p className="px-4 md:px-7 py-6 m-0 text-[14px] opacity-66">Todavía no hay visitas registradas.</p>;
  }
  const mallDe = (v: Visita) => {
    const s = v.sucursal ?? sucursales.find((x) => x.id === v.sucursalId);
    return malls.find((m) => m.id === s?.mallId)?.nombre ?? "—";
  };
  return (
    <div className="px-4 md:px-7 overflow-x-auto">
      <table className="table min-w-[640px]">
        <thead>
          <tr>
            <th>Folio</th>
            <th>Fecha</th>
            <th>Estado</th>
            {conTienda ? <th>Tienda</th> : null}
            <th>Mall</th>
            <th>Motivo</th>
            <th>Técnico</th>
          </tr>
        </thead>
        <tbody>
          {visitas.map((v) => (
            <tr key={v.id}>
              <td className="whitespace-nowrap font-extrabold tabular-nums">
                <Link href={`/admin/visitas/${encodeURIComponent(v.folio)}`} className="underline underline-offset-2">
                  {v.folio}
                </Link>
              </td>
              <td className="whitespace-nowrap tabular-nums">{textoFechaVisita(v)}</td>
              <td>
                <Tag variant={ESTADO_VISITA_TAG[v.estado]}>{ESTADO_VISITA_LABEL[v.estado]}</Tag>
              </td>
              {conTienda ? <td>{v.sucursal?.nombre ?? "—"}</td> : null}
              <td>{mallDe(v)}</td>
              <td className="max-w-[260px]">{textoMotivos(v)}</td>
              <td>
                {v.tecnico?.nombreCompleto ?? "—"}
                {v.tecnicoAyudante ? <div className="text-[11px] opacity-66">+ {v.tecnicoAyudante.nombreCompleto}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Los números de arriba: cuántas, cuántas cerradas, cuántas esperando y la última. */
export function resumenVisitas(visitas: Visita[]) {
  const completadas = visitas.filter((v) => v.estado === "COMPLETADA").length;
  const abiertas = visitas.filter((v) =>
    ["PROGRAMADA", "EN_CURSO", "PENDIENTE", "REAGENDADA"].includes(v.estado)
  ).length;
  // Vienen de la más reciente a la más antigua: la última hecha es la primera completada.
  const ultima = visitas.find((v) => v.estado === "COMPLETADA")?.fechaProgramada ?? null;
  return { total: visitas.length, completadas, abiertas, ultima };
}
