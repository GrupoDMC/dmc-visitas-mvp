"use client";

import { useState } from "react";
import Link from "next/link";
import type { PanelData, Rango } from "@/lib/ui/panel-data";

const RANGOS: Rango[] = ["Hoy", "Semana", "Mes"];

export default function PanelDashboard({ data }: { data: Record<Rango, PanelData> }) {
  const [rango, setRango] = useState<Rango>("Hoy");
  const d = data[rango];

  return (
    <>
      <div className="sticky top-0 z-10 bg-[var(--color-bg)] border-b-2 border-[var(--color-divider)] flex items-end gap-5 px-7 pt-[22px] pb-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">Coordinación</div>
          <h1 className="font-extrabold text-[30px] leading-[1.08] tracking-[-.03em] mt-1.5">Panel de operación</h1>
        </div>
        <div className="ml-auto seg">
          {RANGOS.map((r) => (
            <label
              key={r}
              className="seg-opt"
              style={{
                background: rango === r ? "var(--color-accent)" : "transparent",
                color: rango === r ? "var(--color-bg)" : "var(--color-text)",
              }}
            >
              <input
                type="radio"
                name="rango"
                className="sr-only"
                checked={rango === r}
                onChange={() => setRango(r)}
              />
              <span>{r}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="pb-10 animate-fade-in">
        <div className="grid grid-cols-4 border-b-2 border-[var(--color-divider)]">
          <KpiCard
            label={`Visitas · ${rango.toLowerCase()}`}
            n={d.kpis.programadas}
            unidad="programadas"
            sub={rango === "Hoy" ? `${d.kpis.tecnicosHoy} técnicos en terreno` : `${d.kpis.programadas - d.kpis.cerradas} sin cerrar a tiempo`}
            accion="Ver visitas"
            href="/admin/visitas"
          />
          <KpiCard
            label={`Cumplimiento · ${rango.toLowerCase()}`}
            n={`${d.kpis.pctCumpl}%`}
            sub={`${d.kpis.cerradas} de ${d.kpis.programadas} cerradas a tiempo`}
            accion="Ver completadas"
            href="/admin/visitas?estado=COMPLETADA"
          />
          <KpiCard
            label="Problemas abiertos"
            n={d.kpis.problemasAbiertosTotal}
            unidad="sin resolver"
            sub="Abiertos + pendientes, en total"
            accion="Ver problemas"
            href="/admin/problemas"
            color="var(--color-accent)"
          />
          <KpiCard
            label={`Reagendas · ${rango.toLowerCase()}`}
            n={d.kpis.reagendas}
            sub="Reagendadas o pendientes"
            accion="Ver reagendas"
            href="/admin/reagendas"
          />
        </div>

        <div className="grid grid-cols-2">
          <div className="p-6 border-r border-b border-black/[.12]">
            <div className="flex items-baseline gap-2.5">
              <h2 className="font-extrabold text-[17px] m-0">Visitas del día por estado</h2>
              <span className="ml-auto text-[11px] tracking-[.08em] uppercase opacity-60">{d.totalHoy} visitas</span>
            </div>
            <div className="flex h-3.5 mt-4 border border-[var(--color-divider)]">
              {d.estadoHoy.map((e) => (
                <div key={e.estado} style={{ width: `${e.pct}%`, background: e.color }} className="border-r border-black/[.15]" />
              ))}
            </div>
            <div className="mt-4">
              {d.estadoHoy.map((e) => (
                <Link
                  key={e.estado}
                  href={`/admin/visitas?estado=${e.estado}`}
                  className="w-full flex items-center gap-2.5 py-2.5 border-b border-black/[.1] hover:bg-black/5"
                >
                  <span className="w-2.5 h-2.5 shrink-0 border border-black/[.35]" style={{ background: e.color }} />
                  <span className="text-[13px]">{e.label}</span>
                  <span className="ml-auto font-extrabold text-sm tabular-nums">{e.n}</span>
                  <span className="w-11 text-right text-xs opacity-62 tabular-nums">{e.pct}%</span>
                </Link>
              ))}
            </div>
          </div>

          <CumplimientoPanel cumplimiento={d.cumplimiento} />

          <div className="p-6 border-r border-b border-black/[.12]">
            <div className="flex items-baseline gap-2.5">
              <h2 className="font-extrabold text-[17px] m-0">Problemas abiertos por tipo</h2>
              <span className="ml-auto text-[11px] tracking-[.08em] uppercase opacity-60">
                {d.kpis.problemasAbiertosTotal} abiertos
              </span>
            </div>
            <p className="mt-1.5 mb-0 text-xs opacity-62">Haz clic en un tipo para ver las visitas donde se registró.</p>
            <div className="mt-2.5">
              {d.problemasTipo.map((p) => (
                <div key={p.codigo} className="py-2.5 border-b border-black/[.1]">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-[13px] min-w-0">{p.nombre}</span>
                    <span className="ml-auto font-extrabold text-sm tabular-nums">{p.n}</span>
                  </div>
                  <div className="h-2 mt-1.5 bg-[var(--color-neutral-300)]">
                    <div className="h-2" style={{ width: `${p.pct}%`, background: "var(--color-accent)" }} />
                  </div>
                </div>
              ))}
              {d.problemasTipo.length === 0 ? (
                <div className="py-5 text-[13px] opacity-66">Sin problemas registrados en este período.</div>
              ) : null}
            </div>
          </div>

          <div className="p-6 border-b border-black/[.12]">
            <h2 className="font-extrabold text-[17px] m-0 mb-1">Carga por técnico</h2>
            <p className="m-0 mb-2 text-xs opacity-62">Programadas vs realizadas hoy.</p>
            <table className="table">
              <thead>
                <tr>
                  <th>Técnico</th>
                  <th className="text-right">Prog.</th>
                  <th className="text-right">Real.</th>
                  <th style={{ width: 140 }}>Avance</th>
                </tr>
              </thead>
              <tbody>
                {d.carga.map((c) => (
                  <tr key={c.tecnicoId}>
                    <td className="font-semibold">{c.nombre}</td>
                    <td className="text-right tabular-nums">{c.programadas}</td>
                    <td className="text-right tabular-nums">{c.realizadas}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-[var(--color-neutral-300)]">
                          <div className="h-2" style={{ width: `${c.pct}%`, background: "var(--color-text)" }} />
                        </div>
                        <span className="text-[11px] opacity-66 tabular-nums">{c.pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-6 border-r border-black/[.12]">
            <h2 className="font-extrabold text-[17px] m-0 mb-1">Sucursales con más fallas</h2>
            <p className="m-0 mb-2 text-xs opacity-62">Total histórico de problemas registrados.</p>
            <div>
              {d.sucursalesFallas.map((s, i) => (
                <div key={s.sucursalId} className="w-full flex items-center gap-3 py-2.5 border-b border-black/[.1]">
                  <div className="font-extrabold text-[13px] tabular-nums opacity-52 w-5">{i + 1}</div>
                  <div className="min-w-0">
                    <div className="font-extrabold text-sm">{s.sucursal.nombre}</div>
                    <div className="text-xs opacity-62">
                      {s.sucursal.comuna}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2.5">
                    <span className="tag tag-outline">{s.sinCerrar} sin cerrar</span>
                    <span className="font-extrabold text-lg tabular-nums">{s.total}</span>
                  </div>
                </div>
              ))}
              {d.sucursalesFallas.length === 0 ? (
                <div className="py-5 text-[13px] opacity-66">Sin fallas registradas.</div>
              ) : null}
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h2 className="font-extrabold text-[17px] m-0 mb-3">Tiempo en sitio</h2>
                <div className="flex items-baseline gap-1.5">
                  <div className="font-extrabold text-[44px] leading-none tracking-[-.03em] tabular-nums">{d.tiempo.prom}</div>
                  <div className="text-[13px] opacity-62">min prom.</div>
                </div>
                <div className="mt-3.5">
                  {d.tiempo.porMotivo.map((t) => (
                    <div key={t.label} className="py-2 border-b border-black/[.1]">
                      <div className="flex gap-2 text-xs">
                        <span className="min-w-0 opacity-75">{t.label}</span>
                        <span className="ml-auto tabular-nums font-semibold">{t.min} min</span>
                      </div>
                      <div className="h-1.5 mt-1.5 bg-[var(--color-neutral-300)]">
                        <div className="h-1.5" style={{ width: `${t.pct}%`, background: "var(--color-text)" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="font-extrabold text-[17px] m-0 mb-3">Reagendamientos</h2>
                <div className="flex items-baseline gap-2">
                  <div className="font-extrabold text-[44px] leading-none tracking-[-.03em] tabular-nums text-[var(--color-accent)]">
                    {d.reagendasLista.length}
                  </div>
                  <div className="text-[13px] opacity-62">últimos registrados</div>
                </div>
                <div className="mt-3.5">
                  {d.reagendasLista.map((r) => (
                    <Link
                      key={r.reagendamiento.id}
                      href={`/admin/visitas/${r.visita.folio}`}
                      className="w-full block text-left py-2.5 border-b border-black/[.1] hover:bg-black/5"
                    >
                      <div className="flex gap-2 items-baseline">
                        <span className="font-extrabold text-[13px] min-w-0">{r.visita.sucursal?.nombre}</span>
                        <span className="ml-auto text-[11px] tabular-nums opacity-62">{r.visita.folio}</span>
                      </div>
                      <div className="text-xs opacity-70 mt-1">{r.reagendamiento.motivo}</div>
                    </Link>
                  ))}
                  {d.reagendasLista.length === 0 ? (
                    <div className="py-3.5 text-[13px] opacity-66">Sin reagendamientos.</div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * "Cumplimiento vs programado": el porcentaje del rango y una barra por día
 * trabajado. Los días sin visitas programadas no aparecen. Al pasar el mouse
 * por una barra se explica ese día; al hacer clic se abren sus visitas.
 */
function CumplimientoPanel({ cumplimiento }: { cumplimiento: PanelData["cumplimiento"] }) {
  const [hover, setHover] = useState<string | null>(null);
  const dia = cumplimiento.dias.find((x) => x.fecha === hover) ?? null;

  return (
    <div className="p-6 border-b border-black/[.12]">
      <div className="flex items-baseline gap-2.5">
        <h2 className="font-extrabold text-[17px] m-0">Cumplimiento vs programado</h2>
        <span className="ml-auto text-[11px] tracking-[.08em] uppercase opacity-60">{cumplimiento.rangoTexto}</span>
      </div>

      <div className="flex items-end gap-3.5 mt-3.5">
        <div className="font-extrabold text-[56px] leading-none tracking-[-.04em] tabular-nums">
          {cumplimiento.pct}%
        </div>
        <div className="text-xs opacity-66 pb-2">
          {cumplimiento.detalle}
          <br />
          Meta interna {cumplimiento.meta}%
        </div>
      </div>

      <div
        className="mt-3.5 px-3 py-2.5 text-xs min-h-5 border-l-[3px]"
        style={{
          background: dia ? "var(--color-accent-200)" : "var(--color-surface)",
          borderColor: dia ? "var(--color-accent)" : "var(--color-divider)",
        }}
      >
        {dia
          ? `${dia.label} · ${dia.pct}% · ${dia.cerradas} de ${dia.programadas} cerradas a tiempo · click para ver sus visitas`
          : "Pasa el mouse por un día para ver su detalle; haz clic para abrir esas visitas."}
      </div>

      {cumplimiento.dias.length > 0 ? (
        <>
          <div className="flex items-end gap-2.5 h-[118px] mt-3.5 border-b-2 border-[var(--color-divider)]">
            {cumplimiento.dias.map((day) => {
              const activo = hover === day.fecha;
              return (
                <Link
                  key={day.fecha}
                  href={`/admin/visitas?fecha=${day.fecha}`}
                  onMouseEnter={() => setHover(day.fecha)}
                  onMouseLeave={() => setHover(null)}
                  aria-label={`${day.label} ${day.pct}%`}
                  className="flex-1 flex flex-col justify-end items-stretch h-full"
                  style={{ background: activo ? "rgba(32,30,29,.07)" : "transparent" }}
                >
                  <div
                    className="text-[10px] font-extrabold text-center tabular-nums mb-1.5"
                    style={{ opacity: activo ? 1 : 0.5 }}
                  >
                    {day.pctTxt}
                  </div>
                  <div
                    style={{
                      height: `${day.h}%`,
                      background: activo
                        ? "var(--color-accent-active)"
                        : day.esHoy
                          ? "var(--color-accent)"
                          : "#7a7676",
                    }}
                  />
                </Link>
              );
            })}
          </div>
          <div className="flex gap-2.5 mt-1.5">
            {cumplimiento.dias.map((day) => (
              <div
                key={day.fecha}
                className="flex-1 text-center text-[10px] tracking-[.06em] uppercase"
                style={{
                  opacity: hover === day.fecha || day.esHoy ? 1 : 0.45,
                  fontWeight: hover === day.fecha || day.esHoy ? 800 : 400,
                }}
              >
                {day.label}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="py-8 text-[13px] opacity-66">Sin días trabajados en este período.</div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  n,
  unidad,
  sub,
  accion,
  href,
  color = "var(--color-text)",
}: {
  label: string;
  n: number | string;
  unidad?: string;
  sub: string;
  accion: string;
  href: string;
  color?: string;
}) {
  return (
    <Link href={href} className="block text-left px-6 pt-[22px] pb-4.5 border-r border-black/[.2] hover:bg-black/5">
      <div className="text-[10px] tracking-[.12em] uppercase opacity-66">{label}</div>
      <div className="flex items-baseline gap-2 mt-3">
        <div className="font-extrabold text-[40px] leading-none tracking-[-.03em] tabular-nums" style={{ color }}>
          {n}
        </div>
        {unidad ? <div className="text-xs opacity-62">{unidad}</div> : null}
      </div>
      <div className="text-xs opacity-66 mt-2.5">{sub}</div>
      <div className="flex items-center gap-1.5 mt-2.5 text-[10px] tracking-[.1em] uppercase text-[var(--color-accent-active)]">
        <span>{accion}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </div>
    </Link>
  );
}
