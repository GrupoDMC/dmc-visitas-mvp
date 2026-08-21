"use client";

import { useEffect, useState } from "react";

export type CampoTipo =
  | "text"
  | "email"
  | "date"
  | "time"
  | "tel"
  | "select"
  | "password"
  | "area"
  | "cuerpo"
  | "toggle";

export interface CampoDef {
  k: string;
  label: string;
  /** 1 = media fila, 2 = fila completa. Por defecto 1. */
  span?: 1 | 2;
  tipo?: CampoTipo;
  ph?: string;
  ayuda?: string;
  opciones?: { v: string; t: string }[];
}

export interface Adjunto {
  label: string;
  incluido: boolean;
}

export type FormValores = Record<string, string | boolean>;

/**
 * Diálogo de formulario del panel — el `dialogoAbierto` del mockup: 720 px,
 * cabecera con kicker y título, campos en dos columnas, nota al pie y el par
 * Cancelar / acción principal.
 */
export default function Dialogo({
  kicker,
  titulo,
  cta,
  nota,
  campos,
  form,
  onCampo,
  onCerrar,
  onGuardar,
  guardando = false,
  adjuntos,
  onToggleAdjunto,
}: {
  kicker: string;
  titulo: string;
  cta: string;
  nota?: string;
  campos: CampoDef[];
  form: FormValores;
  onCampo: (k: string, valor: string | boolean) => void;
  onCerrar: () => void;
  onGuardar: () => void;
  guardando?: boolean;
  adjuntos?: Adjunto[];
  onToggleAdjunto?: (i: number) => void;
}) {
  const [verPass, setVerPass] = useState(false);

  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = previo;
      window.removeEventListener("keydown", onEsc);
    };
  }, [onCerrar]);

  const nIncluidos = adjuntos?.filter((a) => a.incluido).length ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className="fixed inset-0 z-[60] bg-[rgba(45,43,43,.5)] grid place-items-center p-6"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[720px] max-h-[88vh] flex flex-col overflow-hidden bg-[var(--color-bg)] border-2 border-[var(--color-text)] animate-up-dlg"
      >
        <div className="flex-none flex items-center gap-3 px-5.5 py-4.5 border-b-2 border-[var(--color-divider)]">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[.14em] uppercase text-[var(--color-accent-active)]">{kicker}</div>
            <div className="font-extrabold text-[21px] leading-[1.15] mt-1">{titulo}</div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="btn btn-icon ml-auto flex-none"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5.5">
          <div className="grid grid-cols-2 gap-4">
            {campos.map((c) => {
              const valor = form[c.k];
              const texto = typeof valor === "boolean" ? "" : String(valor ?? "");
              return (
                <div key={c.k} className="field min-w-0" style={{ gridColumn: `span ${c.span ?? 1}` }}>
                  <label htmlFor={`dlg-${c.k}`}>{c.label}</label>

                  {c.tipo === "select" ? (
                    <div className="relative">
                      <select
                        id={`dlg-${c.k}`}
                        value={texto}
                        onChange={(e) => onCampo(c.k, e.target.value)}
                        className="input pr-9.5 appearance-none"
                      >
                        {c.opciones?.map((o) => (
                          <option key={o.v} value={o.v}>
                            {o.t}
                          </option>
                        ))}
                      </select>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--color-text)"
                        strokeWidth="2.2"
                        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                  ) : c.tipo === "password" ? (
                    <div className="flex gap-2">
                      <input
                        id={`dlg-${c.k}`}
                        type={verPass ? "text" : "password"}
                        value={texto}
                        onChange={(e) => onCampo(c.k, e.target.value)}
                        placeholder={c.ph}
                        className="input flex-1 min-w-0 tracking-[.08em]"
                      />
                      <button
                        type="button"
                        onClick={() => setVerPass((v) => !v)}
                        aria-label={verPass ? "Ocultar contraseña" : "Ver contraseña"}
                        className="w-[46px] min-h-[42px] flex-none grid place-items-center bg-transparent border border-[var(--color-divider)] cursor-pointer text-[var(--color-text)] hover:bg-black/[.07]"
                      >
                        {verPass ? (
                          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
                            <path d="M4 4l16 16" />
                          </svg>
                        ) : (
                          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
                            <circle cx="12" cy="12" r="2.6" />
                          </svg>
                        )}
                      </button>
                    </div>
                  ) : c.tipo === "toggle" ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onCampo(c.k, true)}
                        className={`tag ${valor === false ? "tag-neutral" : "tag-accent"} min-h-[42px] flex-1 border border-[var(--color-divider)] cursor-pointer font-extrabold text-[13px] justify-center`}
                      >
                        Activo
                      </button>
                      <button
                        type="button"
                        onClick={() => onCampo(c.k, false)}
                        className={`tag ${valor === false ? "tag-accent" : "tag-neutral"} min-h-[42px] flex-1 border border-[var(--color-divider)] cursor-pointer font-extrabold text-[13px] justify-center`}
                      >
                        Inactivo
                      </button>
                    </div>
                  ) : c.tipo === "area" ? (
                    <textarea
                      id={`dlg-${c.k}`}
                      rows={3}
                      value={texto}
                      onChange={(e) => onCampo(c.k, e.target.value)}
                      placeholder={c.ph}
                      className="input min-h-[84px] px-3.5 py-3 resize-y leading-[1.5]"
                    />
                  ) : c.tipo === "cuerpo" ? (
                    <textarea
                      id={`dlg-${c.k}`}
                      rows={12}
                      value={texto}
                      onChange={(e) => onCampo(c.k, e.target.value)}
                      placeholder={c.ph}
                      className="input min-h-[260px] p-3.5 resize-y text-sm leading-[1.6] bg-[var(--color-surface-3)]"
                    />
                  ) : (
                    <input
                      id={`dlg-${c.k}`}
                      type={c.tipo ?? "text"}
                      value={texto}
                      onChange={(e) => onCampo(c.k, e.target.value)}
                      placeholder={c.ph}
                      className="input"
                    />
                  )}

                  {c.ayuda ? <div className="text-[11px] leading-[1.4] opacity-66 mt-1.5">{c.ayuda}</div> : null}
                </div>
              );
            })}
          </div>

          {adjuntos && adjuntos.length > 0 ? (
            <div className="mt-5 border border-black/[.3]">
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--color-surface)] border-b border-[var(--color-divider-soft)]">
                <div className="font-extrabold text-[11px] tracking-[.11em] uppercase">Adjuntos</div>
                <div className="ml-auto text-[11px] tracking-[.06em] uppercase opacity-66 tabular-nums">
                  {nIncluidos} de {adjuntos.length} seleccionados
                </div>
              </div>
              <div className="flex flex-wrap gap-2 px-3.5 py-3.5">
                {adjuntos.map((a, i) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => onToggleAdjunto?.(i)}
                    className="flex items-center gap-2.5 min-h-[38px] px-3 border border-black/[.35] text-[13px] leading-[1.2] cursor-pointer text-left"
                    style={{
                      background: a.incluido ? "var(--color-text)" : "transparent",
                      color: a.incluido ? "var(--color-bg)" : "var(--color-text)",
                    }}
                  >
                    <span className="w-4 h-4 flex-none border-2 border-current grid place-items-center">
                      {a.incluido ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                          <path d="M4 12l5 5L20 6" />
                        </svg>
                      ) : null}
                    </span>
                    <span>{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {nota ? <p className="mt-4.5 mb-0 text-xs opacity-66">{nota}</p> : null}

          <div className="flex gap-2.5 justify-end mt-5.5 pt-4.5 border-t border-[var(--color-divider-soft)]">
            <button type="button" className="btn btn-secondary min-h-11 px-4.5" onClick={onCerrar}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary min-h-11 px-4.5" onClick={onGuardar} disabled={guardando}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M4 12l5 5L20 6" />
              </svg>
              <span>{guardando ? "Guardando…" : cta}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
