import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PerfilRow } from "./tipos";

const CAMPOS = "id, nombre, rol, tecnico_id, activo, creado_en";

/**
 * Devuelve el perfil de aplicación de un usuario de auth, o null si no existe.
 *
 * Ojo: no filtra por `activo`. Quien llama decide qué hacer con una cuenta
 * deshabilitada — en el ingreso necesitamos distinguir "no tiene perfil" de
 * "tiene perfil apagado" para mostrar el mensaje correcto.
 */
export async function obtenerPerfil(
  usuarioId: string,
): Promise<PerfilRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("perfil")
    .select(CAMPOS)
    .eq("id", usuarioId)
    .maybeSingle<PerfilRow>();

  if (error) {
    throw new Error(`No se pudo leer el perfil del usuario: ${error.message}`);
  }

  return data;
}
