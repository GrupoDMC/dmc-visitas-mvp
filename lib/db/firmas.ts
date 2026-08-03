import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { FirmaRow, TipoFirma } from "./tipos";

const CAMPOS = "id, visita_id, tipo, firmante_nombre, firmante_rut, imagen, firmado_en";

/** Las firmas de una visita. A lo sumo dos: TECNICO y TIENDA. */
export async function listarFirmasDeVisita(visitaId: number): Promise<FirmaRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("firma")
    .select(CAMPOS)
    .eq("visita_id", visitaId)
    .returns<FirmaRow[]>();

  if (error) {
    throw new Error(`No se pudieron leer las firmas de la visita: ${error.message}`);
  }

  return data ?? [];
}

export type DatosFirma = {
  firmante_nombre: string | null;
  firmante_rut: string | null;
  imagen: string;
};

/**
 * Guarda o rehace una firma. `firma` tiene `unique (visita_id, tipo)`: la
 * segunda vez que se firma lo mismo (Rehacer firma) es un upsert, no un
 * segundo registro.
 */
export async function guardarFirma(
  visitaId: number,
  tipo: TipoFirma,
  datos: DatosFirma,
): Promise<FirmaRow> {
  const { data, error } = await supabaseAdmin()
    .from("firma")
    .upsert(
      { ...datos, visita_id: visitaId, tipo, firmado_en: new Date().toISOString() },
      { onConflict: "visita_id,tipo" },
    )
    .select(CAMPOS)
    .single<FirmaRow>();

  if (error) {
    throw new Error(`No se pudo guardar la firma: ${error.message}`);
  }

  return data;
}
