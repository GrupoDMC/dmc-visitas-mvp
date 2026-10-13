import "server-only";
import { consultaCon, num, numONull, sql } from "@/lib/data/sql";
import { mimeDeImagen } from "@/lib/imagen";

// Visitas: la evidencia (fotos y firmas) servida desde la base.

// ── Evidencia servida desde la base ─────────────────────────────────────────

export interface ImagenGuardada {
  bytes: Buffer;
  mime: string;
}

/** Los bytes de una foto, para /api/visita/foto/[id]. */
export async function getFotoBinaria(id: number): Promise<ImagenGuardada | null> {
  const [fila] = await consultaCon<{ contenido: Buffer | null; mime: string; visita_id: number }>(
    `SELECT contenido, mime, visita_id FROM dmc.visita_foto WHERE id = @id`,
    [["id", sql.BigInt, id]]
  );
  if (!fila?.contenido) return null;
  return { bytes: fila.contenido, mime: fila.mime || "image/jpeg" };
}

/** Los bytes de una firma, para /api/visita/firma/[id]. */
export async function getFirmaBinaria(id: number): Promise<ImagenGuardada | null> {
  const [fila] = await consultaCon<{ contenido: Buffer | null }>(
    `SELECT contenido FROM dmc.visita_firma WHERE id = @id`,
    [["id", sql.BigInt, id]]
  );
  if (!fila?.contenido) return null;
  return { bytes: fila.contenido, mime: mimeDeImagen(fila.contenido) ?? "application/octet-stream" };
}

/**
 * ¿La foto, firma o clip es de una visita eliminada? Entonces solo la sirve el
 * administrador: para el resto esa visita no existe, y su evidencia tampoco.
 */
export async function esEvidenciaDeEliminada(tabla: "foto" | "firma" | "video", id: number): Promise<boolean> {
  const nombre = { foto: "dmc.visita_foto", firma: "dmc.visita_firma", video: "dmc.visita_video" }[tabla];
  const [fila] = await consultaCon<{ activo: boolean }>(
    `SELECT v.activo FROM ${nombre} x JOIN dmc.visita v ON v.id = x.visita_id WHERE x.id = @id`,
    [["id", sql.BigInt, id]]
  );
  return fila ? !fila.activo : false;
}

/** Los técnicos de la visita a la que pertenece la foto o la firma: asignado y ayudante. */
export async function getDuenosDeImagen(tabla: "foto" | "firma", id: number): Promise<number[]> {
  const nombre = tabla === "foto" ? "dmc.visita_foto" : "dmc.visita_firma";
  const [fila] = await consultaCon<{ tecnico_id: number; tecnico_ayudante_id: number | null }>(
    `SELECT v.tecnico_id, v.tecnico_ayudante_id
       FROM ${nombre} x JOIN dmc.visita v ON v.id = x.visita_id WHERE x.id = @id`,
    [["id", sql.BigInt, id]]
  );
  if (!fila) return [];
  const ayudante = numONull(fila.tecnico_ayudante_id);
  return ayudante === null ? [num(fila.tecnico_id)] : [num(fila.tecnico_id), ayudante];
}
