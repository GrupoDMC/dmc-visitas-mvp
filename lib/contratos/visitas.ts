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
