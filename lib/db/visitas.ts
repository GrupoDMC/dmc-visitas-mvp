import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { rango, totalPaginas, type Pagina } from "@/lib/paginacion";
import { limpiarBusqueda } from "./filtros";
import type {
  ClienteDeVisita,
  EstadoVisita,
  SucursalDeVisita,
  TecnicoDeVisita,
  TipoTrabajo,
  VisitaRow,
} from "./tipos";

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

// ---------------------------------------------------------------------------
// LISTADOS
// ---------------------------------------------------------------------------

/**
 * Los datos embebidos se piden por nombre de tabla y no con hint de FK
 * (`cliente:cliente_id(...)`) porque `visita` tiene exactamente una clave
 * foránea a cada una de las tres. Sin ambigüedad, PostgREST resuelve solo.
 */
const CAMPOS_LISTADO =
  "id, folio, estado, tipo_trabajo, fecha_programada, hora_programada, " +
  "tecnico_id, cliente ( razon_social ), " +
  "sucursal ( nombre, direccion, comuna, telefono ), " +
  "tecnico ( nombres, apellidos )";

export type VisitaEnListado = Pick<
  VisitaRow,
  | "id"
  | "folio"
  | "estado"
  | "tipo_trabajo"
  | "fecha_programada"
  | "hora_programada"
  | "tecnico_id"
> & {
  cliente: ClienteDeVisita | null;
  sucursal: SucursalDeVisita | null;
  tecnico: TecnicoDeVisita | null;
};

/**
 * Filtros del listado de coordinación. Todos llegan como texto porque viven en
 * la URL: es la fuente de verdad, para que un link filtrado se pueda compartir.
 *
 * Vacío siempre significa "sin filtrar". `tecnico` tiene además el valor
 * especial `sin`, que es el filtro más útil de todos: las visitas que todavía
 * no tienen a quién mandarle.
 */
export type FiltrosVisitas = {
  busqueda: string;
  desde: string;
  hasta: string;
  estado: string;
  tecnico: string;
  cliente: string;
};

export const SIN_TECNICO = "sin";

/**
 * Tope de ids que el buscador libre arrastra por cliente y por sucursal.
 *
 * El buscador tiene que pegar contra folio, razón social y nombre de sucursal a
 * la vez, y esas dos últimas viven en otras tablas. PostgREST no filtra la
 * tabla de arriba por una condición de una embebida dentro de un `or`, así que
 * se resuelven primero los ids que coinciden y después se los mete en el `in`.
 *
 * Son dos consultas más, las dos por índice y sobre tablas chicas. El tope está
 * para que una búsqueda de una sola letra no arme una URL de 40 KB; si alguien
 * lo alcanza, el resultado queda incompleto, pero buscar "a" tampoco pretendía
 * ser preciso.
 */
const TOPE_BUSQUEDA = 300;

async function idsQueCoinciden(
  tabla: "cliente" | "sucursal",
  columna: string,
  termino: string,
): Promise<number[]> {
  const { data, error } = await supabaseAdmin()
    .from(tabla)
    .select("id")
    .ilike(columna, `%${termino}%`)
    .limit(TOPE_BUSQUEDA)
    .returns<{ id: number }[]>();

  if (error) {
    throw new Error(`No se pudo buscar en ${tabla}: ${error.message}`);
  }

  return (data ?? []).map((fila) => fila.id);
}

function idNumerico(valor: string): number | null {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

/**
 * Listado de coordinación, paginado de 25.
 *
 * Orden: las sin fecha primero —son las que nacieron en terreno, recién
 * llegadas y sin agendar—, después las más recientes. Ordenar ascendente
 * dejaría arriba las visitas de hace tres meses, que es lo que menos importa.
 */
export async function listarVisitas(
  filtros: FiltrosVisitas,
  pagina: number,
): Promise<Pagina<VisitaEnListado>> {
  const { desde, hasta } = rango(pagina);

  let consulta = supabaseAdmin()
    .from("visita")
    .select(CAMPOS_LISTADO, { count: "exact" })
    .order("fecha_programada", { ascending: false, nullsFirst: true })
    .order("hora_programada", { ascending: true, nullsFirst: true })
    .order("id", { ascending: false })
    .range(desde, hasta);

  if (filtros.desde) consulta = consulta.gte("fecha_programada", filtros.desde);
  if (filtros.hasta) consulta = consulta.lte("fecha_programada", filtros.hasta);
  if (filtros.estado) consulta = consulta.eq("estado", filtros.estado);

  if (filtros.tecnico === SIN_TECNICO) {
    consulta = consulta.is("tecnico_id", null);
  } else {
    const tecnicoId = idNumerico(filtros.tecnico);
    if (tecnicoId) consulta = consulta.eq("tecnico_id", tecnicoId);
  }

  const clienteId = idNumerico(filtros.cliente);
  if (clienteId) consulta = consulta.eq("cliente_id", clienteId);

  const termino = limpiarBusqueda(filtros.busqueda);
  if (termino) {
    const [clientes, sucursales] = await Promise.all([
      idsQueCoinciden("cliente", "razon_social", termino),
      idsQueCoinciden("sucursal", "nombre", termino),
    ]);

    const partes = [`folio.ilike.%${termino}%`];
    if (clientes.length) partes.push(`cliente_id.in.(${clientes.join(",")})`);
    if (sucursales.length) partes.push(`sucursal_id.in.(${sucursales.join(",")})`);

    consulta = consulta.or(partes.join(","));
  }

  const { data, error, count } = await consulta.returns<VisitaEnListado[]>();

  if (error) {
    throw new Error(`No se pudo leer el listado de visitas: ${error.message}`);
  }

  const total = count ?? 0;

  return { filas: data ?? [], total, pagina, paginas: totalPaginas(total) };
}

/**
 * ¿Hay alguna visita cargada? Igual que en los maestros: distingue "no hay
 * ninguna" de "ninguna coincide con el filtro", que llevan a acciones opuestas.
 * Corre solo cuando el listado ya salió vacío.
 */
export async function hayAlgunaVisita(): Promise<boolean> {
  const { count, error } = await supabaseAdmin()
    .from("visita")
    .select("id", { count: "exact", head: true });

  if (error) {
    throw new Error(`No se pudieron contar las visitas: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

/**
 * Todas las visitas sin cerrar de un técnico.
 *
 * No pagina: son las que tiene encima, y si un técnico llega a 200 visitas
 * abiertas el problema no es la paginación. El tope está por las dudas.
 *
 * Ordenadas ascendente y con las sin fecha primero: acá sí manda lo que viene,
 * y las de terreno sin agendar son las que quedaron a medio cerrar.
 */
export async function visitasAbiertasDeTecnico(
  tecnicoId: number,
): Promise<VisitaEnListado[]> {
  const { data, error } = await supabaseAdmin()
    .from("visita")
    .select(CAMPOS_LISTADO)
    .eq("tecnico_id", tecnicoId)
    .in("estado", ESTADOS_ABIERTOS)
    .order("fecha_programada", { ascending: true, nullsFirst: true })
    .order("hora_programada", { ascending: true, nullsFirst: true })
    .limit(200)
    .returns<VisitaEnListado[]>();

  if (error) {
    throw new Error(`No se pudieron leer tus visitas: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Las últimas visitas de una sucursal, para el panel de historial del detalle.
 * `exceptoId` saca del listado a la visita que se está mirando.
 */
export async function ultimasVisitasDeSucursal(
  sucursalId: number,
  exceptoId: number,
  limite = 5,
): Promise<VisitaEnListado[]> {
  const { data, error } = await supabaseAdmin()
    .from("visita")
    .select(CAMPOS_LISTADO)
    .eq("sucursal_id", sucursalId)
    .neq("id", exceptoId)
    .order("fecha_programada", { ascending: false, nullsFirst: true })
    .order("id", { ascending: false })
    .limit(limite)
    .returns<VisitaEnListado[]>();

  if (error) {
    throw new Error(
      `No se pudo leer el historial de la sucursal: ${error.message}`,
    );
  }

  return data ?? [];
}

// ---------------------------------------------------------------------------
// DETALLE
// ---------------------------------------------------------------------------

export type VisitaDetalle = VisitaRow & {
  cliente: { id: number; rut: string; razon_social: string } | null;
  sucursal: {
    id: number;
    nombre: string;
    codigo_interno: string | null;
    direccion: string | null;
    comuna: string | null;
    region: string | null;
    telefono: string | null;
  } | null;
  tecnico: {
    id: number;
    rut: string;
    nombres: string;
    apellidos: string;
    telefono: string | null;
  } | null;
};

const CAMPOS_DETALLE =
  "id, folio, cliente_id, sucursal_id, tecnico_id, estado, tipo_trabajo, " +
  "fecha_programada, hora_programada, fecha_inicio, fecha_termino, " +
  "contacto_nombre, contacto_email, contacto_telefono, " +
  "responsable_tienda_nombre, responsable_tienda_rut, " +
  "descripcion_trabajo, trabajo_realizado, observaciones, motivo_pendiente, " +
  "requiere_seguimiento, creado_en, " +
  "cliente ( id, rut, razon_social ), " +
  "sucursal ( id, nombre, codigo_interno, direccion, comuna, region, telefono ), " +
  "tecnico ( id, rut, nombres, apellidos, telefono )";

export async function obtenerVisita(id: number): Promise<VisitaDetalle | null> {
  const { data, error } = await supabaseAdmin()
    .from("visita")
    .select(CAMPOS_DETALLE)
    .eq("id", id)
    .maybeSingle<VisitaDetalle>();

  if (error) {
    throw new Error(`No se pudo leer la visita: ${error.message}`);
  }

  return data;
}

// ---------------------------------------------------------------------------
// ESCRITURA
// ---------------------------------------------------------------------------

/**
 * Lo que se escribe al crear una visita.
 *
 * `folio` no está y no puede estar: lo genera la base con su propia secuencia
 * (`docs/01_esquema.sql`). Mandarlo desde acá sería pisarle el número.
 *
 * Los `contacto_*` son un SNAPSHOT de esta visita. No leen ni actualizan la
 * sucursal: quien recibe al técnico un martes puede no ser quien figura como
 * contacto, y la visita tiene que registrar quién estaba de verdad.
 */
export type DatosVisitaNueva = {
  cliente_id: number;
  sucursal_id: number;
  tecnico_id: number | null;
  tipo_trabajo: TipoTrabajo | null;
  fecha_programada: string | null;
  hora_programada: string | null;
  descripcion_trabajo: string | null;
  contacto_nombre: string | null;
  contacto_email: string | null;
  contacto_telefono: string | null;
  creado_por: string;
};

export async function crearVisita(
  datos: DatosVisitaNueva,
): Promise<{ id: number; folio: string }> {
  const { data, error } = await supabaseAdmin()
    .from("visita")
    // El estado va explícito aunque la columna lo tenga por defecto: que una
    // visita nace PROGRAMADA es una regla del negocio, no un detalle del DDL.
    .insert({ ...datos, estado: "PROGRAMADA" })
    .select("id, folio")
    .single<{ id: number; folio: string }>();

  if (error) {
    throw new Error(`No se pudo crear la visita: ${error.message}`);
  }

  return data;
}

/**
 * Asigna un técnico a una o varias visitas. Devuelve cuántas cambiaron de
 * verdad, que no es lo mismo que cuántas se pidieron: entre que el coordinador
 * marcó las casillas y apretó el botón, alguna pudo desaparecer del filtro.
 */
export async function asignarTecnico(
  ids: number[],
  tecnicoId: number,
): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from("visita")
    .update({ tecnico_id: tecnicoId })
    .in("id", ids)
    .select("id")
    .returns<{ id: number }[]>();

  if (error) {
    throw new Error(`No se pudo asignar el técnico: ${error.message}`);
  }

  return (data ?? []).length;
}

// ---------------------------------------------------------------------------
// FORMULARIO DE TERRENO (fase 4)
// ---------------------------------------------------------------------------

/** Sección 1 · Datos de la visita. */
export type DatosVisitaTerreno = {
  tipo_trabajo: TipoTrabajo;
  contacto_nombre: string | null;
  contacto_email: string | null;
  contacto_telefono: string | null;
  responsable_tienda_nombre: string | null;
  responsable_tienda_rut: string | null;
};

export async function actualizarDatosVisita(
  id: number,
  datos: DatosVisitaTerreno,
): Promise<void> {
  const { error } = await supabaseAdmin().from("visita").update(datos).eq("id", id);

  if (error) {
    throw new Error(`No se pudieron guardar los datos de la visita: ${error.message}`);
  }
}

/**
 * "Iniciar visita": el botón de la sección 1. Pone la visita EN_CURSO y deja
 * la marca de cuándo arrancó. No pisa `fecha_inicio` si ya estaba puesta —
 * iniciar dos veces no reescribe la hora real de llegada.
 */
export async function iniciarVisita(id: number): Promise<void> {
  const { data: actual, error: errorLectura } = await supabaseAdmin()
    .from("visita")
    .select("fecha_inicio")
    .eq("id", id)
    .maybeSingle<{ fecha_inicio: string | null }>();

  if (errorLectura) {
    throw new Error(`No se pudo leer la visita: ${errorLectura.message}`);
  }

  const { error } = await supabaseAdmin()
    .from("visita")
    .update({
      estado: "EN_CURSO",
      fecha_inicio: actual?.fecha_inicio ?? new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`No se pudo iniciar la visita: ${error.message}`);
  }
}

/** Sección 2 · Trabajo realizado. */
export type DatosTrabajoRealizado = {
  trabajo_realizado: string | null;
  observaciones: string | null;
  requiere_seguimiento: boolean;
};

export async function actualizarTrabajoRealizado(
  id: number,
  datos: DatosTrabajoRealizado,
): Promise<void> {
  const { error } = await supabaseAdmin().from("visita").update(datos).eq("id", id);

  if (error) {
    throw new Error(`No se pudo guardar el trabajo realizado: ${error.message}`);
  }
}

/** Cierre: REALIZADA + fecha_termino = now(). Las validaciones van en la acción. */
export async function cerrarVisita(id: number): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("visita")
    .update({ estado: "REALIZADA", fecha_termino: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(`No se pudo cerrar la visita: ${error.message}`);
  }
}

/** Pendiente: sin exigir firma, con motivo obligatorio. */
export async function marcarVisitaPendiente(
  id: number,
  motivo: string,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("visita")
    .update({ estado: "PENDIENTE", motivo_pendiente: motivo })
    .eq("id", id);

  if (error) {
    throw new Error(`No se pudo marcar la visita como pendiente: ${error.message}`);
  }
}

/**
 * Reabrir una visita REALIZADA. Solo COORDINADOR/ADMIN, con confirmación en
 * la pantalla. Vuelve a EN_CURSO y borra `fecha_termino`: si se vuelve a
 * cerrar, la fecha de término tiene que ser la de ese cierre, no la anterior.
 */
export async function reabrirVisita(id: number): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("visita")
    .update({ estado: "EN_CURSO", fecha_termino: null })
    .eq("id", id);

  if (error) {
    throw new Error(`No se pudo reabrir la visita: ${error.message}`);
  }
}
