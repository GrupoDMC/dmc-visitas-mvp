import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Filtro de rango de fechas de `/exportar`. Vacío en cualquiera de los dos
 * lados significa "sin tope" de ese lado — dejar los dos vacíos exporta todo.
 *
 * Las columnas que se filtran son siempre `timestamptz`, así que `hasta` se
 * empuja al final del día: un `<input type="date">` manda solo la fecha
 * (`"2026-08-03"`), y compararla tal cual contra una columna con hora dejaría
 * afuera casi todo ese día.
 */
export type FiltroFechas = { desde: string; hasta: string };

function finDeDia(fecha: string): string {
  return `${fecha}T23:59:59.999`;
}

// ---------------------------------------------------------------------------
// VISITAS — ya existe la vista v_export_visita, aplicada en Supabase.
// ---------------------------------------------------------------------------

export type VisitaExport = {
  id: number;
  folio: string;
  cliente_rut: string;
  razon_social: string;
  sucursal: string;
  direccion: string | null;
  comuna: string | null;
  tecnico_rut: string | null;
  tecnico: string | null;
  estado: string;
  tipo_trabajo: string | null;
  fecha_programada: string | null;
  hora_programada: string | null;
  fecha_inicio: string | null;
  fecha_termino: string | null;
  contacto_nombre: string | null;
  contacto_email: string | null;
  contacto_telefono: string | null;
  responsable_tienda_nombre: string | null;
  responsable_tienda_rut: string | null;
  descripcion_trabajo: string | null;
  trabajo_realizado: string | null;
  observaciones: string | null;
  motivo_pendiente: string | null;
  requiere_seguimiento: boolean;
  creado_en: string;
};

export async function exportarVisitas(
  filtro: FiltroFechas,
): Promise<VisitaExport[]> {
  let consulta = supabaseAdmin()
    .from("v_export_visita")
    .select("*")
    .order("id", { ascending: true });

  if (filtro.desde) consulta = consulta.gte("creado_en", filtro.desde);
  if (filtro.hasta) consulta = consulta.lte("creado_en", finDeDia(filtro.hasta));

  const { data, error } = await consulta.returns<VisitaExport[]>();

  if (error) {
    throw new Error(`No se pudo generar el export de visitas: ${error.message}`);
  }

  return data ?? [];
}

// ---------------------------------------------------------------------------
// PROBLEMAS
// ---------------------------------------------------------------------------

export type ProblemaExport = {
  id: number;
  visita_id: number;
  folio_visita: string;
  sucursal: string;
  descripcion: string;
  solucion_sugerida: string | null;
  estado: string;
  detectado_en: string;
};

type FilaProblema = {
  id: number;
  visita_id: number;
  descripcion: string;
  solucion_sugerida: string | null;
  estado: string;
  detectado_en: string;
  visita: { folio: string } | null;
  sucursal: { nombre: string } | null;
};

export async function exportarProblemas(
  filtro: FiltroFechas,
): Promise<ProblemaExport[]> {
  let consulta = supabaseAdmin()
    .from("problema")
    .select(
      "id, visita_id, descripcion, solucion_sugerida, estado, detectado_en, " +
        "visita ( folio ), sucursal ( nombre )",
    )
    .order("id", { ascending: true });

  if (filtro.desde) consulta = consulta.gte("detectado_en", filtro.desde);
  if (filtro.hasta) consulta = consulta.lte("detectado_en", finDeDia(filtro.hasta));

  const { data, error } = await consulta.returns<FilaProblema[]>();

  if (error) {
    throw new Error(`No se pudo generar el export de problemas: ${error.message}`);
  }

  return (data ?? []).map((fila) => ({
    id: fila.id,
    visita_id: fila.visita_id,
    folio_visita: fila.visita?.folio ?? "",
    sucursal: fila.sucursal?.nombre ?? "",
    descripcion: fila.descripcion,
    solucion_sugerida: fila.solucion_sugerida,
    estado: fila.estado,
    detectado_en: fila.detectado_en,
  }));
}

// ---------------------------------------------------------------------------
// MATERIALES — no tiene fecha propia. Se filtra por la fecha de la visita
// a la que pertenece, con un inner join (`visita!inner`) para poder filtrar
// sobre la columna embebida.
// ---------------------------------------------------------------------------

export type MaterialExport = {
  id: number;
  visita_id: number;
  folio_visita: string;
  descripcion: string;
  codigo_producto: string | null;
  cantidad: number;
  direccion: string;
  observacion: string | null;
};

type FilaMaterial = {
  id: number;
  visita_id: number;
  descripcion: string;
  codigo_producto: string | null;
  cantidad: number;
  direccion: string;
  observacion: string | null;
  visita: { folio: string; creado_en: string } | null;
};

export async function exportarMateriales(
  filtro: FiltroFechas,
): Promise<MaterialExport[]> {
  let consulta = supabaseAdmin()
    .from("material_terreno")
    .select(
      "id, visita_id, descripcion, codigo_producto, cantidad, direccion, " +
        "observacion, visita!inner ( folio, creado_en )",
    )
    .order("id", { ascending: true });

  if (filtro.desde) consulta = consulta.gte("visita.creado_en", filtro.desde);
  if (filtro.hasta) {
    consulta = consulta.lte("visita.creado_en", finDeDia(filtro.hasta));
  }

  const { data, error } = await consulta.returns<FilaMaterial[]>();

  if (error) {
    throw new Error(`No se pudo generar el export de materiales: ${error.message}`);
  }

  return (data ?? []).map((fila) => ({
    id: fila.id,
    visita_id: fila.visita_id,
    folio_visita: fila.visita?.folio ?? "",
    descripcion: fila.descripcion,
    codigo_producto: fila.codigo_producto,
    cantidad: fila.cantidad,
    direccion: fila.direccion,
    observacion: fila.observacion,
  }));
}

// ---------------------------------------------------------------------------
// CLIENTES Y SUCURSALES — una fila por sucursal, con los datos del cliente
// repetidos al costado (mismo estilo que v_export_visita). Un cliente sin
// ninguna sucursal todavía sale como una fila con las columnas de sucursal
// vacías: no se lo pierde el traspaso solo porque no le cargaron sucursales.
//
// El filtro de fechas corre sobre `cliente.creado_en`: la fila pertenece
// primero al cliente, y sus sucursales viajan con él sin importar cuándo se
// las agregó — separarlas del cliente por fecha las dejaría huérfanas en un
// traspaso incremental.
// ---------------------------------------------------------------------------

export type ClienteSucursalExport = {
  cliente_id: number;
  cliente_rut: string;
  razon_social: string;
  nombre_fantasia: string | null;
  cliente_telefono: string | null;
  cliente_email: string | null;
  cliente_activo: boolean;
  cliente_creado_en: string;
  sucursal_id: number | null;
  sucursal_nombre: string | null;
  sucursal_codigo_interno: string | null;
  sucursal_direccion: string | null;
  sucursal_comuna: string | null;
  sucursal_region: string | null;
  sucursal_telefono: string | null;
  sucursal_activo: boolean | null;
  sucursal_creado_en: string | null;
};

type FilaCliente = {
  id: number;
  rut: string;
  razon_social: string;
  nombre_fantasia: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  creado_en: string;
  sucursal: {
    id: number;
    nombre: string;
    codigo_interno: string | null;
    direccion: string | null;
    comuna: string | null;
    region: string | null;
    telefono: string | null;
    activo: boolean;
    creado_en: string;
  }[];
};

export async function exportarClientesSucursales(
  filtro: FiltroFechas,
): Promise<ClienteSucursalExport[]> {
  let consulta = supabaseAdmin()
    .from("cliente")
    .select(
      "id, rut, razon_social, nombre_fantasia, telefono, email, activo, " +
        "creado_en, sucursal ( id, nombre, codigo_interno, direccion, comuna, " +
        "region, telefono, activo, creado_en )",
    )
    .order("razon_social", { ascending: true });

  if (filtro.desde) consulta = consulta.gte("creado_en", filtro.desde);
  if (filtro.hasta) consulta = consulta.lte("creado_en", finDeDia(filtro.hasta));

  const { data, error } = await consulta.returns<FilaCliente[]>();

  if (error) {
    throw new Error(
      `No se pudo generar el export de clientes y sucursales: ${error.message}`,
    );
  }

  return (data ?? []).flatMap((cliente): ClienteSucursalExport[] => {
    const base = {
      cliente_id: cliente.id,
      cliente_rut: cliente.rut,
      razon_social: cliente.razon_social,
      nombre_fantasia: cliente.nombre_fantasia,
      cliente_telefono: cliente.telefono,
      cliente_email: cliente.email,
      cliente_activo: cliente.activo,
      cliente_creado_en: cliente.creado_en,
    };

    if (cliente.sucursal.length === 0) {
      return [
        {
          ...base,
          sucursal_id: null,
          sucursal_nombre: null,
          sucursal_codigo_interno: null,
          sucursal_direccion: null,
          sucursal_comuna: null,
          sucursal_region: null,
          sucursal_telefono: null,
          sucursal_activo: null,
          sucursal_creado_en: null,
        },
      ];
    }

    return cliente.sucursal.map((sucursal) => ({
      ...base,
      sucursal_id: sucursal.id,
      sucursal_nombre: sucursal.nombre,
      sucursal_codigo_interno: sucursal.codigo_interno,
      sucursal_direccion: sucursal.direccion,
      sucursal_comuna: sucursal.comuna,
      sucursal_region: sucursal.region,
      sucursal_telefono: sucursal.telefono,
      sucursal_activo: sucursal.activo,
      sucursal_creado_en: sucursal.creado_en,
    }));
  });
}
