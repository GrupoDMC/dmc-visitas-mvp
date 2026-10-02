"use server";

import { getSesion } from "@/lib/auth";
import {
  abrirVideo,
  cerrarVideo,
  desactivarVideo,
  getVisitaParaVideo,
  motivoRechazo,
  pegarTrozo,
  type DatosVideo,
} from "@/lib/data/videos";
import { participaEnVisita, tomadaPorOtro } from "@/lib/ui/estado";
import { tiene } from "@/lib/permisos";

/**
 * Subida del video del trabajo, por partes.
 *
 * El clip no cabe en el acta: el cuerpo de una Server Action se corta en 4,5 MB
 * en producción y un minuto en 720p pesa unos 11 MB. Por eso el video se sube
 * apenas se termina de grabar y en trozos, mientras el técnico sigue llenando
 * el formulario. Cuando aprieta "Guardar visita", los clips ya están en la base
 * y el acta solo lleva sus ids.
 *
 * Solo el técnico dueño de la visita puede subir, y solo mientras la visita
 * siga abierta o mientras esté corrigiendo su acta dentro del plazo. En ese
 * segundo caso el clip sube pero queda inactivo: entra al acta recién cuando
 * se guarda la edición, que es la que deja el registro del cambio.
 *
 * Desde el panel también se sube, con el permiso «Editar el acta ya cerrada» y
 * solo sobre un acta completada: mismo trato, el clip espera inactivo hasta que
 * se guarde la edición.
 */

export interface ResultadoVideo {
  ok: boolean;
  error?: string;
  /** Id de la fila en dmc.visita_video. */
  videoId?: number;
  /** Cuántos bytes lleva escritos la base; sirve para reanudar tras un corte. */
  recibidos?: number;
  /** Ruta con la que se reproduce el clip ya cerrado. */
  archivoUrl?: string;
}

/**
 * La visita tiene que ser del técnico (asignado o ayudante), estar todavía
 * abierta y no tenerla tomada el otro; o estar ya cerrada pero dentro del plazo
 * en que el técnico puede editar su acta.
 *
 * Se comprueba en cada trozo, no solo al abrir: entre el primero y el último
 * pueden pasar varios minutos, y en el medio el acta se pudo cerrar o
 * administración pudo cancelar la visita.
 */
async function visitaAbierta(folio: string) {
  const sesion = await getSesion();
  if (!sesion) return null;
  const visita = await getVisitaParaVideo(folio);
  if (!visita) return null;

  // El panel: solo para editar un acta ya cerrada, y solo con el permiso.
  if (sesion.usuario.rol !== "TECNICO") {
    if (visita.estado !== "COMPLETADA" || !tiene(sesion.permisos, "visitas.editarActa")) return null;
    return { ...visita, enEdicion: true };
  }

  if (!sesion.tecnico || !participaEnVisita(visita, sesion.tecnico.id)) return null;
  if (visita.editablePorTecnico) return { ...visita, enEdicion: true };
  if (visita.estado !== "PROGRAMADA" && visita.estado !== "EN_CURSO") return null;
  if (tomadaPorOtro(visita, sesion.tecnico.id)) return null;
  return { ...visita, enEdicion: false };
}

/** Paso 1: reserva la fila del clip y devuelve su id. */
export async function abrirVideoAction(folio: string, datos: DatosVideo): Promise<ResultadoVideo> {
  const visita = await visitaAbierta(folio);
  if (!visita) return { ok: false, error: "Esa visita no está abierta para ti." };

  const rechazo = motivoRechazo(datos);
  if (rechazo) return { ok: false, error: rechazo };

  try {
    return { ok: true, videoId: await abrirVideo(visita.id, datos), recibidos: 0 };
  } catch (err) {
    console.error("[dmc] abrirVideo:", err);
    return { ok: false, error: "No se pudo empezar a subir el video." };
  }
}

/**
 * Lo que lleva un envío de trozo.
 *
 * VA EN UN OBJETO A PROPÓSITO, no como cuatro argumentos sueltos. React cuenta
 * el largo de todo string que cuelgue directamente de un array —y los
 * argumentos de una Server Action son un array— contra un tope de 1.000.000 de
 * posiciones. Un trozo de 1,5 MB en base64 son 2.097.152 caracteres, así que
 * pasarlo suelto reventaba SIEMPRE, con este error del propio React:
 *
 *   "Maximum array nesting exceeded. Large nested arrays can be dangerous.
 *    Try adding intermediate objects."
 *
 * El error se lanza antes de entrar a la función, así que ningún try/catch de
 * acá lo veía: al celular llegaba el mensaje genérico de producción ("An error
 * occurred in the Server Components render…") y el clip no se subía nunca,
 * daba igual cuánto pesara. El objeto intermedio —justo lo que sugiere el
 * mensaje— corta la cuenta y el string viaja entero.
 */
export interface TrozoVideo {
  folio: string;
  videoId: number;
  /** Lo que el celular cree llevar subido, en bytes del archivo. */
  desde: number;
  trozoBase64: string;
}

/**
 * Paso 2: pega un trozo al final del clip.
 *
 * `desde` es lo que el celular cree llevar subido. Si no calza con la base, el
 * trozo se descarta y se devuelve la posición real para reanudar desde ahí sin
 * duplicar ni dejar un hueco.
 */
export async function subirTrozoVideoAction(envio: TrozoVideo): Promise<ResultadoVideo> {
  const { folio, videoId, desde, trozoBase64 } = envio;
  const visita = await visitaAbierta(folio);
  if (!visita) return { ok: false, error: "Esa visita no está abierta para ti." };
  if (!Number.isInteger(videoId) || videoId <= 0) return { ok: false, error: "Ese video no existe." };
  if (!Number.isInteger(desde) || desde < 0) return { ok: false, error: "El video se descuadró al subirlo." };

  let trozo: Buffer;
  try {
    trozo = Buffer.from(String(trozoBase64), "base64");
  } catch {
    return { ok: false, error: "Un trozo del video llegó dañado." };
  }

  try {
    const res = await pegarTrozo(videoId, visita.id, desde, trozo);
    return res.ok
      ? { ok: true, videoId, recibidos: res.recibidos }
      : { ok: false, error: res.error, recibidos: res.recibidos };
  } catch (err) {
    console.error("[dmc] subirTrozoVideo:", err);
    return { ok: false, error: "Se cortó la subida del video." };
  }
}

/** Paso 3: el clip queda utilizable. Falla si no llegó completo. */
export async function cerrarVideoAction(folio: string, videoId: number): Promise<ResultadoVideo> {
  const visita = await visitaAbierta(folio);
  if (!visita) return { ok: false, error: "Esa visita no está abierta para ti." };

  try {
    if (!(await cerrarVideo(videoId, visita.id))) {
      return { ok: false, error: "El video no llegó completo. Vuelve a subirlo." };
    }
    // Sobre un acta ya cerrada el clip espera inactivo: lo activa la edición
    // al guardarse. Si el técnico abandona la edición, el acta no cambió.
    if (visita.enEdicion) await desactivarVideo(videoId, visita.id);
  } catch (err) {
    console.error("[dmc] cerrarVideo:", err);
    return { ok: false, error: "No se pudo terminar de guardar el video." };
  }
  return { ok: true, videoId, archivoUrl: `/api/visita/video/${videoId}` };
}

/** Quitar un clip del acta. La fila no se borra: queda inactiva. */
export async function borrarVideoAction(folio: string, videoId: number): Promise<ResultadoVideo> {
  const visita = await visitaAbierta(folio);
  // Sobre un acta cerrada los clips solo se quitan guardando la edición.
  if (!visita || visita.enEdicion) return { ok: false, error: "Esa visita no está abierta para ti." };

  try {
    await desactivarVideo(videoId, visita.id);
  } catch (err) {
    console.error("[dmc] borrarVideo:", err);
    return { ok: false, error: "No se pudo quitar el video." };
  }
  return { ok: true, videoId };
}
