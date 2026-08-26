"use client";

// Preparación del video del trabajo antes de subirlo.
//
// La regla es una sola: EL CLIP NUNCA SE RECHAZA. Si el técnico grabó tres
// minutos en 1080p, o eligió de la galería algo que viene en 4K, el video se
// acepta igual y acá se recorta al minuto y se baja a 720p. Antes esto devolvía
// un "no se puede guardar" y el técnico se quedaba sin evidencia por culpa de
// una cámara que entregó más de lo que se le pidió — que es justamente lo que
// hacen casi todos los celulares.
//
// Los tres límites siguen siendo los mismos, porque son los que hace cumplir
// dmc.visita_video (ck_video_duracion, ck_video_resolucion, ck_video_bytes):
//
//   · 720p ....... 1280x720 acostado o 720x1280 parado
//   · 1 minuto ... lo que pase del segundo 60 se corta
//   · 25 MB ...... el bitrate se calcula para no llegar nunca al tope
//
// El reajuste cuesta tiempo real: se reproduce el clip y se vuelve a grabar
// cuadro a cuadro, así que un video de un minuto tarda un minuto. Por eso solo
// se hace cuando hace falta: lo que ya viene dentro de los límites —el caso
// normal, porque a la cámara se le piden 720p— se sube tal cual y al instante.

export const VIDEO_MAX_SEG = 60;
export const VIDEO_MAX_BYTES = 25 * 1024 * 1024;
/** El lado mayor y el lado menor de 720p. */
export const VIDEO_LADO_MAYOR = 1280;
export const VIDEO_LADO_MENOR = 720;
/** Bitrate de video máximo: un minuto sale en torno a 11 MB. */
export const VIDEO_BITRATE = 1_500_000;
/** Piso del bitrate: por debajo el clip deja de servir como evidencia. */
const VIDEO_BITRATE_MINIMO = 500_000;
const AUDIO_BITRATE = 96_000;
const VIDEO_FPS = 30;

/**
 * Tamaño de cada trozo de la subida, en bytes del archivo.
 *
 * Viaja en base64, que infla un tercio: 1,5 MB de video son 2 MB de texto. El
 * cuerpo de una Server Action se corta en 4,5 MB en producción, así que queda
 * margen de sobra para la envoltura del propio request.
 */
export const VIDEO_TROZO_BYTES = 1.5 * 1024 * 1024;

export interface MedidaVideo {
  duracionSeg: number;
  ancho: number;
  alto: number;
}

/** Un clip ya listo para subir: dentro de los límites, pase lo que pase. */
export interface ClipListo {
  blob: Blob;
  mime: string;
  medida: MedidaVideo;
  /** Qué hubo que arreglarle, para contárselo al técnico. Vacío si no se tocó. */
  ajustes: string[];
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

/** ¿Es un contenedor que la base acepta tal cual? */
export function mimeAceptado(mime: string): boolean {
  return ["video/mp4", "video/webm", "video/quicktime"].includes(mimeBase(mime));
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

/**
 * Un trozo del archivo en base64, listo para viajar en la Server Action.
 *
 * Lo hace el FileReader y no un bucle propio a propósito. La versión a mano
 * —`String.fromCharCode(...bytes)` por tramos— desborda la pila de llamadas en
 * cuanto el tramo tiene algunas decenas de miles de bytes, y en el celular eso
 * reventaba en el primer trozo: la fila del video quedaba creada y vacía, y el
 * clip no se guardaba nunca.
 */
export function trozoBase64(blob: Blob, desde: number, hasta: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const texto = String(reader.result);
      const coma = texto.indexOf(",");
      if (coma < 0) reject(new Error("No se pudo preparar el video para subirlo."));
      else resolve(texto.slice(coma + 1));
    };
    reader.onerror = () => reject(new Error("No se pudo leer el video."));
    reader.readAsDataURL(blob.slice(desde, hasta));
  });
}

// ── Reproducción ────────────────────────────────────────────────────────────

/**
 * Arregla la duración Infinity de un WebM recién grabado para que el propio
 * `<video controls>` de la previsualización quede con barra de avance y
 * miniatura, en vez de aparecer congelado o sin poder adelantarse.
 *
 * Es el mismo bug de Chrome que obliga al truco de `medirVideo` (el
 * contenedor no trae escrita la duración real): ahí se usa solo para medir,
 * acá hay que aplicarlo también sobre el elemento que el técnico ve, porque
 * un `blob:` URL no se corrige solo. Una vez que sale de la app —servido por
 * `/api/visita/video/<id>`, que sí responde por rangos— el navegador lo
 * resuelve solo y por eso el mismo clip se ve bien ahí.
 */
export function repararDuracionPreview(video: HTMLVideoElement) {
  if (Number.isFinite(video.duration)) return;
  const volver = () => {
    video.ontimeupdate = null;
    video.currentTime = 0;
  };
  video.ontimeupdate = volver;
  try {
    video.currentTime = 1e101;
  } catch {
    video.ontimeupdate = null;
  }
}

// ── Medición ────────────────────────────────────────────────────────────────

/** Cuánto se espera a que el navegador diga cuánto dura el clip. */
const ESPERA_MEDIDA_MS = 8000;

/**
 * Duración y tamaño reales del clip, leídos del propio archivo.
 *
 * Lo que la cámara promete y lo que entrega no siempre coinciden, y un archivo
 * traído de la galería no prometió nada.
 *
 * Nunca se queda colgada: si el navegador no resuelve la duración —pasa con el
 * WebM recién grabado, que llega con duración Infinity— se devuelve lo que se
 * haya podido leer. Un 0 acá no rompe nada: significa "hay que medirlo después
 * de reajustarlo", no "el video no sirve".
 */
export function medirVideo(blob: Blob): Promise<MedidaVideo> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;

    let listo = false;
    const terminar = (m: MedidaVideo) => {
      if (listo) return;
      listo = true;
      clearTimeout(reloj);
      URL.revokeObjectURL(url);
      resolve(m);
    };
    const datos = (): MedidaVideo => ({
      duracionSeg: Number.isFinite(video.duration) ? Math.max(1, Math.round(video.duration)) : 0,
      ancho: video.videoWidth || 0,
      alto: video.videoHeight || 0,
    });

    const reloj = setTimeout(() => terminar(datos()), ESPERA_MEDIDA_MS);

    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) return terminar(datos());
      // El WebM recién grabado llega con duración Infinity: se le pide saltar
      // más allá del final para obligar al navegador a calcularla.
      video.ontimeupdate = () => {
        video.ontimeupdate = null;
        terminar(datos());
      };
      try {
        video.currentTime = 1e101;
      } catch {
        terminar(datos());
      }
    };
    video.onerror = () => terminar({ duracionSeg: 0, ancho: 0, alto: 0 });
    video.src = url;
  });
}

// ── Ajuste automático ───────────────────────────────────────────────────────

const par = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** A qué tamaño hay que llevarlo para entrar en 720p, respetando la forma. */
function destino(m: MedidaVideo): { ancho: number; alto: number } {
  const mayor = Math.max(m.ancho, m.alto);
  const menor = Math.min(m.ancho, m.alto);
  if (!mayor || !menor) return { ancho: VIDEO_LADO_MAYOR, alto: VIDEO_LADO_MENOR };
  const escala = Math.min(1, VIDEO_LADO_MAYOR / mayor, VIDEO_LADO_MENOR / menor);
  return { ancho: par(m.ancho * escala), alto: par(m.alto * escala) };
}

/** El bitrate que hace que `segundos` de video quepan bajo el tope de peso. */
function bitrateObjetivo(segundos: number): number {
  // 80% del tope: el contenedor y el audio también ocupan, y el VBR se pasa.
  const cabe = Math.floor((VIDEO_MAX_BYTES * 8 * 0.8) / Math.max(1, segundos));
  return Math.max(VIDEO_BITRATE_MINIMO, Math.min(VIDEO_BITRATE, cabe));
}

/** ¿Este clip ya entra tal como viene? */
function yaCabe(blob: Blob, m: MedidaVideo): boolean {
  const mayor = Math.max(m.ancho, m.alto);
  const menor = Math.min(m.ancho, m.alto);
  return (
    mimeAceptado(blob.type || "") &&
    blob.size > 0 &&
    blob.size <= VIDEO_MAX_BYTES &&
    m.duracionSeg > 0 &&
    m.duracionSeg <= VIDEO_MAX_SEG &&
    mayor > 0 &&
    mayor <= VIDEO_LADO_MAYOR &&
    menor <= VIDEO_LADO_MENOR
  );
}

/**
 * Deja el clip dentro de los límites, pase lo que pase.
 *
 * Si ya cabe, lo devuelve intacto y no cuesta nada. Si no, lo vuelve a grabar
 * recortado al minuto y escalado a 720p, y avisa por `onProgreso` para que la
 * pantalla no parezca colgada: el reajuste va en tiempo real.
 *
 * Lanza solo si el navegador no sabe grabar —sin MediaRecorder no hay forma de
 * reajustar nada—, y en ese caso el mensaje ya viene explicado.
 */
export async function ajustarVideo(
  origen: Blob,
  onProgreso?: (pct: number) => void,
  /**
   * Lo que el que grabó ya sabe del clip. Se usa solo para rellenar lo que el
   * navegador no supo medir: un WebM recién grabado a veces no dice cuánto
   * dura, y sin este dato habría que reajustar —o sea, esperar un minuto— un
   * video que en realidad ya estaba perfecto.
   */
  pista?: { duracionSeg?: number }
): Promise<ClipListo> {
  const medido = await medirVideo(origen);
  const medida: MedidaVideo = {
    ...medido,
    duracionSeg: medido.duracionSeg || Math.min(VIDEO_MAX_SEG, pista?.duracionSeg ?? 0),
  };

  if (yaCabe(origen, medida)) {
    return { blob: origen, mime: mimeBase(origen.type), medida, ajustes: [] };
  }

  const ajustes: string[] = [];
  if (medida.duracionSeg > VIDEO_MAX_SEG) {
    ajustes.push(`se recortó a 1 minuto (venía de ${reloj(medida.duracionSeg)})`);
  }
  const dest = destino(medida);
  if (medida.ancho > dest.ancho || medida.alto > dest.alto) {
    ajustes.push(`se bajó a ${dest.ancho}x${dest.alto} (venía en ${medida.ancho}x${medida.alto})`);
  }
  if (!mimeAceptado(origen.type || "")) ajustes.push("se convirtió a un formato que la app puede guardar");

  let clip = await reencodear(origen, medida, dest, bitrateObjetivo(segundosDestino(medida)), onProgreso);

  // El VBR se puede pasar del tope aunque se le haya pedido un bitrate. Una
  // segunda pasada, con el bitrate corregido por lo que se pasó, lo deja dentro.
  if (clip.blob.size > VIDEO_MAX_BYTES) {
    const corregido = Math.max(
      VIDEO_BITRATE_MINIMO,
      Math.floor((bitrateObjetivo(segundosDestino(medida)) * VIDEO_MAX_BYTES * 0.85) / clip.blob.size)
    );
    clip = await reencodear(origen, medida, dest, corregido, onProgreso);
    ajustes.push("se bajó la calidad para que cupiera en 25 MB");
  }

  if (!ajustes.length) ajustes.push("se reajustó para poder guardarlo");
  return { ...clip, ajustes };
}

function segundosDestino(m: MedidaVideo): number {
  return Math.min(m.duracionSeg || VIDEO_MAX_SEG, VIDEO_MAX_SEG);
}

/**
 * Vuelve a grabar el clip escalado y recortado.
 *
 * Se reproduce el original con el sonido desviado a WebAudio —así no suena por
 * el parlante en media tienda— mientras cada cuadro se dibuja en un canvas del
 * tamaño de destino. Lo que sale del canvas y del audio se graba de nuevo con
 * MediaRecorder. Es en tiempo real: no hay forma de recortar ni reescalar un
 * video en el navegador sin volver a pasarlo.
 */
async function reencodear(
  origen: Blob,
  medida: MedidaVideo,
  dest: { ancho: number; alto: number },
  bitrate: number,
  onProgreso?: (pct: number) => void
): Promise<{ blob: Blob; mime: string; medida: MedidaVideo }> {
  const tipo = tipoGrabacion();
  if (!tipo) {
    throw new Error("Este navegador no sabe reajustar videos. Graba el clip con la cámara de la app.");
  }

  const segundos = segundosDestino(medida);
  const url = URL.createObjectURL(origen);
  const video = document.createElement("video");
  video.src = url;
  video.playsInline = true;
  video.preload = "auto";

  const canvas = document.createElement("canvas");
  canvas.width = dest.ancho;
  canvas.height = dest.alto;
  const ctx2d = canvas.getContext("2d");

  let audioCtx: AudioContext | null = null;
  let cuadro = 0;

  const limpiar = () => {
    if (cuadro) cancelAnimationFrame(cuadro);
    video.pause();
    URL.revokeObjectURL(url);
    void audioCtx?.close().catch(() => {});
  };

  try {
    if (!ctx2d) throw new Error("No se pudo preparar el video para reajustarlo.");

    await new Promise<void>((listo, falla) => {
      video.onloadeddata = () => listo();
      video.onerror = () => falla(new Error("No se pudo leer ese video."));
    });

    const pistas: MediaStreamTrack[] = [...canvas.captureStream(VIDEO_FPS).getVideoTracks()];

    // El audio va por WebAudio y NO se conecta a ctx.destination: se captura
    // para el clip nuevo pero no sale por el parlante mientras se reajusta.
    try {
      const Contexto =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Contexto) {
        audioCtx = new Contexto();
        await audioCtx.resume().catch(() => {});
        const destinoAudio = audioCtx.createMediaStreamDestination();
        audioCtx.createMediaElementSource(video).connect(destinoAudio);
        pistas.push(...destinoAudio.stream.getAudioTracks());
      }
    } catch {
      // Sin audio se sigue igual: el video mudo vale más que ningún video.
      audioCtx = null;
    }

    const grabador = new MediaRecorder(new MediaStream(pistas), {
      mimeType: tipo,
      videoBitsPerSecond: bitrate,
      audioBitsPerSecond: AUDIO_BITRATE,
    });
    const trozos: Blob[] = [];
    grabador.ondataavailable = (e) => {
      if (e.data.size) trozos.push(e.data);
    };
    const grabado = new Promise<void>((listo) => {
      grabador.onstop = () => listo();
    });

    grabador.start(1000);
    await video.play();

    let detenido = false;
    const detener = () => {
      if (detenido) return;
      detenido = true;
      if (grabador.state !== "inactive") grabador.stop();
    };
    video.onended = detener;

    const dibujar = () => {
      if (detenido) return;
      ctx2d.drawImage(video, 0, 0, dest.ancho, dest.alto);
      onProgreso?.(Math.min(99, Math.round((video.currentTime / segundos) * 100)));
      // Acá es donde se recorta: pasado el minuto se deja de grabar, aunque el
      // original siga.
      if (video.currentTime >= segundos || video.ended) return detener();
      cuadro = requestAnimationFrame(dibujar);
    };
    cuadro = requestAnimationFrame(dibujar);

    await grabado;
    onProgreso?.(100);

    const blob = new Blob(trozos, { type: mimeBase(tipo) });
    const medidaFinal = await medirVideo(blob);
    return {
      blob,
      mime: mimeBase(tipo),
      medida: {
        // Si el navegador no supo decir cuánto dura el clip nuevo, vale lo que
        // se grabó: se cortó exactamente en `segundos`.
        duracionSeg: Math.min(VIDEO_MAX_SEG, medidaFinal.duracionSeg || Math.round(segundos)),
        ancho: medidaFinal.ancho || dest.ancho,
        alto: medidaFinal.alto || dest.alto,
      },
    };
  } finally {
    limpiar();
  }
}
