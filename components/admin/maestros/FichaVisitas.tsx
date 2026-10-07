"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Tag from "@/components/Tag";
import AdminHeader from "@/components/admin/AdminHeader";
import FiltrosBar from "@/components/admin/FiltrosBar";
import { ESTADO_VISITA_COLOR, ESTADO_VISITA_LABEL, ESTADO_VISITA_TAG } from "@/lib/ui/estado";
import { textoFechaVisita } from "@/lib/ui/fecha";
import { sinTildes } from "@/lib/ui/formato";
import type { DatoFicha, FilaFicha } from "@/components/admin/maestros/FichaPartes";
import type { EstadoVisita } from "@/lib/types";

const ESTADOS: EstadoVisita[] = [
  "COMPLETADA",
  "EN_CURSO",
  "PROGRAMADA",
  "PENDIENTE",
  "REAGENDADA",
  "CANCELADA",
  "CANCELADA_ADMIN",
];
const EN_ESPERA: EstadoVisita[] = ["PROGRAMADA", "EN_CURSO", "PENDIENTE", "REAGENDADA"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export interface TiendaFicha {
  id: number;
  nombre: string;
  mall: string | null;
  comuna: string;
  activo: boolean;
}

const pct = (n: number, de: number) => (de ? Math.round((n / de) * 100) : 0);

/** Días entre dos fechas YYYY-MM-DD. */
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export default function FichaVisitas({
  kicker,
  titulo,
  subtitulo,
  activo,
  volver,
  acciones,
  datos,
  notas,
  filas,
  tiendas,
  verVisitas,
  hoy,
}: {
  kicker: string;
  titulo: string;
  subtitulo: string;
  activo: boolean;
  volver: { href: string; label: string };
  acciones?: { href: string; label: string }[];
  datos: DatoFicha[];
  notas: string | null;
  filas: FilaFicha[];
  /** Solo en la ficha del cliente: sus tiendas, para el ranking y la tabla. */
  tiendas?: TiendaFicha[];
  verVisitas: boolean;
  hoy: string;
}) {
  const router = useRouter();
  const historial = useRef<HTMLDivElement>(null);
  const esCliente = Boolean(tiendas);

  const [busqueda, setBusqueda] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fAnio, setFAnio] = useState("");
  const [fTienda, setFTienda] = useState("");

  // ── Cifras ────────────────────────────────────────────────────────────────
  const total = filas.length;
  const completadas = filas.filter((f) => f.estado === "COMPLETADA").length;
  const enEspera = filas.filter((f) => EN_ESPERA.includes(f.estado)).length;
  const problemas = filas.reduce((n, f) => n + f.problemas, 0);
  const problemasAbiertos = filas.reduce((n, f) => n + f.problemasAbiertos, 0);
  // Vienen de la más reciente a la más antigua.
  const ultima = filas.find((f) => f.estado === "COMPLETADA" && f.fecha <= hoy) ?? null;
  const proxima = [...filas].reverse().find((f) => EN_ESPERA.includes(f.estado) && f.fecha >= hoy) ?? null;
  const conTiempo = filas.filter((f) => f.minutos !== null);
  const minutosProm = conTiempo.length
    ? Math.round(conTiempo.reduce((n, f) => n + (f.minutos ?? 0), 0) / conTiempo.length)
    : null;

  // ── Gráficos ──────────────────────────────────────────────────────────────
  const porEstado = ESTADOS.map((e) => {
    const n = filas.filter((f) => f.estado === e).length;
    return { estado: e, label: ESTADO_VISITA_LABEL[e], n, pct: pct(n, total), color: ESTADO_VISITA_COLOR[e] };
  }).filter((e) => e.n > 0);

  const meses = useMemo(() => {
    const [a, m] = hoy.split("-").map(Number);
    const lista: { clave: string; label: string; anio: number; total: number; completadas: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(a, m - 1 - i, 1);
      const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      lista.push({ clave, label: MESES[d.getMonth()], anio: d.getFullYear(), total: 0, completadas: 0 });
    }
    for (const f of filas) {
      const mes = lista.find((x) => x.clave === f.fecha.slice(0, 7));
      if (!mes) continue;
      mes.total++;
      if (f.estado === "COMPLETADA") mes.completadas++;
    }
    return lista;
  }, [filas, hoy]);
  const maxMes = Math.max(1, ...meses.map((m) => m.total));
  const enElAnio = meses.reduce((n, m) => n + m.total, 0);

  const ranking = (claves: string[]) => {
    const cuenta = new Map<string, number>();
    for (const c of claves) cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
    const lista = [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
    const max = Math.max(1, ...lista.map(([, n]) => n));
    return lista.slice(0, 7).map(([nombre, n]) => ({ nombre, n, pct: pct(n, max) }));
  };
  const motivos = ranking(filas.flatMap((f) => f.motivosLista));
  const tecnicos = ranking(filas.flatMap((f) => (f.ayudante ? [f.tecnico, f.ayudante] : [f.tecnico])));
  const malls = ranking(filas.map((f) => f.mall ?? "Sin mall"));

  const visitasPorTienda = useMemo(() => {
    const m = new Map<number, { n: number; ultima: string | null }>();
    for (const f of filas) {
      const t = m.get(f.tiendaId) ?? { n: 0, ultima: null };
      t.n++;
      if (f.estado === "COMPLETADA" && (!t.ultima || f.fecha > t.ultima)) t.ultima = f.fecha;
      m.set(f.tiendaId, t);
    }
    return m;
  }, [filas]);
  const tiendasOrdenadas = useMemo(
    () =>
      [...(tiendas ?? [])].sort(
        (a, b) =>
          Number(b.activo) - Number(a.activo) ||
          (visitasPorTienda.get(b.id)?.n ?? 0) - (visitasPorTienda.get(a.id)?.n ?? 0) ||
          a.nombre.localeCompare(b.nombre, "es")
      ),
    [tiendas, visitasPorTienda]
  );
  const maxTienda = Math.max(1, ...tiendasOrdenadas.map((t) => visitasPorTienda.get(t.id)?.n ?? 0));

  // ── Historial ─────────────────────────────────────────────────────────────
  const anios = [...new Set(filas.map((f) => f.fecha.slice(0, 4)))].sort().reverse();
  const filtradas = useMemo(() => {
    const q = sinTildes(busqueda.trim().toLowerCase());
    return filas.filter(
      (f) =>
        (!fEstado || f.estado === fEstado) &&
        (!fAnio || f.fecha.startsWith(fAnio)) &&
        (!fTienda || String(f.tiendaId) === fTienda) &&
        (!q || sinTildes(`${f.folio} ${f.tienda} ${f.mall ?? ""} ${f.tecnico} ${f.ayudante ?? ""} ${f.motivos}`.toLowerCase()).includes(q))
    );
  }, [filas, busqueda, fEstado, fAnio, fTienda]);

  function verEstado(estado: string) {
    setFEstado(estado);
    historial.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <AdminHeader kicker={kicker} title={titulo}>
        <Tag variant={activo ? "accent" : "neutral"}>{activo ? (esCliente ? "Activo" : "Activa") : esCliente ? "Inactivo" : "Inactiva"}</Tag>
        {acciones?.map((a) => (
          <Link key={a.href} href={a.href} className="btn btn-secondary">
            {a.label}
          </Link>
        ))}
        <Link href={volver.href} className="btn btn-ghost">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
          <span>{volver.label}</span>
        </Link>
      </AdminHeader>

      <div className="pb-10 animate-fade-in">
        <div className="px-4 md:px-7 py-3 text-[13px] opacity-70 border-b border-[var(--color-divider-soft)]">{subtitulo}</div>

        {/* Cifras */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 border-b-2 border-[var(--color-divider)]">
          <Kpi label="Visitas" n={verVisitas ? total : "—"} sub={verVisitas ? `${enElAnio} en los últimos 12 meses` : "Sin permiso para verlas"} />
          <Kpi label="Completadas" n={verVisitas ? `${pct(completadas, total)}%` : "—"} sub={`${completadas} de ${total}`} />
          <Kpi
            label="En espera"
            n={verVisitas ? enEspera : "—"}
            sub={proxima ? `Próxima: ${proxima.fecha} · ${proxima.folio}` : "Nada agendado"}
          />
          <Kpi
            label="Problemas sin resolver"
            n={verVisitas ? problemasAbiertos : "—"}
            sub={`de ${problemas} registrados`}
            color={problemasAbiertos ? "var(--color-accent)" : undefined}
          />
          <Kpi
            label="Última visita hecha"
            n={<span className="text-[24px] md:text-[28px]">{ultima ? ultima.fecha : "—"}</span>}
            sub={ultima ? `hace ${diasEntre(ultima.fecha, hoy)} días · ${ultima.folio}` : "Todavía ninguna"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Datos */}
          <Panel titulo={esCliente ? "Datos del cliente" : "Datos de la tienda"} borde="r">
            <dl className="m-0 mt-2">
              {datos.map((d) => (
                <div key={d.label} className="flex gap-4 py-2.5 border-b border-black/[.1]">
                  <dt className="text-[11px] tracking-[.08em] uppercase opacity-62 w-[150px] flex-none pt-0.5">{d.label}</dt>
                  <dd className="m-0 text-[14px] min-w-0 break-words font-semibold">
                    {d.href ? (
                      <Link href={d.href} className="underline underline-offset-2">
                        {d.valor}
                      </Link>
                    ) : (
                      d.valor
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {notas ? (
              <div className="mt-4 px-3 py-2.5 text-[13px] border-l-[3px] border-[var(--color-divider)] bg-[var(--color-surface)] whitespace-pre-line">
                {notas}
              </div>
            ) : null}
          </Panel>

          {/* Estados */}
          <Panel titulo="Visitas por estado" extra={`${total} visitas`}>
            {porEstado.length ? (
              <>
                <div className="flex h-3.5 mt-4 border border-[var(--color-divider)]">
                  {porEstado.map((e) => (
                    <div key={e.estado} style={{ width: `${e.pct}%`, background: e.color }} className="border-r border-black/[.15]" />
                  ))}
                </div>
                <p className="mt-3 mb-0 text-xs opacity-62">Haz clic en un estado para ver esas visitas abajo.</p>
                <div className="mt-1.5">
                  {porEstado.map((e) => (
                    <button
                      key={e.estado}
                      type="button"
                      onClick={() => verEstado(e.estado)}
                      className="w-full flex items-center gap-2.5 py-2.5 border-b border-black/[.1] hover:bg-black/5 bg-transparent text-left cursor-pointer"
                    >
                      <span className="w-2.5 h-2.5 shrink-0 border border-black/[.35]" style={{ background: e.color }} />
                      <span className="text-[13px]">{e.label}</span>
                      <span className="ml-auto font-extrabold text-sm tabular-nums">{e.n}</span>
                      <span className="w-11 text-right text-xs opacity-62 tabular-nums">{e.pct}%</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <Vacio texto="Todavía no hay visitas." />
            )}
          </Panel>

          {/* Por mes */}
          <GraficoMeses meses={meses} max={maxMes} />

          {/* Motivos */}
          <Panel titulo="Motivos más frecuentes" extra="histórico">
            <Barras filas={motivos} color="var(--color-accent)" vacio="Sin motivos registrados." />
          </Panel>

          {/* Quién va / dónde */}
          {esCliente ? (
            <Panel titulo="Visitas por mall" extra={`${malls.length} ${malls.length === 1 ? "lugar" : "lugares"}`} borde="r">
              <Barras filas={malls} color="var(--color-text)" vacio="Sin visitas todavía." />
            </Panel>
          ) : (
            <Panel titulo="Técnicos que han ido" extra="histórico" borde="r">
              <Barras filas={tecnicos} color="var(--color-text)" vacio="Sin visitas todavía." />
            </Panel>
          )}

          {/* Problemas y tiempo */}
          <Panel titulo="Problemas y tiempo en sitio">
            <div className="grid grid-cols-2 gap-6 mt-3">
              <div>
                <div className="text-[10px] tracking-[.12em] uppercase opacity-66">Problemas registrados</div>
                <div className="flex items-baseline gap-2 mt-2">
                  <div className="font-extrabold text-[44px] leading-none tracking-[-.03em] tabular-nums">{problemas}</div>
                  <div className="text-[13px] opacity-62">en {filas.filter((f) => f.problemas).length} visitas</div>
                </div>
                <div className="h-2 mt-4 bg-[var(--color-neutral-300)]">
                  <div className="h-2 bg-[var(--color-text)]" style={{ width: `${pct(problemas - problemasAbiertos, problemas)}%` }} />
                </div>
                <div className="text-xs opacity-66 mt-1.5">
                  {problemas ? `${pct(problemas - problemasAbiertos, problemas)}% resueltos · ${problemasAbiertos} sin resolver` : "Ninguno"}
                </div>
              </div>
              <div>
                <div className="text-[10px] tracking-[.12em] uppercase opacity-66">Tiempo en sitio</div>
                <div className="flex items-baseline gap-1.5 mt-2">
                  <div className="font-extrabold text-[44px] leading-none tracking-[-.03em] tabular-nums">{minutosProm ?? "—"}</div>
                  <div className="text-[13px] opacity-62">min prom.</div>
                </div>
                <div className="text-xs opacity-66 mt-4">
                  {conTiempo.length ? `Según ${conTiempo.length} actas con hora de inicio y término.` : "Sin actas con hora de término."}
                </div>
              </div>
            </div>
          </Panel>
        </div>

        {/* Tiendas del cliente */}
        {tiendas ? (
          <section className="border-b-2 border-[var(--color-divider)]">
            <Cabecera titulo="Sus tiendas" extra={`${tiendas.filter((t) => t.activo).length} activas de ${tiendas.length}`} />
            {tiendasOrdenadas.length ? (
              <div className="px-4 md:px-7 overflow-x-auto">
                <table className="table min-w-[640px]">
                  <thead>
                    <tr>
                      <th>Tienda</th>
                      <th>Mall</th>
                      <th>Comuna</th>
                      <th style={{ width: 220 }}>Visitas</th>
                      <th>Última hecha</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiendasOrdenadas.map((t) => {
                      const v = visitasPorTienda.get(t.id);
                      return (
                        <tr key={t.id} onClick={() => router.push(`/admin/sucursales/${t.id}`)} className="cursor-pointer hover:bg-black/5">
                          <td className="font-semibold">{t.nombre}</td>
                          <td className="opacity-70">{t.mall ?? "—"}</td>
                          <td className="opacity-70">{t.comuna}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-[var(--color-neutral-300)]">
                                <div className="h-2 bg-[var(--color-text)]" style={{ width: `${pct(v?.n ?? 0, maxTienda)}%` }} />
                              </div>
                              <span className="w-7 text-right font-extrabold text-[13px] tabular-nums">{v?.n ?? 0}</span>
                            </div>
                          </td>
                          <td className="tabular-nums opacity-65 whitespace-nowrap">{v?.ultima ?? "—"}</td>
                          <td>
                            <Tag variant={t.activo ? "accent" : "neutral"}>{t.activo ? "Activa" : "Inactiva"}</Tag>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Vacio texto="Este cliente no tiene tiendas." />
            )}
          </section>
        ) : null}

        {/* Historial */}
        <section ref={historial} className="scroll-mt-24">
          <Cabecera titulo="Historial de visitas" extra={verVisitas ? `${total} en total` : ""} />
          {verVisitas ? (
            <>
              <FiltrosBar
                busqueda={busqueda}
                phBusqueda={esCliente ? "Buscar folio, tienda, mall, técnico…" : "Buscar folio, técnico, motivo…"}
                onBusqueda={setBusqueda}
                campos={[
                  {
                    id: "ff-estado",
                    label: "Estado",
                    valor: fEstado,
                    opciones: [{ v: "", t: "Todos" }, ...ESTADOS.map((e) => ({ v: e, t: ESTADO_VISITA_LABEL[e] }))],
                    onChange: setFEstado,
                  },
                  { id: "ff-anio", label: "Año", valor: fAnio, opciones: [{ v: "", t: "Todos" }, ...anios.map((a) => ({ v: a, t: a }))], onChange: setFAnio },
                  ...(tiendas
                    ? [
                        {
                          id: "ff-tienda",
                          label: "Tienda",
                          valor: fTienda,
                          opciones: [{ v: "", t: "Todas" }, ...tiendasOrdenadas.map((t) => ({ v: String(t.id), t: t.nombre }))],
                          onChange: setFTienda,
                        },
                      ]
                    : []),
                ]}
                chips={[
                  ...(fEstado ? [{ label: ESTADO_VISITA_LABEL[fEstado as EstadoVisita], onQuitar: () => setFEstado("") }] : []),
                  ...(fAnio ? [{ label: `Año ${fAnio}`, onQuitar: () => setFAnio("") }] : []),
                  ...(fTienda
                    ? [{ label: tiendas?.find((t) => String(t.id) === fTienda)?.nombre ?? "Tienda", onQuitar: () => setFTienda("") }]
                    : []),
                ]}
                onLimpiar={() => {
                  setBusqueda("");
                  setFEstado("");
                  setFAnio("");
                  setFTienda("");
                }}
                conteo={`${filtradas.length} ${filtradas.length === 1 ? "visita" : "visitas"}`}
              />
              <div className="px-4 md:px-7 overflow-x-auto">
                <table className="table min-w-[760px]">
                  <thead>
                    <tr>
                      <th>Folio</th>
                      <th>Fecha</th>
                      <th>Hora</th>
                      {esCliente ? <th>Tienda</th> : null}
                      <th>Mall</th>
                      <th>Técnico</th>
                      <th>Motivo</th>
                      <th>Problemas</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((f) => (
                      <tr key={f.id} onClick={() => router.push(`/admin/visitas/${encodeURIComponent(f.folio)}`)} className="cursor-pointer hover:bg-black/5">
                        <td className="font-semibold tabular-nums whitespace-nowrap">{f.folio}</td>
                        <td className="tabular-nums opacity-65 whitespace-nowrap">{textoFechaVisita({ fechaProgramada: f.fecha, fechaHasta: f.fechaHasta })}</td>
                        <td className={`tabular-nums whitespace-nowrap ${f.hora ? "opacity-90" : "opacity-45"}`}>{f.hora ?? "Sin hora"}</td>
                        {esCliente ? <td className="font-semibold">{f.tienda}</td> : null}
                        <td className="opacity-70">{f.mall ?? "—"}</td>
                        <td className="opacity-70">{f.ayudante ? `${f.tecnico} + ${f.ayudante}` : f.tecnico}</td>
                        <td className="opacity-70 max-w-[260px]">{f.motivos}</td>
                        <td className="tabular-nums">
                          {f.problemas ? (
                            <span className={f.problemasAbiertos ? "tag tag-accent" : "tag tag-outline"}>
                              {f.problemasAbiertos ? `${f.problemasAbiertos} sin resolver` : `${f.problemas} resueltos`}
                            </span>
                          ) : (
                            <span className="opacity-45">—</span>
                          )}
                        </td>
                        <td>
                          <Tag variant={ESTADO_VISITA_TAG[f.estado]}>{ESTADO_VISITA_LABEL[f.estado]}</Tag>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtradas.length === 0 ? (
                  <div className="py-14 text-center">
                    <div className="font-extrabold text-[17px] mb-1.5">Nada que mostrar</div>
                    <div className="text-[13px] opacity-66">{total ? "Ajusta la búsqueda o los filtros." : "Todavía no hay visitas registradas."}</div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <Vacio texto="Tu rol no tiene acceso a las visitas." />
          )}
        </section>
      </div>
    </>
  );
}

function Kpi({ label, n, sub, color = "var(--color-text)" }: { label: string; n: React.ReactNode; sub: string; color?: string }) {
  return (
    <div className="px-4 md:px-6 pt-4 md:pt-[22px] pb-4.5 border-r border-b xl:border-b-0 border-black/[.2] min-w-0">
      <div className="text-[10px] tracking-[.12em] uppercase opacity-66">{label}</div>
      <div className="font-extrabold text-[32px] md:text-[40px] leading-none tracking-[-.03em] tabular-nums mt-3" style={{ color }}>
        {n}
      </div>
      <div className="text-xs opacity-66 mt-2.5 truncate">{sub}</div>
    </div>
  );
}

function Panel({
  titulo,
  extra,
  borde,
  children,
}: {
  titulo: string;
  extra?: string;
  /** "r": lleva la línea a la derecha en pantalla ancha (es el de la izquierda). */
  borde?: "r";
  children: React.ReactNode;
}) {
  return (
    <div className={`p-4 md:p-6 border-b border-black/[.12] ${borde === "r" ? "lg:border-r" : ""}`}>
      <div className="flex items-baseline gap-2.5">
        <h2 className="font-extrabold text-[17px] m-0">{titulo}</h2>
        {extra ? <span className="ml-auto text-[11px] tracking-[.08em] uppercase opacity-60">{extra}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Cabecera({ titulo, extra }: { titulo: string; extra?: string }) {
  return (
    <div className="flex items-baseline gap-2.5 px-4 md:px-7 pt-6 pb-3">
      <h2 className="font-extrabold text-[20px] tracking-[-.02em] m-0">{titulo}</h2>
      {extra ? <span className="ml-auto text-[11px] tracking-[.08em] uppercase opacity-60">{extra}</span> : null}
    </div>
  );
}

function Barras({ filas, color, vacio }: { filas: { nombre: string; n: number; pct: number }[]; color: string; vacio: string }) {
  if (!filas.length) return <Vacio texto={vacio} />;
  return (
    <div className="mt-2.5">
      {filas.map((f) => (
        <div key={f.nombre} className="py-2.5 border-b border-black/[.1]">
          <div className="flex items-baseline gap-2.5">
            <span className="text-[13px] min-w-0 truncate">{f.nombre}</span>
            <span className="ml-auto font-extrabold text-sm tabular-nums">{f.n}</span>
          </div>
          <div className="h-2 mt-1.5 bg-[var(--color-neutral-300)]">
            <div className="h-2" style={{ width: `${f.pct}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <div className="px-4 md:px-7 py-6 text-[13px] opacity-66">{texto}</div>;
}

/** Una barra por mes de los últimos 12: el total, y en oscuro lo completado. */
function GraficoMeses({
  meses,
  max,
}: {
  meses: { clave: string; label: string; anio: number; total: number; completadas: number }[];
  max: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const mes = meses.find((m) => m.clave === hover) ?? null;
  const ultimo = meses[meses.length - 1]?.clave;

  return (
    <div className="p-4 md:p-6 border-b border-black/[.12] lg:border-r">
      <div className="flex items-baseline gap-2.5">
        <h2 className="font-extrabold text-[17px] m-0">Visitas por mes</h2>
        <span className="ml-auto text-[11px] tracking-[.08em] uppercase opacity-60">últimos 12 meses</span>
      </div>

      <div
        className="mt-3.5 px-3 py-2.5 text-xs min-h-5 border-l-[3px]"
        style={{
          background: mes ? "var(--color-accent-200)" : "var(--color-surface)",
          borderColor: mes ? "var(--color-accent)" : "var(--color-divider)",
        }}
      >
        {mes
          ? `${mes.label} ${mes.anio} · ${mes.total} ${mes.total === 1 ? "visita" : "visitas"} · ${mes.completadas} completadas`
          : "Pasa el mouse por un mes para ver su detalle."}
      </div>

      <div className="flex items-end gap-1.5 md:gap-2.5 h-[140px] mt-3.5 border-b-2 border-[var(--color-divider)]">
        {meses.map((m) => {
          const activo = hover === m.clave;
          return (
            <div
              key={m.clave}
              onMouseEnter={() => setHover(m.clave)}
              onMouseLeave={() => setHover(null)}
              className="flex-1 flex flex-col justify-end items-stretch h-full"
              style={{ background: activo ? "rgba(32,30,29,.07)" : "transparent" }}
            >
              <div className="text-[10px] font-extrabold text-center tabular-nums mb-1" style={{ opacity: m.total ? (activo ? 1 : 0.55) : 0 }}>
                {m.total}
              </div>
              <div className="flex flex-col justify-end" style={{ height: `${(m.total / max) * 100}%` }}>
                <div style={{ flex: m.total - m.completadas, background: activo ? "var(--color-accent-active)" : "var(--color-accent-400)" }} />
                <div style={{ flex: m.completadas, background: activo ? "var(--color-text)" : "#4a4646" }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 md:gap-2.5 mt-1.5">
        {meses.map((m) => (
          <div
            key={m.clave}
            className="flex-1 text-center text-[10px] tracking-[.04em] uppercase"
            style={{ opacity: hover === m.clave || m.clave === ultimo ? 1 : 0.5, fontWeight: hover === m.clave || m.clave === ultimo ? 800 : 400 }}
          >
            {m.label}
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-3 text-[11px] opacity-75">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-[#4a4646]" /> Completadas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-[var(--color-accent-400)]" /> Otras
        </span>
      </div>
    </div>
  );
}
