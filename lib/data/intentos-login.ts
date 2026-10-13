import "server-only";
import { log } from "@/lib/log";
import { consultaCon, ejecutar, num, sql } from "@/lib/data/sql";

// Freno de intentos de entrar — dmc.intento_login (migración 023).
//
// Dos topes, y basta con que salte uno:
//
// - Por cuenta: MAX_FALLOS_CUENTA fallos seguidos dentro de VENTANA_MIN dejan
//   el correo en espera VENTANA_MIN desde el último fallo. Un acierto borra la
//   cuenta de fallos anteriores.
// - Por origen: MAX_FALLOS_IP fallos desde la misma IP dentro de VENTANA_MIN,
//   sea cual sea el correo.
//
// El correo se anota exista o no: si solo se frenaran las cuentas dadas de
// alta, la espera delataría cuáles existen. Los intentos que llegan durante la
// espera no se anotan, así que la espera no se alarga sola.

export const VENTANA_MIN = 15;
export const MAX_FALLOS_CUENTA = 5;
export const MAX_FALLOS_IP = 30;
/** Más viejo que esto ya no sirve para nada. */
const RETENCION_DIAS = 30;

/** Lo que entra a la tabla: el correo como se compara al entrar, y acotado. */
export function correoDeIntento(email: string): string {
  return email.trim().toLowerCase().slice(0, 160);
}

/** Lo que decide el freno, a partir de lo que cuenta la consulta. */
export function hayFreno(fila: { cuenta?: unknown; fallos_ip?: unknown } | undefined): boolean {
  return num(fila?.cuenta ?? 0) === 1 || num(fila?.fallos_ip ?? 0) >= MAX_FALLOS_IP;
}

/** ¿Hay que frenar este intento antes de mirar siquiera la contraseña? */
export async function intentoBloqueado(email: string, ip: string | null): Promise<boolean> {
  const [fila] = await consultaCon<{ cuenta: number; fallos_ip: number }>(
    `WITH fallos AS (
       SELECT TOP (${MAX_FALLOS_CUENTA}) creado_en
         FROM dmc.intento_login
        WHERE email = @email AND exito = 0
          AND creado_en > DATEADD(minute, -${2 * VENTANA_MIN}, SYSDATETIME())
          AND creado_en > ISNULL((SELECT MAX(creado_en) FROM dmc.intento_login
                                   WHERE email = @email AND exito = 1), '19000101')
        ORDER BY creado_en DESC
     )
     SELECT (SELECT CASE WHEN COUNT(*) >= ${MAX_FALLOS_CUENTA}
                          AND DATEDIFF(second, MIN(creado_en), MAX(creado_en)) <= ${VENTANA_MIN * 60}
                          AND MAX(creado_en) > DATEADD(minute, -${VENTANA_MIN}, SYSDATETIME())
                         THEN 1 ELSE 0 END
               FROM fallos) AS cuenta,
            (SELECT COUNT(*) FROM dmc.intento_login
              WHERE @ip IS NOT NULL AND ip = @ip AND exito = 0
                AND creado_en > DATEADD(minute, -${VENTANA_MIN}, SYSDATETIME())) AS fallos_ip`,
    [
      ["email", sql.NVarChar(160), correoDeIntento(email)],
      ["ip", sql.VarChar(45), ip],
    ]
  );
  return hayFreno(fila);
}

/** Anota el intento. De vez en cuando aprovecha de barrer los muy viejos. */
export async function registrarIntento(email: string, ip: string | null, exito: boolean): Promise<void> {
  await ejecutar(`INSERT INTO dmc.intento_login (email, ip, exito) VALUES (@email, @ip, @exito)`, [
    ["email", sql.NVarChar(160), correoDeIntento(email)],
    ["ip", sql.VarChar(45), ip],
    ["exito", sql.Bit, exito],
  ]);

  if (Math.random() < 0.02) {
    await ejecutar(
      `DELETE TOP (1000) FROM dmc.intento_login WHERE creado_en < DATEADD(day, -${RETENCION_DIAS}, SYSDATETIME())`
    ).catch((err) => log.error("intento_login.barrido", { err }));
  }
}
