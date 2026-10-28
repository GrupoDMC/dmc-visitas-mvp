// Contrato compartido entre el servidor y el navegador: solo tipos, nada que
// toque la base. Los datos con que el panel y el celular crean, corrigen o
// cambian visitas en bloque.

export interface DatosVisita {
  clienteId: number;
  sucursalId: number;
  tecnicoId: number;
  /** El segundo técnico, si van dos. Nunca el mismo que `tecnicoId`. */
  tecnicoAyudanteId?: number | null;
  /** El motivo principal: el que queda en dmc.visita.motivo_codigo. */
  motivoCodigo: string;
  /** Todos los motivos marcados. Si va vacio se asume solo el principal. */
  motivosCodigos?: string[];
  fechaProgramada: string;
  /** Margen de días: el último día para hacerla. Vacío = un solo día. */
  fechaHasta?: string | null;
  horaProgramada: string | null;
  trabajoSolicitado: string;
  indicacionesAcceso: string | null;
  responsableNombre: string | null;
  responsableRut: string | null;
  responsableTelefono: string | null;
  /** Opcional. No vive en la visita: queda en la lista de personas de la tienda. */
  responsableCargo?: string | null;
  problemaOrigenId?: number | null;
  creadaEnTerreno?: boolean;
  /**
   * Lo que se respondió al aviso de problemas sin resolver de la sucursal. Si
   * la sucursal tiene alguno, el panel no deja agendar sin esto.
   */
  avisoProblemas?: AvisoProblemas | null;
}

/** La respuesta a «¿esta visita es para resolver alguno de estos problemas?». */
export interface AvisoProblemas {
  respuesta: "RESUELVE" | "OTRA_COSA";
  /** Los problemas que mostraba el aviso, para saber si apareció otro entre medio. */
  avisados: number[];
  /** Con RESUELVE, los que la visita va a resolver. Con OTRA_COSA, vacío. */
  elegidos: number[];
}

/** Un problema sin resolver de la sucursal, tal como lo muestra el aviso. */
export interface ProblemaSinResolver {
  id: number;
  /** El nombre del tipo, del catálogo. */
  tipo: string;
  descripcion: string | null;
  estado: string;
  estadoNombre: string;
  /** Cuándo se levantó, ISO. */
  creadoEn: string;
  /** La visita donde se levantó. */
  folio: string;
  /** Si ya hay otra visita agendada para resolverlo, su folio. */
  agendadoEn: string | null;
}

/** Lo que se le cambia a una visita. Lo que no viene, no se toca. */
export interface CambiosVisita {
  tecnicoId?: number;
  /** null = pasa a ir solo. */
  tecnicoAyudanteId?: number | null;
  fecha?: string;
  hora?: string;
  motivosCodigos?: string[];
  trabajoSolicitado?: string;
  indicacionesAcceso?: string;
}
