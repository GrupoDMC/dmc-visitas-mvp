// Contrato compartido entre el servidor y el navegador: solo tipos, nada que
// toque la base. El borrador del checklist que arma el panel y lo que vuelve al
// guardarlo.

/** Una entrada del borrador. `id` en null significa que es nueva. */
export interface ItemBorrador {
  id: number | null;
  etiqueta: string;
  permiteCantidad: boolean;
}

export interface MotivoBorrador {
  id: number | null;
  nombre: string;
}

export interface ProblemaBorrador {
  id: number | null;
  nombre: string;
  grupoLabel: string | null;
  opciones: ItemBorrador[];
}

/** Un motivo con los trabajos que se ofrecen bajo él. */
export interface MotivoConTrabajos extends MotivoBorrador {
  /**
   * Sus trabajos en orden, POR NOMBRE y no por id: un trabajo recién agregado
   * en el mismo borrador todavía no tiene id. Vacío = ninguno.
   */
  trabajos?: string[];
  /** Su sección, por nombre (debe estar en `seccionesMotivo`). Null o ausente = sin sección. */
  seccion?: string | null;
}

export interface TrabajoBorrador {
  id: number | null;
  nombre: string;
  grupoLabel: string | null;
  subtrabajos: ItemBorrador[];
  /** Su sección, por nombre (debe estar en `seccionesTrabajo`). Null o ausente = sin sección. */
  seccion?: string | null;
  /**
   * Solo plantillas guardadas antes de los trabajos por motivo: los motivos del
   * trabajo, por nombre, con vacío = todos. Ahora la relación viaja en
   * `motivos[].trabajos`.
   */
  motivos?: string[];
}

export interface BorradorChecklist {
  motivos: MotivoConTrabajos[];
  problemas: ProblemaBorrador[];
  trabajos: TrabajoBorrador[];
  /**
   * Las secciones de motivos y de trabajos, por nombre y en su orden. Sin la
   * lista (un panel viejo todavía abierto) no se tocan las secciones.
   */
  seccionesMotivo?: string[];
  seccionesTrabajo?: string[];
  /** Checklist del comentario interno. Misma forma que los motivos. */
  internos?: MotivoBorrador[];
  /** Checklist de gestión de reagendas y pendientes. Misma forma que los motivos. */
  pendientes?: MotivoBorrador[];
  /** Cargos del responsable de tienda. Misma forma que los motivos. */
  cargos?: MotivoBorrador[];
  /** Checklist de gestión de problemas. Misma forma que los motivos. */
  gestionProblemas?: MotivoBorrador[];
  /** Los estados de un problema. Misma forma que los motivos. */
  estadosProblema?: MotivoBorrador[];
}

export interface ResumenChecklist {
  motivos: number;
  problemas: number;
  trabajos: number;
  internos: number;
  pendientes: number;
  cargos: number;
  gestionProblemas: number;
  estadosProblema: number;
  desactivados: number;
}
