"use client";

import { useMemo } from "react";
import type { FirmanteSugerido } from "@/app/actions/visitas-papel";
import type { CatalogoTrabajo } from "@/lib/types";
import { FilaInforme } from "@/components/admin/papel/informe";
import { type Informe, type Tienda, faltante } from "@/components/admin/papel/modelo";

// Las piezas de la carga de visitas en papel: el bloque de una tienda, los
// botones y los chips.

export function Flecha({ abierto }: { abierto: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      className="flex-none transition-transform"
      style={{ transform: `rotate(${abierto ? 0 : -90}deg)` }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function BotonQuitar({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-icon w-8 h-8 flex-none border border-black/[.3]"
      aria-label={label}
      title={label}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

/** Una tienda del cliente con sus informes del año. */
export function BloqueTienda({
  tienda,
  nombre,
  informes,
  anio,
  hoy,
  opcMotivos,
  catalogoTrabajos,
  onAlternar,
  onQuitar,
  firmantesPrevios,
  onAgregarInforme,
  onDuplicarInforme,
  onCambiarInforme,
  onQuitarInforme,
}: {
  tienda: Tienda;
  nombre: string;
  informes: Informe[];
  anio: number;
  hoy: string;
  opcMotivos: { v: string; t: string }[];
  catalogoTrabajos: CatalogoTrabajo[];
  onAlternar: () => void;
  onQuitar: () => void;
  firmantesPrevios: FirmanteSugerido[];
  onAgregarInforme: () => void;
  onDuplicarInforme: (informe: Informe) => void;
  onCambiarInforme: (key: string, cambios: Partial<Informe>) => void;
  onQuitarInforme: (key: string) => void;
}) {
  const incompletos = informes.filter((i) => faltante(i, anio, hoy)).length;
  // Primero los que ya constan en el sistema; después los escritos en esta carga.
  const sugeridos = useMemo(() => {
    const vistos = new Map<string, FirmanteSugerido>();
    for (const f of [...firmantesPrevios, ...informes.map((i) => ({ nombre: i.firmante.trim(), rut: i.rut }))]) {
      const k = f.nombre.toLowerCase();
      if (!k) continue;
      const ya = vistos.get(k);
      if (!ya) vistos.set(k, f);
      else if (!ya.rut && f.rut) ya.rut = f.rut;
    }
    return [...vistos.values()];
  }, [firmantesPrevios, informes]);

  return (
    <div className="border-t border-black/[.3] ml-3.5 sm:ml-6 border-l-2 border-l-[var(--color-divider)]">
      <div className="flex items-center gap-2 px-3.5 py-2">
        <button
          type="button"
          aria-expanded={tienda.abierto}
          onClick={onAlternar}
          className="flex-1 min-w-0 flex items-center gap-2.5 min-h-9 bg-transparent border-0 cursor-pointer text-[var(--color-text)] text-left"
        >
          <Flecha abierto={tienda.abierto} />
          <span className="font-extrabold text-[14px] truncate">{nombre}</span>
          <span className="text-[11px] tracking-[.06em] uppercase opacity-66 tabular-nums flex-none">
            {informes.length} {informes.length === 1 ? "informe" : "informes"}
          </span>
          {incompletos ? <span className="tag tag-accent flex-none">{incompletos} sin completar</span> : null}
        </button>
        <BotonQuitar label={`Quitar ${nombre} y sus informes`} onClick={onQuitar} />
      </div>

      {tienda.abierto ? (
        <div className="px-3.5 pb-3">
          {informes.map((inf, i) => (
            <FilaInforme
              key={inf.key}
              n={i + 1}
              informe={inf}
              anio={anio}
              hoy={hoy}
              opcMotivos={opcMotivos}
              catalogoTrabajos={catalogoTrabajos}
              sugeridos={sugeridos}
              onCambiar={onCambiarInforme}
              onDuplicar={onDuplicarInforme}
              onQuitar={onQuitarInforme}
            />
          ))}
          <button type="button" onClick={onAgregarInforme} className="btn btn-secondary min-h-9 px-3 text-[13px] mt-2.5">
            + Agregar informe en {nombre}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Chip({
  activo,
  fuerte = false,
  onClick,
  children,
}: {
  activo: boolean;
  /** Los trabajos van en negro al marcarse; los subtrabajos, en el acento. */
  fuerte?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={activo}
      onClick={onClick}
      className="min-h-8 px-2.5 flex items-center gap-1.5 text-[13px] leading-[1.2] cursor-pointer text-left"
      style={{
        background: activo ? (fuerte ? "var(--color-text)" : "var(--color-accent-100)") : "var(--color-surface)",
        color: activo && fuerte ? "var(--color-bg)" : "var(--color-text)",
        border: `1px solid ${activo ? (fuerte ? "var(--color-text)" : "var(--color-accent)") : "rgba(32,30,29,.35)"}`,
        fontWeight: activo ? 800 : 400,
      }}
    >
      {activo ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4">
          <path d="M4 12l5 5L20 6" />
        </svg>
      ) : null}
      {children}
    </button>
  );
}
