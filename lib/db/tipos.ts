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
