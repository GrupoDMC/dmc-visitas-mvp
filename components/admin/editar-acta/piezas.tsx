"use client";

import { reloj } from "@/lib/ui/video";
import type { FotoForm, SubSeleccion } from "@/lib/ui/borrador";
import type { Visita } from "@/lib/types";

// Las piezas de la edición del acta: la sección con su número, los botones, las
// casillas del checklist y las listas de fotos y videos.

export function Candado() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="flex-none opacity-55">
      <rect x="5" y="11" width="14" height="10" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

export function Seccion({
  id,
  n,
  titulo,
  ayuda,
  cuenta,
  cambio = false,
  candado = false,
  children,
}: {
  id: string;
  n: number;
  titulo: string;
  ayuda?: string;
  /** Cuántos elementos tiene la sección, junto al título. */
  cuenta?: number;
  /** La sección lleva cambios sin guardar. */
  cambio?: boolean;
  /** La sección solo se mira. */
  candado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`ea-sec-${id}`}
      className="scroll-mt-[120px] border border-[var(--color-divider-soft)] bg-[var(--color-surface-3)]"
    >
      <div className="flex items-start gap-3.5 px-5 py-4 border-b border-[var(--color-divider-soft)]">
        <span
          className="w-7 h-7 flex-none grid place-items-center font-extrabold text-xs tabular-nums mt-0.5"
          style={{
            background: cambio ? "var(--color-accent)" : "var(--color-text)",
            color: "var(--color-bg)",
          }}
        >
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-[17px] leading-[1.25] tracking-[-.01em]">
            {titulo}
            {cuenta !== undefined ? <span className="font-normal opacity-55 tabular-nums"> · {cuenta}</span> : null}
          </div>
          {ayuda ? <div className="text-[13px] leading-[1.45] opacity-66 mt-0.5">{ayuda}</div> : null}
        </div>
        {cambio ? (
          <span className="tag tag-accent flex-none mt-0.5">Con cambios</span>
        ) : candado ? (
          <span className="tag tag-neutral flex-none mt-0.5 gap-1.5">
            <Candado />
            No se modifica
          </span>
        ) : null}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

/** Quitar algo de la lista: un ícono discreto que se enciende al pasar el mouse. */
export function BotonQuitar({ etiqueta, onClick }: { etiqueta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className="w-9 h-9 flex-none grid place-items-center bg-transparent border-0 cursor-pointer text-[var(--color-text)] opacity-55 hover:opacity-100 hover:bg-[var(--color-accent-100)] hover:text-[var(--color-accent-active)]"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}

export function BotonAgregar({ texto, onClick }: { texto: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-12 flex items-center justify-center gap-2 bg-transparent border border-dashed border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer hover:bg-black/[.05] hover:border-solid"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M12 5v14M5 12h14" />
      </svg>
      {texto}
    </button>
  );
}

/** Una casilla del checklist: toda la fila se aprieta, y marcada queda destacada. */
export function Marca({
  activo,
  texto,
  onClick,
  children,
}: {
  activo: boolean;
  texto: string;
  onClick: () => void;
  /** Lo que va a la derecha cuando está marcada: el contador de cantidad. */
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-stretch min-h-11"
      style={{
        background: activo ? "var(--color-accent-100)" : "#fff",
        border: `1px solid ${activo ? "var(--color-accent)" : "var(--color-divider-faint)"}`,
      }}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={activo}
        onClick={onClick}
        className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2 bg-transparent border-0 cursor-pointer text-left text-[14px] leading-[1.3] text-[var(--color-text)]"
        style={{ fontWeight: activo ? 800 : 400 }}
      >
        <span
          className="w-[18px] h-[18px] flex-none grid place-items-center border-2"
          style={{
            borderColor: activo ? "var(--color-accent)" : "var(--color-neutral-500)",
            background: activo ? "var(--color-accent)" : "transparent",
          }}
        >
          {activo ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6">
              <path d="M4 12l5 5L20 6" />
            </svg>
          ) : null}
        </span>
        <span className="min-w-0">{texto}</span>
      </button>
      {children}
    </div>
  );
}

/** Opciones del checklist que se marcan y, las que llevan cantidad, se cuentan. */
export function ListaMarcable({
  opciones,
  marcados,
  onCambiar,
}: {
  opciones: { etiqueta: string; conCantidad: boolean }[];
  marcados: SubSeleccion[];
  onCambiar: (fn: (prev: SubSeleccion[]) => SubSeleccion[]) => void;
}) {
  const sumar = (etiqueta: string, delta: number) =>
    onCambiar((prev) =>
      prev.map((x) => (x.etiqueta === etiqueta ? { ...x, cantidad: Math.min(99, Math.max(1, x.cantidad + delta)) } : x))
    );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {opciones.map((o) => {
        const marcado = marcados.find((x) => x.etiqueta === o.etiqueta);
        return (
          <Marca
            key={o.etiqueta}
            activo={!!marcado}
            texto={o.etiqueta}
            onClick={() =>
              onCambiar((prev) =>
                marcado ? prev.filter((x) => x.etiqueta !== o.etiqueta) : [...prev, { etiqueta: o.etiqueta, cantidad: 1 }]
              )
            }
          >
            {marcado && o.conCantidad ? (
              <div className="flex-none flex items-center border-l border-[var(--color-accent-300)]">
                <button
                  type="button"
                  onClick={() => sumar(o.etiqueta, -1)}
                  disabled={marcado.cantidad <= 1}
                  aria-label={`Uno menos de ${o.etiqueta}`}
                  className="w-8 self-stretch bg-transparent border-0 cursor-pointer font-extrabold text-[17px] leading-none text-[var(--color-text)] hover:bg-[var(--color-accent-200)] disabled:opacity-30 disabled:cursor-default"
                >
                  −
                </button>
                <span className="min-w-[26px] text-center font-extrabold text-[14px] tabular-nums" aria-live="polite">
                  {marcado.cantidad}
                </span>
                <button
                  type="button"
                  onClick={() => sumar(o.etiqueta, 1)}
                  disabled={marcado.cantidad >= 99}
                  aria-label={`Uno más de ${o.etiqueta}`}
                  className="w-8 self-stretch bg-transparent border-0 cursor-pointer font-extrabold text-[17px] leading-none text-[var(--color-text)] hover:bg-[var(--color-accent-200)] disabled:opacity-30 disabled:cursor-default"
                >
                  +
                </button>
              </div>
            ) : null}
          </Marca>
        );
      })}
    </div>
  );
}

export function Subtitulo({ texto, cuenta }: { texto: string; cuenta: number }) {
  return (
    <div className="flex items-baseline gap-2 mb-2.5">
      <div className="text-[11px] tracking-[.09em] uppercase opacity-62">{texto}</div>
      <div className="text-[11px] tabular-nums opacity-45">{cuenta}</div>
    </div>
  );
}

export function Fotos({
  titulo,
  fotos,
  onQuitar,
  onAgregar,
  onPegar,
  onCopiar,
  copiarA,
}: {
  titulo: string;
  fotos: FotoForm[];
  onQuitar: (id: number) => void;
  onAgregar: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** «Pegar imagen»: trae lo que haya en el portapapeles. */
  onPegar: () => void;
  /** Copia la foto a la otra lista. */
  onCopiar: (id: number) => void;
  /** A qué lista va la copia: «el trabajo realizado» o «el comentario interno». */
  copiarA: string;
}) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <Subtitulo texto={titulo} cuenta={fotos.length} />
        <button
          type="button"
          onClick={onPegar}
          title="Pega la imagen que tengas copiada (también funciona Ctrl+V sobre esta sección)"
          className="ml-auto -mt-1.5 px-2.5 min-h-8 bg-transparent border border-[var(--color-divider)] cursor-pointer text-[11px] font-extrabold uppercase tracking-[.07em] text-[var(--color-text)] hover:bg-black/[.05]"
        >
          Pegar imagen
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
        {fotos.map((f) => (
          <div
            key={f.id}
            className="group relative aspect-square overflow-hidden bg-[var(--color-surface)]"
            style={{ border: `1px solid ${f.dbId ? "var(--color-divider-soft)" : "var(--color-accent)"}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.src} alt="" className="w-full h-full object-cover" loading="lazy" />
            {!f.dbId ? (
              <span className="absolute left-0 bottom-0 px-1.5 py-0.5 bg-[var(--color-accent)] text-white text-[10px] font-extrabold uppercase tracking-[.06em]">
                Nueva
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onCopiar(f.id)}
              aria-label={`Copiar la foto a ${copiarA}`}
              title={`Copiar a ${copiarA}`}
              className="absolute top-1.5 left-1.5 w-7 h-7 grid place-items-center bg-[rgba(32,30,29,.78)] text-white border-0 cursor-pointer opacity-80 group-hover:opacity-100 hover:bg-[var(--color-accent)] focus-visible:opacity-100"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <rect x="8" y="8" width="12" height="12" />
                <path d="M16 8V4H4v12h4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onQuitar(f.id)}
              aria-label="Quitar la foto del acta"
              title="Quitar del acta"
              className="absolute top-1.5 right-1.5 w-7 h-7 grid place-items-center bg-[rgba(32,30,29,.78)] text-white border-0 cursor-pointer opacity-80 group-hover:opacity-100 hover:bg-[var(--color-accent)] focus-visible:opacity-100"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}
        <label className="relative aspect-square flex flex-col items-center justify-center gap-1.5 border border-dashed border-[var(--color-divider)] cursor-pointer text-center hover:bg-black/[.05] hover:border-solid focus-within:outline focus-within:outline-2 focus-within:outline-[var(--color-accent)]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 8h3l2-3h8l2 3h3v12H3z" />
            <path d="M12 10.5v6M9 13.5h6" />
          </svg>
          <span className="font-extrabold text-[10px] tracking-[.08em] uppercase">Agregar fotos</span>
          <input type="file" accept="image/*" multiple onChange={onAgregar} className="absolute w-px h-px opacity-0" />
        </label>
      </div>
    </div>
  );
}

export function Videos({
  titulo,
  videos,
  nuevos,
  onQuitar,
  onAgregar,
  subida,
  ocupado,
}: {
  titulo: string;
  videos: NonNullable<Visita["videos"]>;
  /** Ids de los clips agregados en esta edición. */
  nuevos: Set<number>;
  onQuitar: (id: number) => void;
  onAgregar: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** El avance, si lo que se está subiendo es de esta lista. */
  subida: { paso: string; pct: number } | null;
  /** Hay un video subiendo (acá o en la otra lista): se sube de a uno. */
  ocupado: boolean;
}) {
  return (
    <div>
      <Subtitulo texto={titulo} cuenta={videos.length} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {videos.map((v) => (
          <figure
            key={v.id}
            className="m-0 bg-white"
            style={{ border: `1px solid ${nuevos.has(v.id) ? "var(--color-accent)" : "var(--color-divider-soft)"}` }}
          >
            <video src={v.archivoUrl} controls preload="metadata" playsInline className="w-full aspect-video bg-black object-contain block" />
            <figcaption className="flex items-center gap-2 pl-3 pr-1 text-[12px] tabular-nums">
              {nuevos.has(v.id) ? (
                <span className="px-1.5 py-0.5 bg-[var(--color-accent)] text-white text-[10px] font-extrabold uppercase tracking-[.06em]">
                  Nuevo
                </span>
              ) : null}
              <span className="opacity-70">
                {v.duracionSeg ? reloj(v.duracionSeg) : "—"}
                {v.ancho && v.alto ? ` · ${v.ancho}x${v.alto}` : ""}
              </span>
              <span className="ml-auto">
                <BotonQuitar etiqueta="Quitar el video del acta" onClick={() => onQuitar(v.id)} />
              </span>
            </figcaption>
          </figure>
        ))}

        {subida ? (
          <div className="aspect-video sm:aspect-auto sm:min-h-[120px] flex flex-col justify-center gap-2 px-4 border border-[var(--color-accent)] bg-[var(--color-accent-100)]">
            <div className="font-extrabold text-[13px]">{subida.paso}</div>
            <div className="h-1.5 bg-[var(--color-accent-300)] overflow-hidden">
              <div className="h-full bg-[var(--color-accent)] transition-[width] duration-300" style={{ width: `${subida.pct}%` }} />
            </div>
            <div className="text-xs opacity-70 tabular-nums">{subida.pct}% · no cierres esta página</div>
          </div>
        ) : (
          <label
            className={`relative min-h-[120px] flex flex-col items-center justify-center gap-1.5 border border-dashed border-[var(--color-divider)] text-center focus-within:outline focus-within:outline-2 focus-within:outline-[var(--color-accent)] ${
              ocupado ? "opacity-45 cursor-not-allowed" : "cursor-pointer hover:bg-black/[.05] hover:border-solid"
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 7h11v10H3z" />
              <path d="M14 11l7-4v10l-7-4z" />
            </svg>
            <span className="font-extrabold text-[10px] tracking-[.08em] uppercase">Agregar un video</span>
            <span className="text-[11px] opacity-62">Desde un archivo · hasta 1 minuto</span>
            <input type="file" accept="video/*" disabled={ocupado} onChange={onAgregar} className="absolute w-px h-px opacity-0" />
          </label>
        )}
      </div>
    </div>
  );
}
