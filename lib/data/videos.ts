import "server-only";
import { consultaCon, ejecutar, num, sql } from "@/lib/data/sql";

/**
 * El video del trabajo, subido por partes.
 *
 * El clip no viaja dentro del acta como las fotos: el cuerpo de una Server
 * Action se corta en 4,5 MB en producción y un minuto en 720p pesa unos 11 MB.
 * Se sube aparte, en cuanto el técnico termina de grabarlo, y en tres pasos:
 *
 *   1. `abrirVideo` ...... crea la fila vacía y devuelve su id.
 *   2. `pegarTrozo` ...... le va agregando el archivo de a 2 MB con .WRITE,
 *                          que en varbinary(max) escribe al final sin traerse
 *                          los bytes ya guardados.
 *   3. `cerrarVideo` ..... comprueba que llegó todo y recién ahí lo marca
 *                          utilizable (subida_completa = 1).
 *
 * Si la señal se corta a mitad de la subida, la fila queda incompleta: existe,
 * pero ni el acta ni el panel la muestran, y el índice ix_video_incompleto la
 * deja a mano para limpiarla.
 *
 * Los límites de duración, resolución y peso los hacen cumplir los CHECK de
 * dmc.visita_video: acá se validan antes solo para devolver un mensaje que el
 * técnico entienda en vez de un error de constraint.
 */

export const VIDEO_MAX_SEG = 60;
export const VIDEO_MAX_BYTES = 25 * 1024 * 1024;
const VIDEO_LADO_MAYOR = 1280;
const VIDEO_LADO_MENOR = 720;
const MIMES = ["video/mp4", "video/webm", "video/quicktime"];
/** Lo que como máximo acepta un solo `pegarTrozo`, ya en bytes crudos. */
const TROZO_MAX_BYTES = 4 * 1024 * 1024;

export interface DatosVideo {
  mime: string;
  bytes: number;
  duracionSeg: number;
  ancho: number;
  alto: number;
  etiqueta?: string | null;
  grabadoEn?: string | null;
}

/** Por qué no se puede guardar este clip, o null si está bien. */
export function motivoRechazo(d: DatosVideo): string | null {
  if (!MIMES.includes(String(d.mime).toLowerCase())) {
    return "Ese formato de video no se puede guardar.";
  }
  if (!Number.isInteger(d.bytes) || d.bytes <= 0 || d.bytes > VIDEO_MAX_BYTES) {
    return "El video pesa más de 25 MB. Graba uno más corto.";
  }
  if (!Number.isInteger(d.duracionSeg) || d.duracionSeg <= 0 || d.duracionSeg > VIDEO_MAX_SEG) {
    return "El video dura más de 1 minuto.";
  }
  const mayor = Math.max(d.ancho, d.alto);
  const menor = Math.min(d.ancho, d.alto);
  if (!mayor || !menor || mayor > VIDEO_LADO_MAYOR || menor > VIDEO_LADO_MENOR) {
    return "Solo se guardan clips en 720p.";
  }
  return null;
}

export interface VisitaParaVideo {
  id: number;
  estado: string;
  tecnicoId: number;
}

/**
 * Lo mínimo para decidir si este técnico puede subir a esta visita.
 *
 * Existe en vez de reusar getVisitaCompletaPorFolio porque cada trozo del video
 * pasa por acá: un clip de 11 MB son seis llamadas, y traerse la visita entera
 * con sus trabajos, problemas, fotos y firmas seis veces para leer dos columnas
 * no tiene ningún sentido.
 */
export async function getVisitaParaVideo(folio: string): Promise<VisitaParaVideo | null> {
  const [fila] = await consultaCon<{ id: number; estado: string; tecnico_id: number }>(
    `SELECT id, estado, tecnico_id FROM dmc.visita WHERE folio = @folio`,
    [["folio", sql.VarChar(16), folio]]
  );
  return fila ? { id: num(fila.id), estado: fila.estado, tecnicoId: num(fila.tecnico_id) } : null;
}

/** Crea la fila vacía a la que se le van a pegar los trozos. */
export async function abrirVideo(visitaId: number, d: DatosVideo): Promise<number> {
  const [fila] = await consultaCon<{ id: number }>(
    `DECLARE @nuevo TABLE (id bigint);

     INSERT INTO dmc.visita_video
       (visita_id, etiqueta, contenido, mime, bytes, bytes_recibidos,
        duracion_seg, ancho, alto, subida_completa, grabado_en)
     OUTPUT INSERTED.id INTO @nuevo
     VALUES (@visita, @etiqueta, 0x, @mime, @bytes, 0,
             @duracion, @ancho, @alto, 0, COALESCE(@grabado, SYSDATETIME()));

     SELECT id FROM @nuevo;`,
    [
      ["visita", sql.BigInt, visitaId],
      ["etiqueta", sql.NVarChar(40), d.etiqueta || null],
      ["mime", sql.VarChar(40), d.mime.toLowerCase()],
      ["bytes", sql.Int, d.bytes],
      ["duracion", sql.SmallInt, d.duracionSeg],
      ["ancho", sql.SmallInt, d.ancho],
      ["alto", sql.SmallInt, d.alto],
      ["grabado", sql.DateTime2(0), d.grabadoEn ? new Date(d.grabadoEn) : null],
    ]
  );
  return num(fila.id);
}

export type ResultadoTrozo =
  | { ok: true; recibidos: number }
  /** `recibidos` es la posición real en la base, para reanudar desde ahí. */
  | { ok: false; error: string; recibidos?: number };

/**
 * Pega un trozo al final del clip.
 *
 * `desde` es el offset que el celular cree llevar escrito. Si no calza con lo
 * que hay en la base, el trozo se descarta y se devuelve la posición real: así
 * un reintento después de un corte de señal no duplica ni deja un hueco.
 */
export async function pegarTrozo(
  videoId: number,
  visitaId: number,
  desde: number,
  trozo: Buffer
): Promise<ResultadoTrozo> {
  if (!trozo.length) return { ok: false, error: "Llegó un trozo vacío del video." };
  if (trozo.length > TROZO_MAX_BYTES) return { ok: false, error: "El trozo del video es demasiado grande." };

  const [fila] = await consultaCon<{ recibidos: number; bytes: number; completa: boolean }>(
    `SELECT bytes_recibidos AS recibidos, bytes, subida_completa AS completa
       FROM dmc.visita_video WHERE id = @id AND visita_id = @visita`,
    [
      ["id", sql.BigInt, videoId],
      ["visita", sql.BigInt, visitaId],
    ]
  );
  if (!fila) return { ok: false, error: "Ese video ya no existe." };
  if (fila.completa) return { ok: true, recibidos: num(fila.bytes) };

  const recibidos = num(fila.recibidos);
  if (desde !== recibidos) {
    return { ok: false, error: "El video se descuadró al subirlo.", recibidos };
  }
  if (recibidos + trozo.length > num(fila.bytes)) {
    return { ok: false, error: "El video llegó más largo de lo que declaró el celular." };
  }

  // .WRITE con offset NULL agrega al final sin traerse lo ya escrito. El
  // bytes_recibidos = @desde del WHERE hace de candado: dos envíos del mismo
  // trozo no se pegan dos veces.
  const filas = await ejecutar(
    `UPDATE dmc.visita_video
        SET contenido.WRITE(@trozo, NULL, 0),
            bytes_recibidos = bytes_recibidos + @largo
      WHERE id = @id AND visita_id = @visita
        AND subida_completa = 0 AND bytes_recibidos = @desde`,
    [
      ["id", sql.BigInt, videoId],
      ["visita", sql.BigInt, visitaId],
      ["trozo", sql.VarBinary(sql.MAX), trozo],
      ["largo", sql.Int, trozo.length],
      ["desde", sql.Int, desde],
    ]
  );
  if (!filas) return { ok: false, error: "El video se descuadró al subirlo.", recibidos };
  return { ok: true, recibidos: recibidos + trozo.length };
}

/** Marca el clip utilizable. Falla si no llegó completo. */
export async function cerrarVideo(videoId: number, visitaId: number): Promise<boolean> {
  const filas = await ejecutar(
    `UPDATE dmc.visita_video
        SET subida_completa = 1,
            archivo_url = CONCAT('/api/visita/video/', CAST(id AS varchar(20))),
            subido_en = SYSDATETIME()
      WHERE id = @id AND visita_id = @visita
        AND subida_completa = 0 AND bytes IS NOT NULL AND bytes_recibidos = bytes`,
    [
      ["id", sql.BigInt, videoId],
      ["visita", sql.BigInt, visitaId],
    ]
  );
  return filas > 0;
}

/** Quitar un clip del acta: no se borra la fila, se deja inactiva. */
export async function desactivarVideo(videoId: number, visitaId: number): Promise<boolean> {
  const filas = await ejecutar(
    `UPDATE dmc.visita_video SET activo = 0 WHERE id = @id AND visita_id = @visita AND activo = 1`,
    [
      ["id", sql.BigInt, videoId],
      ["visita", sql.BigInt, visitaId],
    ]
  );
  return filas > 0;
}

export interface VideoMeta {
  mime: string;
  /** Largo real del clip guardado, en bytes. */
  total: number;
}

/**
 * Tipo y largo del clip, sin traerse un solo byte del video.
 *
 * Va separado del contenido porque el reproductor pide el archivo por tramos y
 * cada petición necesita el largo total para armar el Content-Range: sería
 * absurdo leer el varbinary entero para responder que mide 11 MB.
 */
export async function getVideoMeta(id: number): Promise<VideoMeta | null> {
  const [fila] = await consultaCon<{ mime: string; largo: number }>(
    `SELECT mime, DATALENGTH(contenido) AS largo
       FROM dmc.visita_video
      WHERE id = @id AND activo = 1 AND subida_completa = 1`,
    [["id", sql.BigInt, id]]
  );
  if (!fila?.largo) return null;
  return { mime: fila.mime || "video/mp4", total: num(fila.largo) };
}

/**
 * Un tramo del clip, para /api/visita/video/[id].
 *
 * El reproductor pide rangos: sin ellos no se puede adelantar el video y en
 * Safari no arranca. SUBSTRING sobre varbinary(max) trae solo el pedazo pedido,
 * así que un clip de 11 MB nunca pasa entero por memoria.
 */
export async function getVideoTramo(id: number, desde: number, hasta: number): Promise<Buffer | null> {
  const [fila] = await consultaCon<{ trozo: Buffer | null }>(
    // SUBSTRING sobre varbinary es 1-based.
    `SELECT SUBSTRING(contenido, @desde, @largo) AS trozo FROM dmc.visita_video WHERE id = @id`,
    [
      ["id", sql.BigInt, id],
      ["desde", sql.BigInt, desde + 1],
      ["largo", sql.BigInt, hasta - desde + 1],
    ]
  );
  return fila?.trozo ?? null;
}

/** El técnico dueño de la visita a la que pertenece el clip. */
export async function getDuenoDeVideo(id: number): Promise<number | null> {
  const [fila] = await consultaCon<{ tecnico_id: number }>(
    `SELECT v.tecnico_id FROM dmc.visita_video x JOIN dmc.visita v ON v.id = x.visita_id WHERE x.id = @id`,
    [["id", sql.BigInt, id]]
  );
  return fila ? num(fila.tecnico_id) : null;
}
