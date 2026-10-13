// Logger mínimo: una línea JSON por evento, con nivel, contexto y el id del
// usuario cuando se conoce. Vercel y cualquier recolector de logs lo leen tal
// cual; no depende de nada.
//
// Nunca pases datos personales ni el valor de un campo en `extra`: el log vive
// más que la petición.

type Nivel = "info" | "warn" | "error";

export interface DatosLog {
  /** id de dmc.usuario de quien disparó la acción, si se conoce. */
  usuarioId?: number | null;
  [clave: string]: unknown;
}

/** Un Error se vuelve algo serializable; lo demás se deja pasar. */
function serializarError(err: unknown): unknown {
  if (err instanceof Error) {
    return { nombre: err.name, mensaje: err.message, pila: err.stack?.split("\n").slice(0, 6).join("\n") };
  }
  return err;
}

export function lineaDeLog(nivel: Nivel, contexto: string, datos: DatosLog = {}, ahora = new Date()): string {
  const { usuarioId, err, ...resto } = datos;
  const linea: Record<string, unknown> = { ts: ahora.toISOString(), nivel, contexto };
  if (usuarioId != null) linea.usuarioId = usuarioId;
  if (err !== undefined) linea.error = serializarError(err);
  try {
    return JSON.stringify({ ...linea, ...resto });
  } catch {
    return JSON.stringify({ ...linea, extra: "no serializable" });
  }
}

function emitir(nivel: Nivel, contexto: string, datos?: DatosLog) {
  const linea = lineaDeLog(nivel, contexto, datos);
  if (nivel === "error") console.error(linea);
  else if (nivel === "warn") console.warn(linea);
  else console.log(linea);
}

export const log = {
  info: (contexto: string, datos?: DatosLog) => emitir("info", contexto, datos),
  warn: (contexto: string, datos?: DatosLog) => emitir("warn", contexto, datos),
  /** `datos.err` lleva el error original. */
  error: (contexto: string, datos?: DatosLog) => emitir("error", contexto, datos),
};
