"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Tag from "@/components/Tag";
import NuevaVisitaSheet from "@/components/mobile/NuevaVisitaSheet";
import { Toast, useToast } from "@/components/ui/Toast";
import { ESTADO_VISITA_BARRA, ESTADO_VISITA_LABEL, ESTADO_VISITA_TAG, textoMotivos } from "@/lib/ui/estado";
import type { EstadoVisita, Visita } from "@/lib/types";

const ESTADOS: EstadoVisita[] = ["PROGRAMADA", "EN_CURSO", "COMPLETADA", "PENDIENTE", "REAGENDADA", "CANCELADA"];

export default function VisitasList({ visitas, hoy }: { visitas: Visita[]; hoy: string }) {
  const router = useRouter();
  const { toast, aviso } = useToast();
  const [filtroAbierto, setFiltroAbierto] = useState(false);
  const [estado, setEstado] = useState<string>("");
  const [nueva, setNueva] = useState(false);

  const filtradas = useMemo(() => (estado ? visitas.filter((v) => v.estado === estado) : visitas), [visitas, estado]);

  const grupos = useMemo(() => {
    const porFecha = new Map<string, Visita[]>();
    for (const v of filtradas) {
      const arr = porFecha.get(v.fechaProgramada) ?? [];
      arr.push(v);
      porFecha.set(v.fechaProgramada, arr);
    }
    return [...porFecha.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([fecha, items]) => ({
        fecha,
        titulo:
          fecha === hoy
            ? "Hoy"
            : new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "short" }),
        items: items.sort((a, b) => (a.horaProgramada ?? "99:99").localeCompare(b.horaProgramada ?? "99:99")),
      }));
  }, [filtradas, hoy]);

  return (
    <div className="px-4 pt-5 pb-[26px] animate-fade-in">
      <h1 className="font-extrabold text-[28px] leading-[1.06] tracking-[-.03em] m-0 mb-1">Mis visitas</h1>
      <p className="m-0 mb-3.5 text-[13px] opacity-66">asignadas a ti</p>

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
            <div className="text-xs tabular-nums opacity-60">{g.items.length}</div>
          </div>
          <div className="flex flex-col gap-3 mt-3">
            {g.items.map((v) => (
              <button
                key={v.id}
                onClick={() => router.push(`/tecnico/visitas/${v.folio}`)}
                className="block w-full text-left bg-[var(--color-surface)] border border-[var(--color-divider)] px-3.5 pt-3.5 pb-3 hover:bg-[#e2e0e0]"
                style={{ borderLeft: `5px solid ${ESTADO_VISITA_BARRA[v.estado]}` }}
              >
                <div className="flex items-baseline gap-2.5">
                  <span className="font-extrabold text-[19px] tabular-nums">{v.horaProgramada ?? "—"}</span>
                  <span className="text-[11px] tabular-nums tracking-[.06em] opacity-62">{v.folio}</span>
                  <Tag variant={ESTADO_VISITA_TAG[v.estado]} className="ml-auto">
                    {ESTADO_VISITA_LABEL[v.estado]}
                  </Tag>
                </div>
                <div className="font-extrabold text-[17px] leading-[1.2] mt-2.5">{v.sucursal?.nombre}</div>
                <div className="text-[13px] opacity-60 mt-0.5">{v.cliente?.nombreFantasia}</div>
                <div className="text-[13px] opacity-60">{v.sucursal?.direccion}</div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  <span className="tag tag-neutral border border-black/[.2]">{textoMotivos(v)}</span>
                  {v.responsableNombre ? <span className="tag tag-neutral border border-black/[.2]">{v.responsableNombre}</span> : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
      {grupos.length === 0 ? <div className="py-8.5 text-center text-sm opacity-62">No hay visitas con ese estado.</div> : null}

      {nueva ? <NuevaVisitaSheet hoy={hoy} onCerrar={() => setNueva(false)} onError={aviso} /> : null}
      <Toast texto={toast} />
    </div>
  );
}
