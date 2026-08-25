"use client";

import { createContext, useContext } from "react";
import type {
  CatalogoMotivo,
  CatalogoProblema,
  CatalogoTrabajo,
  Cliente,
  RolUsuario,
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
  /**
   * Con qué rol entró quien está mirando. Lo necesitan las acciones que no son
   * de cualquiera —cerrar una visita por administración, por ejemplo— para no
   * ofrecer un botón que el servidor va a rechazar igual.
   */
  rol: RolUsuario;
  clientes: Cliente[];
  sucursales: Sucursal[];
  tecnicos: Tecnico[];
  motivos: CatalogoMotivo[];
  problemas: CatalogoProblema[];
  trabajos: CatalogoTrabajo[];
}

export const REFERENCIAS_VACIAS: Referencias = {
  rol: "TECNICO",
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

/** ¿Quien está mirando es administrador? */
export function esAdmin(ref: Referencias): boolean {
  return ref.rol === "ADMIN";
}

/** Nombre legible de un tipo de problema; si ya no está en el catálogo, su código. */
export function nombreProblema(problemas: CatalogoProblema[], codigo: string): string {
  return problemas.find((p) => p.codigo === codigo)?.nombre ?? codigo;
}

/** Nombre legible de un trabajo; si ya no está en el catálogo, su código. */
export function nombreTrabajo(trabajos: CatalogoTrabajo[], codigo: string): string {
  return trabajos.find((t) => t.codigo === codigo)?.nombre ?? codigo;
}
