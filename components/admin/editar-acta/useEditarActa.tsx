"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { editarActaAdminAction } from "@/app/actions/ediciones";
import { formularioDesdeActa } from "@/lib/ui/edicion";
import { mensajeRut } from "@/lib/ui/formato";
import { useReferencias } from "@/lib/ui/referencias";
import { comprimirFoto } from "@/lib/ui/imagen";
import { ajustarVideo, trozoBase64, VIDEO_TROZO_BYTES } from "@/lib/ui/video";
import { abrirVideoAction, cerrarVideoAction, subirTrozoVideoAction } from "@/app/actions/videos";
import type { FotoForm, ProblemaForm, SubSeleccion, TrabajoForm } from "@/lib/ui/borrador";
import type { CatalogoInterno, CatalogoMotivo, CatalogoProblema, CatalogoTrabajo, Visita } from "@/lib/types";

// El estado de la edición del acta desde el panel y todo lo que lo cambia: los
// campos de cada sección, las fotos y videos nuevos, qué cambió y el guardado
// (ver components/admin/EditarActa.tsx).

export function useEditarActa({
  visita,
  motivos,
  catalogoTrabajo,
  catalogoProblema,
  catalogoInterno,
}: {
  visita: Visita;
  motivos: CatalogoMotivo[];
  catalogoTrabajo: CatalogoTrabajo[];
  catalogoProblema: CatalogoProblema[];
  catalogoInterno: CatalogoInterno[];
}) {
  const router = useRouter();
  const { toast, aviso } = useToast();
  const [inicial] = useState(() => formularioDesdeActa(visita));
  const [sigId, setSigId] = useState(inicial.siguienteId);
  const nuevoId = () => {
    setSigId((n) => n + 1);
    return sigId;
  };

  const [respNombre, setRespNombre] = useState(inicial.respNombre);
  const [respRut, setRespRut] = useState(inicial.respRut);
  const [respTel, setRespTel] = useState(inicial.respTel);
  const cargos = useReferencias().cargos;
  const [respCargo, setRespCargo] = useState(visita.ejecucion?.responsableCargo ?? "");
  const [motivosCodigos, setMotivosCodigos] = useState(inicial.motivosCodigos);
  const [trabajos, setTrabajos] = useState<TrabajoForm[]>(inicial.trabajos);
  const [obs, setObs] = useState(inicial.obs);
  const [problemas, setProblemas] = useState<ProblemaForm[]>(inicial.problemas);
  const [interno, setInterno] = useState(inicial.interno);
  const [internos, setInternos] = useState(inicial.internos);
  const [fotos, setFotos] = useState<FotoForm[]>(inicial.fotos);
  const [videos, setVideos] = useState(visita.videos ?? []);
  const [motivoEdicion, setMotivoEdicion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** El video que se está preparando o subiendo: uno a la vez. */
  const [subida, setSubida] = useState<{ interno: boolean; paso: string; pct: number } | null>(null);

  const hrefActa = `/admin/visitas/${encodeURIComponent(visita.folio)}`;
  // Los motivos que agendó coordinación se marcan como tales, pero se pueden
  // quitar igual que en el celular si en terreno no correspondían.
  const agendados = (visita.motivosCodigos?.length ? visita.motivosCodigos : [visita.motivoCodigo]).filter(Boolean);
  const nombreMotivo = (codigo: string) =>
    motivos.find((m) => m.codigo === codigo)?.nombre ??
    visita.motivosNombres[visita.motivosCodigos.indexOf(codigo)] ??
    codigo;
  const nombreTrabajo = (codigo: string) => catalogoTrabajo.find((t) => t.codigo === codigo)?.nombre ?? codigo;
  const nombreProblema = (codigo: string) => catalogoProblema.find((p) => p.codigo === codigo)?.nombre ?? codigo;
  /** Los trabajos de actas anteriores no traen motivo: cuelgan del primero. */
  const motivoDe = (t: TrabajoForm) => t.motivo || motivosCodigos[0] || "";
  const errorRut = mensajeRut(respRut);
  const firma = inicial.firma;
  /** Los clips agregados en esta edición: todavía no están en el acta. */
  const videosNuevos = new Set(
    videos.filter((v) => !(visita.videos ?? []).some((x) => x.id === v.id)).map((v) => v.id)
  );

  // Los motivos marcados, en el orden del checklist; los que ya no están en él
  // (se desactivaron después) van al final para no perderlos.
  const motivosMarcados = [
    ...motivos.filter((m) => motivosCodigos.includes(m.codigo)).map((m) => m.codigo),
    ...motivosCodigos.filter((c) => !motivos.some((m) => m.codigo === c)),
  ];

  function cambiarSubs(trabajoId: number, fn: (subs: SubSeleccion[]) => SubSeleccion[]) {
    setTrabajos((prev) => prev.map((t) => (t.id === trabajoId ? { ...t, subs: fn(t.subs) } : t)));
  }

  function cambiarProblema(id: number, cambio: Partial<ProblemaForm>) {
    setProblemas((prev) => prev.map((p) => (p.id === id ? { ...p, ...cambio } : p)));
  }

  function quitarMotivo(codigo: string) {
    setTrabajos((prev) => prev.filter((t) => motivoDe(t) !== codigo));
    setMotivosCodigos((prev) => prev.filter((c) => c !== codigo));
  }

  function agregarFotos(e: React.ChangeEvent<HTMLInputElement>, interna: boolean) {
    const archivos = Array.from(e.target.files ?? []);
    let id = sigId;
    setSigId((n) => n + archivos.length);
    archivos.forEach((archivo) => {
      const propio = id++;
      const lector = new FileReader();
      lector.onload = async () => {
        const src = await comprimirFoto(String(lector.result));
        setFotos((prev) => [...prev, { id: propio, src, interno: interna }]);
      };
      lector.readAsDataURL(archivo);
    });
    e.target.value = "";
  }

  /**
   * Agrega un video desde un archivo del computador.
   *
   * Pasa por el mismo camino que el del celular: se deja dentro de los límites
   * (1 minuto, 720p, 25 MB; si se pasa, se recorta y se reescala acá mismo) y
   * se sube por partes. Queda en la base pero inactivo: entra al acta recién al
   * apretar «Guardar cambios», que es lo que deja el registro.
   */
  async function agregarVideo(e: React.ChangeEvent<HTMLInputElement>, interna: boolean) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo || subida) return;
    const avance = (paso: string, pct: number) => setSubida({ interno: interna, paso, pct });

    try {
      avance("Preparando el video…", 0);
      const clip = await ajustarVideo(archivo, (pct) => avance("Ajustando a 1 minuto y 720p…", pct));

      avance("Subiendo…", 0);
      const abierto = await abrirVideoAction(visita.folio, {
        mime: clip.mime,
        bytes: clip.blob.size,
        duracionSeg: clip.medida.duracionSeg,
        ancho: clip.medida.ancho,
        alto: clip.medida.alto,
      });
      if (!abierto.ok || !abierto.videoId) throw new Error(abierto.error ?? "No se pudo empezar a subir el video.");
      const videoId = abierto.videoId;

      let subido = 0;
      while (subido < clip.blob.size) {
        const hasta = Math.min(subido + VIDEO_TROZO_BYTES, clip.blob.size);
        const res = await subirTrozoVideoAction({
          folio: visita.folio,
          videoId,
          desde: subido,
          trozoBase64: await trozoBase64(clip.blob, subido, hasta),
        });
        if (!res.ok) throw new Error(res.error ?? "No se pudo subir el video.");
        subido = res.recibidos ?? hasta;
        avance("Subiendo…", Math.round((subido / clip.blob.size) * 100));
      }

      const cerrado = await cerrarVideoAction(visita.folio, videoId);
      if (!cerrado.ok) throw new Error(cerrado.error ?? "El video no terminó de guardarse.");

      setVideos((prev) => [
        ...prev,
        {
          id: videoId,
          visitaId: visita.id,
          problemaId: null,
          etiqueta: null,
          // Hasta guardar la edición el servidor no lo sirve: se ve el local.
          archivoUrl: URL.createObjectURL(clip.blob),
          interno: interna,
          mime: clip.mime,
          bytes: clip.blob.size,
          duracionSeg: clip.medida.duracionSeg,
          ancho: clip.medida.ancho,
          alto: clip.medida.alto,
          orden: 0,
          grabadoEn: null,
        },
      ]);
      aviso(clip.ajustes.length ? `Video agregado: ${clip.ajustes.join(", ")}` : "Video agregado");
    } catch (err) {
      console.error("[dmc] no se pudo agregar el video:", err);
      const texto = err instanceof Error ? err.message : "";
      // Los errores propios vienen explicados; los del runtime de Next, no.
      aviso(texto && !/server components render|fetch/i.test(texto) ? texto : "No se pudo subir el video. Inténtalo otra vez.");
    } finally {
      setSubida(null);
    }
  }

  /** Qué falta para poder guardar, o null si está todo. */
  function falta(): string | null {
    if (!respNombre.trim()) return "Falta el nombre del responsable de tienda.";
    if (errorRut) return `RUT del responsable: ${errorRut}`;
    if (motivosCodigos.length === 0) return "Marca al menos un motivo de la visita.";
    const vigentes = trabajos.filter((t) => motivosCodigos.includes(motivoDe(t)));
    if (!vigentes.length) return "Agrega al menos un trabajo realizado.";
    for (const t of vigentes) {
      const cat = catalogoTrabajo.find((c) => c.codigo === t.codigo);
      if (cat && cat.subtrabajos.length > 0 && t.subs.length === 0) {
        return `En «${cat.nombre}» marca al menos un ${cat.singular ?? "subtrabajo"}.`;
      }
    }
    for (const p of problemas) {
      const cat = catalogoProblema.find((c) => c.codigo === p.codigo);
      const conOpciones = !!cat && cat.opciones.length > 0;
      if (conOpciones && p.items.length === 0) {
        return `En el problema «${cat.nombre}» marca al menos un ${cat.singular ?? "detalle"}.`;
      }
      if (!conOpciones && !p.desc.trim()) return `Escribe qué se encontró en el problema «${nombreProblema(p.codigo)}».`;
    }
    if (subida) return "Espera a que termine de subir el video.";
    if (motivoEdicion.trim().length < 5) return "Escribe por qué se edita el acta: queda en el registro.";
    return null;
  }

  async function guardar() {
    const problema = falta();
    if (problema) {
      setError(problema);
      irA("guardar");
      return aviso(problema);
    }
    setGuardando(true);
    setError(null);
    try {
      const res = await editarActaAdminAction({
        folio: visita.folio,
        motivoEdicion: motivoEdicion.trim(),
        edicionesVistas: visita.ediciones?.length ?? 0,
        responsableNombre: respNombre.trim(),
        responsableRut: respRut.trim() || null,
        responsableTelefono: respTel.trim() || null,
        responsableCargo: respCargo.trim() || null,
        motivosCodigos: motivosMarcados,
        observaciones: obs.trim() || null,
        comentarioInterno: interno.trim() || null,
        internosCodigos: internos,
        trabajos: trabajos
          .filter((t) => motivosCodigos.includes(motivoDe(t)))
          .map((t) => ({
            codigo: t.codigo,
            motivoCodigo: motivoDe(t),
            detalle: t.detalle?.trim() || null,
            subtrabajos: t.subs.map((s) => ({ etiqueta: s.etiqueta, cantidad: s.cantidad })),
          })),
        problemas: problemas.map((p) => ({
          id: p.dbId ?? null,
          tipoCodigo: p.codigo,
          descripcion: p.desc.trim() || null,
          items: p.items.map((it) => ({ etiqueta: it.etiqueta, cantidad: it.cantidad })),
        })),
        fotosConservadas: fotos.filter((f) => f.dbId).map((f) => f.dbId!),
        fotosNuevas: fotos.filter((f) => !f.dbId).map((f) => ({ dataUrl: f.src, etiqueta: null, interno: Boolean(f.interno) })),
        videosIds: videos.map((v) => v.id),
        videosInternosIds: videos.filter((v) => v.interno).map((v) => v.id),
      });
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar la edición.");
        return aviso(res.error ?? "No se pudo guardar la edición.");
      }
      router.push(hrefActa);
      router.refresh();
    } catch (err) {
      console.error("[dmc] no se pudo guardar la edición del acta:", err);
      setError("No se pudo llegar al servidor. No se guardó nada: inténtalo otra vez.");
    } finally {
      setGuardando(false);
    }
  }

  // Qué secciones llevan cambios, comparando contra lo que se cargó. Es solo
  // para orientar a quien edita: el registro de verdad lo arma el servidor.
  const huellas = {
    responsable: JSON.stringify([respNombre.trim(), respRut, respTel, respCargo]),
    trabajo: JSON.stringify([
      motivosMarcados,
      trabajos.map((t) => [t.codigo, motivoDe(t), t.subs.map((x) => [x.etiqueta, x.cantidad]).sort()]),
      obs.trim(),
    ]),
    problemas: JSON.stringify(
      problemas.map((x) => [x.dbId ?? 0, x.codigo, x.items.map((i) => [i.etiqueta, i.cantidad]).sort(), x.desc.trim()])
    ),
    interno: JSON.stringify([
      [...internos].sort(),
      interno.trim(),
      fotos.filter((f) => f.interno).map((f) => f.id),
      videos.filter((v) => v.interno).map((v) => v.id),
    ]),
    media: JSON.stringify([fotos.filter((f) => !f.interno).map((f) => f.id), videos.filter((v) => !v.interno).map((v) => v.id)]),
  };
  const [huellasIniciales] = useState(huellas);
  const SECCIONES = [
    { clave: "responsable", titulo: "Responsable de tienda" },
    { clave: "trabajo", titulo: "Motivo y trabajo realizado" },
    { clave: "problemas", titulo: "Problemas detectados" },
    { clave: "interno", titulo: "Comentario interno" },
    { clave: "media", titulo: "Fotos y video del trabajo" },
  ] as const;
  type Clave = (typeof SECCIONES)[number]["clave"];
  const cambio = (clave: Clave) => huellas[clave] !== huellasIniciales[clave];
  const conCambios = SECCIONES.filter((x) => cambio(x.clave));
  const hayCambios = conCambios.length > 0;

  function irA(clave: string) {
    document.getElementById(`ea-sec-${clave}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const quitarFoto = (id: number) => setFotos((prev) => prev.filter((f) => f.id !== id));
  const quitarVideo = (id: number) => setVideos((prev) => prev.filter((v) => v.id !== id));
  const ejec = visita.ejecucion;

  return {
    visita,
    motivos,
    catalogoTrabajo,
    catalogoProblema,
    catalogoInterno,
    router,
    toast,
    aviso,
    inicial,
    sigId,
    setSigId,
    nuevoId,
    respNombre,
    setRespNombre,
    respRut,
    setRespRut,
    respTel,
    setRespTel,
    cargos,
    respCargo,
    setRespCargo,
    motivosCodigos,
    setMotivosCodigos,
    trabajos,
    setTrabajos,
    obs,
    setObs,
    problemas,
    setProblemas,
    interno,
    setInterno,
    internos,
    setInternos,
    fotos,
    setFotos,
    videos,
    setVideos,
    motivoEdicion,
    setMotivoEdicion,
    guardando,
    setGuardando,
    error,
    setError,
    subida,
    setSubida,
    hrefActa,
    agendados,
    nombreMotivo,
    nombreTrabajo,
    nombreProblema,
    motivoDe,
    errorRut,
    firma,
    videosNuevos,
    motivosMarcados,
    cambiarSubs,
    cambiarProblema,
    quitarMotivo,
    agregarFotos,
    agregarVideo,
    falta,
    guardar,
    huellas,
    huellasIniciales,
    SECCIONES,
    cambio,
    conCambios,
    hayCambios,
    irA,
    quitarFoto,
    quitarVideo,
    ejec,
  };
}

/** Todo lo que el formulario expone a sus pantallas, secciones y hojas. */
export type EditarActaApi = ReturnType<typeof useEditarActa>;
