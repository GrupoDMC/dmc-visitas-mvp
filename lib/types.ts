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

/**
 * El código de un estado de problema (dmc.catalogo_problema_estado). Ya no
 * son tres fijos: la Lista 7 del Checklist agrega estados intermedios. Los dos
 * que el sistema conoce por nombre son ABIERTO (con el que nace) y RESUELTO
 * (el único que lo cierra).
 */
export type EstadoProblema = string;

export interface CatalogoEstadoProblema {
  /** null en los tres de respaldo, cuando la base todavía no tiene el catálogo. */
  id: number | null;
  codigo: string;
  nombre: string;
  orden: number;
  /** false = ya no se ofrece, pero los problemas que lo tienen lo siguen mostrando. */
  activo: boolean;
}

export type OrigenRegistro = "MOVIL" | "WEB";

export interface Cliente {
  id: number;
  rut: string;
  razonSocial: string;
  nombreFantasia: string;
  activo: boolean;
  /** Por qué se desactivó. Solo lo llevan los inactivos. */
  motivoInactivo?: string | null;
  /** Texto libre del panel. */
  notas?: string | null;
}

/** Un centro comercial. Sus tiendas son las sucursales con ese `mallId`. */
export interface Mall {
  id: number;
  nombre: string;
  direccion: string;
  /** Vacías en los malls creados antes de la migración 012. */
  comuna: string;
  region: string;
  activo: boolean;
}

export interface Sucursal {
  id: number;
  clienteId: number;
  /** El mall donde está la tienda. Null = no está en ninguno. */
  mallId?: number | null;
  nombre: string;
  /** Código interno de la sucursal. Opcional. */
  codigo: string | null;
  direccion: string;
  comuna: string;
  region: string;
  telefono: string | null;
  activo: boolean;
  /** Por qué se desactivó. Solo lo llevan las inactivas. */
  motivoInactivo?: string | null;
  /** Texto libre del panel. */
  notas?: string | null;
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
  /** El rol del panel (dmc.rol). Solo lo llevan las cuentas COORDINADOR. */
  rolId?: number | null;
  tecnicoId: number | null;
  activo: boolean;
  ultimoAccesoEn: string | null;
}

/** Un rol del panel con lo que puede hacer. Ver lib/permisos.ts. */
export interface Rol {
  id: number;
  nombre: string;
  descripcion: string | null;
  /** No se puede eliminar; sus permisos sí se editan. */
  esSistema: boolean;
  /** Cuántos usuarios lo tienen asignado. */
  usuarios: number;
  permisos: string[];
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
  /**
   * Motivos bajo los que se ofrece este trabajo en el acta. Vacío = se ofrece
   * en todos (dmc.catalogo_motivo_trabajo sin filas para él).
   */
  motivosCodigos: string[];
}

/** Ítem del checklist del comentario interno. No lo ve el cliente. */
export interface CatalogoInterno {
  id: number;
  codigo: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

/**
 * Paso del checklist con que coordinación gestiona una visita reagendada o
 * pendiente ("Repuesto pedido", "Tienda confirmó acceso"). Solo vive en el panel.
 */
export interface CatalogoPendiente {
  id: number;
  codigo: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

/**
 * Paso del checklist con que coordinación lleva un problema hasta cerrarlo
 * ("Repuesto cotizado", "Cliente aprobó"). Solo vive en el panel.
 */
export type CatalogoGestionProblema = CatalogoPendiente;

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
  /** Bajo qué motivo lo registró el técnico. Null en actas anteriores. */
  motivoCodigo: string | null;
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
  /**
   * Hasta cuándo el técnico puede corregir el acta: un día después de
   * cerrarla. Null si todavía no se cierra. El administrador no tiene plazo.
   */
  editableHasta: string | null;
  /** true mientras ese plazo siga abierto. Lo decide la base, con su reloj. */
  editablePorTecnico: boolean;
}

/** Una corrección hecha al acta después de cerrarla (dmc.visita_edicion). */
export interface VisitaEdicion {
  id: number;
  visitaId: number;
  /** MOVIL = la hizo el técnico en el celular; WEB = se hizo desde el panel. */
  origen: OrigenRegistro;
  /** Quién la hizo: el nombre del técnico o el correo de la cuenta del panel. */
  por: string;
  /** Por qué se cambió, en palabras de quien editó. */
  motivo: string;
  /** Qué partes del acta se tocaron. */
  secciones: string[];
  /** Qué cambió exactamente, una línea por cambio. */
  detalle: string[];
  editadoEn: string;
}

export interface VisitaFoto {
  id: number;
  visitaId: number;
  problemaId: number | null;
  /** Foto del comentario interno: no sale en el PDF ni en el correo al cliente. */
  interno: boolean;
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
  /** Clip del comentario interno: no sale en el PDF ni en el correo al cliente. */
  interno: boolean;
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
  /**
   * El segundo técnico, cuando van dos al mismo local. Cualquiera de los dos
   * puede llenar el acta, pero solo uno: el que la inicia (ver
   * `tomadaPorTecnicoId`).
   */
  tecnicoAyudanteId: number | null;
  /**
   * Quién la tiene tomada mientras está EN_CURSO: el asignado o el ayudante,
   * el que apretó "Iniciar visita". Solo él puede terminarla, hasta que
   * administración la libere. Null en cualquier otro estado.
   */
  tomadaPorTecnicoId: number | null;
  motivoCodigo: string;
  /**
   * Todos los motivos agendados. `motivoCodigo` es el principal (el primero de
   * esta lista): es el que tiene la FK en dmc.visita.
   */
  motivosCodigos: string[];
  /** Los mismos motivos, ya con su nombre del catálogo, para pintarlos. */
  motivosNombres: string[];
  estado: EstadoVisita;
  fechaProgramada: string;
  /**
   * Margen de días: el último día en que se puede hacer. Null = un solo día.
   * Con valor, la visita vale cualquier día entre `fechaProgramada` y este.
   */
  fechaHasta: string | null;
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
  tecnicoAyudante?: Pick<Tecnico, "id" | "nombreCompleto" | "telefono">;
  motivo?: CatalogoMotivo;
  ejecucion?: VisitaEjecucion;
  trabajos?: VisitaTrabajo[];
  problemas?: Problema[];
  fotos?: VisitaFoto[];
  videos?: VisitaVideo[];
  firmas?: VisitaFirma[];
  /** Lo marcado del checklist del comentario interno, con su nombre. */
  internos?: { codigo: string; nombre: string }[];
  reagendamientos?: Reagendamiento[];
  /** Las correcciones hechas al acta ya cerrada, de la más nueva a la más vieja. */
  ediciones?: VisitaEdicion[];
  /**
   * Solo viene en una visita eliminada, y esas solo las lee el administrador:
   * quién la sacó de circulación y cuándo. Para todo el resto no existe.
   */
  eliminacion?: { por: string; en: string };
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
  internos: number;
  pendientes: number;
  gestionProblemas: number;
}
