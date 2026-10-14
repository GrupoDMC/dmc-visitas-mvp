import "server-only";
import { enTransaccion, ejecutar, consultaCon, num, sql, F_TS, type Ejecutor } from "@/lib/data/sql";
import { env, enProduccion } from "@/lib/env";
import { log } from "@/lib/log";
import {
  evaluarReserva,
  plazoConfigurado,
  type EstadoReserva,
  type ReservaLeida,
  type ResultadoReserva,
} from "@/lib/reserva";
import type { EstadoVisita } from "@/lib/types";

/**
 * Reserva del acta — dmc.visita_reserva (migración 026).
 *
 * Quien abre el acta la reserva; mientras trabaja la renueva; si pasa el plazo
 * sin actividad vence y el otro técnico de la visita puede tomarla. Las reglas
 * de vigencia están en lib/reserva (puras); acá solo se lee, se escribe y se
 * toma el bloqueo.
 *
 * Atomicidad: toda toma o renovación corre con la fila de la visita bloqueada
 * (UPDLOCK), la misma con la que ya se serializan iniciar y cerrar el acta. Dos
 * técnicos que abren a la vez se ponen en fila y el segundo ve la reserva del
 * primero. La vigencia la mide SQL Server con su reloj (DATEDIFF contra
 * SYSDATETIME), no la hora del celular ni la de este proceso.
 *
 * El panel de administración no participa: editar un acta ya cerrada ni toma ni
 * respeta reservas.
 */

/** El plazo vigente. En producción son siempre 15 minutos; en desarrollo se puede acortar con RESERVA_PLAZO_SEG. */
export function plazoReservaSeg(): number {
  return plazoConfigurado(env("RESERVA_PLAZO_SEG"), enProduccion);
}

export interface QuienReserva {
  usuarioId: number;
  tecnicoId: number;
}

interface FilaReserva {
  usuario_id: number;
  tecnico_id: number;
  nombre: string;
  desde: string;
  inactiva: number;
}

const SELECT_RESERVA = `
  SELECT r.usuario_id, r.tecnico_id, t.nombre_completo AS nombre,
         ${F_TS("r.tomada_en")} AS desde,
         DATEDIFF(SECOND, r.renovada_en, SYSDATETIME()) AS inactiva
    FROM dmc.visita_reserva r
    JOIN dmc.tecnico t ON t.id = r.tecnico_id
   WHERE r.visita_id = @visita`;

function comoLeida(fila: FilaReserva | undefined): ReservaLeida | null {
  return fila
    ? {
        usuarioId: num(fila.usuario_id),
        tecnicoId: num(fila.tecnico_id),
        nombre: fila.nombre,
        desde: fila.desde,
        segundosInactiva: num(fila.inactiva),
      }
    : null;
}

async function leerEn(ej: Ejecutor, visitaId: number): Promise<ReservaLeida | null> {
  const [fila] = await ej.consulta<FilaReserva>(SELECT_RESERVA, [["visita", sql.BigInt, visitaId]]);
  return comoLeida(fila);
}

/** Cómo está la reserva para este técnico, sin tomarla ni renovarla (para mostrar). */
export async function estadoDeReserva(visitaId: number, tecnicoId: number): Promise<EstadoReserva> {
  const [fila] = await consultaCon<FilaReserva>(SELECT_RESERVA, [["visita", sql.BigInt, visitaId]]);
  return evaluarReserva(comoLeida(fila), { tecnicoId }, plazoReservaSeg());
}

/**
 * Toma la reserva o la renueva. Tiene que correr dentro de una transacción que
 * ya tenga tomada la fila de la visita (UPDLOCK): ahí es donde se serializa.
 *
 * - Libre (sin fila o vencida): queda a nombre de quien pregunta.
 * - Propia: se renueva; el "desde" no cambia.
 * - De otro y vigente: no se toca y se devuelve de quién es.
 */
export async function tomarReservaEn(ej: Ejecutor, visitaId: number, quien: QuienReserva): Promise<ResultadoReserva> {
  const actual = await leerEn(ej, visitaId);
  const estado = evaluarReserva(actual, { tecnicoId: quien.tecnicoId }, plazoReservaSeg());
  if (estado.estado === "ajena") {
    return { ok: false, motivo: "ajena", nombre: estado.nombre, desde: estado.desde, liberaEnSeg: estado.liberaEnSeg };
  }
  const params = [
    ["visita", sql.BigInt, visitaId],
    ["usuario", sql.BigInt, quien.usuarioId],
    ["tecnico", sql.BigInt, quien.tecnicoId],
  ] as Parameters<Ejecutor["ejecutar"]>[1];
  if (estado.estado === "propia") {
    await ej.ejecutar(
      `UPDATE dmc.visita_reserva SET renovada_en = SYSDATETIME(), usuario_id = @usuario WHERE visita_id = @visita`,
      params
    );
  } else {
    // Libre: la fila vencida (si la hay) se reemplaza por una nueva con "desde" de ahora.
    await ej.ejecutar(
      `DELETE FROM dmc.visita_reserva WHERE visita_id = @visita;
       INSERT INTO dmc.visita_reserva (visita_id, usuario_id, tecnico_id) VALUES (@visita, @usuario, @tecnico);`,
      params
    );
  }
  return { ok: true };
}

/**
 * Si la visita está EN_CURSO y la tenía "tomada" otro técnico (la marca
 * permanente de iniciarVisita), pasa a quien acaba de tomar la reserva. Solo se
 * llama con la reserva ya conseguida: es lo que deja a un técnico seguir donde
 * el otro lo dejó cuando su reserva venció.
 */
export async function traspasarTomadaEn(ej: Ejecutor, visitaId: number, quien: QuienReserva): Promise<void> {
  await ej.ejecutar(
    `UPDATE h SET tecnico_id = @tecnico, usuario_id = @usuario
       FROM dmc.visita_estado_historial h
      WHERE h.id = (SELECT TOP 1 h2.id FROM dmc.visita_estado_historial h2
                     WHERE h2.visita_id = @visita AND h2.estado = 'EN_CURSO'
                     ORDER BY h2.id DESC)
        AND h.tecnico_id <> @tecnico`,
    [
      ["visita", sql.BigInt, visitaId],
      ["usuario", sql.BigInt, quien.usuarioId],
      ["tecnico", sql.BigInt, quien.tecnicoId],
    ]
  );
}

/**
 * Toma o renueva la reserva de una visita abierta, en una transacción propia.
 * Es lo que llaman el formulario al abrirse, el aviso de actividad y las
 * acciones de video y borrador antes de escribir.
 */
export async function tomarReserva(folio: string, quien: QuienReserva): Promise<ResultadoReserva> {
  return enTransaccion(async (ej): Promise<ResultadoReserva> => {
    const [visita] = await ej.consulta<{
      id: number;
      estado: EstadoVisita;
      tecnico_id: number;
      tecnico_ayudante_id: number | null;
    }>(
      `SELECT v.id, v.estado, v.tecnico_id, v.tecnico_ayudante_id
         FROM dmc.visita v WITH (UPDLOCK, ROWLOCK) WHERE v.folio = @folio AND v.activo = 1`,
      [["folio", sql.VarChar(16), folio]]
    );
    const NO: ResultadoReserva = { ok: false, motivo: "no_disponible", error: "Esa visita no está abierta para ti." };
    if (!visita) return NO;
    const suya = num(visita.tecnico_id) === quien.tecnicoId || num(visita.tecnico_ayudante_id) === quien.tecnicoId;
    if (!suya) return NO;
    if (visita.estado !== "PROGRAMADA" && visita.estado !== "EN_CURSO") return NO;

    const id = num(visita.id);
    const res = await tomarReservaEn(ej, id, quien);
    if (res.ok && visita.estado === "EN_CURSO") await traspasarTomadaEn(ej, id, quien);
    return res;
  });
}

/** Suelta la reserva de esa visita si es de este usuario. Es de mejor esfuerzo: no tumba nada. */
export async function liberarReserva(folio: string, usuarioId: number): Promise<void> {
  try {
    await ejecutar(
      `DELETE r FROM dmc.visita_reserva r
         JOIN dmc.visita v ON v.id = r.visita_id
        WHERE v.folio = @folio AND r.usuario_id = @usuario`,
      [
        ["folio", sql.VarChar(16), folio],
        ["usuario", sql.BigInt, usuarioId],
      ]
    );
  } catch (err) {
    // Si no se suelta, vence sola: no vale la pena frenar al técnico por esto.
    log.error("liberarReserva", { err });
  }
}

/** Suelta todas las reservas de un usuario: al cerrar sesión. */
export async function liberarReservasDelUsuario(usuarioId: number): Promise<void> {
  try {
    await ejecutar(`DELETE FROM dmc.visita_reserva WHERE usuario_id = @usuario`, [["usuario", sql.BigInt, usuarioId]]);
  } catch (err) {
    log.error("liberarReservasDelUsuario", { err });
  }
}

/** Suelta la reserva de una visita, sea de quien sea, dentro de una transacción (cerrar el acta, liberarla). */
export async function soltarReservaEn(ej: Ejecutor, visitaId: number): Promise<void> {
  await ej.ejecutar(`DELETE FROM dmc.visita_reserva WHERE visita_id = @visita`, [["visita", sql.BigInt, visitaId]]);
}
