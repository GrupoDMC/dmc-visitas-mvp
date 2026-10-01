import "server-only";
import { consulta, ejecutar, sql } from "@/lib/data/sql";
import { hoyISO, sumarDias } from "@/lib/ui/fecha";

/**
 * Cancelación automática de las visitas que el técnico no completó a tiempo.
 *
 * Plazo: el día asignado más un día de tolerancia. Una visita del lunes se
 * puede cerrar el lunes o el martes; desde el miércoles a las 00:00 (hora de
 * Chile) queda CANCELADA, con el motivo escrito en la bitácora de estados.
 *
 * Entran PROGRAMADA, EN_CURSO y REAGENDADA (con la fecha que tenga). PENDIENTE
 * no: esa ya tiene acta, con el técnico explicando por qué no se pudo, y
 * cancelarla taparía ese motivo.
 *
 * No hay tarea programada que lo corra: se hace al leer visitas (ver
 * `cargar` en visitas.ts y el panel en queries.ts). Así no depende de un cron
 * de Vercel ni del Agente de SQL Server, y nadie alcanza a ver una visita
 * vencida como si siguiera abierta.
 */

export const DIAS_TOLERANCIA = 1;

/** Con este texto empieza el motivo; sirve para reconocerlas al leerlas. */
export const MOTIVO_VENCIDA = "Cancelada automáticamente: el técnico no la completó en el plazo establecido";

/** Cada cuánto se vuelve a revisar, como mucho, por instancia del servidor. */
const CADA_MS = 5 * 60 * 1000;

let ultima = 0;
let enCurso: Promise<void> | null = null;

/**
 * Cancela las vencidas. Barata e idempotente: si ya se revisó hace poco no
 * vuelve a la base, y si hay una revisión andando se espera esa misma.
 * Un error se registra y no se propaga: que falle no debe tumbar la pantalla.
 */
export function cancelarVisitasVencidas(): Promise<void> {
  if (enCurso) return enCurso;
  if (Date.now() - ultima < CADA_MS) return Promise.resolve();

  enCurso = revisar()
    .then(() => {
      ultima = Date.now();
    })
    .catch((err) => console.error("[dmc] cancelarVisitasVencidas:", err))
    .finally(() => {
      enCurso = null;
    });
  return enCurso;
}

let conMargen = false;

/**
 * ¿La base ya tiene dmc.visita.fecha_hasta (migración 010)?
 *
 * Sin ella todo sigue como antes, con visitas de un solo día. Solo se recuerda
 * el sí: el no se vuelve a preguntar, para enterarse cuando corran la migración.
 */
export async function hayMargenDeDias(): Promise<boolean> {
  if (conMargen) return true;
  const [fila] = await consulta<{ largo: number | null }>(
    `SELECT COL_LENGTH('dmc.visita', 'fecha_hasta') AS largo`
  );
  conMargen = fila?.largo != null;
  return conMargen;
}

async function revisar(): Promise<void> {
  // Vence lo que tenga fecha anterior a ayer (en Chile): hoy y ayer siguen en plazo.
  const limite = sumarDias(hoyISO(), -DIAS_TOLERANCIA);
  // Con margen de días, el plazo corre desde el último día del margen.
  const plazo = (await hayMargenDeDias()) ? "COALESCE(fecha_hasta, fecha_programada)" : "fecha_programada";

  // tg_visita_cambio deja la fila del historial al cambiar el estado; después
  // se le pone el motivo. Los ids van a una tabla de paso porque OUTPUT sin
  // INTO no se admite sobre una tabla con triggers.
  await ejecutar(
    `SET XACT_ABORT ON;
     BEGIN TRAN;

     DECLARE @vencidas TABLE (id bigint PRIMARY KEY, fecha date);
     INSERT INTO @vencidas (id, fecha)
     SELECT id, ${plazo}
       FROM dmc.visita WITH (UPDLOCK, HOLDLOCK)
      WHERE activo = 1
        AND estado IN ('PROGRAMADA', 'EN_CURSO', 'REAGENDADA')
        AND ${plazo} < @limite;

     IF EXISTS (SELECT 1 FROM @vencidas)
     BEGIN
       DECLARE @antes bigint = (SELECT ISNULL(MAX(id), 0) FROM dmc.visita_estado_historial);

       UPDATE v SET estado = 'CANCELADA'
         FROM dmc.visita v JOIN @vencidas x ON x.id = v.id;

       UPDATE h
          SET motivo = CONCAT(@motivo, ' (fecha asignada ', FORMAT(x.fecha, 'dd-MM-yyyy'),
                              ', con ', @dias, ' día de tolerancia).'),
              origen = 'WEB', usuario_id = NULL
         FROM dmc.visita_estado_historial h
         JOIN @vencidas x ON x.id = h.visita_id
        WHERE h.id > @antes AND h.estado = 'CANCELADA';
     END

     COMMIT;`,
    [
      ["limite", sql.Date, limite],
      ["motivo", sql.NVarChar(200), MOTIVO_VENCIDA],
      ["dias", sql.Int, DIAS_TOLERANCIA],
    ]
  );
}
