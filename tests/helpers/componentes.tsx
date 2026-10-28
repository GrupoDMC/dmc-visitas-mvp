import { vi } from "vitest";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { ReferenciasProvider, REFERENCIAS_VACIAS, type Referencias } from "@/lib/ui/referencias";
import type { Visita } from "@/lib/types";

/** El router de next/navigation que usan los componentes en los tests (ver tests/setup/componentes.ts). */
export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

/** Pinta un componente dentro del contexto de referencias (permisos, catálogos). */
export function pintar(ui: ReactElement, referencias: Partial<Referencias> = {}) {
  return render(<ReferenciasProvider valor={{ ...REFERENCIAS_VACIAS, ...referencias }}>{ui}</ReferenciasProvider>);
}

let contador = 0;

/** Una visita ficticia con lo que usa la tabla; `extra` pisa lo que haga falta. */
export function visitaFalsa(extra: Record<string, unknown> = {}): Visita {
  const n = ++contador;
  return {
    id: n,
    folio: `V-${String(n).padStart(4, "0")}`,
    estado: "PROGRAMADA",
    fechaProgramada: "2026-10-26",
    fechaHasta: null,
    horaProgramada: "09:30",
    clienteId: 1,
    sucursalId: 1,
    tecnicoId: 1,
    tecnicoAyudanteId: null,
    motivoCodigo: "VISITA",
    motivosCodigos: ["VISITA"],
    motivosNombres: ["Visita preventiva"],
    trabajoSolicitado: "Revisar antenas",
    cliente: { id: 1, nombreFantasia: "Cliente Uno" },
    marca: { id: 1, nombre: "Cliente Uno" },
    sucursal: { id: 1, nombre: "Tienda Centro" },
    tecnico: { id: 1, nombreCompleto: "Ana Pérez" },
    tecnicoAyudante: undefined,
    ediciones: [],
    reagendamientos: [],
    eliminacion: null,
    ...extra,
  } as unknown as Visita;
}
