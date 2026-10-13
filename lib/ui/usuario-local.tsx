"use client";

import { createContext, useContext } from "react";

// El id del usuario con sesión, para que lo guardado en el equipo (borradores y
// cola de actas, ver lib/ui/borrador) quede a su nombre y no se mezcle con el
// de quien use el mismo celular o computador después.

const Contexto = createContext<number>(0);

export function UsuarioLocalProvider({ usuarioId, children }: { usuarioId: number; children: React.ReactNode }) {
  return <Contexto.Provider value={usuarioId}>{children}</Contexto.Provider>;
}

export function useUsuarioLocal(): number {
  return useContext(Contexto);
}
