"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  VIDEO_BITRATE,
  VIDEO_LADO_MAYOR,
  VIDEO_LADO_MENOR,
  VIDEO_MAX_SEG,
  ajustarVideo,
  mb,
  mimeBase,
  reloj,
  tipoGrabacion,
  type ClipListo,
} from "@/lib/ui/video";

type Estado =
  | "pidiendo"
  | "lista"
  | "grabando"
  /** Recortando y reescalando lo que se pasó de los límites. */
  | "ajustando"
  | "revisando"
  | "denegada"
  | "sin-camara";

export type ClipGrabado = ClipListo;

/**
 * Grabación del video del trabajo: 720p y hasta 1 minuto.
 *
 * A la cámara se le piden 1280x720 y el contador corta la grabación solo al
 * llegar al segundo 60, así que el clip nace dentro de lo que la base acepta
 * (ck_video_duracion y ck_video_resolucion en dmc.visita_video). Antes de
 * devolverlo se mide el archivo de verdad —lo que la cámara promete y lo que
 * entrega no siempre coincide— y si se pasó de alguno de los límites se dice
 * por qué en vez de subir algo que la base va a botar.
 *
 * Antes de aceptarlo el técnico lo ve reproducido: en terreno se graba el
 * pórtico equivocado más seguido de lo que uno cree, y descubrirlo en la
 * oficina ya no sirve de nada.
 */
export default function VideoSheet({
  onGrabado,
  onCerrar,
}: {
  onGrabado: (clip: ClipGrabado) => void;
  onCerrar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const grabadorRef = useRef<MediaRecorder | null>(null);
  const trozosRef = useRef<Blob[]>([]);
  const relojRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Los segundos grabados, legibles desde onstop, que no ve el estado. */
  const segundosRef = useRef(0);

  const [estado, setEstado] = useState<Estado>("pidiendo");
  const [error, setError] = useState("");
  /** Se está grabando sin sonido porque no hubo micrófono. */
  const [sinAudio, setSinAudio] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [ajuste, setAjuste] = useState(0);
  const [clip, setClip] = useState<(ClipListo & { url: string }) | null>(null);

  const detener = useCallback(() => {
    if (relojRef.current) {
      clearInterval(relojRef.current);
      relojRef.current = null;
    }
    const grabador = grabadorRef.current;
    if (grabador && grabador.state !== "inactive") grabador.stop();
    grabadorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelado = false;

    async function pedir() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setEstado("sin-camara");
        setError("Este navegador no permite abrir la cámara.");
        return;
      }
      if (!tipoGrabacion()) {
        setEstado("sin-camara");
        setError("Este navegador no sabe grabar video. Usa la galería para adjuntar el clip.");
        return;
      }
      // 720p. Se piden como `ideal` y no como `max` a propósito: con `max`, un
      // celular que solo sabe grabar en 1080p devuelve OverconstrainedError y
      // el técnico se queda sin cámara; pidiéndolo como preferencia, el equipo
      // entrega lo que puede y si se pasa se reajusta después.
      const camara = {
        facingMode: { ideal: "environment" as const },
        width: { ideal: VIDEO_LADO_MAYOR },
        height: { ideal: VIDEO_LADO_MENOR },
        frameRate: { ideal: 30 },
      };

      try {
        // Primero con micrófono: en terreno lo que se explica hablando vale
        // tanto como lo que se ve.
        //
        // Si el micrófono falla —permiso denegado solo para él, equipo sin
        // micrófono, política del navegador— se reintenta con la cámara sola en
        // vez de dejar al técnico sin poder grabar. Un video mudo del pórtico
        // sigue siendo evidencia; ninguno no.
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: camara, audio: true });
        } catch (conAudio) {
          stream = await navigator.mediaDevices.getUserMedia({ video: camara, audio: false });
          if (cancelado) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          console.warn("[dmc] video sin micrófono:", conAudio);
          setSinAudio(true);
        }
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          await videoRef.current.play().catch(() => {});
        }
        setEstado("lista");
      } catch (e) {
        if (cancelado) return;
        const nombre = e instanceof DOMException ? e.name : "";
        if (nombre === "NotAllowedError" || nombre === "SecurityError") {
          setEstado("denegada");
          setError(
            "Diste “Bloquear” al permiso de cámara o micrófono. Habilítalo en el candado de la barra de direcciones, o sube el clip desde la galería."
          );
        } else if (nombre === "NotFoundError" || nombre === "OverconstrainedError") {
          setEstado("sin-camara");
          setError("No se detectó ninguna cámara en este equipo.");
        } else {
          setEstado("sin-camara");
          setError("No se pudo abrir la cámara. Usa la galería para adjuntar el clip.");
        }
      }
    }

    pedir();
    return () => {
      cancelado = true;
      detener();
    };
  }, [detener]);

  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  // La previsualización del clip vive en un object URL: si no se suelta, el
  // celular se queda con el archivo en memoria hasta recargar la página.
  useEffect(() => {
    return () => {
      if (clip) URL.revokeObjectURL(clip.url);
    };
  }, [clip]);

  function cerrar() {
    detener();
    if (clip) URL.revokeObjectURL(clip.url);
    onCerrar();
  }

  function grabar() {
    const stream = streamRef.current;
    const tipo = tipoGrabacion();
    if (!stream || !tipo) return;

    trozosRef.current = [];
    const grabador = new MediaRecorder(stream, { mimeType: tipo, videoBitsPerSecond: VIDEO_BITRATE });
    grabadorRef.current = grabador;

    grabador.ondataavailable = (e) => {
      if (e.data.size) trozosRef.current.push(e.data);
    };
    grabador.onstop = () => {
      if (relojRef.current) {
        clearInterval(relojRef.current);
        relojRef.current = null;
      }
      // El reloj de la grabación es la duración real, y se la pasa por si el
      // navegador no sabe medir el WebM que acaba de producir.
      void revisar(new Blob(trozosRef.current, { type: mimeBase(tipo) }), segundosRef.current);
    };

    grabador.start(1000);
    segundosRef.current = 0;
    setSegundos(0);
    setEstado("grabando");

    relojRef.current = setInterval(
      () =>
        setSegundos((s) => {
          segundosRef.current = s + 1;
          return s + 1;
        }),
      1000
    );
  }

  const parar = useCallback(() => {
    const grabador = grabadorRef.current;
    if (grabador && grabador.state !== "inactive") grabador.stop();
  }, []);

  // El minuto se corta solo: es el tope que acepta dmc.visita_video. Va en un
  // efecto y no dentro del setInterval para no disparar el corte desde el
  // actualizador de estado, que React puede volver a ejecutar.
  useEffect(() => {
    if (estado === "grabando" && segundos >= VIDEO_MAX_SEG) parar();
  }, [estado, segundos, parar]);

  /**
   * Deja el clip listo para aceptar o repetir.
   *
   * Nada se rechaza: si se pasó del minuto o de 720p, `ajustarVideo` lo recorta
   * y lo reescala. Eso toma tiempo real, así que mientras tanto se muestra la
   * barra en vez de dejar la pantalla como colgada.
   */
  async function revisar(blob: Blob, duracionSeg?: number) {
    setError("");
    setAjuste(0);
    setEstado("ajustando");
    try {
      const listo = await ajustarVideo(blob, setAjuste, { duracionSeg });
      setClip({ ...listo, url: URL.createObjectURL(listo.blob) });
      setEstado("revisando");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo preparar el video. Inténtalo otra vez.");
      setEstado("lista");
    }
  }

  function repetir() {
    if (clip) URL.revokeObjectURL(clip.url);
    setClip(null);
    setSegundos(0);
    setEstado("lista");
  }

  function aceptar() {
    if (!clip) return;
    detener();
    URL.revokeObjectURL(clip.url);
    onGrabado({ blob: clip.blob, mime: clip.mime, medida: clip.medida, ajustes: clip.ajustes });
  }

  /**
   * El clip traído de la galería pasa por lo mismo que el grabado: se acepta
   * venga como venga y se recorta y reescala si hace falta. Un video del
   * carrete suele ser largo y en 1080p o más, así que este es el camino que más
   * veces termina reajustando.
   */
  async function desdeArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // La cámara en vivo ya no hace falta y compite por el equipo mientras se
    // reajusta.
    detener();
    await revisar(file);
  }

  const restantes = VIDEO_MAX_SEG - segundos;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Grabar video"
      className="fixed inset-0 z-50 bg-[rgba(45,43,43,.7)] flex flex-col justify-end items-center"
    >
      <div className="w-full max-w-[460px] max-h-[94vh] overflow-y-auto bg-[var(--color-bg)] border-t-2 border-[var(--color-text)] animate-up-sheet">
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b-2 border-[var(--color-divider)]">
          <div className="font-extrabold text-[17px] leading-[1.2]">
            {estado === "revisando"
              ? "Revisa el video"
              : estado === "ajustando"
                ? "Ajustando el video"
                : "Grabar video"}
          </div>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="ml-auto w-[38px] h-[38px] grid place-items-center bg-transparent border-0 cursor-pointer text-[var(--color-text)] hover:bg-black/[.08]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          <div className="relative w-full aspect-[16/9] bg-[var(--color-text)] overflow-hidden border border-[var(--color-divider)]">
            {clip ? (
              <video src={clip.url} controls playsInline className="w-full h-full object-contain bg-black" />
            ) : (
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            )}

            {estado === "pidiendo" ? (
              <div className="absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-[var(--color-bg)]">
                Esperando que autorices la cámara y el micrófono…
              </div>
            ) : null}
            {estado === "ajustando" ? (
              <div className="absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-[var(--color-bg)] bg-[rgba(24,22,21,.82)]">
                <div>
                  <div className="font-extrabold text-base">Recortando y bajando a 720p…</div>
                  <div className="mt-1 opacity-80 tabular-nums">{ajuste}%</div>
                </div>
              </div>
            ) : null}
            {estado === "denegada" || estado === "sin-camara" ? (
              <div className="absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-[var(--color-bg)]">
                {error}
              </div>
            ) : null}

            {estado === "grabando" ? (
              <div className="absolute top-2 left-2 flex items-center gap-2 px-2.5 py-1.5 bg-[rgba(32,30,29,.78)] text-[var(--color-bg)]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#e5484d] animate-pulse" />
                <span className="font-extrabold text-[13px] tabular-nums">{reloj(segundos)}</span>
                <span className="text-[11px] opacity-80 tabular-nums">
                  quedan {reloj(restantes)}
                </span>
              </div>
            ) : null}
          </div>

          {/* La barra del minuto: se ve de un vistazo cuánto queda. */}
          {estado === "grabando" ? (
            <div className="h-1 mt-2 bg-[var(--color-divider)] overflow-hidden">
              <div
                className="h-full bg-[var(--color-accent)] transition-[width] duration-1000 ease-linear"
                style={{ width: `${(segundos / VIDEO_MAX_SEG) * 100}%` }}
              />
            </div>
          ) : null}

          {estado === "ajustando" ? (
            <>
              <div className="h-1 mt-2 bg-[var(--color-divider)] overflow-hidden">
                <div
                  className="h-full bg-[var(--color-accent)] transition-[width] duration-300"
                  style={{ width: `${ajuste}%` }}
                />
              </div>
              <p className="mt-2.5 mb-0 text-xs opacity-66">
                El video venía más largo o con más calidad de la que se puede guardar. Se está
                reajustando y demora lo mismo que dura el clip: no cierres esta ventana.
              </p>
            </>
          ) : null}

          {estado === "lista" ? (
            <>
              <button
                type="button"
                onClick={grabar}
                className="w-full min-h-[58px] flex items-center justify-between px-4.5 mt-3.5 bg-[var(--color-accent)] text-[var(--color-bg)] border-0 font-extrabold text-base cursor-pointer text-left hover:bg-[var(--color-accent-hover)]"
              >
                <span>Empezar a grabar</span>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M3 7h11v10H3z" />
                  <path d="M14 11l7-4v10l-7-4z" />
                </svg>
              </button>
              <p className="mt-2.5 mb-0 text-xs opacity-66">
                720p y hasta 1 minuto. Al llegar al minuto la grabación se corta sola.
                {sinAudio ? " Este equipo no dio micrófono: el clip va a quedar sin sonido." : ""}
              </p>
            </>
          ) : null}

          {estado === "grabando" ? (
            <button
              type="button"
              onClick={parar}
              className="w-full min-h-[58px] flex items-center justify-between px-4.5 mt-3.5 bg-[var(--color-text)] text-[var(--color-bg)] border-0 font-extrabold text-base cursor-pointer text-left hover:bg-[var(--color-neutral-900)]"
            >
              <span>Detener y revisar</span>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            </button>
          ) : null}

          {estado === "revisando" && clip ? (
            <>
              <div className="mt-3 flex items-center gap-2 text-xs opacity-66 tabular-nums">
                <span>
                  {reloj(clip.medida.duracionSeg)} · {clip.medida.ancho}x{clip.medida.alto}
                </span>
                <span className="ml-auto">{mb(clip.blob.size)}</span>
              </div>
              {clip.ajustes.length ? (
                <div className="mt-2 px-3 py-2.5 bg-[var(--color-surface-3)] border-l-[3px] border-[var(--color-accent)] text-[12px] leading-[1.45]">
                  <span className="font-extrabold">Se ajustó para poder guardarlo: </span>
                  {clip.ajustes.join("; ")}. Revísalo antes de aceptarlo.
                </div>
              ) : null}
              <button
                type="button"
                onClick={aceptar}
                className="w-full min-h-[58px] flex items-center justify-between px-4.5 mt-2.5 bg-[var(--color-accent)] text-[var(--color-bg)] border-0 font-extrabold text-base cursor-pointer text-left hover:bg-[var(--color-accent-hover)]"
              >
                <span>Usar este video</span>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M4 12l5 5L20 6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={repetir}
                className="w-full min-h-[50px] mt-2.5 px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
              >
                Grabar otro
              </button>
            </>
          ) : null}

          {error && estado !== "denegada" && estado !== "sin-camara" ? (
            <p className="mt-2.5 mb-0 text-xs text-[var(--color-accent-active)]">{error}</p>
          ) : null}

          {estado !== "grabando" && estado !== "revisando" && estado !== "ajustando" ? (
            <label className="relative w-full min-h-[52px] flex items-center gap-2.5 px-4 mt-2.5 bg-transparent border border-dashed border-black/[.5] text-[var(--color-text)] font-extrabold text-sm cursor-pointer hover:bg-black/[.06]">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 5h16v14H4z" />
                <path d="M10 9l5 3-5 3z" />
              </svg>
              <span>Subir un video desde la galería</span>
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={desdeArchivo}
                className="absolute w-px h-px opacity-0 pointer-events-none"
              />
            </label>
          ) : null}

          {estado !== "grabando" && estado !== "ajustando" ? (
            <button
              type="button"
              onClick={cerrar}
              className="w-full min-h-[50px] mt-2.5 px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
