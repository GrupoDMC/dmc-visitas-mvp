import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { EstadoProblema, ProblemaRow } from "./tipos";

const CAMPOS =
  "id, visita_id, sucursal_id, descripcion, solucion_sugerida, estado, detectado_en";

/** Los problemas de una visita, más nuevo primero: es lo último que se cargó. */
export async function listarProblemasDeVisita(
  visitaId: number,
): Promise<ProblemaRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("problema")
    .select(CAMPOS)
    .eq("visita_id", visitaId)
    .order("id", { ascending: false })
    .returns<ProblemaRow[]>();

  if (error) {
    throw new Error(`No se pudieron leer los problemas de la visita: ${error.message}`);
  }

  return data ?? [];
}

export type DatosProblema = {
  descripcion: string;
  solucion_sugerida: string | null;
  estado: EstadoProblema;
};

/**
 * `sucursal_id` se copia de la visita, nunca del formulario: el encargo es
 * explícito en que no se pregunta, y confiar en un id que viaje desde el
 * navegador dejaría cargar un problema en la sucursal que uno quisiera.
 */
export async function crearProblema(
  visitaId: number,
  sucursalId: number,
  datos: DatosProblema,
): Promise<ProblemaRow> {
  const { data, error } = await supabaseAdmin()
    .from("problema")
    .insert({ ...datos, visita_id: visitaId, sucursal_id: sucursalId })
    .select(CAMPOS)
    .single<ProblemaRow>();

  if (error) {
    throw new Error(`No se pudo guardar el problema: ${error.message}`);
  }

  return data;
}

export async function actualizarProblema(
  id: number,
  datos: DatosProblema,
): Promise<void> {
  const { error } = await supabaseAdmin().from("problema").update(datos).eq("id", id);

  if (error) {
    throw new Error(`No se pudo guardar el problema: ${error.message}`);
  }
}

export async function obtenerProblema(id: number): Promise<ProblemaRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("problema")
    .select(CAMPOS)
    .eq("id", id)
    .maybeSingle<ProblemaRow>();

  if (error) {
    throw new Error(`No se pudo leer el problema: ${error.message}`);
  }

  return data;
}
