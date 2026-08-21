"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Sheet from "./Sheet";
import Tag from "@/components/Tag";
import { Toast, useToast } from "./toast";
import { cambiarEstadoVisitaAction, iniciarVisitaAction } from "@/app/actions/visitas";
import { ESTADO_VISITA_LABEL, ESTADO_VISITA_TAG } from "@/lib/ui/estado";
import { urlMapa, urlTel } from "@/lib/ui/formato";
import type { HistorialVista } from "@/lib/mock/historial";
import type { EstadoVisita, Visita } from "@/lib/types";

type AccionEstado = "reagendar" | "pendiente" | "cancelar";

const SHEETS: Record<
  AccionEstado,
  { titulo: string; ayuda: string; pideFecha: boolean; labelMotivo: string; ph: string; cta: string; estado: EstadoVisita }
> = {
  reagendar: {
    titulo: "Reagendar visita",
    ayuda: "Queda registrada la fecha anterior y el motivo; coordinación lo ve al instante.",
    pideFecha: true,
    labelMotivo: "Motivo del reagendamiento",
    ph: "La tienda está en inventario y no puede parar el acceso.",
    cta: "Confirmar reagendamiento",
    estado: "REAGENDADA",
  },
  pendiente: {
    titulo: "No se pudo realizar",
    ayuda: "La visita queda PENDIENTE y vuelve a tu lista hasta cerrarla.",
    pideFecha: false,
    labelMotivo: "Motivo pendiente",
    ph: "Falta repuesto: tarjeta electrónica del pórtico 2.",
    cta: "Dejar pendiente",
    estado: "PENDIENTE",
  },
  cancelar: {
    titulo: "Cancelar la visita",
    ayuda: "Se cancela y no se puede volver atrás desde el celular.",
    pideFecha: false,
    labelMotivo: "Motivo de la cancelación",
    ph: "Tienda cerrada por corte de energía del mall.",
    cta: "Cancelar visita",
    estado: "CANCELADA",
  },
};

export default function DetalleVisita({ visita, historial }: { visita: Visita; historial: HistorialVista }) {
  const router = useRouter();
  const { toast, aviso } = useToast();
  const [pendiente, startTransition] = useTransition();

  const [openDatos, setOpenDatos] = useState(false);
  const [openHistorial, setOpenHistorial] = useState(false);
  const [openAcciones, setOpenAcciones] = useState(false);
  const [sheet, setSheet] = useState<AccionEstado | null>(null);
  const [motivo, setMotivo] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");

  const abierta = visita.estado === "PROGRAMADA" || visita.estado === "EN_CURSO";
  const cerradaConActa = visita.estado === "COMPLETADA" || visita.estado === "PENDIENTE";
  const reagenda = visita.reagendamientos?.[0];

  const filas: { k: string; v: string }[] = [
    { k: "Hora", v: visita.horaProgramada ?? "Sin hora" },
    { k: "Dirección", v: `${visita.sucursal?.direccion}, ${visita.sucursal?.comuna}` },
    { k: "Responsable", v: `${visita.responsableNombre ?? "—"} · ${visita.responsableTelefono ?? "—"}` },
    { k: "Motivo", v: visita.motivo?.nombre ?? "—" },
    { k: "Estado", v: ESTADO_VISITA_LABEL[visita.estado] },
    { k: "Fecha", v: visita.fechaProgramada },
  ];
  if (visita.indicacionesAcceso) filas.push({ k: "Acceso", v: visita.indicacionesAcceso });
  if (reagenda) {
    filas.push({
      k: "Reagendada",
      v: `Antes ${reagenda.fechaAnterior}${reagenda.horaAnterior ? " · " + reagenda.horaAnterior : ""} — ${reagenda.motivo}`,
    });
  }

  function iniciar() {
    startTransition(async () => {
      const r = await iniciarVisitaAction(visita.folio);
      if (!r.ok) return aviso(r.error ?? "No se pudo iniciar la visita");
      router.push(`/tecnico/visitas/${visita.folio}/formulario`);
    });
  }

  function abrirSheet(a: AccionEstado) {
    setMotivo("");
    setHora("");
    setFecha(a === "reagendar" ? visita.fechaProgramada : "");
    setSheet(a);
  }

  function confirmarEstado() {
    if (!sheet) return;
    const cfg = SHEETS[sheet];
    if (!motivo.trim()) return aviso("El motivo es obligatorio");
    if (cfg.pideFecha && !fecha) return aviso("Elige la nueva fecha");
    startTransition(async () => {
      const r = await cambiarEstadoVisitaAction({
        folio: visita.folio,
        estado: cfg.estado as "REAGENDADA" | "PENDIENTE" | "CANCELADA",
        motivo,
        fechaNueva: cfg.pideFecha ? fecha : null,
        horaNueva: cfg.pideFecha ? hora || null : null,
      });
      if (!r.ok) return aviso(r.error ?? "No se pudo guardar el cambio");
      setSheet(null);
      router.push("/tecnico/visitas");
      router.refresh();
    });
  }

  const cfg = sheet ? SHEETS[sheet] : null;

  return (
    <div className="animate-fade-in">
      <div className="px-4 pt-5">
        <div className="flex items-center gap-2.5">
          <div className="text-xs tabular-nums tracking-[.08em] opacity-66">{visita.folio}</div>
          <Tag variant={ESTADO_VISITA_TAG[visita.estado]}>{ESTADO_VISITA_LABEL[visita.estado]}</Tag>
        </div>
        <h1 className="font-extrabold text-[30px] leading-[1.06] tracking-[-.03em] mt-2.5 mb-0.5">{visita.sucursal?.nombre}</h1>
        <div className="text-sm opacity-60">{visita.cliente?.nombreFantasia}</div>
        <div className="h-0.5 bg-[var(--color-divider)] mt-4" />
      </div>

      <div className="px-4">
        {/* ── Datos de la visita (desplegable) ── */}
        <button
          onClick={() => setOpenDatos((v) => !v)}
          aria-expanded={openDatos}
          className="w-full min-h-[54px] flex items-center gap-2.5 p-0 bg-transparent border-0 border-b border-black/[.25] cursor-pointer text-[var(--color-text)] text-left hover:opacity-75"
        >
          <span className="font-extrabold text-[13px] tracking-[.1em] uppercase flex-1">Datos de la visita</span>
          <span className="text-xs tabular-nums opacity-66">{visita.horaProgramada ?? "Sin hora"}</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            className="transition-transform duration-150"
            style={{ transform: openDatos ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {openDatos ? (
          <div className="flex flex-col">
            {filas.map((f) => (
              <div key={f.k} className="flex gap-3 py-3.5 border-b border-black/[.25]">
                <div className="text-[10px] leading-[1.6] tracking-[.09em] uppercase opacity-62 min-w-[96px] flex-none">{f.k}</div>
                <div className="text-sm min-w-0">{f.v}</div>
              </div>
            ))}
          </div>
        ) : null}

        {/* ── Ruta y llamada ── */}
        <div className="flex gap-2.5 mt-4">
          <a
            href={urlMapa(visita.sucursal?.nombre, visita.sucursal?.direccion, visita.sucursal?.comuna)}
            target="_blank"
            rel="noreferrer"
            className="flex-1 min-h-[50px] flex items-center gap-2 px-3.5 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-[13px] hover:bg-black/[.07]"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1116 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>Ruta</span>
          </a>
          <a
            href={urlTel(visita.responsableTelefono)}
            className="flex-1 min-h-[50px] flex items-center gap-2 px-3.5 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-[13px] hover:bg-black/[.07]"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 4h4l2 5-3 2a12 12 0 005 5l2-3 5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z" />
            </svg>
            <span>Llamar</span>
          </a>
        </div>

        {/* ── Qué hay que hacer ── */}
        {visita.trabajoSolicitado ? (
          <div className="mt-4 px-4 pt-4 pb-4.5 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)]">
            <div className="font-extrabold text-[13px] tracking-[.1em] uppercase mb-2.5">Qué hay que hacer</div>
            <div className="text-base leading-[1.55]">{visita.trabajoSolicitado}</div>
          </div>
        ) : null}

        {/* ── Última visita al local (desplegable) ── */}
        <div className="mt-3 border border-black/[.35] bg-[var(--color-surface-3)]">
          <button
            onClick={() => setOpenHistorial((v) => !v)}
            aria-expanded={openHistorial}
            className="w-full min-h-[54px] flex items-center gap-2.5 flex-wrap px-3.5 bg-transparent border-0 cursor-pointer text-[var(--color-text)] text-left hover:bg-black/[.04]"
            style={{ borderBottom: openHistorial ? "1px solid rgba(32,30,29,.25)" : "0" }}
          >
            <span className="font-extrabold text-[13px] tracking-[.1em] uppercase flex-1">Última visita al local</span>
            <span className="text-xs tabular-nums opacity-66">{historial.encabezado}</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              className="transition-transform duration-150"
              style={{ transform: openHistorial ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {openHistorial ? (
            <div className="px-3.5 pt-3.5 pb-4">
              {!historial.hay ? (
                <div className="text-sm opacity-70">Primera visita registrada a este local: no hay historial previo.</div>
              ) : (
                <div className="flex flex-col gap-3.5">
                  <div>
                    <div className="text-[10px] tracking-[.1em] uppercase opacity-62 mb-2">Trabajo realizado</div>
                    <div className="flex flex-wrap gap-1.5">
                      {historial.trabajos.map((t) => (
                        <span key={t} className="px-2.5 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2]">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  {historial.obs ? <div className="text-sm leading-[1.5] opacity-80">{historial.obs}</div> : null}
                  <div>
                    <div className="text-[10px] tracking-[.1em] uppercase opacity-62 mb-2">Problemas que quedaron abiertos</div>
                    {historial.sinProblemas ? (
                      <div className="text-sm opacity-70">El local quedó sin problemas abiertos.</div>
                    ) : (
                      <div className="flex flex-col gap-2.5">
                        {historial.problemas.map((p) => (
                          <div key={p.tipo} className="px-3 py-3 bg-[var(--color-accent-200)] border-l-[3px] border-[var(--color-accent)]">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <div className="font-extrabold text-sm leading-[1.25] text-[var(--color-accent-800)]">{p.tipo}</div>
                              <Tag variant={p.tag} className="ml-auto">
                                {p.estado}
                              </Tag>
                            </div>
                            <div className="text-[13px] leading-[1.5] text-[var(--color-accent-800)] mt-1.5">{p.detalle}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* ── Quedó pendiente ── */}
        {visita.motivoPendiente ? (
          <div className="mt-3 p-3.5 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)]">
            <div className="text-[10px] tracking-[.12em] uppercase text-[var(--color-accent-800)] mb-1.5">Quedó pendiente</div>
            <div className="text-sm text-[var(--color-accent-800)]">{visita.motivoPendiente}</div>
          </div>
        ) : null}

        {/* ── Acción principal ── */}
        {abierta ? (
          <>
            <button
              onClick={iniciar}
              disabled={pendiente}
              className="w-full min-h-[62px] flex items-center justify-between px-4.5 mt-4.5 bg-[var(--color-accent)] text-[var(--color-bg)] border-0 font-extrabold text-[17px] cursor-pointer text-left hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-active)] disabled:opacity-60"
            >
              <span>{visita.estado === "EN_CURSO" ? "Continuar formulario" : "Iniciar visita"}</span>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
            <p className="mt-2.5 mb-0 text-xs opacity-66">
              Al iniciar se registra la hora en el acta. El formulario guarda sección por sección.
            </p>

            {/* ── Otras acciones de la visita ── */}
            <button
              onClick={() => setOpenAcciones((v) => !v)}
              aria-expanded={openAcciones}
              className="w-full min-h-[50px] flex items-center gap-2.5 px-1 mt-5 bg-transparent border-0 cursor-pointer text-[var(--color-text)] text-left hover:opacity-75"
            >
              <span className="font-extrabold text-[13px] leading-none tracking-[.07em] uppercase">
                {openAcciones ? "Ocultar otras acciones" : "Otras acciones de la visita"}
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                className="transition-transform duration-150"
                style={{ transform: openAcciones ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {openAcciones ? (
              <div className="flex flex-col gap-2.5 mt-1.5 mb-3">
                <button
                  onClick={() => abrirSheet("reagendar")}
                  className="w-full min-h-[50px] flex items-center justify-between px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
                >
                  <span>Reagendar visita</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="5" width="18" height="16" />
                    <path d="M8 3v4M16 3v4M3 11h18" />
                  </svg>
                </button>
                <button
                  onClick={() => abrirSheet("pendiente")}
                  className="w-full min-h-[50px] flex items-center justify-between px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
                >
                  <span>No se pudo realizar</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5M12 16h.01" />
                  </svg>
                </button>
                <button
                  onClick={() => abrirSheet("cancelar")}
                  className="w-full min-h-11 flex items-center px-1 bg-transparent border-0 text-[var(--color-accent-active)] text-[13px] underline underline-offset-4 cursor-pointer text-left"
                >
                  Cancelar la visita
                </button>
              </div>
            ) : null}
          </>
        ) : cerradaConActa ? (
          <button
            onClick={() => router.push(`/tecnico/visitas/${visita.folio}/revisar`)}
            className="w-full min-h-[54px] flex items-center justify-between px-4 mt-4.5 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
          >
            <span>Ver acta guardada</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        ) : (
          <p className="mt-4.5 text-sm opacity-62">
            Esta visita quedó {ESTADO_VISITA_LABEL[visita.estado].toLowerCase()}. Coordinación debe reagendarla.
          </p>
        )}
      </div>

      <div className="h-6" />

      {cfg ? (
        <Sheet titulo={cfg.titulo} onClose={() => setSheet(null)}>
          <div className="p-4 flex flex-col gap-3.5">
            <p className="m-0 text-[13px] opacity-65">{cfg.ayuda}</p>
            {cfg.pideFecha ? (
              <>
                <div className="flex gap-3">
                  <div className="flex-1 min-w-0">
                    <label htmlFor="rg-fecha" className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
                      Nueva fecha
                    </label>
                    <input
                      id="rg-fecha"
                      type="date"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      className={campo}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label htmlFor="rg-hora" className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
                      Hora <span className="opacity-66 normal-case tracking-normal">(opcional)</span>
                    </label>
                    <input id="rg-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={campo} />
                  </div>
                </div>
                <p className="-mt-1 mb-0 text-xs opacity-66">Si no pones hora, la visita queda para cualquier momento de ese día.</p>
              </>
            ) : null}
            <div>
              <label htmlFor="rg-mot" className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
                {cfg.labelMotivo}
              </label>
              <textarea
                id="rg-mot"
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={cfg.ph}
                className={`${campo} min-h-[96px] leading-[1.4] resize-y`}
              />
            </div>
            <button
              onClick={confirmarEstado}
              disabled={pendiente}
              className="w-full min-h-[58px] flex items-center justify-between px-4.5 border-0 font-extrabold text-base cursor-pointer text-left hover:brightness-95 disabled:opacity-60"
              style={{
                background: motivo.trim() ? "var(--color-accent)" : "#8f8b8b",
                color: motivo.trim() ? "var(--color-bg)" : "var(--color-surface-3)",
              }}
            >
              <span>{pendiente ? "Guardando…" : cfg.cta}</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M4 12l5 5L20 6" />
              </svg>
            </button>
          </div>
        </Sheet>
      ) : null}

      <Toast texto={toast} />
    </div>
  );
}

const campo =
  "w-full min-h-[54px] px-3.5 py-3 text-base tabular-nums bg-[var(--color-surface)] border border-[var(--color-divider)] text-[var(--color-text)] caret-[var(--color-accent)] rounded-none focus-visible:border-[var(--color-accent)] focus-visible:outline-none";
