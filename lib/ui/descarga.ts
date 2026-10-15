export type ArchivoADescargar = { url: string; nombre: string };

/** Extensión según el tipo MIME ("image/jpeg" → "jpg"); cae en `porDefecto`. */
export function extensionDe(mime: string | null | undefined, porDefecto: string): string {
  const sub = mime?.split("/")[1]?.split(";")[0]?.trim();
  if (!sub) return porDefecto;
  return sub === "jpeg" ? "jpg" : sub === "quicktime" ? "mov" : sub;
}

/**
 * Baja los archivos y los entrega juntos en un solo .zip. Va sin comprimir
 * (nivel 0): fotos y videos ya vienen comprimidos y así no se gasta tiempo ni
 * memoria. Un archivo que falla no frena los demás. Devuelve cuántos entraron
 * al zip; si ninguno, no descarga nada.
 */
export async function descargarZip(archivos: ArchivoADescargar[], nombreZip: string): Promise<number> {
  const { zipSync } = await import("fflate");
  const entradas: Record<string, Uint8Array> = {};
  for (const a of archivos) {
    try {
      const res = await fetch(a.url);
      if (!res.ok) continue;
      entradas[a.nombre] = new Uint8Array(await res.arrayBuffer());
    } catch {
      // Se sigue con el resto.
    }
  }
  const n = Object.keys(entradas).length;
  if (n === 0) return 0;

  const zip = zipSync(entradas, { level: 0 });
  const objeto = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
  const enlace = document.createElement("a");
  enlace.href = objeto;
  enlace.download = nombreZip;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(objeto), 10_000);
  return n;
}
