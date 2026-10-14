"use client";

import { useRef, useState } from "react";
import type { ClipGrabado } from "@/components/mobile/VideoSheet";
import { abrirVideoAction, borrarVideoAction, cerrarVideoAction, subirTrozoVideoAction } from "@/app/actions/videos";
import { trozoBase64, VIDEO_TROZO_BYTES } from "@/lib/ui/video";
import type { Seccion, VideoForm } from "@/lib/ui/borrador";
import type { Visita } from "@/lib/types";
import { nuevoId } from "@/components/mobile/formulario/ids";
import type { ReservaAjena } from "@/lib/reserva";

// Los videos del acta: la lista, los clips todavía en el celular y su subida
// por partes al servidor, con reintento sin regrabar.

export function useVideosActa({
  visita,
  edicion,
  aviso,
  setGuardadas,
  onReservaAjena,
}: {
  visita: Visita;
  edicion: boolean;
  aviso: (texto: string) => void;
  setGuardadas: React.Dispatch<React.SetStateAction<Partial<Record<Seccion, boolean>>>>;
  /** El otro técnico tiene el acta reservada: el servidor rechazó el clip. */
  onReservaAjena: (reserva: ReservaAjena) => void;
}) {
  // El video no se acumula en el formulario como las fotos: se sube a
  // dmc.visita_video en cuanto se termina de grabar, porque un minuto en 720p
  // pesa unos 11 MB y no cabe ni en una Server Action ni en localStorage. Por
  // eso la lista arranca de lo que la visita ya tiene subido y no del borrador:
  // la base es la que sabe qué clips hay.
  const [videos, setVideos] = useState<VideoForm[]>(() =>
    (visita.videos ?? []).map((v) => ({
      id: v.id,
      src: v.archivoUrl,
      duracionSeg: v.duracionSeg ?? 0,
      ancho: v.ancho ?? 0,
      alto: v.alto ?? 0,
      bytes: v.bytes ?? 0,
      progreso: null,
      error: null,
      interno: v.interno,
    }))
  );

  /**
   * Los clips todavía en el celular, por si hay que reintentar la subida.
   *
   * Van en un ref y no en el estado porque son megas: meterlos en el estado los
   * haría viajar en cada render y no aportan nada a lo que se pinta.
   */
  const clipsRef = useRef<Map<number, ClipGrabado>>(new Map());

  /**
   * Sube el clip recién grabado, por partes y en cuanto se acepta.
   *
   * No espera al "Guardar visita": un minuto en 720p pesa unos 11 MB y el
   * cuerpo de una Server Action se corta en 4,5 MB, así que el clip nunca
   * podría viajar dentro del acta. Se manda de a 2 MB mientras el técnico sigue
   * llenando el formulario, y lo que queda en pantalla es una barra de avance.
   *
   * Si se corta la señal a mitad, la fila queda incompleta en la base —no la
   * muestra nadie— y en el formulario aparece el clip con su error y el botón
   * para reintentar. El acta se puede cerrar igual: el video es evidencia
   * adicional, no un requisito.
   */
  async function subirClip(clip: ClipGrabado, filaId: number) {
    const marcar = (cambio: Partial<VideoForm>) =>
      setVideos((prev) => prev.map((v) => (v.id === filaId ? { ...v, ...cambio } : v)));

    let abierto;
    try {
      abierto = await abrirVideoAction(visita.folio, {
        mime: clip.mime,
        bytes: clip.blob.size,
        duracionSeg: clip.medida.duracionSeg,
        ancho: clip.medida.ancho,
        alto: clip.medida.alto,
        grabadoEn: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[dmc] abrirVideo:", err);
      marcar({ progreso: null, error: "No hubo señal para empezar a subir el video." });
      return;
    }

    if (abierto.reservaAjena) onReservaAjena(abierto.reservaAjena);
    if (!abierto.ok || !abierto.videoId) {
      marcar({ progreso: null, error: abierto.error ?? "No se pudo empezar a subir el video." });
      return;
    }
    const videoId = abierto.videoId;

    let subido = 0;
    while (subido < clip.blob.size) {
      const hasta = Math.min(subido + VIDEO_TROZO_BYTES, clip.blob.size);
      let res;
      try {
        res = await subirTrozoVideoAction({
          folio: visita.folio,
          videoId,
          desde: subido,
          // El trozo viaja dentro del objeto, no como argumento suelto: ver
          // la explicación en app/actions/videos (TrozoVideo).
          trozoBase64: await trozoBase64(clip.blob, subido, hasta),
        });
      } catch (err) {
        // El motivo real va al log, no a la pantalla: cuando el que falla es el
        // servidor, el mensaje que llega es el genérico de producción ("An
        // error occurred in the Server Components render…") y al técnico no le
        // dice nada. En pantalla va algo accionable y el clip queda con su
        // botón de reintentar.
        console.error("[dmc] subirTrozoVideo:", err);
        marcar({ progreso: null, error: "Se cortó la subida del video. Vuelve a intentarlo." });
        return;
      }
      if (res.reservaAjena) onReservaAjena(res.reservaAjena);
      if (!res.ok) {
        marcar({ progreso: null, error: res.error ?? "No se pudo subir el video." });
        return;
      }
      subido = res.recibidos ?? hasta;
      marcar({ progreso: Math.round((subido / clip.blob.size) * 100) });
    }

    const cerrado = await cerrarVideoAction(visita.folio, videoId).catch(() => null);
    if (cerrado?.reservaAjena) onReservaAjena(cerrado.reservaAjena);
    if (!cerrado?.ok) {
      marcar({ progreso: null, error: cerrado?.error ?? "El video no terminó de guardarse." });
      return;
    }
    // Se pisa el id temporal por el de la base y la vista previa local por la
    // ruta que sirve el servidor: así el clip sobrevive a recargar la pantalla.
    clipsRef.current.delete(filaId);
    setVideos((prev) =>
      prev.map((v) =>
        v.id === filaId
          ? {
              ...v,
              id: videoId,
              // Al editar un acta cerrada el clip queda inactivo hasta guardar
              // y el servidor todavía no lo sirve: se sigue viendo el local.
              src: edicion ? v.src : cerrado.archivoUrl ?? v.src,
              progreso: null,
              error: null,
            }
          : v
      )
    );
  }

  /** El clip aceptado en la hoja de grabación entra a la lista y empieza a subir. */
  function agregarVideo(clip: ClipGrabado, interno = false) {
    const filaId = -nuevoId();  // negativo: todavía no tiene id de la base
    // El clip se guarda en memoria para poder reintentar la subida sin obligar
    // al técnico a volver a grabar: si se cayó la señal, el video sigue acá.
    clipsRef.current.set(filaId, clip);
    setVideos((prev) => [
      ...prev,
      {
        id: filaId,
        src: URL.createObjectURL(clip.blob),
        duracionSeg: clip.medida.duracionSeg,
        ancho: clip.medida.ancho,
        alto: clip.medida.alto,
        bytes: clip.blob.size,
        progreso: 0,
        error: null,
        interno,
      },
    ]);
    setGuardadas((g) => ({ ...g, [interno ? "interno" : "fotos"]: false }));
    void subirClip(clip, filaId);
  }

  /** Volver a intentar la subida de un clip que se cortó, sin regrabarlo. */
  function reintentarVideo(video: VideoForm) {
    const clip = clipsRef.current.get(video.id);
    if (!clip) return aviso("Ese video ya no está en el celular: hay que grabarlo de nuevo");
    setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, progreso: 0, error: null } : v)));
    void subirClip(clip, video.id);
  }

  /** Quita el clip del acta. Si ya estaba en la base, se deja inactivo allá. */
  function quitarVideo(video: VideoForm) {
    clipsRef.current.delete(video.id);
    setVideos((prev) => prev.filter((v) => v.id !== video.id));
    setGuardadas((g) => ({ ...g, [video.interno ? "interno" : "fotos"]: false }));
    // Al editar un acta cerrada el clip se quita recién al guardar la edición.
    if (video.id > 0 && !edicion) {
      void borrarVideoAction(visita.folio, video.id).catch(() => {
        // Que no se pueda marcar inactivo ahora no importa: al cerrar el acta
        // se desactiva igual todo lo que no venga en videosIds.
      });
    }
  }

  return { videos, setVideos, clipsRef, agregarVideo, reintentarVideo, quitarVideo };
}
