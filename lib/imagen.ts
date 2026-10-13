// Validación de imágenes por sus primeros bytes. Sin SQL ni "server-only":
// es lógica pura y se prueba sola.

export const MAX_BYTES_IMAGEN = 8 * 1024 * 1024;

/** Formatos de imagen que se aceptan. SVG y similares quedan fuera: pueden llevar scripts. */
export const MIMES_IMAGEN = ["image/jpeg", "image/png", "image/webp"] as const;

/** El tipo real de la imagen según sus primeros bytes, o null si no es uno permitido. */
export function mimeDeImagen(b: Buffer): (typeof MIMES_IMAGEN)[number] | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/**
 * "data:image/jpeg;base64,AAA…" → { mime, bytes }. Null si no es una imagen
 * permitida. El mime sale de los bytes, no de lo que declara el cliente.
 */
export function decodificarImagen(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl ?? "").trim());
  if (!m) return null;
  const bytes = Buffer.from(m[1].replace(/\s+/g, ""), "base64");
  if (!bytes.length || bytes.length > MAX_BYTES_IMAGEN) return null;
  const mime = mimeDeImagen(bytes);
  return mime ? { mime, bytes } : null;
}
