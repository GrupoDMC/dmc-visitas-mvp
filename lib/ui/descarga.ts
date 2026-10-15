export type ArchivoADescargar = { url: string; nombre: string };

/** Extensión según el tipo MIME ("image/jpeg" → "jpg"); cae en `porDefecto`. */
export function extensionDe(mime: string | null | undefined, porDefecto: string): string {
  const sub = mime?.split("/")[1]?.split(";")[0]?.trim();
  if (!sub) return porDefecto;
  return sub === "jpeg" ? "jpg" : sub === "quicktime" ? "mov" : sub;
}

/**
 * Baja varios archivos uno tras otro, cada uno con su nombre. Va de a uno y con
 * una pausa corta: el navegador descarta las descargas que se disparan todas
 * juntas. Devuelve cuántos se bajaron.
 */
export async function descargarArchivos(archivos: ArchivoADescargar[]): Promise<number> {
  let bajados = 0;
  for (const a of archivos) {
    try {
      const res = await fetch(a.url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const enlace = document.createElement("a");
      const objeto = URL.createObjectURL(blob);
      enlace.href = objeto;
      enlace.download = a.nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(objeto), 10_000);
      bajados++;
      await new Promise((r) => setTimeout(r, 400));
    } catch {
      // Un archivo que falla no frena los demás.
    }
  }
  return bajados;
}
