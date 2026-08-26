// Tipos 1:1 con el schema `dmc` definido en sql/dmc_contingencia_sqlserver.sql.
// Es la forma que devuelve la capa de consultas de lib/data/*, ya con los
// nombres en camelCase y las fechas como texto ISO.

export type RolUsuario = "ADMIN" | "COORDINADOR" | "TECNICO";

export type EstadoVisita =
  | "PROGRAMADA"
  | "EN_CURSO"
  | "COMPLETADA"
  | "PENDIENTE"
  | "REAGENDADA"
  | "CANCELADA"
  /**
   * La cierra administración desde el panel: una visita que quedó vieja o que
   * ya no sirve. CANCELADA, en cambio, la deja el técnico parado en la tienda.
   * Solo se puede aplicar sobre PROGRAMADA o EN_CURSO; una COMPLETADA ya tiene
   * acta firmada y no se toca.
   */
  | "CANCELADA_ADMIN";

export type EstadoProblema = "ABIERTO" | "PENDIENTE" | "RESUELTO";

export type OrigenRegistro = "MOVIL" | "WEB";

export interface Cliente {
  id: number;
  rut: string;
  razonSocial: string;
  nombreFantasia: string;
  activo: boolean;
}

export interface Sucursal {
  id: number;
  clienteId: number;
  nombre: string;
  codigo: string;
  direccion: string;
  comuna: string;
  region: string;
  telefono: string | null;
  activo: boolean;
}

export interface Tecnico {
  id: number;
  rut: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombreCompleto: string;
  email: string;
  telefono: string | null;
  activo: boolean;
}

export interface Usuario {
  id: number;
  email: string;
  rol: RolUsuario;
  tecnicoId: number | null;
  activo: boolean;
  ultimoAccesoEn: string | null;
}

export interface CatalogoMotivo {
  id: number;
  codigo: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface CatalogoProblemaOpcion {
  id: number;
  problemaId: number;
  etiqueta: string;
  orden: number;
  /** false = el técnico solo la marca; true = la marca y le pone cantidad. */
  permiteCantidad: boolean;
  activo: boolean;
}

export interface CatalogoProblema {
  id: number;
  codigo: string;
  nombre: string;
  grupoLabel: string | null;
  singular: string | null;
  ayuda: string | null;
  orden: number;
  activo: boolean;
  opciones: CatalogoProblemaOpcion[];
}

export interface CatalogoTrabajoSubtrabajo {
  id: number;
  trabajoId: number;
  etiqueta: string;
  orden: number;
  /** false = el técnico solo lo marca; true = lo marca y le pone cantidad. */
  permiteCantidad: boolean;
  activo: boolean;
}

export interface CatalogoTrabajo {
  id: number;
  codigo: string;
  nombre: string;
  grupoLabel: string | null;
  singular: string | null;
  orden: number;
  activo: boolean;
  subtrabajos: CatalogoTrabajoSubtrabajo[];
}

export interface VisitaTrabajoSubtrabajo {
  id: number;
  visitaTrabajoId: number;
  etiqueta: string;
  cantidad: number;
  orden: number;
}

export interface VisitaTrabajo {
  id: number;
  visitaId: number;
  trabajoCodigo: string;
  detalle: string | null;
  orden: number;
  subtrabajos: VisitaTrabajoSubtrabajo[];
}

export interface ProblemaItem {
  id: number;
  problemaId: number;
  etiqueta: string;
  cantidad: number;
}

export interface Problema {
  id: number;
  visitaId: number;
  tipoCodigo: string;
  estado: EstadoProblema;
  descripcion: string | null;
  solucion: string | null;
  orden: number;
  resueltoEn: string | null;
  creadoEn: string;
  items: ProblemaItem[];
}

export interface VisitaEjecucion {
  visitaId: number;
  horaInicio: string;
  horaTermino: string | null;
  responsableNombre: string;
  responsableRut: string | null;
  responsableTelefono: string | null;
  motivoRealCodigo: string | null;
  /** Todos los motivos que el técnico confirmó en terreno, no solo el primero. */
  motivosRealesCodigos: string[];
  observaciones: string | null;
  comentarioInterno: string | null;
  dispositivo: string | null;
  appVersion: string | null;
  registradoOffline: boolean;
  sincronizadoEn: string | null;
}

export interface VisitaFoto {
  id: number;
  visitaId: number;
  problemaId: number | null;
  etiqueta: string | null;
  archivoUrl: string;
  orden: number;
  tomadaEn: string | null;
}

/** Clip del trabajo: 720p y hasta 1 minuto, servido desde la base. */
export interface VisitaVideo {
  id: number;
  visitaId: number;
  problemaId: number | null;
  etiqueta: string | null;
  /** Ruta interna: /api/visita/video/<id>. */
  archivoUrl: string;
  mime: string;
  bytes: number | null;
  duracionSeg: number | null;
  ancho: number | null;
  alto: number | null;
  orden: number;
  grabadoEn: string | null;
}

export interface VisitaFirma {
  id: number;
  visitaId: number;
  rol: "TIENDA" | "TECNICO";
  nombre: string;
  rut: string | null;
  imagenUrl: string;
  firmadoEn: string;
}

export interface Reagendamiento {
  id: number;
  visitaId: number;
  fechaAnterior: string;
  horaAnterior: string | null;
  fechaNueva: string | null;
  horaNueva: string | null;
  motivo: string;
  origen: OrigenRegistro;
}

export interface Visita {
  id: number;
  folio: string;
  clienteId: number;
  sucursalId: number;
  tecnicoId: number;
  motivoCodigo: string;
  /**
   * Todos los motivos agendados. `motivoCodigo` es el principal (el primero de
   * esta lista): es el que tiene la FK y el CHECK de la hora en instalación.
   */
  motivosCodigos: string[];
  /** Los mismos motivos, ya con su nombre del catálogo, para pintarlos. */
  motivosNombres: string[];
  estado: EstadoVisita;
  fechaProgramada: string;
  horaProgramada: string | null;
  trabajoSolicitado: string;
  indicacionesAcceso: string | null;
  responsableNombre: string | null;
  /** Lo que se supo al agendar. El acta guarda el suyo en VisitaEjecucion. */
  responsableRut: string | null;
  responsableTelefono: string | null;
  /** Por qué la visita quedó PENDIENTE o CANCELADA — lo escribe el técnico. */
  motivoPendiente: string | null;
  problemaOrigenId: number | null;
  creadaEnTerreno: boolean;
  creadoEn: string;
  // Relaciones ya resueltas para la UI: la consulta trae los maestros con la
  // visita y agrupa las tablas hijas en memoria (ver lib/data/visitas).
  cliente?: Cliente;
  sucursal?: Sucursal;
  tecnico?: Tecnico;
  motivo?: CatalogoMotivo;
  ejecucion?: VisitaEjecucion;
  trabajos?: VisitaTrabajo[];
  problemas?: Problema[];
  fotos?: VisitaFoto[];
  videos?: VisitaVideo[];
  firmas?: VisitaFirma[];
  reagendamientos?: Reagendamiento[];
}

export type EstadoSolicitudPassword = "PENDIENTE" | "ATENDIDA" | "DESCARTADA";

/** "Olvidé mi contraseña": lo pide el usuario, lo atiende el administrador. */
export interface SolicitudPassword {
  id: number;
  email: string;
  usuarioId: number | null;
  mensaje: string | null;
  estado: EstadoSolicitudPassword;
  atendidoPor: number | null;
  atendidoEn: string | null;
  creadoEn: string;
  /** Sale del join con dmc.usuario; null si el correo no está dado de alta. */
  usuarioRol: RolUsuario | null;
  usuarioActivo: boolean | null;
}

/** Foto de las tres listas del checklist, para el botón Reiniciar. */
export interface ChecklistPlantilla {
  id: number;
  nombre: string;
  creadoEn: string;
  actualizadoEn: string;
  motivos: number;
  problemas: number;
  trabajos: number;
}
