import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * `fecha_anterior`/`hora_anterior` tienen que ser los valores de la visita en
 * el instante exacto del cambio, y escribir el historial y la visita con dos
 * llamadas sueltas desde acá dejaría una ventana donde podrían quedar
 * desincronizados si la segunda fallara. `fn_reagendar_visita`
 * (docs/05_reagendar_fn.sql) hace las dos escrituras en una sola función de
 * Postgres — el equivalente de una transacción, que supabase-js no expone
 * directamente para dos tablas separadas.
 */
export type DatosReagendamiento = {
  fecha_nueva: string;
  hora_nueva: string | null;
  motivo: string;
};

export async function reagendarVisita(
  visitaId: number,
  datos: DatosReagendamiento,
  reagendadoPor: string,
): Promise<void> {
  const { error } = await supabaseAdmin().rpc("fn_reagendar_visita", {
    p_visita_id: visitaId,
    p_fecha_nueva: datos.fecha_nueva,
    p_hora_nueva: datos.hora_nueva,
    p_motivo: datos.motivo,
    p_reagendado_por: reagendadoPor,
  });

  if (error) {
    throw new Error(`No se pudo reagendar la visita: ${error.message}`);
  }
}

export type ReagendamientoDeVisita = {
  id: number;
  fecha_anterior: string | null;
  hora_anterior: string | null;
  fecha_nueva: string;
  hora_nueva: string | null;
  motivo: string;
  reagendado_en: string;
  reagendado_por: { nombre: string } | null;
};

/**
 * Historial de reagendamientos de una visita, más reciente primero.
 *
 * `reagendado_por:perfil!reagendado_por(nombre)` hace falta con el hint
 * explícito del nombre de columna: la columna no se llama `perfil_id`, así
 * que PostgREST no puede adivinar sola contra qué FK resolver el embed.
 */
export async function listarReagendamientosDeVisita(
  visitaId: number,
): Promise<ReagendamientoDeVisita[]> {
  const { data, error } = await supabaseAdmin()
    .from("visita_reagendamiento")
    .select(
      "id, fecha_anterior, hora_anterior, fecha_nueva, hora_nueva, motivo, reagendado_en, " +
        "reagendado_por:perfil!reagendado_por ( nombre )",
    )
    .eq("visita_id", visitaId)
    .order("reagendado_en", { ascending: false })
    .returns<ReagendamientoDeVisita[]>();

  if (error) {
    throw new Error(
      `No se pudo leer el historial de reagendamiento: ${error.message}`,
    );
  }

  return data ?? [];
}
