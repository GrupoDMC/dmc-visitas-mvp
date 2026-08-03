import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { DireccionMaterial, MaterialRow } from "./tipos";

const CAMPOS =
  "id, visita_id, descripcion, codigo_producto, cantidad, direccion, observacion";

export async function listarMaterialesDeVisita(
  visitaId: number,
): Promise<MaterialRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("material_terreno")
    .select(CAMPOS)
    .eq("visita_id", visitaId)
    .order("id", { ascending: true })
    .returns<MaterialRow[]>();

  if (error) {
    throw new Error(`No se pudieron leer los materiales de la visita: ${error.message}`);
  }

  return data ?? [];
}

export type DatosMaterial = {
  descripcion: string;
  codigo_producto: string | null;
  cantidad: number;
  direccion: DireccionMaterial;
  observacion: string | null;
};

export async function crearMaterial(
  visitaId: number,
  datos: DatosMaterial,
): Promise<MaterialRow> {
  const { data, error } = await supabaseAdmin()
    .from("material_terreno")
    .insert({ ...datos, visita_id: visitaId })
    .select(CAMPOS)
    .single<MaterialRow>();

  if (error) {
    throw new Error(`No se pudo guardar el material: ${error.message}`);
  }

  return data;
}

export async function actualizarMaterial(
  id: number,
  datos: DatosMaterial,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("material_terreno")
    .update(datos)
    .eq("id", id);

  if (error) {
    throw new Error(`No se pudo guardar el material: ${error.message}`);
  }
}

export async function eliminarMaterial(id: number): Promise<void> {
  const { error } = await supabaseAdmin().from("material_terreno").delete().eq("id", id);

  if (error) {
    throw new Error(`No se pudo eliminar el material: ${error.message}`);
  }
}

export async function obtenerMaterial(id: number): Promise<MaterialRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("material_terreno")
    .select(CAMPOS)
    .eq("id", id)
    .maybeSingle<MaterialRow>();

  if (error) {
    throw new Error(`No se pudo leer el material: ${error.message}`);
  }

  return data;
}
