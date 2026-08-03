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

/** tipo de firma (firma.tipo) */
export type TipoFirma = "TECNICO" | "TIENDA";

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
 * visita — todas las columnas propias (sin contar las FK ya resueltas como
 * embebidos en los listados y el detalle).
 *
 * `fecha_programada` es `date` y `hora_programada` es `time`: llegan como
 * `"2026-08-12"` y `"09:30:00"`, sin zona horaria. Ver `lib/fechas.ts`.
 * `fecha_inicio` y `fecha_termino` sí son `timestamptz` — las pone el
 * servidor con `now()`, nunca el navegador.
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

/** Los datos embebidos que acompañan a una visita en los listados. */
export type ClienteDeVisita = { razon_social: string };
export type SucursalDeVisita = {
  nombre: string;
  direccion: string | null;
  comuna: string | null;
  telefono: string | null;
};
export type TecnicoDeVisita = { nombres: string; apellidos: string };

/** problema */
export type ProblemaRow = {
  id: number;
  visita_id: number;
  sucursal_id: number;
  descripcion: string;
  solucion_sugerida: string | null;
  estado: EstadoProblema;
  detectado_en: string;
};

/** material_terreno */
export type MaterialRow = {
  id: number;
  visita_id: number;
  descripcion: string;
  codigo_producto: string | null;
  cantidad: number;
  direccion: DireccionMaterial;
  observacion: string | null;
};

/** firma */
export type FirmaRow = {
  id: number;
  visita_id: number;
  tipo: TipoFirma;
  firmante_nombre: string | null;
  firmante_rut: string | null;
  imagen: string;
  firmado_en: string;
};

/**
 * visita_reagendamiento (docs/03_reagendamiento.sql). `fecha_anterior` y
 * `hora_anterior` pueden ser NULL: es el caso de una visita que nació en
 * terreno y todavía no tenía fecha cuando se reagendó.
 */
export type ReagendamientoRow = {
  id: number;
  visita_id: number;
  fecha_anterior: string | null;
  hora_anterior: string | null;
  fecha_nueva: string;
  hora_nueva: string | null;
  motivo: string;
  reagendado_por: string | null;
  reagendado_en: string;
};
