import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { rango, totalPaginas, type Pagina } from "@/lib/paginacion";
import { limpiarBusqueda, type FiltroActivo } from "./filtros";
import type { TecnicoRow } from "./tipos";

const CAMPOS = "id, rut, nombres, apellidos, telefono, email, activo, creado_en";

export type DatosTecnico = {
  rut: string;
  nombres: string;
  apellidos: string;
  telefono: string | null;
  email: string | null;
  activo: boolean;
};

/** Listado paginado, ordenado por apellido y después por nombre. */
export async function listarTecnicos({
  busqueda,
  activo,
  pagina,
}: {
  busqueda: string;
  activo: FiltroActivo;
  pagina: number;
}): Promise<Pagina<TecnicoRow>> {
  const { desde, hasta } = rango(pagina);

  let consulta = supabaseAdmin()
    .from("tecnico")
    .select(CAMPOS, { count: "exact" })
    .order("apellidos", { ascending: true })
    .order("nombres", { ascending: true })
    .range(desde, hasta);

  if (activo !== null) consulta = consulta.eq("activo", activo);

  const termino = limpiarBusqueda(busqueda);
  if (termino) {
    const soloDigitos = termino.replace(/[^0-9kK]/g, "");
    const patrones = [
      `nombres.ilike.%${termino}%`,
      `apellidos.ilike.%${termino}%`,
      `rut.ilike.%${termino}%`,
    ];
    if (soloDigitos.length >= 2) patrones.push(`rut.ilike.%${soloDigitos}%`);
    consulta = consulta.or(patrones.join(","));
  }

  const { data, error, count } = await consulta.returns<TecnicoRow[]>();

  if (error) {
    throw new Error(`No se pudo leer el listado de técnicos: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    filas: data ?? [],
    total,
    pagina,
    paginas: totalPaginas(total),
  };
}

/** Igual que en clientes: distingue "no hay ninguno" de "están todos inactivos". */
export async function hayAlgunTecnico(): Promise<boolean> {
  const { count, error } = await supabaseAdmin()
    .from("tecnico")
    .select("id", { count: "exact", head: true });

  if (error) {
    throw new Error(`No se pudo contar los técnicos: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

export async function obtenerTecnico(id: number): Promise<TecnicoRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("tecnico")
    .select(CAMPOS)
    .eq("id", id)
    .maybeSingle<TecnicoRow>();

  if (error) {
    throw new Error(`No se pudo leer el técnico: ${error.message}`);
  }

  return data;
}

/** Igual que en clientes: el mensaje de RUT repetido tiene que nombrar al dueño. */
export async function tecnicoConRut(
  rut: string,
  exceptoId?: number,
): Promise<{ id: number; nombres: string; apellidos: string } | null> {
  let consulta = supabaseAdmin()
    .from("tecnico")
    .select("id, nombres, apellidos")
    .eq("rut", rut);

  if (exceptoId !== undefined) consulta = consulta.neq("id", exceptoId);

  const { data, error } = await consulta.maybeSingle<{
    id: number;
    nombres: string;
    apellidos: string;
  }>();

  if (error) {
    throw new Error(`No se pudo verificar el RUT: ${error.message}`);
  }

  return data;
}

export async function crearTecnico(datos: DatosTecnico): Promise<TecnicoRow> {
  const { data, error } = await supabaseAdmin()
    .from("tecnico")
    .insert(datos)
    .select(CAMPOS)
    .single<TecnicoRow>();

  if (error) throw errorDeEscritura(error);

  return data;
}

export async function actualizarTecnico(
  id: number,
  datos: DatosTecnico,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("tecnico")
    .update(datos)
    .eq("id", id);

  if (error) throw errorDeEscritura(error);
}

export async function cambiarActivoTecnico(
  id: number,
  activo: boolean,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("tecnico")
    .update({ activo })
    .eq("id", id);

  if (error) {
    throw new Error(`No se pudo cambiar el estado del técnico: ${error.message}`);
  }
}

/** Técnicos activos, para los selects de asignación. */
export async function tecnicosActivos(): Promise<
  Pick<TecnicoRow, "id" | "nombres" | "apellidos">[]
> {
  const { data, error } = await supabaseAdmin()
    .from("tecnico")
    .select("id, nombres, apellidos")
    .eq("activo", true)
    .order("apellidos", { ascending: true })
    .order("nombres", { ascending: true })
    .returns<Pick<TecnicoRow, "id" | "nombres" | "apellidos">[]>();

  if (error) {
    throw new Error(`No se pudieron leer los técnicos activos: ${error.message}`);
  }

  return data ?? [];
}

/** "Pérez Soto, Ana María" — apellido primero, que es como se los busca. */
export function nombreTecnico(t: { nombres: string; apellidos: string }): string {
  return `${t.apellidos}, ${t.nombres}`;
}

export class RutRepetido extends Error {}

function errorDeEscritura(error: { code?: string; message: string }): Error {
  if (error.code === "23505") return new RutRepetido(error.message);
  return new Error(`No se pudo guardar el técnico: ${error.message}`);
}
