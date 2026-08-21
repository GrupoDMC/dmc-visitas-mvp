"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Estado = "pidiendo" | "lista" | "denegada" | "sin-camara";

/**
 * Captura de fotos con la cámara del equipo. Pide permiso real vía
 * getUserMedia (cámara trasera cuando existe) y devuelve cada disparo como
 * data URL. Si el navegador niega el permiso o no hay cámara, cae al selector
 * de archivos para no dejar al técnico sin forma de adjuntar la foto.
 */
export default function CamaraSheet({
  onCapturar,
  onCerrar,
}: {
  onCapturar: (dataUrl: string) => void;
  onCerrar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<Estado>("pidiendo");
  const [error, setError] = useState("");
  const [tomadas, setTomadas] = useState(0);

  const detener = useCallback(() => {
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
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 }, height: { ideal: 1200 } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setEstado("lista");
      } catch (e) {
        if (cancelado) return;
        const nombre = e instanceof DOMException ? e.name : "";
        if (nombre === "NotAllowedError" || nombre === "SecurityError") {
          setEstado("denegada");
          setError("Diste “Bloquear” al permiso de cámara. Habilítalo en el candado de la barra de direcciones, o sube la foto desde la galería.");
        } else if (nombre === "NotFoundError" || nombre === "OverconstrainedError") {
          setEstado("sin-camara");
          setError("No se detectó ninguna cámara en este equipo.");
        } else {
          setEstado("sin-camara");
          setError("No se pudo abrir la cámara. Usa la galería para adjuntar la foto.");
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

  function cerrar() {
    detener();
    onCerrar();
  }

  function disparar() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapturar(canvas.toDataURL("image/jpeg", 0.85));
    setTomadas((n) => n + 1);
  }

  function desdeArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => onCapturar(String(reader.result));
      reader.readAsDataURL(file);
    });
    e.target.value = "";
    if (files.length) cerrar();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tomar foto"
      className="fixed inset-0 z-50 bg-[rgba(45,43,43,.7)] flex flex-col justify-end items-center"
    >
      <div className="w-full max-w-[460px] max-h-[94vh] overflow-y-auto bg-[var(--color-bg)] border-t-2 border-[var(--color-text)] animate-up-sheet">
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b-2 border-[var(--color-divider)]">
          <div className="font-extrabold text-[17px] leading-[1.2]">Tomar foto</div>
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
          <div className="relative w-full aspect-[4/3] bg-[var(--color-text)] overflow-hidden border border-[var(--color-divider)]">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            {estado === "pidiendo" ? (
              <div className="absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-[var(--color-bg)]">
                Esperando que autorices el uso de la cámara…
              </div>
            ) : null}
            {estado !== "lista" && estado !== "pidiendo" ? (
              <div className="absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-[var(--color-bg)]">
                {error}
              </div>
            ) : null}
          </div>

          {estado === "lista" ? (
            <>
              <button
                type="button"
                onClick={disparar}
                className="w-full min-h-[58px] flex items-center justify-between px-4.5 mt-3.5 bg-[var(--color-accent)] text-[var(--color-bg)] border-0 font-extrabold text-base cursor-pointer text-left hover:bg-[var(--color-accent-hover)]"
              >
                <span>Tomar foto</span>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M3 8h3l2-3h8l2 3h3v12H3z" />
                  <circle cx="12" cy="13" r="3.4" />
                </svg>
              </button>
              <p className="mt-2.5 mb-0 text-xs opacity-66">
                {tomadas > 0
                  ? `${tomadas} foto${tomadas > 1 ? "s" : ""} agregada${tomadas > 1 ? "s" : ""} a la visita. Puedes seguir disparando.`
                  : "Cada disparo se agrega a la visita al instante."}
              </p>
            </>
          ) : null}

          <label className="w-full min-h-[52px] flex items-center gap-2.5 px-4 mt-2.5 bg-transparent border border-dashed border-black/[.5] text-[var(--color-text)] font-extrabold text-sm cursor-pointer hover:bg-black/[.06]">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 5h16v14H4z" />
              <path d="M4 16l5-5 4 4 3-3 4 4" />
              <circle cx="9" cy="9" r="1.4" />
            </svg>
            <span>Subir desde la galería</span>
            <input type="file" accept="image/*" multiple onChange={desdeArchivo} className="absolute w-px h-px opacity-0 pointer-events-none" />
          </label>

          <button
            type="button"
            onClick={cerrar}
            className="w-full min-h-[50px] mt-2.5 px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
          >
            {tomadas > 0 ? "Listo" : "Cancelar"}
          </button>
        </div>
      </div>
    </div>
  );
}
