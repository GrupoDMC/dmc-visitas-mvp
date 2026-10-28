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
  /** En plan de calibración. null = no se sabe. */
  planCalibracion?: boolean | null;
}

/** Una marca que opera un cliente: Cliente → Marca → Sucursal. */
export interface Marca {
  id: number;
  clienteId: number;
  nombre: string;
  activo: boolean;
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
  /** La marca de la tienda: siempre es de `clienteId`. */
  marcaId: number;
  /** El mall donde está la tienda. Null = está a la calle, solo con dirección. */
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
  /** Detalle opcional (migración 017). La fecha va como YYYY-MM-DD; null = no se sabe. */
  fechaInstalacion?: string | null;
  remota?: boolean | null;
  enGarantia?: boolean | null;
  /**
   * La de la tienda por su cuenta (migración 018). Si su cliente está en plan
   * de calibración, la tienda lo está igual: ver `calibracionDeSucursal`.
   */
  planCalibracion?: boolean | null;
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

/**
 * Una sección agrupa motivos o agrupa trabajos para ordenar y plegar la lista.
 * Es solo una capa de presentación: no cambia qué trabajos van con cada motivo.
 */
export interface CatalogoSeccion {
  id: number;
  nombre: string;
  orden: number;
}

export interface CatalogoMotivo {
  id: number;
  codigo: string;
  nombre: string;
  orden: number;
  activo: boolean;
  /** Nombre de su sección. Null = sin sección. */
  seccion?: string | null;
  /** El orden de esa sección entre las demás. */
  seccionOrden?: number;
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
   * Motivos bajo los que se ofrece este trabajo en el acta, en el orden de los
   * motivos. Vacío = no se ofrece en ninguno.
   */
  motivosCodigos: string[];
  /** Su posición dentro de cada motivo (código del motivo → orden). */
  ordenEnMotivo: Record<string, number>;
  /** Nombre de su sección. Null = sin sección. */
  seccion?: string | null;
  /** El orden de esa sección entre las demás. */
  seccionOrden?: number;
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

/** Cargo del responsable de tienda ("Jefe de tienda"). Lista fija del checklist. */
export type CatalogoCargo = CatalogoPendiente;

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

/** Alguien que ya recibió o firmó en una tienda (dmc.persona_local). */
export interface PersonaLocal {
  id: number;
  nombre: string;
  rut: string | null;
  telefono: string | null;
  /** "Jefe de tienda", "Encargado de seguridad"… Opcional. */
  cargo: string | null;
  ultimaVez: string;
}

export interface VisitaEjecucion {
  visitaId: number;
  horaInicio: string;
  horaTermino: string | null;
  responsableNombre: string;
  responsableRut: string | null;
  responsableTelefono: string | null;
  /** El cargo de quien firmó. Opcional; viene del checklist de cargos. */
  responsableCargo?: string | null;
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

/** Foto o video que explica el trabajo a realizar (dmc.visita_adjunto). No es evidencia del acta. */
export interface AdjuntoTrabajo {
  id: number;
  visitaId: number;
  tipo: "FOTO" | "VIDEO";
  nombre: string | null;
  mime: string;
  bytes: number;
  duracionSeg: number | null;
  /** Ruta interna: /api/visita/adjunto/<id>. */
  url: string;
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
  /**
   * Quién cerró el acta, cuando está COMPLETADA: el técnico del último cierre
   * en la bitácora. Null si no está cerrada o la cerró administración. Sirve
   * para que el celular no dé por enviada un acta que cerró el otro técnico.
   */
  cerradaPorTecnicoId: number | null;
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
  /** El cargo que se anotó al agendar. El del acta, si ya se cerró, está en VisitaEjecucion. */
  responsableCargo?: string | null;
  /** Por qué la visita quedó PENDIENTE o CANCELADA — lo escribe el técnico. */
  motivoPendiente: string | null;
  problemaOrigenId: number | null;
  creadaEnTerreno: boolean;
  creadoEn: string;
  // Relaciones ya resueltas para la UI: la consulta trae los maestros con la
  // visita y agrupa las tablas hijas en memoria (ver lib/data/visitas).
  cliente?: Cliente;
  /** La marca de la tienda de la visita. */
  marca?: Pick<Marca, "id" | "nombre">;
  /** Su mall; null = a la calle. */
  mall?: Pick<Mall, "id" | "nombre"> | null;
  sucursal?: Sucursal;
  tecnico?: Tecnico;
  tecnicoAyudante?: Pick<Tecnico, "id" | "nombreCompleto" | "telefono">;
  motivo?: CatalogoMotivo;
  ejecucion?: VisitaEjecucion;
  trabajos?: VisitaTrabajo[];
  problemas?: Problema[];
  fotos?: VisitaFoto[];
  videos?: VisitaVideo[];
  /** Fotos y videos que explican el trabajo a realizar. */
  adjuntos?: AdjuntoTrabajo[];
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
  /**
   * Si quien mira puede asignarle una clave: no a su propia cuenta, ni a una de
   * administrador o con permisos que él no tiene (ver puedeAdministrarCuenta).
   */
  administrable: boolean;
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
  cargos?: number;
  gestionProblemas: number;
}

/**
 * Lo que la ficha de una tienda o de un cliente necesita de cada visita. Se
 * arma en el servidor: la visita completa (fotos, firmas, trabajos…) no viaja
 * al navegador solo para contar y listar.
 */
export interface FilaFicha {
  id: number;
  folio: string;
  fecha: string;
  fechaHasta: string | null;
  hora: string | null;
  estado: EstadoVisita;
  motivos: string;
  /** Cada motivo por separado, para el gráfico de los más frecuentes. */
  motivosLista: string[];
  tecnico: string;
  ayudante: string | null;
  tiendaId: number;
  tienda: string;
  cliente: string;
  mall: string | null;
  problemas: number;
  problemasAbiertos: number;
  /** Minutos en sitio según el acta; null si no hay acta cerrada. */
  minutos: number | null;
}
