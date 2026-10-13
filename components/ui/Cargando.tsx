// Pantalla de carga de un segmento: mientras el servidor arma la página.

export default function Cargando({ compacta = false }: { compacta?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`${compacta ? "min-h-[60vh]" : "min-h-screen"} flex items-center justify-center bg-[var(--color-bg)] text-[var(--color-text)]`}
    >
      <div className="w-[180px]">
        <div className="h-0.5 bg-[var(--color-divider-soft)] overflow-hidden">
          <div className="h-full w-1/3 bg-[var(--color-accent)] animate-pulse" />
        </div>
        <p className="mt-3 text-[10px] tracking-[.16em] uppercase opacity-60">Cargando…</p>
      </div>
    </div>
  );
}
