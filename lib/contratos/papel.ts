// Contrato compartido entre el servidor y el navegador: solo tipos, nada que
// toque la base. Un informe en papel tal como lo carga el panel.

import type { TrabajoActa } from "@/lib/contratos/acta";

/** Un informe en papel, tal como se transcribe. */
export interface InformePapel {
  clienteId: number;
  sucursalId: number;
  tecnicoId: number;
  tecnicoAyudanteId: number | null;
  /** El primero es el principal. */
  motivosCodigos: string[];
  /** Lo marcado del checklist de trabajos, con sus subtrabajos. Opcional. */
  trabajos?: TrabajoActa[];
  /** El día del informe (YYYY-MM-DD). */
  fecha: string;
  firmanteNombre: string;
  firmanteRut: string | null;
  /** Lo que dice el informe: queda como las observaciones del acta. */
  descripcion: string;
  /** Guardarlo aunque ya haya una visita de esa sucursal ese mismo día. */
  aunqueRepetida?: boolean;
}
