import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { rango, totalPaginas, type Pagina } from "@/lib/paginacion";
import { limpiarBusqueda, type FiltroActivo } from "./filtros";
import type { ClienteRow } from "./tipos";

const CAMPOS =
  "id, rut, razon_social, nombre_fantasia, telefono, email, activo, creado_en";

export type DatosCliente = {
  rut: string;
  razon_social: string;
  nombre_fantasia: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
};

/**
 * Listado paginado, ordenado por razón social.
 *
 * El buscador pega contra razón social y RUT a la vez. Para el RUT se busca
 * también la forma normalizada, así "76.123.456" encuentra al cliente que en
 * la base está guardado como "76123456-7".
 */
export async function listarClientes({
  busqueda,
  activo,
  pagina,
}: {
  busqueda: string;
  activo: FiltroActivo;
  pagina: number;
}): Promise<Pagina<ClienteRow>> {
  const { desde, hasta } = rango(pagina);

  let consulta = supabaseAdmin()
    .from("cliente")
    .select(CAMPOS, { count: "exact" })
    .order("razon_social", { ascending: true })
    .range(desde, hasta);

  if (activo !== null) consulta = consulta.eq("activo", activo);

  const termino = limpiarBusqueda(busqueda);
  if (termino) {
    const soloDigitos = termino.replace(/[^0-9kK]/g, "");
    const patrones = [`razon_social.ilike.%${termino}%`, `rut.ilike.%${termino}%`];
    if (soloDigitos.length >= 2) patrones.push(`rut.ilike.%${soloDigitos}%`);
    consulta = consulta.or(patrones.join(","));
  }

  const { data, error, count } = await consulta.returns<ClienteRow[]>();

  if (error) {
    throw new Error(`No se pudo leer el listado de clientes: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    filas: data ?? [],
    total,
    pagina,
    paginas: totalPaginas(total),
  };
}

/**
 * ¿Hay algún cliente cargado, activo o no?
 *
 * Se usa solo cuando el listado sale vacío, para no confundir "no hay ninguno"
 * con "los que hay están todos inactivos". Son dos estados vacíos distintos y
 * llevan a acciones opuestas: crear uno nuevo, o cambiar el filtro. Ofrecer
 * "crear el primero" cuando el cliente ya existe apagado termina en un error
 * de RUT repetido.
 */
export async function hayAlgunCliente(): Promise<boolean> {
  const { count, error } = await supabaseAdmin()
    .from("cliente")
    .select("id", { count: "exact", head: true });

  if (error) {
    throw new Error(`No se pudo contar los clientes: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

export async function obtenerCliente(id: number): Promise<ClienteRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("cliente")
    .select(CAMPOS)
    .eq("id", id)
    .maybeSingle<ClienteRow>();

  if (error) {
    throw new Error(`No se pudo leer el cliente: ${error.message}`);
  }

  return data;
}

/**
 * Quién tiene ese RUT, si es que alguien lo tiene. `exceptoId` se usa al
 * editar: un cliente no colisiona consigo mismo.
 *
 * Devuelve la razón social porque el mensaje de error tiene que decir de quién
 * es el RUT — "ya existe" sin nombre obliga a salir a buscarlo a mano.
 */
export async function clienteConRut(
  rut: string,
  exceptoId?: number,
): Promise<{ id: number; razon_social: string; activo: boolean } | null> {
  let consulta = supabaseAdmin()
    .from("cliente")
    .select("id, razon_social, activo")
    .eq("rut", rut);

  if (exceptoId !== undefined) consulta = consulta.neq("id", exceptoId);

  const { data, error } = await consulta.maybeSingle<{
    id: number;
    razon_social: string;
    activo: boolean;
  }>();

  if (error) {
    throw new Error(`No se pudo verificar el RUT: ${error.message}`);
  }

  return data;
}

export async function crearCliente(datos: DatosCliente): Promise<ClienteRow> {
  const { data, error } = await supabaseAdmin()
    .from("cliente")
    .insert(datos)
    .select(CAMPOS)
    .single<ClienteRow>();

  if (error) throw errorDeEscritura(error);

  return data;
}

export async function actualizarCliente(
  id: number,
  datos: DatosCliente,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("cliente")
    .update(datos)
    .eq("id", id);

  if (error) throw errorDeEscritura(error);
}

/** Nada se borra: "eliminar" es esto. */
export async function cambiarActivoCliente(
  id: number,
  activo: boolean,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("cliente")
    .update({ activo })
    .eq("id", id);

  if (error) {
    throw new Error(`No se pudo cambiar el estado del cliente: ${error.message}`);
  }
}

/** Clientes activos, para los selects. Sin paginar: son pocos. */
export async function clientesActivos(): Promise<
  Pick<ClienteRow, "id" | "rut" | "razon_social">[]
> {
  const { data, error } = await supabaseAdmin()
    .from("cliente")
    .select("id, rut, razon_social")
    .eq("activo", true)
    .order("razon_social", { ascending: true })
    .returns<Pick<ClienteRow, "id" | "rut" | "razon_social">[]>();

  if (error) {
    throw new Error(`No se pudieron leer los clientes activos: ${error.message}`);
  }

  return data ?? [];
}

/**
 * `23505` es la violación de índice único de Postgres. La marcamos para que la
 * acción pueda distinguir "RUT repetido" de "se cayó la base" — el primero se
 * le muestra al usuario, el segundo no.
 */
export class RutRepetido extends Error {}

function errorDeEscritura(error: { code?: string; message: string }): Error {
  if (error.code === "23505") return new RutRepetido(error.message);
  return new Error(`No se pudo guardar el cliente: ${error.message}`);
}
