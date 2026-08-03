/**
 * Tipos que reflejan docs/01_esquema.sql. No inventar columnas acá:
 * si falta una, primero se agrega en el esquema.
 */

export type Rol = "ADMIN" | "COORDINADOR" | "TECNICO";

/** cat_estado_visita */
export type EstadoVisita =
  | "PROGRAMADA"
  | "EN_CURSO"
  | "REALIZADA"
  | "PENDIENTE"
  | "REAGENDADA"
  | "CANCELADA";

/** cat_tipo_trabajo */
export type TipoTrabajo =
  | "INSTALACION"
  | "MANTENCION"
  | "REPARACION"
  | "RETIRO"
  | "CAPACITACION"
  | "VISITA_TEC";

/** cat_estado_problema */
export type EstadoProblema = "ABIERTO" | "EN_GESTION" | "RESUELTO";

/** cat_direccion_material */
export type DireccionMaterial = "INSTALADO" | "RETIRADO";

/** perfil — el id ES el id de auth.users */
export type PerfilRow = {
  id: string;
  nombre: string;
  rol: Rol;
  tecnico_id: number | null;
  activo: boolean;
  creado_en: string;
};

/** cliente */
export type ClienteRow = {
  id: number;
  rut: string;
  razon_social: string;
  nombre_fantasia: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  creado_en: string;
};

/** sucursal */
export type SucursalRow = {
  id: number;
  cliente_id: number;
  nombre: string;
  codigo_interno: string | null;
  direccion: string | null;
  comuna: string | null;
  region: string | null;
  telefono: string | null;
  activo: boolean;
  creado_en: string;
};

/** tecnico */
export type TecnicoRow = {
  id: number;
  rut: string;
  nombres: string;
  apellidos: string;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  creado_en: string;
};

/**
 * visita — solo las columnas que la fase 3 lee o escribe.
 *
 * Las de terreno (trabajo_realizado, observaciones, motivo_pendiente,
 * responsable_tienda_*, fecha_inicio, fecha_termino) existen en el esquema y
 * las llena la fase 4.
 *
 * `fecha_programada` es `date` y `hora_programada` es `time`: llegan como
 * `"2026-08-12"` y `"09:30:00"`, sin zona horaria. Ver `lib/fechas.ts`.
 */
export type VisitaRow = {
  id: number;
  folio: string;
  cliente_id: number;
  sucursal_id: number;
  tecnico_id: number | null;
  estado: EstadoVisita;
  tipo_trabajo: TipoTrabajo | null;
  fecha_programada: string | null;
  hora_programada: string | null;
  contacto_nombre: string | null;
  contacto_email: string | null;
  contacto_telefono: string | null;
  descripcion_trabajo: string | null;
  creado_en: string;
};

/** Los datos embebidos que acompañan a una visita en los listados. */
export type ClienteDeVisita = { razon_social: string };
export type SucursalDeVisita = {
  nombre: string;
  direccion: string | null;
  comuna: string | null;
  telefono: string | null;
};
export type TecnicoDeVisita = { nombres: string; apellidos: string };
