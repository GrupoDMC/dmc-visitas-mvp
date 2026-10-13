

// El modelo de la carga de visitas en papel: técnicos, clientes, tiendas e
// informes mientras se transcriben, y lo que le falta a cada informe.

/** Un técnico de la carga: todo lo que hay adentro lo hizo él. */
export interface Bloque {
  tecnicoId: string;
  abierto: boolean;
}

/** Un cliente dentro del recuadro de un técnico, con su filtro de mall. */
export interface Grupo {
  key: string;
  tecnicoId: string;
  clienteId: string;
  abierto: boolean;
  /** "" = todas las sucursales del cliente; si no, solo las de ese mall. */
  mallId: string;
}

/** Una sucursal del cliente, con sus informes adentro. */
export interface Tienda {
  key: string;
  grupoKey: string;
  sucursalId: string;
  abierto: boolean;
}

/** Un informe en papel mientras se transcribe. El año va arriba y el técnico en su recuadro. */
export interface Informe {
  key: string;
  tiendaKey: string;
  /** "01".."12" */
  mes: string;
  /** "01".."31" */
  dia: string;
  motivo: string;
  /** Los trabajos del checklist que se marcaron bajo el motivo, con sus subtrabajos. */
  trabajos: TrabajoPapel[];
  firmante: string;
  rut: string;
  descripcion: string;
  /** Por qué no se guardó la última vez. */
  error?: string;
  /** Ya hay una visita de esa tienda ese día: se ofrece guardarlo igual. */
  repetida?: boolean;
  aunqueRepetida?: boolean;
}

export interface TrabajoPapel {
  codigo: string;
  subs: { etiqueta: string; cantidad: number }[];
}

export interface Borrador {
  anio: number;
  bloques: Bloque[];
  grupos: Grupo[];
  tiendas: Tienda[];
  informes: Informe[];
}

/** De a cuántos informes se manda al servidor: el avance se ve y nada se corta. */
export const TANDA = 40;

export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

let contador = 0;
export function nuevaKey(): string {
  contador += 1;
  return `${Date.now().toString(36)}-${contador}`;
}

export const dos = (n: number) => String(n).padStart(2, "0");

export function diasDelMes(anio: number, mes: string): number {
  return mes ? new Date(anio, Number(mes), 0).getDate() : 31;
}

/** La fecha completa del informe, o "" si falta el mes o el día. */
export function fechaDe(inf: Informe, anio: number): string {
  return inf.mes && inf.dia ? `${anio}-${inf.mes}-${inf.dia}` : "";
}

/**
 * Lo que le falta al informe para poder guardarse, o null si está completo.
 * El RUT no cuenta: uno mal escrito en el papel se guarda igual, con aviso.
 */
export function faltante(inf: Informe, anio: number, hoy: string): string | null {
  if (!inf.mes) return "Falta el mes.";
  if (!inf.dia) return "Falta el día.";
  if (Number(inf.dia) > diasDelMes(anio, inf.mes)) return `${MESES[Number(inf.mes) - 1]} de ${anio} no tiene día ${Number(inf.dia)}.`;
  if (fechaDe(inf, anio) > hoy) return "La fecha no puede ser futura.";
  if (!inf.motivo) return "Falta el motivo.";
  if (!inf.firmante.trim()) return "Falta quién firmó.";
  if (!inf.descripcion.trim()) return "Falta la descripción.";
  return null;
}
