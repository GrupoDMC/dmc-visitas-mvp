// "Hoy" de la operación. Toda la app opera en Chile continental, así que la
// fecha se calcula siempre en America/Santiago y no en el huso del servidor:
// en Vercel el runtime corre en UTC y de noche mostraría el día siguiente.

export const ZONA = "America/Santiago";

const FORMATO_FECHA = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Fecha de hoy en Chile, como 'YYYY-MM-DD'. */
export function hoyISO(referencia: Date = new Date()): string {
  return FORMATO_FECHA.format(referencia);
}

/** Lunes de la semana de `fecha`, como 'YYYY-MM-DD'. */
export function inicioSemana(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // lunes=1 … domingo=7
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

/** Suma días a una fecha 'YYYY-MM-DD' sin salirse del calendario. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * 'YYYY-MM-DDTHH:mm:ss' → "24 ago 2026 · 14:35".
 *
 * La marca viene sin zona desde SQL Server (ya es hora de Chile), así que se
 * formatea a mano: dársela a Date la haría interpretar como UTC y correría las
 * horas según dónde esté corriendo el servidor.
 */
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function fechaHoraLegible(marca: string | null | undefined): string {
  if (!marca) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(marca);
  if (!m) return marca;
  const [, anio, mes, dia, hh, mm] = m;
  return `${Number(dia)} ${MESES[Number(mes) - 1] ?? mes} ${anio} · ${hh}:${mm}`;
}

/** Primer día del mes de `fecha`. */
export function inicioMes(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`;
}
