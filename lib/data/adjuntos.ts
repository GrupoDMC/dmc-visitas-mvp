import "server-only";
import { consultaCon, ejecutar, num, numONull, sql } from "@/lib/data/sql";
import type { AdjuntoTrabajo, EstadoVisita } from "@/lib/types";

/**
 * Las fotos y los videos que explican el trabajo a realizar.
 *
 * Es el encargo, no la evidencia: viven en dmc.visita_adjunto y no se mezclan
 * con dmc.visita_foto ni dmc.visita_video, que son lo que el técnico deja en el
 * acta. La subida es la misma del video del acta, por trozos y en tres pasos:
 * `abrirAdjunto` crea la fila vacía, `pegarTrozoAdjunto` le agrega el archivo y
 * `cerrarAdjunto` la deja utilizable. Mientras no llegue entero, nadie la ve.
 *
 * Los topes que hace cumplir la base (25 MB y los mimes) se validan antes solo
 * para devolver un mensaje que se entienda.
 */

export const ADJUNTO_MAX_BYTES = 25 * 1024 * 1024;
/** Cuántos adjuntos puede tener una visita: la ficha no es un archivo. */
export const ADJUNTOS_MAX_POR_VISITA = 12;
const MIMES_FOTO = ["image/jpeg", "image/png", "image/webp"];
const MIMES_VIDEO = ["video/mp4", "video/webm", "video/quicktime"];
const TROZO_MAX_BYTES = 4 * 1024 * 1024;

export interface DatosAdjunto {
  tipo: "FOTO" | "VIDEO";
  mime: string;
  bytes: number;
  nombre?: string | null;
  duracionSeg?: number | null;
}

/** Por qué no se puede guardar este archivo, o null si está bien. */
export function motivoRechazoAdjunto(d: DatosAdjunto): string | null {
  const mime = String(d.mime).toLowerCase();
  if (!(d.tipo === "FOTO" ? MIMES_FOTO : MIMES_VIDEO).includes(mime)) {
    return d.tipo === "FOTO"
      ? "La foto llegó en un formato que no se puede guardar."
      : "El video llegó en un formato que no se puede guardar.";
  }
  if (!Number.isInteger(d.bytes) || d.bytes <= 0 || d.bytes > ADJUNTO_MAX_BYTES) {
    return "El archivo pesa más de 25 MB.";
  }
  if (d.tipo === "VIDEO" && d.duracionSeg != null && d.duracionSeg > 60) {
    return "El video llegó sin recortar al minuto.";
  }
  return null;
}

/** JPEG, PNG o WebP por su cabecera: el mime lo declara el navegador y no basta. */
export function firmaDeFotoValida(b: Buffer): boolean {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  if (b.length >= 4 && b[0] === 0x89 && b.toString("latin1", 1, 4) === "PNG") return true;
  return b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP";
}

/** mp4/mov llevan 'ftyp' en el offset 4; webm empieza con la cabecera EBML. */
export function firmaDeVideoValida(b: Buffer): boolean {
  if (b.length >= 8 && b.toString("latin1", 4, 8) === "ftyp") return true;
  return b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
}

export interface VisitaParaAdjunto {
  id: number;
  estado: EstadoVisita;
  tecnicoId: number;
  tecnicoAyudanteId: number | null;
  creadaEnTerreno: boolean;
}

/** Lo mínimo para decidir si esta persona puede adjuntar a esta visita. */
export async function getVisitaParaAdjunto(folio: string): Promise<VisitaParaAdjunto | null> {
  const [fila] = await consultaCon<{
    id: number;
    estado: EstadoVisita;
    tecnico_id: number;
    tecnico_ayudante_id: number | null;
    creada_en_terreno: boolean;
  }>(
    `SELECT id, estado, tecnico_id, tecnico_ayudante_id, creada_en_terreno
       FROM dmc.visita WHERE folio = @folio AND activo = 1`,
    [["folio", sql.VarChar(16), folio]]
  );
  return fila
    ? {
        id: num(fila.id),
        estado: fila.estado,
        tecnicoId: num(fila.tecnico_id),
        tecnicoAyudanteId: numONull(fila.tecnico_ayudante_id),
        creadaEnTerreno: Boolean(fila.creada_en_terreno),
      }
    : null;
}

/** Crea la fila vacía a la que se le van a pegar los trozos. Null si la visita ya tiene el máximo. */
export async function abrirAdjunto(visitaId: number, d: DatosAdjunto, usuarioId: number): Promise<number | null> {
  const [fila] = await consultaCon<{ id: number | null }>(
    `DECLARE @nuevo TABLE (id bigint);

     INSERT INTO dmc.visita_adjunto (visita_id, tipo, nombre, mime, contenido, bytes, duracion_seg, subido_por)
     OUTPUT INSERTED.id INTO @nuevo
     SELECT @visita, @tipo, @nombre, @mime, 0x, @bytes, @duracion, @usuario
      WHERE (SELECT COUNT(*) FROM dmc.visita_adjunto WHERE visita_id = @visita AND activo = 1) < @maximo;

     SELECT id FROM @nuevo;`,
    [
      ["visita", sql.BigInt, visitaId],
      ["tipo", sql.VarChar(5), d.tipo],
      ["nombre", sql.NVarChar(120), d.nombre?.slice(0, 120) || null],
      ["mime", sql.VarChar(40), d.mime.toLowerCase()],
      ["bytes", sql.Int, d.bytes],
      ["duracion", sql.SmallInt, d.duracionSeg ?? null],
      ["usuario", sql.BigInt, usuarioId],
      ["maximo", sql.Int, ADJUNTOS_MAX_POR_VISITA],
    ]
  );
  return fila?.id ? num(fila.id) : null;
}

export type ResultadoTrozoAdjunto =
  | { ok: true; recibidos: number }
  /** `recibidos` es la posición real en la base, para reanudar desde ahí. */
  | { ok: false; error: string; recibidos?: number };

/** Pega un trozo al final del archivo. Si `desde` no calza con la base, lo descarta y dice dónde va. */
export async function pegarTrozoAdjunto(
  id: number,
  visitaId: number,
  desde: number,
  trozo: Buffer
): Promise<ResultadoTrozoAdjunto> {
  if (!trozo.length) return { ok: false, error: "Llegó un trozo vacío." };
  if (trozo.length > TROZO_MAX_BYTES) return { ok: false, error: "El trozo del archivo es demasiado grande." };

  const [fila] = await consultaCon<{ recibidos: number; bytes: number; completa: boolean; tipo: "FOTO" | "VIDEO" }>(
    `SELECT bytes_recibidos AS recibidos, bytes, subida_completa AS completa, tipo
       FROM dmc.visita_adjunto WHERE id = @id AND visita_id = @visita AND activo = 1`,
    [
      ["id", sql.BigInt, id],
      ["visita", sql.BigInt, visitaId],
    ]
  );
  if (!fila) return { ok: false, error: "Ese archivo ya no existe." };
  if (fila.completa) return { ok: true, recibidos: num(fila.bytes) };

  const recibidos = num(fila.recibidos);
  if (recibidos === 0 && desde === 0) {
    const valida = fila.tipo === "FOTO" ? firmaDeFotoValida(trozo) : firmaDeVideoValida(trozo);
    if (!valida) {
      return {
        ok: false,
        error: fila.tipo === "FOTO" ? "El archivo no parece una foto válida." : "El archivo no parece un video válido.",
      };
    }
  }
  if (desde !== recibidos) return { ok: false, error: "El archivo se descuadró al subirlo.", recibidos };
  if (recibidos + trozo.length > num(fila.bytes)) {
    return { ok: false, error: "El archivo llegó más largo de lo que se declaró." };
  }

  // .WRITE con offset NULL agrega al final. El bytes_recibidos = @desde del
  // WHERE hace de candado: dos envíos del mismo trozo no se pegan dos veces.
  const filas = await ejecutar(
    `UPDATE dmc.visita_adjunto
        SET contenido.WRITE(@trozo, NULL, 0),
            bytes_recibidos = bytes_recibidos + @largo
      WHERE id = @id AND visita_id = @visita
        AND subida_completa = 0 AND bytes_recibidos = @desde`,
    [
      ["id", sql.BigInt, id],
      ["visita", sql.BigInt, visitaId],
      ["trozo", sql.VarBinary(sql.MAX), trozo],
      ["largo", sql.Int, trozo.length],
      ["desde", sql.Int, desde],
    ]
  );
  if (!filas) return { ok: false, error: "El archivo se descuadró al subirlo.", recibidos };
  return { ok: true, recibidos: recibidos + trozo.length };
}

/** Marca el archivo utilizable. Falla si no llegó completo. */
export async function cerrarAdjunto(id: number, visitaId: number): Promise<boolean> {
  const filas = await ejecutar(
    `UPDATE dmc.visita_adjunto SET subida_completa = 1, subido_en = SYSDATETIME()
      WHERE id = @id AND visita_id = @visita AND activo = 1
        AND subida_completa = 0 AND bytes_recibidos = bytes`,
    [
      ["id", sql.BigInt, id],
      ["visita", sql.BigInt, visitaId],
    ]
  );
  return filas > 0;
}

/** Quitar un adjunto: no se borra la fila, se deja inactiva. */
export async function desactivarAdjunto(id: number, visitaId: number): Promise<boolean> {
  const filas = await ejecutar(
    `UPDATE dmc.visita_adjunto SET activo = 0 WHERE id = @id AND visita_id = @visita AND activo = 1`,
    [
      ["id", sql.BigInt, id],
      ["visita", sql.BigInt, visitaId],
    ]
  );
  return filas > 0;
}

export interface FilaAdjunto {
  id: number;
  visita_id: number;
  tipo: "FOTO" | "VIDEO";
  nombre: string | null;
  mime: string;
  bytes: number;
  duracion_seg: number | null;
}

/** Las columnas que mapearAdjunto espera; la lectura de visitas las pide con su propio filtro. */
export const COLUMNAS_ADJUNTO = "id, visita_id, tipo, nombre, mime, bytes, duracion_seg";

export function mapearAdjunto(f: FilaAdjunto): AdjuntoTrabajo {
  return {
    id: num(f.id),
    visitaId: num(f.visita_id),
    tipo: f.tipo,
    nombre: f.nombre,
    mime: f.mime,
    bytes: num(f.bytes),
    duracionSeg: numONull(f.duracion_seg),
    url: `/api/visita/adjunto/${num(f.id)}`,
  };
}

export interface AdjuntoMeta {
  mime: string;
  total: number;
  tipo: "FOTO" | "VIDEO";
  nombre: string | null;
}

/** Tipo y largo del archivo, sin traerse un solo byte del contenido. */
export async function getAdjuntoMeta(id: number): Promise<AdjuntoMeta | null> {
  const [fila] = await consultaCon<{ mime: string; largo: number; tipo: "FOTO" | "VIDEO"; nombre: string | null }>(
    `SELECT mime, tipo, nombre, DATALENGTH(contenido) AS largo
       FROM dmc.visita_adjunto WHERE id = @id AND activo = 1 AND subida_completa = 1`,
    [["id", sql.BigInt, id]]
  );
  if (!fila?.largo) return null;
  return { mime: fila.mime, total: num(fila.largo), tipo: fila.tipo, nombre: fila.nombre };
}

/** Un tramo del archivo; SUBSTRING trae solo el pedazo pedido. */
export async function getAdjuntoTramo(id: number, desde: number, hasta: number): Promise<Buffer | null> {
  const [fila] = await consultaCon<{ trozo: Buffer | null }>(
    // SUBSTRING sobre varbinary es 1-based.
    `SELECT SUBSTRING(contenido, @desde, @largo) AS trozo FROM dmc.visita_adjunto WHERE id = @id`,
    [
      ["id", sql.BigInt, id],
      ["desde", sql.BigInt, desde + 1],
      ["largo", sql.BigInt, hasta - desde + 1],
    ]
  );
  return fila?.trozo ?? null;
}

/** Los técnicos de la visita del adjunto y si la visita sigue activa. */
export async function getDuenosDeAdjunto(id: number): Promise<{ tecnicos: number[]; visitaActiva: boolean } | null> {
  const [fila] = await consultaCon<{ tecnico_id: number; tecnico_ayudante_id: number | null; activo: boolean }>(
    `SELECT v.tecnico_id, v.tecnico_ayudante_id, v.activo
       FROM dmc.visita_adjunto x JOIN dmc.visita v ON v.id = x.visita_id WHERE x.id = @id`,
    [["id", sql.BigInt, id]]
  );
  if (!fila) return null;
  const ayudante = numONull(fila.tecnico_ayudante_id);
  return {
    tecnicos: ayudante === null ? [num(fila.tecnico_id)] : [num(fila.tecnico_id), ayudante],
    visitaActiva: Boolean(fila.activo),
  };
}
