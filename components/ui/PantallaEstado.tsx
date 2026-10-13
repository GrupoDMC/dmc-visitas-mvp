import type { ReactNode } from "react";

// Marco común de las pantallas de error, "no encontrado" y carga: la misma
// cabecera editorial del login (etiqueta en acento, título grande, regla negra).

export default function PantallaEstado({
  etiqueta,
  titulo,
  children,
  acciones,
  compacta = false,
}: {
  etiqueta: string;
  titulo: ReactNode;
  children?: ReactNode;
  acciones?: ReactNode;
  /** Dentro del panel: sin altura de pantalla completa. */
  compacta?: boolean;
}) {
  return (
    <main
      className={`${compacta ? "min-h-[60vh]" : "min-h-screen"} flex items-center justify-center bg-[var(--color-bg)] px-[22px] py-10 text-[var(--color-text)]`}
    >
      <div className="w-full max-w-[460px]">
        <div className="h-0.5 bg-[var(--color-text)]" />
        <div className="text-[10px] tracking-[.16em] uppercase text-[var(--color-accent-active)] mt-[22px] mb-2">
          {etiqueta}
        </div>
        <h1 className="font-extrabold text-[34px] leading-[1.06] tracking-[-.03em] mb-2.5">{titulo}</h1>
        {children ? <div className="text-sm opacity-70 max-w-[38ch]">{children}</div> : null}
        {acciones ? <div className="mt-6 flex flex-wrap gap-3">{acciones}</div> : null}
      </div>
    </main>
  );
}

export const CLASE_BOTON =
  "inline-flex items-center justify-center px-5 py-3 text-[13px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-active)]";
export const CLASE_BOTON_SECUNDARIO =
  "inline-flex items-center justify-center px-5 py-3 text-[13px] font-semibold border border-[var(--color-text)] hover:bg-[var(--color-surface)]";
