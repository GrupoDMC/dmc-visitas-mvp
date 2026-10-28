"use client";

import { useRef } from "react";
import { ADJUNTOS_MAX, type AdjuntoPendiente } from "@/lib/ui/adjuntos";
import { mb, reloj } from "@/lib/ui/video";
import type { AdjuntoTrabajo } from "@/lib/types";

/**
 * Lo que se ve de los adjuntos del trabajo a realizar, en un solo lugar para el
 * panel y el celular: una grilla de miniaturas con las fotos y los videos.
 *
 * `AdjuntosVista` solo muestra los ya guardados. `SelectorAdjuntos` agrega el
 * botón para elegir archivos y la lista de los que están por subir.
 */

const CELDA = "relative aspect-square overflow-hidden border border-[var(--color-divider)] bg-[var(--color-surface-3)]";

function Miniatura({ a }: { a: AdjuntoTrabajo }) {
  return a.tipo === "FOTO" ? (
    <a href={a.url} target="_blank" rel="noreferrer" className={`${CELDA} block`} title={a.nombre ?? "Foto"}>
      {/* eslint-disable-next-line @next/next/no-img-element -- la ruta la sirve la propia app, sin optimizador */}
      <img src={a.url} alt={a.nombre ?? "Foto del trabajo"} className="w-full h-full object-cover" loading="lazy" />
    </a>
  ) : (
    <div className={CELDA}>
      <video src={a.url} controls preload="metadata" playsInline className="w-full h-full object-cover bg-black" />
      {a.duracionSeg ? (
        <span className="absolute left-1 bottom-1 px-1.5 text-[11px] bg-black/70 text-white tabular-nums pointer-events-none">
          {reloj(a.duracionSeg)}
        </span>
      ) : null}
    </div>
  );
}

/** Los adjuntos ya guardados. `onQuitar` pone una X en cada uno (solo donde se puede editar). */
export function AdjuntosVista({
  adjuntos,
  onQuitar,
  titulo,
}: {
  adjuntos: AdjuntoTrabajo[];
  onQuitar?: (a: AdjuntoTrabajo) => void;
  titulo?: string;
}) {
  if (!adjuntos.length) return null;
  return (
    <div>
      {titulo ? <div className="text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">{titulo}</div> : null}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {adjuntos.map((a) => (
          <div key={a.id} className="relative">
            <Miniatura a={a} />
            {onQuitar ? (
              <button
                type="button"
                onClick={() => onQuitar(a)}
                aria-label="Quitar adjunto"
                className="absolute top-1 right-1 w-7 h-7 grid place-items-center bg-black/75 text-white border-0 cursor-pointer text-base leading-none"
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Elegir fotos y videos que expliquen el trabajo. En el celular el selector del
 * sistema ofrece la cámara y la galería.
 *
 * `guardados` es lo que la visita ya tiene (al corregirla): cuenta contra el
 * máximo de la ficha.
 */
export function SelectorAdjuntos({
  pendientes,
  onAgregar,
  onQuitar,
  guardados = 0,
  deshabilitado = false,
  claseBoton,
}: {
  pendientes: AdjuntoPendiente[];
  onAgregar: (archivos: FileList, cupo: number) => number;
  onQuitar: (clave: string) => void;
  guardados?: number;
  deshabilitado?: boolean;
  claseBoton?: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const cupo = ADJUNTOS_MAX - guardados - pendientes.length;

  return (
    <div>
      <input
        ref={entrada}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onAgregar(e.target.files, cupo);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={deshabilitado || cupo <= 0}
        onClick={() => entrada.current?.click()}
        className={
          claseBoton ??
          "min-h-[48px] px-3.5 inline-flex items-center gap-2 bg-transparent border border-dashed border-[var(--color-text)] text-[var(--color-text)] font-bold text-[13px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        }
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.5l-8.5 8.5a5.5 5.5 0 01-7.8-7.8l9-9a3.7 3.7 0 015.2 5.2l-9 9a1.8 1.8 0 01-2.6-2.6l8.3-8.3" />
        </svg>
        <span>Adjuntar fotos o videos</span>
      </button>
      <div className="mt-1 text-[11px] opacity-60 leading-[1.4]">
        Para explicar qué se debe hacer. Hasta {ADJUNTOS_MAX} archivos; los videos se bajan a 720p y un minuto.
      </div>

      {pendientes.length ? (
        <div className="mt-2.5 grid grid-cols-3 sm:grid-cols-4 gap-2">
          {pendientes.map((p) => (
            <div key={p.clave}>
              <div className={CELDA}>
                {p.tipo === "FOTO" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
                  <img src={p.preview} alt={p.nombre} className="w-full h-full object-cover" />
                ) : (
                  <video src={p.preview} muted playsInline preload="metadata" className="w-full h-full object-cover bg-black" />
                )}
                {p.estado !== "listo" || p.progreso !== null ? (
                  <div className="absolute inset-0 grid place-items-center bg-black/55 text-white text-[12px] font-bold text-center px-1">
                    {p.estado === "error"
                      ? "No sirve"
                      : p.progreso !== null
                        ? `${p.progreso}%`
                        : "Preparando…"}
                  </div>
                ) : null}
                {p.tipo === "VIDEO" && p.blob && p.estado === "listo" && p.progreso === null ? (
                  <span className="absolute left-1 bottom-1 px-1.5 text-[11px] bg-black/70 text-white tabular-nums">
                    {mb(p.blob.size)}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onQuitar(p.clave)}
                  aria-label="Quitar adjunto"
                  disabled={p.progreso !== null && p.estado === "listo"}
                  className="absolute top-1 right-1 w-7 h-7 grid place-items-center bg-black/75 text-white border-0 cursor-pointer text-base leading-none"
                >
                  ×
                </button>
              </div>
              {p.error ? <div className="mt-0.5 text-[11px] leading-[1.3] text-[var(--color-accent-800)]">{p.error}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
