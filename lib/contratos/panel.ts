// Contrato compartido entre el servidor y el navegador: solo tipos, nada que
// toque la base. Lo que el servidor arma para las vistas de reagendas,
// problemas e historial.

import type { TagVariant } from "@/lib/ui/estado";
import type {
  CatalogoGestionProblema,
  CatalogoPendiente,
  EstadoProblema,
  EstadoVisita,
  OrigenRegistro,
  Visita,
} from "@/lib/types";

export interface HistorialProblema {
  tipo: string;
  detalle: string;
  estado: string;
  tag: TagVariant;
}

/** Una visita del local, para leer qué más ha pasado ahí. */
export interface VisitaDeLocal {
  folio: string;
  fecha: string;
  estado: EstadoVisita;
  tecnico: string;
  motivo: string | null;
  /** Los trabajos realizados, ya con nombre y separados por " · ". */
  trabajos: string | null;
  observaciones: string | null;
}

/** Un cambio de estado o de tipo, tal como quedó en dmc.problema_historial. */
export interface CambioProblema {
  campo: "ESTADO" | "TIPO";
  antes: string;
  ahora: string;
  /** Lo que se escribió al hacer el cambio, si se escribió algo. */
  nota: string | null;
  por: string | null;
  en: string;
}

/** Un paso del checklist de gestión ya marcado en una visita. */
export interface GestionMarca {
  codigo: string;
  /** Quién lo marcó: su nombre si es técnico, si no su correo. */
  por: string | null;
  en: string;
}

export interface ProblemaLocal {
  id: number;
  tipoCodigo: string;
  estado: EstadoProblema;
  descripcion: string | null;
  solucion: string | null;
  items: { etiqueta: string; cantidad: number }[];
  /** La visita donde se levantó. */
  folio: string;
  fecha: string;
  resueltoEn: string | null;
}

export interface VisitaLocal {
  folio: string;
  fecha: string;
  estado: EstadoVisita;
  tecnico: string;
  motivos: string[];
  trabajosCodigos: string[];
  observaciones: string | null;
  /** Por qué quedó pendiente o cancelada, si fue el caso. */
  motivoTecnico: string | null;
}

/** Todo lo registrado en una sucursal, de lo más nuevo a lo más viejo. */
export interface HistorialLocal {
  visitas: VisitaLocal[];
  problemas: ProblemaLocal[];
}

export interface Pendiente {
  visita: Visita;
  /** Cuándo quedó en este estado y quién la dejó así. Null si la bitácora no lo trae. */
  desde: { en: string; por: string | null; origen: OrigenRegistro } | null;
  /** Días que lleva esperando, contados desde `desde` (o desde su fecha programada). */
  dias: number;
  gestion: GestionMarca[];
}

export interface DatosPendientes {
  pendientes: Pendiente[];
  /** Por id de sucursal. Incluye a la propia visita pendiente: la vista la aparta. */
  historial: Record<number, HistorialLocal>;
  /** La Lista 5 del checklist, en su orden. */
  pasos: CatalogoPendiente[];
}

export interface ProblemaPanel {
  id: number;
  tipoCodigo: string;
  estado: EstadoProblema;
  descripcion: string | null;
  solucion: string | null;
  items: { id: number; etiqueta: string; cantidad: number }[];
  /** Cuándo lo levantó el técnico (al guardar el acta). */
  creadoEn: string;
  resueltoEn: string | null;
  /** Sin cerrar: días que lleva abierto. Resuelto: días que tardó en cerrarse. */
  dias: number;
  /** La visita donde se levantó. */
  visita: { folio: string; fechaProgramada: string; tecnico: string; motivo: string | null };
  /** La última visita agendada para resolverlo, si la hay. */
  agenda: { folio: string; fecha: string; tecnico: string; estado: EstadoVisita } | null;
  gestion: GestionMarca[];
  /** Del más viejo al más nuevo. */
  cambios: CambioProblema[];
}

export interface GrupoProblemas {
  sucursalId: number;
  nombre: string;
  cliente: string;
  clienteId: number;
  comuna: string;
  total: number;
  abiertos: number;
  /** Del más nuevo al más viejo. */
  items: ProblemaPanel[];
  /** Todas las visitas del local, de la más nueva a la más vieja. */
  visitas: VisitaDeLocal[];
}

export interface DatosProblemas {
  grupos: GrupoProblemas[];
  /** La Lista 6 del checklist, en su orden. */
  pasos: CatalogoGestionProblema[];
  /** "Hoy" en Chile: la referencia de las antigüedades y de los gráficos. */
  hoy: string;
}

export interface HistorialVista {
  hay: boolean;
  encabezado: string;
  trabajos: string[];
  obs: string;
  problemas: HistorialProblema[];
  sinProblemas: boolean;
}
