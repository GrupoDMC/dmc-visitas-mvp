import type { Visita } from "@/lib/types";
import { extensionDe } from "@/lib/ui/descarga";
import { acotarNombre, nombresSinColision, sanearNombre } from "@/lib/ui/nombre-acta";

export interface MedioActa {
  /** Ruta interna desde donde se baja (foto, video o adjunto). */
  url: string;
  /** Nombre del archivo dentro de la carpeta del acta, con extensión. */
  nombre: string;
  /** Peso conocido, para no pasarse de memoria al armar el .zip. */
  bytes: number | null;
}

/** Agrega la extensión del MIME si el nombre no trae ya una. */
function conExtension(nombre: string, mime: string, porDefecto: string): string {
  return /\.[A-Za-z0-9]{1,5}$/.test(nombre) ? nombre : `${nombre}.${extensionDe(mime, porDefecto)}`;
}

/**
 * Las fotos y los videos de un acta, ya con el nombre que llevan en el .zip.
 * Quedan fuera los marcados como internos, igual que en el PDF y en «descargar
 * todo» del acta. Primero la evidencia (fotos, videos) y luego los adjuntos que
 * explican el trabajo, con el prefijo «Trabajo - ». Sin colisiones de nombre.
 */
export function mediosDelActa(visita: Pick<Visita, "fotos" | "videos" | "adjuntos">): MedioActa[] {
  const fotos = (visita.fotos ?? []).filter((f) => !f.interno);
  const videos = (visita.videos ?? []).filter((v) => !v.interno);
  const adjuntos = visita.adjuntos ?? [];

  const medios: MedioActa[] = [
    ...fotos.map((f, i) => ({ url: f.archivoUrl, nombre: `Foto ${i + 1}.jpg`, bytes: null })),
    ...videos.map((v, i) => ({
      url: v.archivoUrl,
      nombre: `Video ${i + 1}.${extensionDe(v.mime, "mp4")}`,
      bytes: v.bytes,
    })),
    ...adjuntos.map((a, i) => {
      const propio = acotarNombre(sanearNombre(a.nombre), 100);
      const base = propio ? `Trabajo - ${propio}` : `Trabajo - ${a.tipo === "FOTO" ? "foto" : "video"} ${i + 1}`;
      return { url: a.url, nombre: conExtension(base, a.mime, a.tipo === "FOTO" ? "jpg" : "mp4"), bytes: a.bytes };
    }),
  ];
  const nombres = nombresSinColision(
    medios.map((m) => m.nombre),
    true
  );
  return medios.map((m, i) => ({ ...m, nombre: nombres[i] }));
}
