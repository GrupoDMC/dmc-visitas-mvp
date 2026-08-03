import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SucursalRow } from "./tipos";

const CAMPOS =
  "id, cliente_id, nombre, codigo_interno, direccion, comuna, region, " +
  "telefono, activo, creado_en";

export type DatosSucursal = {
  nombre: string;
  codigo_interno: string | null;
  direccion: string | null;
  comuna: string | null;
  region: string | null;
  telefono: string | null;
  activo: boolean;
};

/**
 * Todas las sucursales de un cliente, activas e inactivas, ordenadas por
 * nombre. No pagina: viven dentro de la ficha del cliente y ninguno de los
 * clientes de DMC tiene tantas como para justificarlo.
 */
export async function listarSucursalesDeCliente(
  clienteId: number,
): Promise<SucursalRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("sucursal")
    .select(CAMPOS)
    .eq("cliente_id", clienteId)
    .order("nombre", { ascending: true })
    .returns<SucursalRow[]>();

  if (error) {
    throw new Error(`No se pudieron leer las sucursales: ${error.message}`);
  }

  return data ?? [];
}

export async function obtenerSucursal(id: number): Promise<SucursalRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("sucursal")
    .select(CAMPOS)
    .eq("id", id)
    .maybeSingle<SucursalRow>();

  if (error) {
    throw new Error(`No se pudo leer la sucursal: ${error.message}`);
  }

  return data;
}

export async function crearSucursal(
  clienteId: number,
  datos: DatosSucursal,
): Promise<SucursalRow> {
  const { data, error } = await supabaseAdmin()
    .from("sucursal")
    .insert({ ...datos, cliente_id: clienteId })
    .select(CAMPOS)
    .single<SucursalRow>();

  if (error) {
    throw new Error(`No se pudo guardar la sucursal: ${error.message}`);
  }

  return data;
}

export async function actualizarSucursal(
  id: number,
  datos: DatosSucursal,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("sucursal")
    .update(datos)
    .eq("id", id);

  if (error) {
    throw new Error(`No se pudo guardar la sucursal: ${error.message}`);
  }
}

export async function cambiarActivoSucursal(
  id: number,
  activo: boolean,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("sucursal")
    .update({ activo })
    .eq("id", id);

  if (error) {
    throw new Error(`No se pudo cambiar el estado de la sucursal: ${error.message}`);
  }
}

/** Sucursales activas de un cliente, para el select de creación de visitas. */
export async function sucursalesActivasDeCliente(
  clienteId: number,
): Promise<Pick<SucursalRow, "id" | "nombre" | "direccion" | "comuna" | "telefono">[]> {
  const { data, error } = await supabaseAdmin()
    .from("sucursal")
    .select("id, nombre, direccion, comuna, telefono")
    .eq("cliente_id", clienteId)
    .eq("activo", true)
    .order("nombre", { ascending: true })
    .returns<
      Pick<SucursalRow, "id" | "nombre" | "direccion" | "comuna" | "telefono">[]
    >();

  if (error) {
    throw new Error(`No se pudieron leer las sucursales activas: ${error.message}`);
  }

  return data ?? [];
}
