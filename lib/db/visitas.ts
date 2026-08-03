import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { EstadoVisita } from "./tipos";

/**
 * Una visita "abierta" es la que todavía le puede caer encima a alguien.
 * REALIZADA y CANCELADA ya no dan trabajo, así que no cuentan para avisar
 * antes de desactivar un cliente o un técnico.
 */
export const ESTADOS_ABIERTOS: readonly EstadoVisita[] = [
  "PROGRAMADA",
  "EN_CURSO",
  "PENDIENTE",
  "REAGENDADA",
];

async function contarAbiertas(
  columna: "cliente_id" | "tecnico_id",
  id: number,
): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("visita")
    .select("id", { count: "exact", head: true })
    .eq(columna, id)
    .in("estado", ESTADOS_ABIERTOS);

  if (error) {
    throw new Error(`No se pudieron contar las visitas abiertas: ${error.message}`);
  }

  return count ?? 0;
}

/** Visitas sin cerrar de un cliente, en cualquiera de sus sucursales. */
export function contarVisitasAbiertasDeCliente(clienteId: number): Promise<number> {
  return contarAbiertas("cliente_id", clienteId);
}

/** Visitas sin cerrar asignadas a un técnico. */
export function contarVisitasAbiertasDeTecnico(tecnicoId: number): Promise<number> {
  return contarAbiertas("tecnico_id", tecnicoId);
}

/** Frase reutilizable para los avisos de desactivación. */
export function frasearVisitasAbiertas(cantidad: number): string {
  return cantidad === 1
    ? "1 visita abierta"
    : `${cantidad} visitas abiertas`;
}
