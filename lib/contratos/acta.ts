// Contrato compartido entre el servidor y el navegador: solo tipos, nada que
// toque la base. Lo que el celular manda al cerrar o corregir un acta, y lo que
// recibe de vuelta.

import type { EstadoProblema } from "@/lib/types";

export interface ProblemaEdicion {
  /** Id en dmc.problema si ya estaba en el acta; sin id, es uno nuevo. */
  id?: number | null;
  tipoCodigo: string;
  descripcion: string | null;
  items: SubtrabajoActa[];
}

export interface FirmaActa {
  nombre: string;
  rut: string | null;
  dataUrl: string;
}

export interface SubtrabajoActa {
  etiqueta: string;
  cantidad: number;
}

export interface TrabajoActa {
  codigo: string;
  /** Bajo qué motivo lo agregó el técnico. */
  motivoCodigo?: string | null;
  detalle: string | null;
  subtrabajos: SubtrabajoActa[];
}

export interface ProblemaActa {
  tipoCodigo: string;
  estado: EstadoProblema;
  descripcion: string | null;
  solucion: string | null;
  items: SubtrabajoActa[];
}

export interface FotoActa {
  /** data:image/jpeg;base64,… tal como sale del canvas de la cámara. */
  dataUrl: string;
  etiqueta: string | null;
  /** Foto del comentario interno: no la ve el cliente. */
  interno?: boolean;
}

export interface ActaEntrada {
  folio: string;
  responsableNombre: string;
  responsableRut: string | null;
  responsableTelefono: string | null;
  /** Opcional: el cargo de quien firma. Queda en la lista de personas de la tienda. */
  responsableCargo?: string | null;
  /** Los motivos que el técnico confirmó en terreno. El primero es el principal. */
  motivosCodigos: string[];
  observaciones: string | null;
  comentarioInterno: string | null;
  /** Lo marcado del checklist del comentario interno (códigos). */
  internosCodigos?: string[];
  trabajos: TrabajoActa[];
  problemas: ProblemaActa[];
  fotos: FotoActa[];
  /**
   * Los clips que quedaron en el acta, en el orden en que se ven.
   *
   * Van solo los ids: el video no viaja acá. Un minuto en 720p pesa unos 11 MB
   * y el cuerpo de una Server Action se corta en 4,5 MB, así que el clip se
   * sube aparte y por partes en cuanto se termina de grabar (ver
   * lib/data/videos y app/actions/videos). Al cerrar el acta solo queda decir
   * cuáles se conservan: los que no estén acá quedan inactivos.
   */
  videosIds?: number[];
  /** De los de `videosIds`, los que son del comentario interno. */
  videosInternosIds?: number[];
  firma: FirmaActa | null;
  dispositivo: string | null;
  /**
   * Cuándo el técnico apretó "Guardar visita" en el celular. Cuando el acta se
   * llenó sin señal, esa hora es la del cierre real en terreno y puede ser muy
   * anterior a la de esta escritura; se usa como hora de término si es
   * coherente (posterior a la llegada y no futura).
   */
  capturadaEn?: string | null;
  /** true si el acta esperó cobertura guardada en el celular. */
  registradoOffline?: boolean;
}

export interface ResultadoActa {
  ok: boolean;
  /** Por qué no se guardó, en palabras que el técnico entienda. */
  error?: string;
  horaTermino?: string;
}

export interface EdicionActaEntrada {
  folio: string;
  /** Por qué se edita. Obligatorio: queda en el registro. */
  motivoEdicion: string;
  /**
   * Cuántas ediciones tenía el acta cuando se abrió para editar. Si mientras
   * tanto alguien más la editó, esta se rechaza en vez de pisarla.
   */
  edicionesVistas: number;
  responsableNombre: string;
  responsableRut: string | null;
  responsableTelefono: string | null;
  /** El cargo del checklist. Sin definir (undefined) = no se toca el que tenía. */
  responsableCargo?: string | null;
  motivosCodigos: string[];
  observaciones: string | null;
  comentarioInterno: string | null;
  internosCodigos: string[];
  trabajos: TrabajoActa[];
  problemas: ProblemaEdicion[];
  /** Ids de las fotos del acta que se conservan. Las demás quedan inactivas. */
  fotosConservadas: number[];
  fotosNuevas: FotoActa[];
  /** Los clips que quedan, en orden. Los nuevos ya están subidos. */
  videosIds: number[];
  /** De los nuevos, los que son del comentario interno. */
  videosInternosIds: number[];
}
