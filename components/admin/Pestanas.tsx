"use client";

/**
 * Pestañas de una sección del panel — lo que separa "Cuentas" de "Contraseñas
 * pedidas" dentro de Usuarios. Van pegadas al borde inferior de la cabecera,
 * así que la activa se lee como una carpeta abierta sobre el contenido.
 */

export interface Pestana {
  clave: string;
  label: string;
  /** Número al costado (cuántos registros, cuántos pendientes…). */
  n?: number;
  /** Pinta el número en rojo: hay algo esperando. */
  urgente?: boolean;
}

export default function Pestanas({
  pestanas,
  activa,
  onCambiar,
}: {
  pestanas: Pestana[];
  activa: string;
  onCambiar: (clave: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Vistas de la sección" className="flex items-end gap-1.5">
      {pestanas.map((p) => {
        const esActiva = p.clave === activa;
        return (
          <button
            key={p.clave}
            role="tab"
            type="button"
            aria-selected={esActiva}
            onClick={() => onCambiar(p.clave)}
            className="relative min-h-10 flex items-center gap-2 px-3.5 border-2 border-b-0 cursor-pointer font-extrabold text-[13px] -mb-0.5"
            style={{
              background: esActiva ? "var(--color-bg)" : "transparent",
              borderColor: esActiva ? "var(--color-divider)" : "transparent",
              color: "var(--color-text)",
              opacity: esActiva ? 1 : 0.62,
            }}
          >
            <span>{p.label}</span>
            {p.n !== undefined ? (
              <span
                className="min-w-[20px] h-5 px-1.5 grid place-items-center text-[11px] tabular-nums"
                style={{
                  background: p.urgente && p.n > 0 ? "var(--color-accent)" : "var(--color-neutral-300)",
                  color: p.urgente && p.n > 0 ? "var(--color-bg)" : "var(--color-text)",
                }}
              >
                {p.n}
              </span>
            ) : null}
            {esActiva ? (
              <span className="absolute left-0 right-0 -bottom-0.5 h-0.5 bg-[var(--color-bg)]" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
