"use client";

import { createContext, useContext } from "react";
import type {
  CatalogoMotivo,
  CatalogoProblema,
  CatalogoTrabajo,
  Cliente,
  Sucursal,
  Tecnico,
} from "@/lib/types";

// Maestros y catálogos para los componentes de cliente.
//
// Antes cada componente importaba los arreglos de lib/mock y los tenía
// disponibles al evaluar el módulo. Ahora salen de SQL Server, que es asíncrono
// y solo se puede consultar en el servidor: los layouts los cargan una vez por
// petición y los bajan por contexto, en vez de que cada diálogo los pida.

export interface Referencias {
  clientes: Cliente[];
  sucursales: Sucursal[];
  tecnicos: Tecnico[];
  motivos: CatalogoMotivo[];
  problemas: CatalogoProblema[];
  trabajos: CatalogoTrabajo[];
}

export const REFERENCIAS_VACIAS: Referencias = {
  clientes: [],
  sucursales: [],
  tecnicos: [],
  motivos: [],
  problemas: [],
  trabajos: [],
};

const Contexto = createContext<Referencias>(REFERENCIAS_VACIAS);

export function ReferenciasProvider({ valor, children }: { valor: Referencias; children: React.ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useReferencias(): Referencias {
  return useContext(Contexto);
}

/** Nombre legible de un tipo de problema; si ya no está en el catálogo, su código. */
export function nombreProblema(problemas: CatalogoProblema[], codigo: string): string {
  return problemas.find((p) => p.codigo === codigo)?.nombre ?? codigo;
}

/** Nombre legible de un trabajo; si ya no está en el catálogo, su código. */
export function nombreTrabajo(trabajos: CatalogoTrabajo[], codigo: string): string {
  return trabajos.find((t) => t.codigo === codigo)?.nombre ?? codigo;
}
