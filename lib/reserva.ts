// Reserva del acta (dmc.visita_reserva, migración 026): la lógica de cuándo
// una reserva sigue vigente y quién puede escribir. Es pura y no toca la base:
// el servidor le pasa lo que leyó y el celular lo que le contestó el servidor,
// así que se prueba sin conexión (tests/reserva.test.ts).
//
// La reserva es un préstamo corto. Quien abre el acta la toma; mientras trabaja
// la va renovando; si pasa el plazo sin actividad vence y cualquiera de los dos
// técnicos de la visita puede tomarla. Se mide en segundos de inactividad que
// calcula SQL Server con su propio reloj (DATEDIFF contra SYSDATETIME), nunca
// con la hora del celular ni la de este proceso.

/** Cuánto dura una reserva sin actividad: 15 minutos. */
export const PLAZO_RESERVA_SEG = 15 * 60;

/** Lo que se lee de una fila de dmc.visita_reserva. */
export interface ReservaLeida {
  usuarioId: number;
  tecnicoId: number;
  /** Nombre del técnico que la tiene. */
  nombre: string;
  /** Cuándo la tomó, 'YYYY-MM-DDTHH:mm:ss' en la hora del servidor. */
  desde: string;
  /** Segundos desde la última actividad, según el reloj de SQL Server. */
  segundosInactiva: number;
}

/** Quién pregunta. Se compara por técnico: es quien va a la visita. */
export interface Solicitante {
  tecnicoId: number;
}

export type EstadoReserva =
  /** Nadie la tiene (no hay fila o venció): se puede tomar. */
  | { estado: "libre" }
  /** La tiene quien pregunta: puede escribir y se renueva. */
  | { estado: "propia" }
  /** Otro técnico la tiene vigente: no se puede escribir. */
  | { estado: "ajena"; nombre: string; desde: string; liberaEnSeg: number };

/** ¿Pasó el plazo sin actividad? Justo en el plazo ya venció. */
export function reservaVencida(segundosInactiva: number, plazoSeg: number = PLAZO_RESERVA_SEG): boolean {
  // Un valor ilegible se trata como vencido: nunca deja a nadie bloqueado.
  if (!Number.isFinite(segundosInactiva)) return true;
  return segundosInactiva >= plazoSeg;
}

/** Cuánto falta para que venza, en segundos, sin bajar de cero. */
export function segundosParaVencer(segundosInactiva: number, plazoSeg: number = PLAZO_RESERVA_SEG): number {
  if (!Number.isFinite(segundosInactiva)) return 0;
  return Math.max(0, Math.ceil(plazoSeg - Math.max(0, segundosInactiva)));
}

/** Qué pasa con la reserva desde el punto de vista de quien pregunta. */
export function evaluarReserva(
  reserva: ReservaLeida | null,
  quien: Solicitante,
  plazoSeg: number = PLAZO_RESERVA_SEG
): EstadoReserva {
  if (!reserva || reservaVencida(reserva.segundosInactiva, plazoSeg)) return { estado: "libre" };
  if (reserva.tecnicoId === quien.tecnicoId) return { estado: "propia" };
  return {
    estado: "ajena",
    nombre: reserva.nombre,
    desde: reserva.desde,
    liberaEnSeg: segundosParaVencer(reserva.segundosInactiva, plazoSeg),
  };
}

/** Lo que contesta el servidor a "tomar o renovar". */
export type ResultadoReserva =
  | { ok: true }
  | { ok: false; motivo: "ajena"; nombre: string; desde: string; liberaEnSeg: number }
  /** La visita ya no está abierta (cerrada, cancelada…) o no es de este técnico. */
  | { ok: false; motivo: "no_disponible"; error: string };

/** Los datos de quién tiene el acta, tal como viajan al celular. */
export interface ReservaAjena {
  nombre: string;
  desde: string;
  liberaEnSeg: number;
}

/** Cuando el otro técnico ya cerró el acta y la de este celular quedó sin enviarse. */
export const CERRADA_POR_OTRO =
  "Esta visita ya la cerró el otro técnico. Tu acta sigue guardada en este equipo, sin enviarse.";

/** "14:05" de una marca 'YYYY-MM-DDTHH:mm:ss'. */
export function horaDeMarca(marca: string): string {
  return /T(\d{2}:\d{2})/.exec(marca)?.[1] ?? marca;
}

/** Cuántos minutos son los segundos del plazo, redondeado hacia arriba. */
export function minutosDelPlazo(plazoSeg: number = PLAZO_RESERVA_SEG): number {
  return Math.max(1, Math.ceil(plazoSeg / 60));
}

/** El aviso que ve el segundo técnico. */
export function textoActaEnCurso(r: { nombre: string }): string {
  return `Esta acta está en curso por ${r.nombre}`;
}

/** La explicación de abajo: desde cuándo y cuándo se libera. */
export function detalleActaEnCurso(r: { desde: string }, plazoSeg: number = PLAZO_RESERVA_SEG): string {
  const min = minutosDelPlazo(plazoSeg);
  return `Desde las ${horaDeMarca(r.desde)}. Se libera sola tras ${min} ${min === 1 ? "minuto" : "minutos"} sin actividad de esa persona.`;
}

/**
 * ¿Hay que renovar ahora? El formulario abierto no basta: una pantalla
 * olvidada no puede tener el acta reservada para siempre. Se renueva si hubo
 * actividad (tocar, escribir, subir) desde el último aviso, o si hay un video
 * subiendo. Tiempos en milisegundos del reloj del celular, solo comparados
 * entre sí.
 */
export function debeRenovar(p: {
  ultimaActividadMs: number;
  ultimoAvisoMs: number;
  subiendo: boolean;
}): boolean {
  return p.subiendo || p.ultimaActividadMs > p.ultimoAvisoMs;
}

/** Cada cuánto avisa el celular que sigue trabajando: una quinta parte del plazo, entre 3 s y 3 min. */
export function intervaloAvisoMs(plazoSeg: number = PLAZO_RESERVA_SEG): number {
  return Math.min(180, Math.max(3, Math.floor(plazoSeg / 5))) * 1000;
}

/**
 * Lee el plazo de una variable de entorno, solo para pruebas en desarrollo.
 * En producción siempre son 15 minutos, diga lo que diga la variable.
 */
export function plazoConfigurado(valor: string | undefined, enProduccion: boolean): number {
  if (enProduccion) return PLAZO_RESERVA_SEG;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 5 && n <= PLAZO_RESERVA_SEG ? n : PLAZO_RESERVA_SEG;
}
