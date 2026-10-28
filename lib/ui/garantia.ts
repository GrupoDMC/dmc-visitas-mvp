// Garantía de una sucursal (migración 029).
//
// Regla de precedencia, una sola:
//   1. Si la sucursal tiene duración propia (garantia_meses), manda esa.
//   2. Si no, aplica el plan de su cliente (cliente.garantia_meses).
//   3. Si ninguno tiene duración, la sucursal no tiene garantía definida.
// En los dos primeros casos la duración corre desde la fecha de instalación de
// la sucursal; sin esa fecha no hay vencimiento que calcular.
//
// Puro y sin base de datos: la ficha, las tablas y los tests lo usan igual.

/** Desde cuántos días antes del vencimiento la garantía figura «por vencer». */
export const DIAS_POR_VENCER = 30;

export type EstadoGarantia = "VIGENTE" | "POR_VENCER" | "VENCIDA" | "SIN_FECHA" | "SIN_GARANTIA";

export interface Garantia {
  estado: EstadoGarantia;
  /** De quién viene la duración. Null = ninguno la define. */
  origen: "SUCURSAL" | "CLIENTE" | null;
  meses: number | null;
  /** YYYY-MM-DD. Solo hay vencimiento con duración y fecha de instalación. */
  vence: string | null;
  /** Días que faltan para vencer (negativo = ya venció). */
  diasRestantes: number | null;
}

export const ETIQUETA_GARANTIA: Record<EstadoGarantia, string> = {
  VIGENTE: "Garantía vigente",
  POR_VENCER: "Garantía por vencer",
  VENCIDA: "Garantía vencida",
  SIN_FECHA: "Garantía sin fecha de instalación",
  SIN_GARANTIA: "Sin garantía definida",
};

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Suma meses a una fecha YYYY-MM-DD. Si el día no existe en el mes de llegada
 * (31 de enero + 1 mes), queda en el último día de ese mes.
 */
export function sumarMeses(fecha: string, meses: number): string {
  const m = FECHA.exec(fecha);
  if (!m) throw new Error(`Fecha inválida: ${fecha}`);
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const total = anio * 12 + (mes - 1) + meses;
  const a = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(a, mm, 0)).getUTCDate();
  const d = Math.min(dia, ultimo);
  return `${String(a).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Días de `desde` a `hasta` (ambas YYYY-MM-DD). */
function diasEntre(desde: string, hasta: string): number {
  const t = (f: string) => {
    const m = FECHA.exec(f)!;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  return Math.round((t(hasta) - t(desde)) / 86_400_000);
}

/**
 * Estado de la garantía de una sucursal el día `hoy` (YYYY-MM-DD). La garantía
 * vale hasta el día del vencimiento inclusive.
 */
export function garantiaDe(
  sucursal: { fechaInstalacion?: string | null; garantiaMeses?: number | null },
  cliente: { garantiaMeses?: number | null } | undefined,
  hoy: string
): Garantia {
  const propia = sucursal.garantiaMeses ?? null;
  const delCliente = cliente?.garantiaMeses ?? null;
  const origen = propia !== null ? "SUCURSAL" : delCliente !== null ? "CLIENTE" : null;
  const meses = propia ?? delCliente;

  if (origen === null || meses === null) {
    return { estado: "SIN_GARANTIA", origen: null, meses: null, vence: null, diasRestantes: null };
  }
  if (!sucursal.fechaInstalacion || !FECHA.test(sucursal.fechaInstalacion)) {
    return { estado: "SIN_FECHA", origen, meses, vence: null, diasRestantes: null };
  }
  const vence = sumarMeses(sucursal.fechaInstalacion, meses);
  const diasRestantes = diasEntre(hoy, vence);
  const estado: EstadoGarantia =
    diasRestantes < 0 ? "VENCIDA" : diasRestantes <= DIAS_POR_VENCER ? "POR_VENCER" : "VIGENTE";
  return { estado, origen, meses, vence, diasRestantes };
}

/** ¿Cubre hoy? (vigente o por vencer). */
export const enGarantia = (g: Garantia): boolean => g.estado === "VIGENTE" || g.estado === "POR_VENCER";

/** «12 meses · plan del cliente · vence el 2027-03-10 (en 41 días)». */
export function resumenGarantia(g: Garantia): string {
  if (g.estado === "SIN_GARANTIA") return ETIQUETA_GARANTIA.SIN_GARANTIA;
  const quien = g.origen === "CLIENTE" ? "plan del cliente" : "propia de la sucursal";
  const base = `${g.meses} ${g.meses === 1 ? "mes" : "meses"} · ${quien}`;
  if (g.vence === null || g.diasRestantes === null) return `${base} · falta la fecha de instalación`;
  const d = g.diasRestantes;
  const cuando = d < 0 ? `venció hace ${-d} ${-d === 1 ? "día" : "días"}` : d === 0 ? "vence hoy" : `vence en ${d} ${d === 1 ? "día" : "días"}`;
  return `${base} · vence el ${g.vence} (${cuando})`;
}
