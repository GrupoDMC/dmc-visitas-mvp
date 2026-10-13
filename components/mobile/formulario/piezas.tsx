"use client";

import type { ClipGrabado } from "@/components/mobile/VideoSheet";
import { mb, reloj, repararDuracionPreview } from "@/lib/ui/video";
import { haceCuanto, type FotoForm, type VideoForm } from "@/lib/ui/borrador";

// Las piezas chicas del formulario del acta: cabeceras de sección, campos,
// contadores, botones y las listas de fotos y videos.

// ─────────────────────────────── piezas locales ───────────────────────────────

export const entrada =
  "w-full min-h-[52px] px-3.5 py-3 text-base bg-[var(--color-surface-3)] border border-[var(--color-divider)] text-[var(--color-text)] caret-[var(--color-accent)] focus-visible:border-[var(--color-accent)] focus-visible:outline-none";

export const entradaSheet =
  "w-full min-h-[52px] px-3.5 py-3 text-base bg-[var(--color-surface)] border border-[var(--color-divider)] text-[var(--color-text)] caret-[var(--color-accent)] focus-visible:border-[var(--color-accent)] focus-visible:outline-none";

export function ahora(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function Cabecera({
  n,
  titulo,
  ok,
  chip,
  onToggle,
}: {
  n: number;
  titulo: string;
  ok: boolean;
  chip: { variante: "accent" | "neutral" | "outline"; texto: string };
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2.5 min-h-[60px] px-4 bg-transparent border-0 border-b border-black/[.25] cursor-pointer text-left text-[var(--color-text)] hover:bg-black/[.04]"
    >
      <span
        className="w-6.5 h-6.5 flex-none grid place-items-center font-extrabold text-xs tabular-nums"
        style={{
          background: ok ? "var(--color-accent)" : "transparent",
          color: ok ? "var(--color-bg)" : "var(--color-text)",
        }}
      >
        {n}
      </span>
      <span className="font-extrabold text-[15px] leading-[1.2] flex-1">{titulo}</span>
      <span className={`tag tag-${chip.variante}`}>{chip.texto}</span>
    </button>
  );
}

/**
 * Qué pasa con lo que el técnico lleva escrito.
 *
 * Tres cosas que hasta ahora no se decían en ninguna parte: que lo escrito está
 * a salvo en el celular, que se recuperó lo que había quedado a medias, y que
 * hay un acta terminada esperando señal.
 */
export function EstadoBorrador({
  respaldo,
  recuperado,
  pendiente,
  enviando,
  conSenal,
  otrasPendientes,
  onOcultarRecuperado,
  onEmpezarDeNuevo,
  onEnviarPendiente,
}: {
  respaldo: { guardadoEn: string; sinFotos: boolean } | null;
  recuperado: { guardadoEn: string; sinFotos: boolean } | null;
  pendiente: { capturadaEn: string; intentos: number } | null;
  enviando: boolean;
  conSenal: boolean;
  otrasPendientes: number;
  onOcultarRecuperado: () => void;
  onEmpezarDeNuevo: () => void;
  onEnviarPendiente: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 mt-3">
      {pendiente ? (
        <div className="px-3.5 py-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)]">
          <div className="text-[10px] tracking-[.12em] uppercase text-[var(--color-accent-800)]">
            Acta terminada · falta enviarla
          </div>
          <div className="text-[13px] leading-[1.45] text-[var(--color-accent-800)] mt-1.5">
            Quedó guardada en el celular a las {pendiente.capturadaEn.slice(11, 16)} y se manda sola cuando haya señal.
            No la vuelvas a llenar.
          </div>
          <button
            onClick={onEnviarPendiente}
            disabled={enviando}
            className="w-full min-h-[46px] flex items-center justify-between px-3.5 mt-2.5 bg-[var(--color-accent)] text-[var(--color-bg)] border-0 font-extrabold text-[13px] cursor-pointer text-left disabled:opacity-60"
          >
            <span>{enviando ? "Enviando…" : "Enviar ahora"}</span>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M4 12a8 8 0 018-8c3 0 5.5 1.7 7 4M20 12a8 8 0 01-8 8c-3 0-5.5-1.7-7-4" />
              <path d="M19 4v4h-4M5 20v-4h4" />
            </svg>
          </button>
        </div>
      ) : null}

      {recuperado ? (
        <div className="px-3.5 py-3 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)]">
          <div className="text-[10px] tracking-[.12em] uppercase opacity-66">Recuperamos lo que llevabas</div>
          <div className="text-[13px] leading-[1.45] mt-1.5">
            Esta acta quedó a medias {haceCuanto(recuperado.guardadoEn)} y se volvió a cargar tal cual.
            {recuperado.sinFotos ? " Las fotos no alcanzaron a guardarse: hay que tomarlas de nuevo." : ""}
          </div>
          <div className="flex gap-3.5 items-center mt-2">
            <button
              onClick={onOcultarRecuperado}
              className="min-h-10 px-1 bg-transparent border-0 font-extrabold text-[13px] cursor-pointer text-[var(--color-text)] underline underline-offset-4"
            >
              Seguir con esto
            </button>
            <button
              onClick={onEmpezarDeNuevo}
              className="min-h-10 px-1 bg-transparent border-0 text-[13px] cursor-pointer text-[var(--color-accent-active)] underline underline-offset-4"
            >
              Empezar de nuevo
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2 text-[11px] leading-[1.3] opacity-70">
        <span
          className="w-2 h-2 flex-none rounded-full"
          style={{ background: conSenal ? "var(--color-accent)" : "#8f8b8b" }}
          aria-hidden="true"
        />
        <span>
          {!conSenal
            ? "Sin señal · lo que escribes queda guardado en el celular"
            : respaldo
              ? `Guardado en el celular ${haceCuanto(respaldo.guardadoEn)}`
              : "Lo que escribas se guarda solo en este celular"}
        </span>
      </div>

      {otrasPendientes > 0 ? (
        <div className="text-[11px] leading-[1.3] text-[var(--color-accent-800)]">
          Tienes {otrasPendientes} acta{otrasPendientes > 1 ? "s" : ""} de otra visita esperando señal. Se envía
          {otrasPendientes > 1 ? "n" : ""} al abrir esa visita.
        </div>
      ) : null}
    </div>
  );
}

export function Cuerpo({ children, gap = true }: { children: React.ReactNode; gap?: boolean }) {
  return (
    <div className={`p-4 bg-[var(--color-surface)] border-b border-black/[.25] ${gap ? "flex flex-col gap-3.5" : ""}`}>
      {children}
    </div>
  );
}

export function Campo({
  label,
  extra,
  htmlFor,
  children,
  className,
}: {
  label: string;
  extra?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
        {label}
        {extra ? <span className="opacity-66 normal-case tracking-normal"> {extra}</span> : null}
      </label>
      {children}
    </div>
  );
}

export function PasoTitulo({ n, texto }: { n: string; texto: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <span className="w-6 h-6 flex-none grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-none tabular-nums">
        {n}
      </span>
      <span className="font-extrabold text-base leading-[1.2]">{texto}</span>
    </div>
  );
}

/** − / + para las opciones del checklist que llevan cantidad. */
export function Contador({
  valor,
  onCambiar,
  alto,
}: {
  valor: number;
  onCambiar: (delta: number) => void;
  alto?: boolean;
}) {
  const altura = alto ? "min-h-[58px]" : "min-h-[54px]";
  return (
    <div className="flex-none flex items-center border border-[var(--color-divider)] bg-[var(--color-surface-3)]">
      <button
        type="button"
        onClick={() => onCambiar(-1)}
        aria-label="Quitar uno"
        className={`w-[44px] ${altura} bg-transparent border-0 cursor-pointer text-[var(--color-text)] font-extrabold text-[22px] leading-none`}
      >
        −
      </button>
      <div className="min-w-[28px] text-center font-extrabold text-[19px] leading-none tabular-nums">{valor}</div>
      <button
        type="button"
        onClick={() => onCambiar(1)}
        aria-label="Agregar uno"
        className={`w-[44px] ${altura} bg-transparent border-0 cursor-pointer text-[var(--color-text)] font-extrabold text-[22px] leading-none`}
      >
        +
      </button>
    </div>
  );
}

export function BotonGuardar({ texto, onClick, habilitado }: { texto: string; onClick: () => void; habilitado: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-disabled={!habilitado}
      className="w-full min-h-[54px] flex items-center justify-between px-4 border-0 font-extrabold text-[15px] cursor-pointer text-left hover:brightness-95"
      style={{
        background: habilitado ? "var(--color-accent)" : "#8f8b8b",
        color: habilitado ? "var(--color-bg)" : "var(--color-surface-3)",
      }}
    >
      <span>{texto}</span>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M4 12l5 5L20 6" />
      </svg>
    </button>
  );
}

/** Grilla de fotos con sus botones de cámara y galería. La usan el trabajo y el comentario interno. */
export function GaleriaFotos({
  fotos,
  onQuitar,
  onCamara,
  onArchivos,
}: {
  fotos: FotoForm[];
  onQuitar: (f: FotoForm) => void;
  onCamara: () => void;
  onArchivos: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {fotos.map((f) => (
        <div key={f.id} className="relative aspect-square border border-[var(--color-divider)] overflow-hidden bg-[var(--color-neutral-300)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.src} alt="" className="w-full h-full object-cover" />
          <button
            onClick={() => onQuitar(f)}
            aria-label="Quitar foto"
            className="absolute top-0 right-0 w-8 h-8 grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] border-0 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}
      <button
        onClick={onCamara}
        className="relative aspect-square flex flex-col items-center justify-center gap-1.5 border border-black/[.5] cursor-pointer bg-[var(--color-text)] text-[var(--color-bg)] overflow-hidden hover:bg-[var(--color-neutral-900)]"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 8h3l2-3h8l2 3h3v12H3z" />
          <circle cx="12" cy="13" r="3.4" />
        </svg>
        <span className="font-extrabold text-[10px] tracking-[.08em] uppercase">Cámara</span>
      </button>
      <label className="relative aspect-square flex flex-col items-center justify-center gap-1.5 border border-dashed border-black/[.5] cursor-pointer bg-[var(--color-surface-3)] overflow-hidden hover:bg-[#eeeaea]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#201e1d" strokeWidth="1.8">
          <path d="M4 5h16v14H4z" />
          <path d="M4 16l5-5 4 4 3-3 4 4" />
          <circle cx="9" cy="9" r="1.4" />
        </svg>
        <span className="font-extrabold text-[10px] tracking-[.08em] uppercase">Galería</span>
        <input type="file" accept="image/*" multiple onChange={onArchivos} className="absolute w-px h-px opacity-0 pointer-events-none" />
      </label>
    </div>
  );
}

/** Los clips con su avance de subida, su error y el botón de reintentar. */
export function ListaVideos({
  videos,
  clips,
  onQuitar,
  onReintentar,
}: {
  videos: VideoForm[];
  /** Los clips todavía en memoria: sin él, un clip cortado no se puede reintentar. */
  clips: Map<number, ClipGrabado>;
  onQuitar: (v: VideoForm) => void;
  onReintentar: (v: VideoForm) => void;
}) {
  if (!videos.length) return null;
  return (
    <div className="grid gap-2 mt-3 mb-1">
      {videos.map((v) => (
        <div key={v.id} className="border border-[var(--color-divider)] bg-[var(--color-surface-3)]">
          <video
            src={v.src}
            controls
            preload="metadata"
            playsInline
            onLoadedMetadata={(e) => repararDuracionPreview(e.currentTarget)}
            className="w-full aspect-video bg-black object-contain"
          />
          <div className="flex items-center gap-2 px-2.5 py-2">
            <span className="text-[11px] tabular-nums opacity-70">
              {reloj(v.duracionSeg)} · {v.ancho}x{v.alto} · {mb(v.bytes)}
            </span>
            <button
              onClick={() => onQuitar(v)}
              aria-label="Quitar video"
              className="ml-auto w-8 h-8 grid place-items-center bg-transparent border border-[var(--color-divider)] cursor-pointer text-[var(--color-text)] hover:bg-black/[.07]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {/* Mientras sube: la barra. Si se cortó: el motivo. */}
          {v.progreso !== null ? (
            <div className="px-2.5 pb-2.5">
              <div className="h-1 bg-[var(--color-divider)] overflow-hidden">
                <div
                  className="h-full bg-[var(--color-accent)] transition-[width] duration-300"
                  style={{ width: `${v.progreso}%` }}
                />
              </div>
              <div className="mt-1 text-[11px] opacity-62 tabular-nums">Subiendo… {v.progreso}%</div>
            </div>
          ) : null}
          {v.error ? (
            <div className="px-2.5 pb-2.5">
              <div className="text-[11px] text-[var(--color-accent-active)] leading-[1.45]">{v.error}</div>
              {clips.has(v.id) ? (
                <button
                  onClick={() => onReintentar(v)}
                  className="mt-2 min-h-[38px] w-full px-3 bg-[var(--color-text)] text-[var(--color-bg)] border-0 font-extrabold text-[12px] cursor-pointer text-left hover:bg-[var(--color-neutral-900)]"
                >
                  Reintentar la subida
                </button>
              ) : (
                <div className="mt-1 text-[11px] opacity-62">El acta se puede guardar igual; el video no va a quedar.</div>
              )}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
