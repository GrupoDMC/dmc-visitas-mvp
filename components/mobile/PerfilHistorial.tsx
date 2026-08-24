"use client";

import { useMemo, useState } from "react";
import Sheet from "./Sheet";
import Tag from "@/components/Tag";
import { ESTADO_PROBLEMA_LABEL, ESTADO_PROBLEMA_TAG, ESTADO_VISITA_LABEL, ESTADO_VISITA_TAG } from "@/lib/ui/estado";
import { nombreProblema, nombreTrabajo, useReferencias } from "@/lib/ui/referencias";
import type { Visita } from "@/lib/types";

type Filtro = "hoy" | "semana" | "mes";

const FILTROS: { c: Filtro; label: string; dias: number; leyenda: string }[] = [
  { c: "hoy", label: "Hoy", dias: 0, leyenda: "hoy" },
  { c: "semana", label: "Semana", dias: 6, leyenda: "últimos 7 días" },
  { c: "mes", label: "Mes", dias: 30, leyenda: "últimos 30 días" },
];

function diasAtras(fecha: string, hoy: string): number {
  const a = new Date(`${fecha}T00:00:00`).getTime();
  const b = new Date(`${hoy}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** "Mis visitas realizadas" del perfil — ventana móvil de hoy / 7 / 30 días. */
export default function PerfilHistorial({ visitas, hoy }: { visitas: Visita[]; hoy: string }) {
  const { problemas: catalogoProblema } = useReferencias();
  const [filtro, setFiltro] = useState<Filtro>("semana");
  const [abierta, setAbierta] = useState<Visita | null>(null);

  const cfg = FILTROS.find((f) => f.c === filtro)!;

  const realizadas = useMemo(
    () => visitas.filter((v) => v.estado === "COMPLETADA" || v.estado === "PENDIENTE" || v.estado === "REAGENDADA"),
    [visitas]
  );

  const listadas = useMemo(() => {
    return realizadas
      .filter((v) => {
        const d = diasAtras(v.fechaProgramada, hoy);
        return d >= 0 && d <= cfg.dias;
      })
      .sort((a, b) => `${b.fechaProgramada}${b.horaProgramada ?? ""}`.localeCompare(`${a.fechaProgramada}${a.horaProgramada ?? ""}`));
  }, [realizadas, cfg.dias, hoy]);

  const resumen = `${listadas.length} ${listadas.length === 1 ? "visita" : "visitas"} · ${cfg.leyenda}`;

  return (
    <div className="mt-6.5">
      <div className="flex items-baseline gap-2.5 flex-wrap mb-3">
        <h2 className="font-extrabold text-[19px] leading-[1.15] tracking-[-.02em] m-0">Mis visitas realizadas</h2>
        <span className="text-xs leading-[1.3] opacity-62 ml-auto">{resumen}</span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 mb-3.5">
        {FILTROS.map((f) => {
          const activo = filtro === f.c;
          return (
            <button
              key={f.c}
              onClick={() => setFiltro(f.c)}
              className="min-h-11 px-2.5 font-extrabold text-xs leading-none tracking-[.07em] uppercase cursor-pointer hover:brightness-95"
              style={{
                background: activo ? "var(--color-text)" : "transparent",
                color: activo ? "var(--color-bg)" : "var(--color-text)",
                border: `1px solid ${activo ? "var(--color-text)" : "rgba(32,30,29,.35)"}`,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2.5">
        {listadas.map((v) => {
          const abiertos = (v.problemas ?? []).filter((p) => p.estado !== "RESUELTO");
          return (
            <button
              key={v.id}
              onClick={() => setAbierta(v)}
              className="block w-full text-left border border-black/[.3] bg-[var(--color-surface-3)] px-3.5 py-3 cursor-pointer text-[var(--color-text)] hover:bg-[var(--color-surface)]"
            >
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[11px] leading-[1.3] tabular-nums tracking-[.06em] opacity-66">
                  {v.fechaProgramada}
                  {v.horaProgramada ? ` · ${v.horaProgramada}` : ""}
                </span>
                <Tag variant={ESTADO_VISITA_TAG[v.estado]} className="ml-auto">
                  {ESTADO_VISITA_LABEL[v.estado]}
                </Tag>
              </div>
              <div className="font-extrabold text-[15px] leading-[1.25] mt-1.5">{v.sucursal?.nombre}</div>
              <div className="text-[13px] opacity-66 mt-1">
                {v.cliente?.nombreFantasia} · {v.motivo?.nombre}
              </div>
              {abiertos.length > 0 ? (
                <div className="text-xs text-[var(--color-accent-800)] mt-2">
                  {abiertos.length} problema{abiertos.length > 1 ? "s" : ""} abierto{abiertos.length > 1 ? "s" : ""}:{" "}
                  {nombreProblema(catalogoProblema, abiertos[0].tipoCodigo)}
                </div>
              ) : null}
              <div className="flex items-center gap-1.5 mt-2 text-[11px] leading-none tracking-[.07em] uppercase opacity-60">
                <span>Ver detalle</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </div>
            </button>
          );
        })}
        {listadas.length === 0 ? (
          <div className="py-6.5 text-center text-sm opacity-62">No hay visitas cerradas en este período.</div>
        ) : null}
      </div>

      {abierta ? <ActaSheet visita={abierta} onCerrar={() => setAbierta(null)} /> : null}
    </div>
  );
}

function ActaSheet({ visita, onCerrar }: { visita: Visita; onCerrar: () => void }) {
  const { problemas: catalogoProblema, trabajos: catalogoTrabajo } = useReferencias();
  const ejec = visita.ejecucion;
  const duracion =
    ejec?.horaInicio && ejec.horaTermino
      ? `${ejec.horaInicio.slice(11, 16)} – ${ejec.horaTermino.slice(11, 16)}`
      : visita.horaProgramada ?? "Sin hora";

  const filas: { k: string; v: string }[] = [
    { k: "Folio", v: visita.folio },
    { k: "Fecha", v: `${visita.fechaProgramada} · ${duracion}` },
    { k: "Cliente", v: visita.cliente?.nombreFantasia ?? "—" },
    { k: "Motivo", v: visita.motivo?.nombre ?? "—" },
    { k: "Quién recibió", v: ejec?.responsableNombre ?? visita.responsableNombre ?? "—" },
    { k: "Estado", v: ESTADO_VISITA_LABEL[visita.estado] },
  ];

  const trabajos = visita.trabajos ?? [];
  const problemas = visita.problemas ?? [];

  return (
    <Sheet titulo={visita.sucursal?.nombre ?? "Visita"} eyebrow="Visita realizada" onClose={onCerrar}>
      <div className="px-4 pt-1 pb-6">
        {filas.map((f) => (
          <div key={f.k} className="flex gap-3 py-3 border-b border-black/[.2]">
            <div className="text-[10px] leading-[1.6] tracking-[.09em] uppercase opacity-62 min-w-[96px] flex-none">{f.k}</div>
            <div className="text-sm min-w-0">{f.v}</div>
          </div>
        ))}

        <div className="pt-4">
          <div className="text-[10px] tracking-[.1em] uppercase opacity-62 mb-2">Trabajo realizado</div>
          {trabajos.length === 0 ? (
            <div className="text-sm opacity-70">No quedó trabajo registrado en esta visita.</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {trabajos.map((t) => (
                <div key={t.id} className="border-l-[3px] border-[var(--color-text)] pl-3">
                  <div className="font-extrabold text-[15px] leading-[1.25]">
                    {nombreTrabajo(catalogoTrabajo, t.trabajoCodigo)}
                  </div>
                  {t.subtrabajos.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {t.subtrabajos.map((s) => (
                        <span key={s.id} className="px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2]">
                          {s.etiqueta}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {t.detalle ? <div className="text-sm opacity-72 mt-1.5">{t.detalle}</div> : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {ejec?.observaciones ? (
          <div className="pt-4">
            <div className="text-[10px] tracking-[.1em] uppercase opacity-62 mb-1.5">Observación escrita</div>
            <div className="text-sm leading-[1.5]">{ejec.observaciones}</div>
          </div>
        ) : null}

        <div className="pt-4">
          <div className="text-[10px] tracking-[.1em] uppercase opacity-62 mb-2">Problemas levantados</div>
          {problemas.length === 0 ? (
            <div className="text-sm opacity-70">No se levantaron problemas en esta visita.</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {problemas.map((p) => (
                <div key={p.id} className="px-3 py-3 bg-[var(--color-accent-200)] border-l-[3px] border-[var(--color-accent)]">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <div className="font-extrabold text-sm leading-[1.25] text-[var(--color-accent-800)]">
                      {nombreProblema(catalogoProblema, p.tipoCodigo)}
                    </div>
                    <Tag variant={ESTADO_PROBLEMA_TAG[p.estado]} className="ml-auto">
                      {ESTADO_PROBLEMA_LABEL[p.estado]}
                    </Tag>
                  </div>
                  {p.descripcion ? (
                    <div className="text-[13px] leading-[1.5] text-[var(--color-accent-800)] mt-1.5">{p.descripcion}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-4.5 mb-0 text-xs opacity-62">Solo lectura: el acta ya fue enviada a coordinación.</p>
      </div>
    </Sheet>
  );
}
