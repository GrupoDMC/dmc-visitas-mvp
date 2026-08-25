"use client";

// Grabación y envío del video del trabajo.
//
// Tres límites que el formulario respeta y que la base también hace cumplir
// (ck_video_duracion, ck_video_resolucion y ck_video_bytes en dmc.visita_video):
//
//   · 720p ....... 1280x720 acostado o 720x1280 parado. Se le pide a la cámara
//                  esa resolución y, si el equipo entrega otra cosa, se
//                  rechaza el clip antes de subirlo en vez de guardar algo que
//                  la base va a botar.
//   · 1 minuto ... la grabación se corta sola al llegar al segundo 60.
//   · 25 MB ...... a 1,5 Mbps un minuto pesa unos 11 MB; el tope deja aire de
//                  sobra y a la vez evita que un archivo elegido desde la
//                  galería llegue en 4K de 300 MB.
//
// El clip NO viaja dentro del acta. El cuerpo de una Server Action se corta en
// 4,5 MB en producción, así que se sube aparte y por partes en cuanto se
// termina de grabar: la fila nace vacía, se le pegan trozos de 2 MB y recién al
// final queda marcada como completa. El acta solo lleva los ids.

export const VIDEO_MAX_SEG = 60;
export const VIDEO_MAX_BYTES = 25 * 1024 * 1024;
/** El lado mayor y el lado menor de 720p. */
export const VIDEO_LADO_MAYOR = 1280;
export const VIDEO_LADO_MENOR = 720;
/** Bitrate objetivo: un minuto sale en torno a 11 MB. */
export const VIDEO_BITRATE = 1_500_000;
/** Tamaño de cada trozo, ya en base64 y con holgura bajo el tope del request. */
export const VIDEO_TROZO_BYTES = 2 * 1024 * 1024;

export interface MedidaVideo {
  duracionSeg: number;
  ancho: number;
  alto: number;
}

/** Los tipos que la base acepta (ck_video_mime), en orden de preferencia. */
const TIPOS = [
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

/** El mejor contenedor que sepa grabar este navegador, o null si no hay. */
export function tipoGrabacion(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return TIPOS.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

/** "video/webm;codecs=vp9,opus" → "video/webm", que es lo que guarda la base. */
export function mimeBase(tipo: string): string {
  return tipo.split(";")[0].trim().toLowerCase();
}

/** ¿Es un contenedor que la base acepta? */
export function mimeAceptado(mime: string): boolean {
  return ["video/mp4", "video/webm", "video/quicktime"].includes(mimeBase(mime));
}

/**
 * Duración y tamaño reales del clip, leídos del propio archivo.
 *
 * Lo que la cámara promete y lo que entrega no siempre coinciden, y un archivo
 * traído desde la galería no prometió nada. Se mide acá para no subir 11 MB y
 * que la base los rechace por el CHECK al final.
 */
export function medirVideo(blob: Blob): Promise<MedidaVideo> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;

    const limpiar = () => URL.revokeObjectURL(url);

    video.onloadedmetadata = () => {
      // Un webm grabado en vivo llega con duración Infinity: se la fuerza a
      // recorrerse hasta el final para que el navegador la calcule.
      if (!Number.isFinite(video.duration)) {
        video.currentTime = Number.MAX_SAFE_INTEGER;
        video.ontimeupdate = () => {
          video.ontimeupdate = null;
          resolve(datos(video));
          limpiar();
        };
        return;
      }
      resolve(datos(video));
      limpiar();
    };
    video.onerror = () => {
      limpiar();
      reject(new Error("No se pudo leer el video."));
    };
    video.src = url;
  });

  function datos(video: HTMLVideoElement): MedidaVideo {
    return {
      duracionSeg: Math.max(1, Math.round(video.duration || 0)),
      ancho: video.videoWidth || 0,
      alto: video.videoHeight || 0,
    };
  }
}

/**
 * Por qué este clip no sirve, en palabras que el técnico entienda. Null si
 * está bien. Es la misma regla que los CHECK de dmc.visita_video.
 */
export function motivoRechazo(blob: Blob, medida: MedidaVideo): string | null {
  if (!mimeAceptado(blob.type || "")) {
    return "Ese formato de video no se puede guardar. Graba con la cámara de la app.";
  }
  if (blob.size <= 0) return "El video llegó vacío. Vuelve a grabarlo.";
  if (blob.size > VIDEO_MAX_BYTES) {
    return `El video pesa ${mb(blob.size)} y el tope son ${mb(VIDEO_MAX_BYTES)}. Graba uno más corto.`;
  }
  if (medida.duracionSeg > VIDEO_MAX_SEG) {
    return `El video dura ${medida.duracionSeg} segundos y el tope es 1 minuto.`;
  }
  const mayor = Math.max(medida.ancho, medida.alto);
  const menor = Math.min(medida.ancho, medida.alto);
  if (!mayor || !menor) return "No se pudo leer el tamaño del video. Vuelve a grabarlo.";
  if (mayor > VIDEO_LADO_MAYOR || menor > VIDEO_LADO_MENOR) {
    return `El video es de ${medida.ancho}x${medida.alto} y solo se guardan clips en 720p.`;
  }
  return null;
}

/** "11,4 MB" — para decirle al técnico cuánto pesa lo que grabó. */
export function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** "1:05" — el reloj de la grabación y la duración del clip guardado. */
export function reloj(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Un trozo del archivo, ya en base64, listo para viajar en la Server Action. */
export async function trozoBase64(blob: Blob, desde: number, hasta: number): Promise<string> {
  const buffer = await blob.slice(desde, hasta).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // btoa se atraganta con arreglos largos si se pasan de una: se arma por tramos.
  let binario = "";
  const paso = 0x8000;
  for (let i = 0; i < bytes.length; i += paso) {
    binario += String.fromCharCode(...bytes.subarray(i, i + paso));
  }
  return btoa(binario);
}
