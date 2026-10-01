"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Sheet from "./Sheet";
import Tag from "@/components/Tag";
import VisorFotos, { useVisorFotos } from "@/components/ui/VisorFotos";
import {
  ESTADO_PROBLEMA_LABEL,
  ESTADO_PROBLEMA_TAG,
  ESTADO_VISITA_BARRA,
  ESTADO_VISITA_LABEL,
  ESTADO_VISITA_TAG,
  textoMotivos,
  textoMotivosReales,
} from "@/lib/ui/estado";
import { sumarDias } from "@/lib/ui/fecha";
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

/** "2026-08-13T08:30:00" → "08:30". */
function hhmm(iso: string | null | undefined): string {
  return iso ? iso.slice(11, 16) : "—";
}

/** Minutos entre el inicio y el término del acta; null si falta alguno. */
function minutosEnTerreno(v: Visita): number | null {
  const e = v.ejecucion;
  if (!e?.horaInicio || !e.horaTermino) return null;
  const min = Math.round((new Date(e.horaTermino).getTime() - new Date(e.horaInicio).getTime()) / 60_000);
  return Number.isFinite(min) && min >= 0 ? min : null;
}

/** 85 → "1 h 25 min". */
function textoDuracion(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** '2026-10-01' → "jueves, 1 de octubre". */
function fechaLarga(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
}

/** El horario real del acta; si no hay acta, la hora agendada. */
function textoHorario(v: Visita): string {
  const e = v.ejecucion;
  if (e?.horaInicio) return e.horaTermino ? `${hhmm(e.horaInicio)} – ${hhmm(e.horaTermino)}` : hhmm(e.horaInicio);
  return v.horaProgramada ?? "Sin hora";
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** "Mis visitas realizadas" del perfil — ventana móvil de hoy / 7 / 30 días. */
export default function PerfilHistorial({
  visitas,
  hoy,
  tecnicoId,
}: {
  visitas: Visita[];
  hoy: string;
  /** Quien mira: las visitas donde no es el asignado las hizo de ayudante. */
  tecnicoId: number;
}) {
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

  const grupos = useMemo(() => {
    const ayer = sumarDias(hoy, -1);
    const porFecha = new Map<string, Visita[]>();
    for (const v of listadas) {
      const arr = porFecha.get(v.fechaProgramada) ?? [];
      arr.push(v);
      porFecha.set(v.fechaProgramada, arr);
    }
    // `listadas` ya viene de la más nueva a la más vieja, y el Map conserva ese orden.
    return [...porFecha.entries()].map(([fecha, items]) => ({
      fecha,
      titulo: fecha === hoy ? "Hoy" : fecha === ayer ? "Ayer" : fechaLarga(fecha),
      items,
    }));
  }, [listadas, hoy]);

  const resumen = useMemo(() => {
    let minutos = 0;
    let abiertos = 0;
    for (const v of listadas) {
      minutos += minutosEnTerreno(v) ?? 0;
      abiertos += (v.problemas ?? []).filter((p) => p.estado !== "RESUELTO").length;
    }
    return {
      completadas: listadas.filter((v) => v.estado === "COMPLETADA").length,
      minutos,
      abiertos,
    };
  }, [listadas]);

  const cifras: { k: string; v: string; alerta?: boolean }[] = [
    { k: listadas.length === 1 ? "Visita" : "Visitas", v: String(listadas.length) },
    { k: resumen.completadas === 1 ? "Completada" : "Completadas", v: String(resumen.completadas) },
    { k: "En terreno", v: resumen.minutos ? textoDuracion(resumen.minutos) : "—" },
    { k: resumen.abiertos === 1 ? "Problema abierto" : "Problemas abiertos", v: String(resumen.abiertos), alerta: resumen.abiertos > 0 },
  ];

  return (
    <div className="mt-7">
      <div className="flex items-baseline gap-2.5 flex-wrap pb-2 mb-3 border-b-2 border-[var(--color-divider)]">
        <h2 className="font-extrabold text-[19px] leading-[1.15] tracking-[-.02em] m-0">Mis visitas realizadas</h2>
        <span className="text-xs leading-[1.3] opacity-62 ml-auto">{cfg.leyenda}</span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 mb-2.5">
        {FILTROS.map((f) => {
          const activo = filtro === f.c;
          return (
            <button
              key={f.c}
              onClick={() => setFiltro(f.c)}
              aria-pressed={activo}
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

      {/* El período de un vistazo, antes de la lista. */}
      <div className="grid grid-cols-2 gap-1.5 mb-5">
        {cifras.map((c) => (
          <div
            key={c.k}
            className={`px-3 py-2.5 border ${
              c.alerta
                ? "bg-[var(--color-accent-200)] border-[var(--color-accent)] text-[var(--color-accent-800)]"
                : "bg-[var(--color-surface)] border-black/[.2]"
            }`}
          >
            <div className="font-extrabold text-[22px] leading-[1.1] tracking-[-.02em] tabular-nums">{c.v}</div>
            <div className={`text-[10px] tracking-[.09em] uppercase mt-1 ${c.alerta ? "" : "opacity-62"}`}>{c.k}</div>
          </div>
        ))}
      </div>

      {grupos.map((g) => (
        <div key={g.fecha} className="mb-5">
          <div className="flex items-center gap-2 pb-2">
            <div className="font-extrabold text-xs tracking-[.1em] uppercase">{g.titulo}</div>
            <div className="text-xs tabular-nums opacity-60">{g.items.length}</div>
          </div>
          <div className="flex flex-col gap-2.5">
            {g.items.map((v) => {
              const abiertos = (v.problemas ?? []).filter((p) => p.estado !== "RESUELTO");
              const trabajos = v.trabajos?.length ?? 0;
              const fotos = (v.fotos ?? []).filter((f) => !f.interno).length;
              const minutos = minutosEnTerreno(v);
              return (
                <button
                  key={v.id}
                  onClick={() => setAbierta(v)}
                  className="block w-full min-w-0 text-left border border-[var(--color-divider)] bg-[var(--color-surface-3)] px-3.5 pt-3 pb-3 cursor-pointer text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                  style={{ borderLeft: `5px solid ${ESTADO_VISITA_BARRA[v.estado]}` }}
                >
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-extrabold text-[17px] leading-[1.2] tabular-nums">{textoHorario(v)}</span>
                    <span className="text-[11px] tabular-nums tracking-[.06em] opacity-62 truncate">{v.folio}</span>
                    <Tag variant={ESTADO_VISITA_TAG[v.estado]} className="ml-auto flex-none">
                      {ESTADO_VISITA_LABEL[v.estado]}
                    </Tag>
                  </div>
                  <div className="font-extrabold text-[16px] leading-[1.25] mt-2 truncate">{v.sucursal?.nombre}</div>
                  <div className="text-[13px] opacity-66 mt-0.5 truncate">
                    {v.cliente?.nombreFantasia} · {textoMotivos(v)}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {minutos !== null ? (
                      <span className="tag tag-neutral border border-black/[.2] tabular-nums">{textoDuracion(minutos)}</span>
                    ) : null}
                    {trabajos > 0 ? (
                      <span className="tag tag-neutral border border-black/[.2] tabular-nums">
                        {plural(trabajos, "trabajo", "trabajos")}
                      </span>
                    ) : null}
                    {fotos > 0 ? (
                      <span className="tag tag-neutral border border-black/[.2] tabular-nums">{plural(fotos, "foto", "fotos")}</span>
                    ) : null}
                    {v.tecnicoId !== tecnicoId ? <span className="tag tag-dark">Ayudante</span> : null}
                  </div>
                  {abiertos.length > 0 ? (
                    <div className="text-xs text-[var(--color-accent-800)] mt-2.5 px-2.5 py-1.5 bg-[var(--color-accent-200)] border-l-[3px] border-[var(--color-accent)]">
                      {plural(abiertos.length, "problema abierto", "problemas abiertos")}:{" "}
                      {nombreProblema(catalogoProblema, abiertos[0].tipoCodigo)}
                      {abiertos.length > 1 ? ` y ${abiertos.length - 1} más` : ""}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-1.5 mt-2.5 text-[11px] leading-none tracking-[.07em] uppercase opacity-60">
                    <span>Ver detalle</span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {listadas.length === 0 ? (
        <div className="py-6.5 px-4 text-center text-sm opacity-62 border border-dashed border-black/[.3]">
          No hay visitas cerradas en este período.
        </div>
      ) : null}

      {abierta ? <ActaSheet visita={abierta} tecnicoId={tecnicoId} onCerrar={() => setAbierta(null)} /> : null}
    </div>
  );
}

function Seccion({ titulo, cuenta, children }: { titulo: string; cuenta?: number; children: React.ReactNode }) {
  return (
    <div className="pt-5">
      <div className="flex items-center gap-2 pb-2 mb-3 border-b-2 border-[var(--color-divider)]">
        <div className="font-extrabold text-[13px] tracking-[.1em] uppercase">{titulo}</div>
        {cuenta !== undefined ? <div className="text-xs tabular-nums opacity-60">{cuenta}</div> : null}
      </div>
      {children}
    </div>
  );
}

const chip = "px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2] tabular-nums";

function ActaSheet({ visita, tecnicoId, onCerrar }: { visita: Visita; tecnicoId: number; onCerrar: () => void }) {
  const { problemas: catalogoProblema, trabajos: catalogoTrabajo, motivos } = useReferencias();
  const visor = useVisorFotos();
  const ejec = visita.ejecucion;
  const minutos = minutosEnTerreno(visita);
  const nombreMotivo = (codigo: string) => motivos.find((m) => m.codigo === codigo)?.nombre ?? codigo;

  const trabajos = visita.trabajos ?? [];
  const problemas = visita.problemas ?? [];
  // Primero las fotos del trabajo y después las del comentario interno: el
  // visor las recorre en ese orden.
  const fotosTrabajo = (visita.fotos ?? []).filter((f) => !f.interno);
  const fotosInternas = (visita.fotos ?? []).filter((f) => f.interno);
  const fotos = [...fotosTrabajo, ...fotosInternas];
  const videosTrabajo = (visita.videos ?? []).filter((v) => !v.interno);
  const videosInternos = (visita.videos ?? []).filter((v) => v.interno);
  const internos = visita.internos ?? [];
  const firma = visita.firmas?.[0];
  const reagenda = visita.reagendamientos?.[0];
  const esAyudante = visita.tecnicoId !== tecnicoId;

  const direccion = [visita.sucursal?.direccion, visita.sucursal?.comuna]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const recibio = ejec?.responsableNombre
    ? [ejec.responsableNombre, ejec.responsableRut, ejec.responsableTelefono].filter(Boolean).join(" · ")
    : visita.responsableNombre ?? "—";

  const filas: { k: string; v: string }[] = [
    { k: "Folio", v: visita.folio },
    { k: "Cliente", v: visita.cliente?.nombreFantasia ?? "—" },
    ...(direccion ? [{ k: "Dirección", v: direccion }] : []),
    { k: "Motivo", v: textoMotivosReales(visita) },
    { k: "Quién recibió", v: recibio },
    esAyudante
      ? { k: "Técnico a cargo", v: visita.tecnico?.nombreCompleto ?? "—" }
      : { k: "Ayudante", v: visita.tecnicoAyudante?.nombreCompleto ?? "Sin ayudante" },
  ];

  return (
    <>
      <Sheet titulo={visita.sucursal?.nombre ?? "Visita"} eyebrow="Visita realizada" onClose={onCerrar}>
        <div className="px-4 pt-4 pb-6">
          {/* Cuándo y cuánto: lo primero que se busca al abrir una visita vieja. */}
          <div className="bg-[var(--color-text)] text-[var(--color-bg)] px-4 py-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[11px] tracking-[.09em] uppercase opacity-75">
                {fechaLarga(visita.fechaProgramada)}
              </div>
              <Tag variant={visita.estado === "COMPLETADA" ? "neutral" : "accent"} className="ml-auto">
                {ESTADO_VISITA_LABEL[visita.estado]}
              </Tag>
            </div>
            <div className="font-extrabold text-[28px] leading-[1.1] tracking-[-.02em] tabular-nums mt-2">
              {textoHorario(visita)}
            </div>
            <div className="text-[13px] opacity-75 mt-1">
              {minutos !== null
                ? `${textoDuracion(minutos)} en terreno`
                : ejec?.horaInicio
                  ? "Sin hora de término registrada"
                  : "Sin registro de horas"}
              {esAyudante ? " · fuiste de ayudante" : ""}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 mt-1.5">
            {[
              { k: trabajos.length === 1 ? "Trabajo" : "Trabajos", v: trabajos.length },
              { k: problemas.length === 1 ? "Problema" : "Problemas", v: problemas.length },
              { k: fotosTrabajo.length === 1 ? "Foto" : "Fotos", v: fotosTrabajo.length },
            ].map((c) => (
              <div key={c.k} className="px-3 py-2.5 bg-[var(--color-surface)] border border-black/[.2]">
                <div className="font-extrabold text-[20px] leading-[1.1] tabular-nums">{c.v}</div>
                <div className="text-[10px] tracking-[.09em] uppercase opacity-62 mt-1">{c.k}</div>
              </div>
            ))}
          </div>

          {visita.motivoPendiente ? (
            <div className="mt-3 p-3.5 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)]">
              <div className="text-[10px] tracking-[.12em] uppercase text-[var(--color-accent-800)] mb-1.5">Quedó pendiente</div>
              <div className="text-sm leading-[1.5] text-[var(--color-accent-800)]">{visita.motivoPendiente}</div>
            </div>
          ) : null}

          {reagenda ? (
            <div className="mt-3 p-3.5 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)]">
              <div className="text-[10px] tracking-[.12em] uppercase opacity-62 mb-1.5">Reagendada</div>
              <div className="text-sm leading-[1.5]">
                <span className="tabular-nums">
                  Antes {reagenda.fechaAnterior}
                  {reagenda.horaAnterior ? ` · ${reagenda.horaAnterior}` : ""}
                  {reagenda.fechaNueva ? ` → ${reagenda.fechaNueva}${reagenda.horaNueva ? ` · ${reagenda.horaNueva}` : ""}` : ""}
                </span>
                <br />
                {reagenda.motivo}
              </div>
            </div>
          ) : null}

          <div className="mt-3 border border-[var(--color-divider)] bg-[var(--color-surface-3)] px-3.5">
            {filas.map((f, i) => (
              <div key={f.k} className={`flex gap-3 py-3 ${i > 0 ? "border-t border-black/[.15]" : ""}`}>
                <div className="text-[10px] leading-[1.6] tracking-[.09em] uppercase opacity-62 w-[96px] flex-none">{f.k}</div>
                <div className="text-sm min-w-0">{f.v}</div>
              </div>
            ))}
          </div>

          {visita.trabajoSolicitado ? (
            <Seccion titulo="Qué se pidió">
              <div className="text-sm leading-[1.55]">{visita.trabajoSolicitado}</div>
            </Seccion>
          ) : null}

          <Seccion titulo="Trabajo realizado" cuenta={trabajos.length}>
            {trabajos.length === 0 ? (
              <div className="text-sm opacity-70">No quedó trabajo registrado en esta visita.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {trabajos.map((t, i) => (
                  <div key={t.id} className="flex gap-3 px-3 py-3 bg-[var(--color-surface-3)] border border-black/[.2]">
                    <div className="font-extrabold text-[13px] leading-[1.45] tabular-nums opacity-45 flex-none">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="min-w-0">
                      {t.motivoCodigo ? (
                        <div className="text-[10px] tracking-[.1em] uppercase opacity-62">{nombreMotivo(t.motivoCodigo)}</div>
                      ) : null}
                      <div className="font-extrabold text-[15px] leading-[1.25]">
                        {nombreTrabajo(catalogoTrabajo, t.trabajoCodigo)}
                      </div>
                      {t.subtrabajos.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {t.subtrabajos.map((s) => (
                            <span key={s.id} className={chip}>
                              {s.etiqueta}
                              {s.cantidad > 1 ? ` × ${s.cantidad}` : ""}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {t.detalle ? <div className="text-sm leading-[1.5] opacity-80 mt-2">{t.detalle}</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {ejec?.observaciones ? (
              <div className="mt-3 px-3.5 py-3 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)]">
                <div className="text-[10px] tracking-[.1em] uppercase opacity-62 mb-1.5">Observación escrita</div>
                <div className="text-sm leading-[1.5]">{ejec.observaciones}</div>
              </div>
            ) : null}
          </Seccion>

          <Seccion titulo="Problemas levantados" cuenta={problemas.length}>
            {problemas.length === 0 ? (
              <div className="text-sm opacity-70">No se levantaron problemas en esta visita.</div>
            ) : (
              <div className="flex flex-col gap-2">
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
                    {p.items.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {p.items.map((it) => (
                          <span key={it.id} className={chip}>
                            {it.etiqueta} × {it.cantidad}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {p.descripcion ? (
                      <div className="text-[13px] leading-[1.5] text-[var(--color-accent-800)] mt-2">{p.descripcion}</div>
                    ) : null}
                    {p.solucion ? (
                      <div className="text-[13px] leading-[1.5] text-[var(--color-accent-800)] mt-2 pt-2 border-t border-black/[.15]">
                        <b>{p.estado === "RESUELTO" ? "Se realizó: " : "Sugerido: "}</b>
                        {p.solucion}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Seccion>

          <Seccion titulo="Fotos y videos" cuenta={fotosTrabajo.length + videosTrabajo.length}>
            {fotosTrabajo.length === 0 && videosTrabajo.length === 0 ? (
              <div className="text-sm opacity-70">No se tomaron fotos ni videos en esta visita.</div>
            ) : null}
            {fotosTrabajo.length > 0 ? (
              <div className="grid grid-cols-3 gap-1.5">
                {fotosTrabajo.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => visor.abrir(i)}
                    aria-label={`Ver la foto ${i + 1} en grande`}
                    className="relative aspect-square p-0 border border-black/[.3] overflow-hidden bg-[var(--color-neutral-300)] cursor-zoom-in"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.archivoUrl}
                      alt={f.etiqueta ?? "Foto del trabajo"}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            ) : null}
            {videosTrabajo.map((v) => (
              <video
                key={v.id}
                src={v.archivoUrl}
                controls
                preload="metadata"
                playsInline
                className="w-full aspect-video bg-black object-contain mt-2"
              />
            ))}
          </Seccion>

          {/* Comentario interno: lo ve coordinación, no el cliente ni el PDF. */}
          {ejec?.comentarioInterno || internos.length || fotosInternas.length || videosInternos.length ? (
            <Seccion titulo="Comentario interno">
              <div className="px-3 py-3 bg-[var(--color-surface)] border-l-[3px] border-[var(--color-text)]">
                <div className="text-[10px] tracking-[.1em] uppercase opacity-62">No lo ve el cliente</div>
                {internos.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {internos.map((x) => (
                      <span key={x.codigo} className={chip}>
                        {x.nombre}
                      </span>
                    ))}
                  </div>
                ) : null}
                {ejec?.comentarioInterno ? <div className="text-sm leading-[1.5] mt-2">{ejec.comentarioInterno}</div> : null}
                {fotosInternas.length > 0 ? (
                  <div className="grid grid-cols-4 gap-1.5 mt-2.5">
                    {fotosInternas.map((f, i) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => visor.abrir(fotosTrabajo.length + i)}
                        aria-label="Ver la foto interna en grande"
                        className="relative aspect-square p-0 border border-black/[.3] overflow-hidden cursor-zoom-in"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.archivoUrl} alt="Foto interna" className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                ) : null}
                {videosInternos.map((v) => (
                  <video
                    key={v.id}
                    src={v.archivoUrl}
                    controls
                    preload="metadata"
                    playsInline
                    className="w-full aspect-video bg-black object-contain mt-2.5"
                  />
                ))}
              </div>
            </Seccion>
          ) : null}

          <Seccion titulo="Firma de la tienda">
            {firma ? (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={firma.imagenUrl}
                  alt={`Firma de ${firma.nombre}`}
                  className="w-full max-w-[260px] h-[70px] object-contain object-left-bottom"
                />
                <div className="h-px bg-[var(--color-text)] mt-1" />
                <div className="text-xs mt-1.5">
                  {firma.nombre}
                  {firma.rut ? ` · ${firma.rut}` : ""}
                </div>
                <div className="text-[10px] tracking-[.09em] uppercase opacity-62">
                  Firmó a las {hhmm(firma.firmadoEn)}
                </div>
              </div>
            ) : (
              <div className="text-sm opacity-70">Esta visita no quedó firmada.</div>
            )}
          </Seccion>

          {ejec?.registradoOffline ? (
            <div className="mt-5 px-3.5 py-2.5 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)] text-[13px] leading-[1.45]">
              Se llenó sin señal y se sincronizó
              {ejec.sincronizadoEn ? ` el ${ejec.sincronizadoEn.slice(0, 16).replace("T", " a las ")}` : " al recuperar cobertura"}.
            </div>
          ) : null}

          <div className="flex flex-col gap-2.5 mt-6">
            {visita.estado === "COMPLETADA" ? (
              <a
                href={`/api/visita/acta/${encodeURIComponent(visita.folio)}`}
                download={`Acta ${visita.folio}.pdf`}
                className="w-full min-h-[52px] flex items-center justify-between px-4 bg-[var(--color-accent)] text-[var(--color-bg)] font-extrabold text-sm hover:bg-[var(--color-accent-hover)]"
              >
                <span>Descargar acta en PDF</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 4v11M7 11l5 5 5-5M4 20h16" />
                </svg>
              </a>
            ) : null}
            <Link
              href={`/tecnico/visitas/${encodeURIComponent(visita.folio)}`}
              className="w-full min-h-[50px] flex items-center justify-between px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm hover:bg-black/[.07]"
            >
              <span>Abrir la visita</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>

          <p className="mt-3.5 mb-0 text-xs opacity-62">Solo lectura: el acta ya fue enviada a coordinación.</p>
        </div>
      </Sheet>

      {visor.abierto ? (
        <VisorFotos
          fotos={fotos.map((f, i) => ({
            src: f.archivoUrl,
            titulo: f.interno ? "Foto interna" : f.etiqueta ?? `Foto ${i + 1}`,
            subtitulo: `${visita.folio} · ${hhmm(f.tomadaEn)}`,
          }))}
          indice={visor.indice ?? 0}
          onIndice={visor.mover}
          onCerrar={visor.cerrar}
        />
      ) : null}
    </>
  );
}
