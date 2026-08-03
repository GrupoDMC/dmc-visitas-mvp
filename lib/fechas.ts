/**
 * Fechas de agendamiento.
 *
 * REGLA: `visita.fecha_programada` es `date` y `hora_programada` es `time`.
 * Ninguna de las dos tiene zona horaria, y no la queremos. Una visita agendada
 * el 12 de agosto a las 09:30 es eso en Concepción y en cualquier lado.
 *
 * Por eso acá NO se construyen objetos `Date` a partir de esos valores para
 * mostrarlos: `new Date("2026-08-12")` se interpreta como medianoche UTC y en
 * Chile se imprime como 11 de agosto. El formateo se hace partiendo la cadena.
 *
 * Los `Date` aparecen en un solo lugar, `hoyEnChile()`, porque "hoy" sí depende
 * de dónde estás parado — y el servidor de Vercel está en UTC.
 */

const ZONA = "America/Santiago";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const MESES_CORTOS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

// 0 = domingo, como devuelve getUTCDay().
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/**
 * Hoy en Chile, en formato `YYYY-MM-DD`.
 *
 * `en-CA` es el truco: es el único locale común que formatea ISO. Hacerlo con
 * `toISOString()` daría la fecha UTC, que después de las 21:00 en Chile ya es
 * mañana — y "mañana" en el listado del técnico es la peor hora para
 * equivocarse, justo cuando revisa el trabajo del día siguiente.
 */
export function hoyEnChile(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function partes(iso: string): [number, number, number] | null {
  const coincide = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!coincide) return null;
  return [Number(coincide[1]), Number(coincide[2]), Number(coincide[3])];
}

/** Suma (o resta) días a una fecha ISO. Todo el cálculo va en UTC. */
export function sumarDias(iso: string, dias: number): string {
  const p = partes(iso);
  if (!p) return iso;
  const [anio, mes, dia] = p;
  const movida = new Date(Date.UTC(anio, mes - 1, dia) + dias * 86_400_000);
  return movida.toISOString().slice(0, 10);
}

/**
 * El domingo de la semana que contiene a `iso`. La semana arranca el lunes,
 * que es como se reparte el trabajo acá.
 */
export function finDeSemanaDe(iso: string): string {
  const p = partes(iso);
  if (!p) return iso;
  const [anio, mes, dia] = p;
  const domingoCero = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  const desdeLunes = domingoCero === 0 ? 7 : domingoCero;
  return sumarDias(iso, 7 - desdeLunes);
}

/** `03-08-2026`. El formato de tabla: corto, alineable y sin ambigüedad. */
export function fechaCorta(iso: string | null): string | null {
  const p = iso ? partes(iso) : null;
  if (!p) return null;
  const [anio, mes, dia] = p;
  return `${String(dia).padStart(2, "0")}-${String(mes).padStart(2, "0")}-${anio}`;
}

/** `lun 3 ago`. Para las tarjetas del técnico, donde el día de la semana manda. */
export function diaYMes(iso: string | null): string | null {
  const p = iso ? partes(iso) : null;
  if (!p) return null;
  const [anio, mes, dia] = p;
  const nombreDia = DIAS_CORTOS[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()];
  return `${nombreDia} ${dia} ${MESES_CORTOS[mes - 1]}`;
}

/** `3 de agosto de 2026`. Para encabezados, donde hay lugar. */
export function fechaLarga(iso: string | null): string | null {
  const p = iso ? partes(iso) : null;
  if (!p) return null;
  const [anio, mes, dia] = p;
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

/**
 * `09:30`. Postgres devuelve `time` como `09:30:00`; los segundos no aportan
 * nada en un agendamiento.
 */
export function horaCorta(valor: string | null): string | null {
  if (!valor) return null;
  const coincide = /^(\d{2}):(\d{2})/.exec(valor);
  return coincide ? `${coincide[1]}:${coincide[2]}` : valor;
}

/** ¿Es una fecha `YYYY-MM-DD` que existe en el calendario? */
export function esFechaValida(iso: string): boolean {
  const p = partes(iso);
  if (!p) return false;
  const [anio, mes, dia] = p;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  // Rebota el 31 de febrero, que pasa el chequeo de rangos de arriba.
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

/**
 * `03-08-2026 14:22`. Para timestamps con hora real (`timestamptz`), como
 * `reagendado_en` — a diferencia del resto de este archivo, que trabaja con
 * `date`/`time` sin zona. Acá SÍ hay que convertir a hora de Chile, así que
 * pasa por `Intl` en vez de partir el string.
 */
export function fechaHoraCorta(iso: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";

  return (
    `${valor("day")}-${valor("month")}-${valor("year")} ` +
    `${valor("hour")}:${valor("minute")}`
  );
}

/** ¿Es una hora `HH:MM` (o `HH:MM:SS`) del reloj? */
export function esHoraValida(valor: string): boolean {
  const coincide = /^(\d{2}):(\d{2})(:\d{2})?$/.exec(valor);
  if (!coincide) return false;
  const horas = Number(coincide[1]);
  const minutos = Number(coincide[2]);
  return horas >= 0 && horas <= 23 && minutos >= 0 && minutos <= 59;
}
