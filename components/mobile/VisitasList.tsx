"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Tag from "@/components/Tag";
import NuevaVisitaSheet from "@/components/mobile/NuevaVisitaSheet";
import { Toast, useToast } from "@/components/ui/Toast";
import { ESTADO_VISITA_BARRA, ESTADO_VISITA_LABEL, ESTADO_VISITA_TAG, textoMotivos } from "@/lib/ui/estado";
import { actasEnCola, haceCuanto, sacarDeCola, type ActaEnCola } from "@/lib/ui/borrador";
import { estaCancelada } from "@/lib/ui/estado";
import { diaDeVisita } from "@/lib/ui/fecha";
import { useReferencias } from "@/lib/ui/referencias";
import type { EstadoVisita, Mall, Visita } from "@/lib/types";

const ESTADOS: EstadoVisita[] = [
  "PROGRAMADA",
  "EN_CURSO",
  "COMPLETADA",
  "PENDIENTE",
  "REAGENDADA",
  "CANCELADA",
  "CANCELADA_ADMIN",
];

/** '2026-10-05' → "5 oct". */
function diaCorto(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

export default function VisitasList({
  visitas,
  hoy,
  tecnicoId,
}: {
  visitas: Visita[];
  hoy: string;
  /** Quien mira: las visitas donde no es el asignado las tiene de ayudante. */
  tecnicoId: number;
}) {
  const router = useRouter();
  const { toast, aviso } = useToast();
  const [filtroAbierto, setFiltroAbierto] = useState(false);
  const [estado, setEstado] = useState<string>("");
  const [nueva, setNueva] = useState(false);
  const ref = useReferencias();
  /** Los malls desplegados, como "<fecha>-<mall>": nacen plegados. */
  const [abiertos, setAbiertos] = useState<string[]>([]);
  /** Actas terminadas que quedaron esperando señal en este celular. */
  const [pendientes, setPendientes] = useState<ActaEnCola[]>([]);

  // Solo en el navegador: la cola vive en el almacenamiento del equipo.
  //
  // De paso se descarta la de las visitas que el servidor ya da por cerradas:
  // pasa cuando el acta llegó pero la respuesta se perdió en el camino, y sin
  // esto el aviso quedaría para siempre pidiendo enviar algo ya enviado.
  useEffect(() => {
    const cerradas = new Set(
      // Una visita que administración cerró desde el panel también da por
      // cerrada el acta que este celular tenía en cola: ya no hay dónde
      // guardarla y el aviso quedaría pidiendo enviar algo que no se acepta.
      visitas.filter((v) => v.estado === "COMPLETADA" || estaCancelada(v.estado)).map((v) => v.folio)
    );
    const cola = actasEnCola();
    for (const acta of cola) {
      if (cerradas.has(acta.folio)) sacarDeCola(acta.folio);
    }
    setPendientes(cola.filter((a) => !cerradas.has(a.folio)));
  }, [visitas]);

  const filtradas = useMemo(() => (estado ? visitas.filter((v) => v.estado === estado) : visitas), [visitas, estado]);

  const grupos = useMemo(() => {
    const porFecha = new Map<string, Visita[]>();
    for (const v of filtradas) {
      // Con margen de días y sin cerrar, la visita se va corriendo a «Hoy».
      const dia = diaDeVisita(v, hoy);
      const arr = porFecha.get(dia) ?? [];
      arr.push(v);
      porFecha.set(dia, arr);
    }
    return [...porFecha.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([fecha, items]) => ({
        fecha,
        titulo:
          fecha === hoy
            ? "Hoy"
            : new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "short" }),
        n: items.length,
        bloques: enBloques(
          items.sort((a, b) => (a.horaProgramada ?? "99:99").localeCompare(b.horaProgramada ?? "99:99"))
        ),
      }));

    // Las tiendas de un mismo mall van juntas en un bloque desplegable, puesto
    // donde cae su primera visita del día; las demás quedan sueltas.
    function enBloques(items: Visita[]): { mall: Mall | null; visitas: Visita[] }[] {
      const bloques: { mall: Mall | null; visitas: Visita[] }[] = [];
      for (const v of items) {
        const mallId = ref.sucursales.find((s) => s.id === v.sucursalId)?.mallId;
        const mall = (mallId && ref.malls.find((m) => m.id === mallId)) || null;
        const bloque = mall ? bloques.find((b) => b.mall?.id === mall.id) : undefined;
        if (bloque) bloque.visitas.push(v);
        else bloques.push({ mall, visitas: [v] });
      }
      return bloques;
    }
  }, [filtradas, hoy, ref.sucursales, ref.malls]);

  const tarjeta = (v: Visita) => (
    <button
      key={v.id}
      onClick={() => router.push(`/tecnico/visitas/${v.folio}`)}
      className="block w-full min-w-0 text-left bg-[var(--color-surface)] border border-[var(--color-divider)] px-3.5 pt-3.5 pb-3 hover:bg-[#e2e0e0]"
      style={{ borderLeft: `5px solid ${ESTADO_VISITA_BARRA[v.estado]}` }}
    >
      <div className="flex items-baseline gap-2.5">
        <span className="font-extrabold text-[19px] tabular-nums">{v.horaProgramada ?? "—"}</span>
        <span className="text-[11px] tabular-nums tracking-[.06em] opacity-62">{v.folio}</span>
        <Tag variant={ESTADO_VISITA_TAG[v.estado]} className="ml-auto">
          {ESTADO_VISITA_LABEL[v.estado]}
        </Tag>
      </div>
      <div className="font-extrabold text-[17px] leading-[1.2] mt-2.5 truncate">{v.sucursal?.nombre}</div>
      <div className="text-[13px] opacity-60 mt-0.5 truncate">{v.cliente?.nombreFantasia}</div>
      <div className="text-[13px] opacity-60 truncate">{v.sucursal?.direccion}</div>
      {/* Todo en una línea y cortado con "…": un motivo largo ya no
          agranda la tarjeta y la lista queda pareja. */}
      <div className="flex gap-1.5 mt-2.5 min-w-0">
        <span className="tag tag-neutral border border-black/[.2] min-w-0 max-w-full">
          <span className="truncate">{textoMotivos(v)}</span>
        </span>
        {v.fechaHasta ? (
          <span className="tag tag-accent flex-none tabular-nums">Hasta {diaCorto(v.fechaHasta)}</span>
        ) : null}
        {v.tecnicoId !== tecnicoId ? (
          <span className="tag tag-dark flex-none">Ayudante</span>
        ) : v.tecnicoAyudante ? (
          <span className="tag tag-neutral border border-black/[.2] min-w-0 flex-none max-w-[45%]">
            <span className="truncate">+ {v.tecnicoAyudante.nombreCompleto}</span>
          </span>
        ) : null}
        {v.responsableNombre ? (
          <span className="tag tag-neutral border border-black/[.2] min-w-0 flex-none max-w-[45%]">
            <span className="truncate">{v.responsableNombre}</span>
          </span>
        ) : null}
      </div>
    </button>
  );

  return (
    <div className="px-4 pt-5 pb-[26px] animate-fade-in">
      <h1 className="font-extrabold text-[28px] leading-[1.06] tracking-[-.03em] m-0 mb-1">Mis visitas</h1>
      <p className="m-0 mb-3.5 text-[13px] opacity-66">asignadas a ti y en las que vas de ayudante</p>

      {/* Actas que se llenaron sin señal: hay que entrar a la visita para que se
          manden. Se avisa acá porque en la lista la visita se ve "en curso" y
          nada delataba que el acta ya estaba lista y guardada en el equipo. */}
      {pendientes.length > 0 ? (
        <div className="mb-4 px-3.5 py-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)]">
          <div className="text-[10px] tracking-[.12em] uppercase text-[var(--color-accent-800)]">
            {pendientes.length === 1 ? "Un acta espera señal" : `${pendientes.length} actas esperan señal`}
          </div>
          <div className="text-[13px] leading-[1.45] text-[var(--color-accent-800)] mt-1.5">
            Están completas y guardadas en este celular. Abre la visita y se manda sola; no hay que llenarla de nuevo.
          </div>
          <div className="flex flex-col gap-1.5 mt-2.5">
            {pendientes.map((a) => (
              <button
                key={a.folio}
                onClick={() => router.push(`/tecnico/visitas/${a.folio}/formulario`)}
                className="w-full min-h-[44px] flex items-center gap-2 px-3 bg-[var(--color-bg)] border border-[var(--color-accent)] text-[var(--color-accent-800)] font-extrabold text-[13px] cursor-pointer text-left"
              >
                <span className="tabular-nums">{a.folio}</span>
                <span className="font-normal opacity-70">· cerrada {haceCuanto(a.capturadaEn)}</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  className="ml-auto flex-none"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex gap-2 items-center mb-3.5">
        <button onClick={() => setFiltroAbierto((v) => !v)} className={`tag ${estado ? "tag-accent" : "tag-neutral"} min-h-[34px] border border-[var(--color-divider)] cursor-pointer gap-1.5 px-3 uppercase text-[11px] tracking-[.08em]`}>
          <span>Filtrar por estado</span>
        </button>
        {estado ? (
          <button onClick={() => setEstado("")} className="tag tag-accent min-h-[34px] border-0 cursor-pointer gap-1.5 px-2.5 text-[11px] tracking-[.06em]">
            <span>{ESTADO_VISITA_LABEL[estado as EstadoVisita]}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ) : null}
        <button
          onClick={() => setNueva(true)}
          aria-label="Agregar visita"
          className="ml-auto w-[34px] h-[34px] flex-none grid place-items-center bg-[var(--color-accent)] text-[var(--color-bg)] border-0 cursor-pointer hover:bg-[var(--color-accent-hover)]"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {filtroAbierto ? (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 mb-4.5">
          {ESTADOS.map((e) => (
            <button
              key={e}
              onClick={() => {
                setEstado(e);
                setFiltroAbierto(false);
              }}
              className={`tag ${estado === e ? "tag-accent" : "tag-neutral"} flex-none min-h-[34px] border border-[var(--color-divider)] cursor-pointer uppercase text-[11px] tracking-[.08em] px-3`}
            >
              {ESTADO_VISITA_LABEL[e]}
            </button>
          ))}
        </div>
      ) : null}

      {grupos.map((g) => (
        <div key={g.fecha} className="mb-6">
          <div className="flex items-center gap-2 pb-2 border-b-2 border-[var(--color-divider)]">
            <div className="font-extrabold text-xs tracking-[.1em] uppercase capitalize">{g.titulo}</div>
            <div className="text-xs tabular-nums opacity-60">{g.n}</div>
          </div>
          <div className="flex flex-col gap-3 mt-3">
            {g.bloques.map((b) => {
              if (!b.mall) return tarjeta(b.visitas[0]);
              const clave = `${g.fecha}-${b.mall.id}`;
              const abierto = abiertos.includes(clave);
              const porHacer = b.visitas.filter(
                (v) => v.estado === "PROGRAMADA" || v.estado === "EN_CURSO" || v.estado === "PENDIENTE"
              ).length;
              return (
                <div
                  key={clave}
                  className="border border-[var(--color-divider)] border-l-[5px] border-l-[var(--color-accent)] bg-[var(--color-surface)]"
                >
                  <button
                    type="button"
                    aria-expanded={abierto}
                    onClick={() => setAbiertos((prev) => (abierto ? prev.filter((k) => k !== clave) : [...prev, clave]))}
                    className="w-full min-h-[64px] flex items-center gap-3 px-3.5 py-3 bg-transparent border-0 cursor-pointer text-[var(--color-text)] text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-extrabold text-[17px] leading-[1.2] truncate">{b.mall.nombre}</div>
                      <div className="text-[13px] opacity-60 mt-0.5 truncate">{b.mall.direccion}</div>
                      <div className="text-[11px] tracking-[.06em] uppercase opacity-66 mt-1.5 tabular-nums">
                        {b.visitas.length} {b.visitas.length === 1 ? "visita" : "visitas"}
                        {porHacer > 0 ? ` · ${porHacer} por hacer` : " · todas cerradas"}
                      </div>
                    </div>
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      className="flex-none transition-transform"
                      style={{ transform: `rotate(${abierto ? 180 : 0}deg)` }}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {abierto ? (
                    <div className="flex flex-col gap-2.5 px-2.5 pb-2.5 pt-2.5 border-t border-[var(--color-divider-soft)] bg-[var(--color-bg)]">
                      {b.visitas.map(tarjeta)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {grupos.length === 0 ? <div className="py-8.5 text-center text-sm opacity-62">No hay visitas con ese estado.</div> : null}

      {nueva ? <NuevaVisitaSheet hoy={hoy} tecnicoId={tecnicoId} onCerrar={() => setNueva(false)} onError={aviso} /> : null}
      <Toast texto={toast} />
    </div>
  );
}
