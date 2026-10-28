"use client";

import { useRef, useState } from "react";
import { abrirAdjuntoAction, cerrarAdjuntoAction, subirTrozoAdjuntoAction } from "@/app/actions/adjuntos";
import { comprimirFoto } from "@/lib/ui/imagen";
import { ajustarVideo, trozoBase64, VIDEO_TROZO_BYTES } from "@/lib/ui/video";

// Fotos y videos que explican el trabajo a realizar, del lado del navegador.
//
// Se eligen junto con el texto, se preparan al momento (la foto se recomprime y
// el video se baja a 720p y un minuto, como el del acta) y se suben cuando la
// visita ya existe: sin visita no hay a qué colgarlos. La subida va por trozos,
// igual que el video del acta, porque el cuerpo de una Server Action se corta
// en 4,5 MB.

/** Lo mismo que ADJUNTOS_MAX_POR_VISITA de lib/data/adjuntos, que no se puede importar acá. */
export const ADJUNTOS_MAX = 12;
const MIMES_FOTO = ["image/jpeg", "image/png", "image/webp"];

export interface AdjuntoPendiente {
  clave: string;
  tipo: "FOTO" | "VIDEO";
  nombre: string;
  /** Vista previa local (blob: URL). */
  preview: string;
  blob: Blob | null;
  mime: string;
  duracionSeg: number | null;
  /** preparando = recomprimiendo o reajustando; listo = para subir; error = no sirve. */
  estado: "preparando" | "listo" | "error";
  /** Avance de lo que esté haciendo, 0-100, o null si está quieto. */
  progreso: number | null;
  error: string | null;
}

function leerComoDataUrl(archivo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });
}

/** Deja el archivo dentro de los límites de la base. Lanza con un mensaje que se entienda. */
async function preparar(
  archivo: File,
  onProgreso: (pct: number) => void
): Promise<{ blob: Blob; mime: string; duracionSeg: number | null }> {
  if (archivo.type.startsWith("image/")) {
    const reducida = await comprimirFoto(await leerComoDataUrl(archivo));
    const mime = reducida.slice(5, reducida.indexOf(";"));
    if (!MIMES_FOTO.includes(mime)) throw new Error("Ese formato de imagen no se puede guardar. Usa JPG o PNG.");
    return { blob: await (await fetch(reducida)).blob(), mime, duracionSeg: null };
  }
  if (archivo.type.startsWith("video/")) {
    const clip = await ajustarVideo(archivo, onProgreso);
    return { blob: clip.blob, mime: clip.mime, duracionSeg: clip.medida.duracionSeg || null };
  }
  throw new Error("Solo se pueden adjuntar fotos y videos.");
}

/** La lista de adjuntos que todavía no se suben. */
export function useAdjuntosPendientes() {
  const [pendientes, setPendientes] = useState<AdjuntoPendiente[]>([]);
  const contador = useRef(0);

  const cambiar = (clave: string, cambio: Partial<AdjuntoPendiente>) =>
    setPendientes((prev) => prev.map((p) => (p.clave === clave ? { ...p, ...cambio } : p)));

  /** `cupo` es cuántos más caben: lo ya guardado de la visita cuenta contra el máximo. */
  function agregar(archivos: FileList | File[], cupo: number) {
    const lista = Array.from(archivos).slice(0, Math.max(0, cupo));
    for (const archivo of lista) {
      const clave = `p${++contador.current}`;
      const tipo = archivo.type.startsWith("video/") ? "VIDEO" : "FOTO";
      setPendientes((prev) => [
        ...prev,
        {
          clave,
          tipo,
          nombre: archivo.name,
          preview: URL.createObjectURL(archivo),
          blob: null,
          mime: archivo.type,
          duracionSeg: null,
          estado: "preparando",
          progreso: tipo === "VIDEO" ? 0 : null,
          error: null,
        },
      ]);
      preparar(archivo, (pct) => cambiar(clave, { progreso: pct }))
        .then((r) => cambiar(clave, { ...r, estado: "listo", progreso: null }))
        .catch((err) =>
          cambiar(clave, {
            estado: "error",
            progreso: null,
            error: err instanceof Error ? err.message : "No se pudo preparar el archivo.",
          })
        );
    }
    return Array.from(archivos).length - lista.length;
  }

  function quitar(clave: string) {
    setPendientes((prev) => {
      const p = prev.find((x) => x.clave === clave);
      if (p) URL.revokeObjectURL(p.preview);
      return prev.filter((x) => x.clave !== clave);
    });
  }

  /**
   * Sube lo que está listo a la visita ya creada. Devuelve cuántos no llegaron.
   * Un trozo que falla por la señal se reintenta un par de veces antes de rendirse.
   */
  async function subirTodos(folio: string, avance?: (hechos: number, total: number) => void): Promise<number> {
    const aSubir = pendientes.filter((p) => p.estado === "listo" && p.blob);
    let fallidos = 0;
    for (let i = 0; i < aSubir.length; i++) {
      avance?.(i, aSubir.length);
      const error = await subirUno(folio, aSubir[i], (pct) => cambiar(aSubir[i].clave, { progreso: pct }));
      if (error) {
        fallidos++;
        cambiar(aSubir[i].clave, { estado: "error", progreso: null, error });
      }
    }
    avance?.(aSubir.length, aSubir.length);
    return fallidos;
  }

  return { pendientes, agregar, quitar, subirTodos, preparando: pendientes.some((p) => p.estado === "preparando") };
}

async function subirUno(folio: string, p: AdjuntoPendiente, avance: (pct: number) => void): Promise<string | null> {
  const blob = p.blob!;
  let abierto;
  try {
    abierto = await abrirAdjuntoAction(folio, {
      tipo: p.tipo,
      mime: p.mime,
      bytes: blob.size,
      nombre: p.nombre.slice(0, 120),
      duracionSeg: p.duracionSeg,
    });
  } catch {
    return "No hubo señal para empezar a subir el archivo.";
  }
  if (!abierto.ok || !abierto.adjuntoId) return abierto.error ?? "No se pudo empezar a subir el archivo.";
  const adjuntoId = abierto.adjuntoId;

  let subido = 0;
  while (subido < blob.size) {
    const hasta = Math.min(subido + VIDEO_TROZO_BYTES, blob.size);
    const trozo = await trozoBase64(blob, subido, hasta);
    let res;
    for (let intento = 0; intento < 3 && !res; intento++) {
      try {
        // El trozo viaja dentro de un objeto: ver TrozoAdjunto en app/actions/adjuntos.
        res = await subirTrozoAdjuntoAction({ folio, adjuntoId, desde: subido, trozoBase64: trozo });
      } catch {
        res = undefined;
      }
    }
    if (!res) return "Se cortó la subida del archivo.";
    if (!res.ok) return res.error ?? "No se pudo subir el archivo.";
    subido = res.recibidos ?? hasta;
    avance(Math.round((subido / blob.size) * 100));
  }

  const cerrado = await cerrarAdjuntoAction(folio, adjuntoId).catch(() => null);
  return cerrado?.ok ? null : cerrado?.error ?? "El archivo no terminó de guardarse.";
}
