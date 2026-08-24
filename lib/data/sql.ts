import "server-only";
import sql from "mssql";
import { getPool } from "@/lib/db/pool";

// Utilidades comunes de la capa de datos.
//
// Dos decisiones que se repiten en todas las consultas:
//
// 1. Los `bigint` llegan como string desde tedious (no caben garantizados en un
//    number de JS). Todos los ids se pasan por `num()`.
// 2. Las fechas y horas se convierten a texto EN SQL, no en JS. Un `date` que
//    tedious devuelve como Date queda en medianoche UTC, y al formatearlo en un
//    servidor con otro huso se corre un día. Con CONVERT el valor viaja ya como
//    'YYYY-MM-DD' y nadie lo reinterpreta.

/** Fecha como 'YYYY-MM-DD'. */
export const F_FECHA = (col: string) => `CONVERT(varchar(10), ${col}, 23)`;
/** Hora como 'HH:mm'. */
export const F_HORA = (col: string) => `CONVERT(varchar(5), ${col}, 108)`;
/** Marca de tiempo como 'YYYY-MM-DDTHH:mm:ss'. */
export const F_TS = (col: string) => `CONVERT(varchar(19), ${col}, 126)`;

export function num(valor: unknown): number {
  return typeof valor === "number" ? valor : Number(valor);
}

export function numONull(valor: unknown): number | null {
  return valor === null || valor === undefined ? null : num(valor);
}

/** Ejecuta una consulta sin parámetros y devuelve las filas tipadas. */
export async function consulta<T>(texto: string): Promise<T[]> {
  const pool = await getPool();
  const r = await pool.request().query<T>(texto);
  return r.recordset ?? [];
}

export type Parametro = [nombre: string, tipo: sql.ISqlType | (() => sql.ISqlType), valor: unknown];

/** Ejecuta una consulta parametrizada. Nunca interpoles valores en el texto. */
export async function consultaCon<T>(texto: string, params: Parametro[]): Promise<T[]> {
  const pool = await getPool();
  const req = pool.request();
  for (const [nombre, tipo, valor] of params) req.input(nombre, tipo, valor);
  const r = await req.query<T>(texto);
  return r.recordset ?? [];
}

/** Ejecuta una sentencia que no devuelve filas. */
export async function ejecutar(texto: string, params: Parametro[] = []): Promise<number> {
  const pool = await getPool();
  const req = pool.request();
  for (const [nombre, tipo, valor] of params) req.input(nombre, tipo, valor);
  const r = await req.query(texto);
  return r.rowsAffected?.[0] ?? 0;
}

/**
 * Lo mínimo que necesita quien escribe: consultar y ejecutar. Existe para que
 * una función pueda correr igual suelta o dentro de una transacción.
 */
export interface Ejecutor {
  consulta<T>(texto: string, params?: Parametro[]): Promise<T[]>;
  ejecutar(texto: string, params?: Parametro[]): Promise<number>;
}

/** El ejecutor por defecto: cada sentencia va sola contra el pool. */
export const ejecutorSuelto: Ejecutor = {
  consulta: (texto, params = []) => consultaCon(texto, params),
  ejecutar: (texto, params = []) => ejecutar(texto, params),
};

/**
 * Corre `fn` dentro de una transacción: o queda todo escrito, o no queda nada.
 *
 * Es lo que necesita el cierre del acta, que toca siete tablas de una sentada:
 * si se cae a mitad de camino, una visita con la mitad de los trabajos y sin
 * firma es peor que una visita sin guardar.
 */
export async function enTransaccion<T>(fn: (ej: Ejecutor) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  const ejecutorTx: Ejecutor = {
    async consulta<R>(texto: string, params: Parametro[] = []): Promise<R[]> {
      const req = new sql.Request(tx);
      for (const [nombre, tipo, valor] of params) req.input(nombre, tipo, valor);
      const r = await req.query<R>(texto);
      return r.recordset ?? [];
    },
    async ejecutar(texto: string, params: Parametro[] = []): Promise<number> {
      const req = new sql.Request(tx);
      for (const [nombre, tipo, valor] of params) req.input(nombre, tipo, valor);
      const r = await req.query(texto);
      return r.rowsAffected?.[0] ?? 0;
    },
  };

  try {
    const resultado = await fn(ejecutorTx);
    await tx.commit();
    return resultado;
  } catch (err) {
    // Un rollback fallido no debe tapar el error real que trajo hasta acá.
    await tx.rollback().catch((e) => console.error("[dmc] rollback fallido:", e));
    throw err;
  }
}

/** Agrupa filas hijas por el id de su padre. */
export function agrupar<T>(filas: T[], clave: (fila: T) => number): Map<number, T[]> {
  const mapa = new Map<number, T[]>();
  for (const fila of filas) {
    const k = clave(fila);
    const lista = mapa.get(k);
    if (lista) lista.push(fila);
    else mapa.set(k, [fila]);
  }
  return mapa;
}

export { sql };
