"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Tag from "@/components/Tag";
import { Toast, useToast } from "@/components/ui/Toast";
import { editarActaAdminAction } from "@/app/actions/ediciones";
import { ESTADO_PROBLEMA_LABEL, ESTADO_PROBLEMA_TAG } from "@/lib/ui/estado";
import { formularioDesdeActa } from "@/lib/ui/edicion";
import { fmtRut, fmtTel, mensajeRut } from "@/lib/ui/formato";
import { comprimirFoto } from "@/lib/ui/imagen";
import { trabajoVaConMotivo } from "@/lib/ui/referencias";
import { ajustarVideo, reloj, trozoBase64, VIDEO_TROZO_BYTES } from "@/lib/ui/video";
import { abrirVideoAction, cerrarVideoAction, subirTrozoVideoAction } from "@/app/actions/videos";
import type { FotoForm, ProblemaForm, SubSeleccion, TrabajoForm } from "@/lib/ui/borrador";
import type { CatalogoInterno, CatalogoMotivo, CatalogoProblema, CatalogoTrabajo, Visita } from "@/lib/types";

/**
 * Editar un acta ya cerrada, desde el panel.
 *
 * Es el acta entera puesta en campos, cada dato en su sección: responsable,
 * motivos y trabajos, problemas, comentario interno, fotos y videos. Parte de
 * lo que quedó guardado y no escribe nada hasta "Guardar cambios", que pide el
 * motivo. La firma de la tienda se muestra, pero no se toca.
 *
 * Qué cambió no lo decide esta pantalla: el servidor compara contra lo guardado
 * y deja el registro (ver lib/data/ediciones).
 */
export default function EditarActa({
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
  // Los motivos que agendó coordinación no se quitan acá: se corrigen en
  // «Corregir visita», que es donde se agenda.
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

  return (
    <div className="pb-12 animate-fade-in">
      <div className="flex items-center gap-3 flex-wrap px-4 md:px-7 py-3.5 border-b border-[var(--color-divider-soft)]">
        <Link href={hrefActa} className="btn btn-secondary min-h-10 px-3.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
          <span>Volver al acta sin guardar</span>
        </Link>
        <Tag variant="accent">Editando acta cerrada</Tag>
      </div>

      <div className="px-4 md:px-7 pt-7 max-w-[900px]">
        <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">Editar acta</div>
        <h1 className="font-extrabold text-[30px] md:text-[40px] leading-[1.04] tracking-[-.035em] mt-2.5 mb-1.5 tabular-nums">
          {visita.folio}
        </h1>
        <p className="m-0 mb-5 text-[15px] opacity-60">
          {visita.cliente?.nombreFantasia} · {visita.sucursal?.nombre} · {visita.tecnico?.nombreCompleto}
        </p>
        <div className="px-4 py-3.5 mb-6 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)] text-[13px] leading-[1.5]">
          Cada dato está en su sección, tal como quedó guardado. Nada cambia hasta que aprietes «Guardar cambios» al
          final. Ahí queda registrado qué cambiaste, cuándo y por qué; el PDF del acta sale con los datos corregidos y
          sin ninguna marca de edición. La firma de la tienda no se toca.
        </div>

        {/* ── 1 · Responsable ── */}
        <Tarjeta n={1} titulo="Responsable de tienda">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="field min-w-0 sm:col-span-2">
              <label htmlFor="ea-nombre">Nombre</label>
              <input
                id="ea-nombre"
                className="input"
                value={respNombre}
                onChange={(e) => setRespNombre(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="field min-w-0">
              <label htmlFor="ea-rut">RUT</label>
              <input
                id="ea-rut"
                className="input tabular-nums"
                value={respRut}
                onChange={(e) => setRespRut(fmtRut(e.target.value))}
                placeholder="11.111.111-1"
                autoComplete="off"
              />
              {errorRut ? <div className="mt-1 text-xs text-[var(--color-accent-800)]">{errorRut}</div> : null}
            </div>
            <div className="field min-w-0">
              <label htmlFor="ea-tel">Teléfono</label>
              <input
                id="ea-tel"
                className="input tabular-nums"
                value={respTel}
                onChange={(e) => setRespTel(fmtTel(e.target.value))}
                placeholder="+56 9 1234 5678"
                autoComplete="off"
              />
            </div>
          </div>
        </Tarjeta>

        {/* ── 2 · Motivos y trabajo realizado ── */}
        <Tarjeta n={2} titulo="Motivo y trabajo realizado">
          <div className="flex flex-col gap-4">
            {motivosMarcados.map((codigo) => {
              const suyos = trabajos.filter((t) => motivoDe(t) === codigo);
              const porAgregar = catalogoTrabajo.filter(
                (t) => trabajoVaConMotivo(t, codigo) && !suyos.some((x) => x.codigo === t.codigo)
              );
              return (
                <div key={codigo} className="border border-black/[.3] border-l-4 border-l-[var(--color-accent)]">
                  <div className="flex items-center gap-3 px-4 py-3 bg-[var(--color-surface)] border-b border-black/[.2]">
                    <div className="font-extrabold text-[15px] flex-1 min-w-0">{nombreMotivo(codigo)}</div>
                    {agendados.includes(codigo) ? (
                      <span className="text-[11px] tracking-[.09em] uppercase opacity-60">Agendado</span>
                    ) : (
                      <button type="button" onClick={() => quitarMotivo(codigo)} className="btn btn-ghost min-h-8 text-[13px]">
                        Quitar motivo{suyos.length ? ` y sus ${suyos.length === 1 ? "trabajo" : "trabajos"}` : ""}
                      </button>
                    )}
                  </div>

                  <div className="px-4 py-4 flex flex-col gap-3.5">
                    {suyos.map((t) => {
                      const cat = catalogoTrabajo.find((c) => c.codigo === t.codigo);
                      // Lo del checklist de hoy más lo que el acta ya traía y
                      // el checklist dejó de ofrecer: eso tampoco se pierde.
                      const opciones = [
                        ...(cat?.subtrabajos ?? []).map((s) => ({ etiqueta: s.etiqueta, conCantidad: s.permiteCantidad })),
                        ...t.subs
                          .filter((s) => !(cat?.subtrabajos ?? []).some((c) => c.etiqueta === s.etiqueta))
                          .map((s) => ({ etiqueta: s.etiqueta, conCantidad: s.cantidad > 1 })),
                      ];
                      return (
                        <div key={t.id} className="border border-black/[.25] bg-white px-4 py-3.5">
                          <div className="flex items-start gap-3">
                            <div className="font-extrabold text-base flex-1 min-w-0">{nombreTrabajo(t.codigo)}</div>
                            <button
                              type="button"
                              onClick={() => setTrabajos((prev) => prev.filter((x) => x.id !== t.id))}
                              className="btn btn-ghost min-h-8 text-[13px] flex-none"
                            >
                              Quitar trabajo
                            </button>
                          </div>
                          {opciones.length > 0 ? (
                            <>
                              <div className="text-[11px] tracking-[.09em] uppercase opacity-62 mt-2.5 mb-1.5">
                                {cat?.grupoLabel ?? "Subtrabajos"}
                              </div>
                              <ListaMarcable
                                opciones={opciones}
                                marcados={t.subs}
                                onCambiar={(fn) => cambiarSubs(t.id, fn)}
                              />
                            </>
                          ) : null}
                          {t.detalle ? <div className="text-[13px] opacity-70 mt-2.5">{t.detalle}</div> : null}
                        </div>
                      );
                    })}
                    {suyos.length === 0 ? (
                      <div className="text-[13px] opacity-66">Este motivo no tiene trabajos registrados.</div>
                    ) : null}
                    {porAgregar.length > 0 ? (
                      <div className="field max-w-[420px]">
                        <label htmlFor={`ea-agregar-${codigo}`}>Agregar un trabajo a este motivo</label>
                        <select
                          id={`ea-agregar-${codigo}`}
                          className="input"
                          value=""
                          onChange={(e) => {
                            const elegido = e.target.value;
                            if (!elegido) return;
                            const id = nuevoId();
                            setTrabajos((prev) => [...prev, { id, codigo: elegido, motivo: codigo, subs: [], detalle: "" }]);
                          }}
                        >
                          <option value="">Elige el trabajo…</option>
                          {porAgregar.map((c) => (
                            <option key={c.codigo} value={c.codigo}>
                              {c.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {motivos.some((m) => !motivosCodigos.includes(m.codigo)) ? (
              <div>
                <div className="text-[11px] tracking-[.09em] uppercase opacity-62 mb-2">
                  La visita fue también por otro motivo
                </div>
                <div className="flex flex-wrap gap-2">
                  {motivos
                    .filter((m) => !motivosCodigos.includes(m.codigo))
                    .map((m) => (
                      <button
                        key={m.codigo}
                        type="button"
                        onClick={() => setMotivosCodigos((prev) => [...prev, m.codigo])}
                        className="btn btn-secondary min-h-9 px-3 text-[13px] font-normal"
                      >
                        + {m.nombre}
                      </button>
                    ))}
                </div>
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="ea-obs">Detalle del trabajo (lo ve el cliente)</label>
              <textarea id="ea-obs" className="input" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
          </div>
        </Tarjeta>

        {/* ── 3 · Problemas ── */}
        <Tarjeta n={3} titulo={`Problemas detectados (${problemas.length})`}>
          <div className="flex flex-col gap-3.5">
            {problemas.map((p, i) => {
              const cat = catalogoProblema.find((c) => c.codigo === p.codigo);
              const opciones = [
                ...(cat?.opciones ?? []).map((o) => ({ etiqueta: o.etiqueta, conCantidad: o.permiteCantidad })),
                ...p.items
                  .filter((it) => !(cat?.opciones ?? []).some((o) => o.etiqueta === it.etiqueta))
                  .map((it) => ({ etiqueta: it.etiqueta, conCantidad: true })),
              ];
              return (
                <div key={p.id} className="border border-black/[.3] bg-white">
                  <div className="flex items-center gap-2.5 flex-wrap px-4 py-3 bg-[var(--color-surface)] border-b border-black/[.2]">
                    <div className="font-extrabold text-xs tracking-[.09em] uppercase">Problema {i + 1}</div>
                    {p.dbId ? (
                      <Tag variant={ESTADO_PROBLEMA_TAG[p.estado]}>{ESTADO_PROBLEMA_LABEL[p.estado]}</Tag>
                    ) : (
                      <Tag variant="outline">Nuevo</Tag>
                    )}
                    <button
                      type="button"
                      onClick={() => setProblemas((prev) => prev.filter((x) => x.id !== p.id))}
                      className="btn btn-ghost min-h-8 text-[13px] ml-auto"
                    >
                      Quitar problema
                    </button>
                  </div>
                  <div className="px-4 py-4 flex flex-col gap-3.5">
                    <div className="field max-w-[420px]">
                      <label htmlFor={`ea-tipo-${p.id}`}>Tipo de problema</label>
                      <select
                        id={`ea-tipo-${p.id}`}
                        className="input"
                        value={p.codigo}
                        // Cada tipo tiene sus propias opciones: al cambiarlo, lo marcado del anterior no aplica.
                        onChange={(e) => cambiarProblema(p.id, { codigo: e.target.value, items: [] })}
                      >
                        {!cat ? <option value={p.codigo}>{p.codigo}</option> : null}
                        {catalogoProblema.map((c) => (
                          <option key={c.codigo} value={c.codigo}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    {opciones.length > 0 ? (
                      <div>
                        <div className="text-[11px] tracking-[.09em] uppercase opacity-62 mb-1.5">
                          {cat?.grupoLabel ?? "Detalle"}
                        </div>
                        <ListaMarcable
                          opciones={opciones}
                          marcados={p.items}
                          onCambiar={(fn) => cambiarProblema(p.id, { items: fn(p.items) })}
                        />
                      </div>
                    ) : null}
                    <div className="field">
                      <label htmlFor={`ea-desc-${p.id}`}>
                        {opciones.length > 0 ? "Nota (opcional)" : "Qué se encontró"}
                      </label>
                      <textarea
                        id={`ea-desc-${p.id}`}
                        className="input"
                        rows={2}
                        value={p.desc}
                        onChange={(e) => cambiarProblema(p.id, { desc: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {problemas.length === 0 ? (
              <div className="text-[13px] opacity-66">Esta acta no tiene problemas registrados.</div>
            ) : null}
            {catalogoProblema.length > 0 ? (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    const id = nuevoId();
                    setProblemas((prev) => [
                      ...prev,
                      { id, codigo: catalogoProblema[0].codigo, items: [], desc: "", sol: "", estado: "ABIERTO" },
                    ]);
                  }}
                  className="btn btn-secondary min-h-10 px-4"
                >
                  + Agregar un problema
                </button>
              </div>
            ) : null}
            <p className="m-0 text-xs opacity-66">
              El estado de cada problema (abierto, pendiente, resuelto) se cambia en Problemas, no acá. Un problema que
              coordinación ya gestionó se puede corregir, pero no quitar.
            </p>
          </div>
        </Tarjeta>

        {/* ── 4 · Comentario interno ── */}
        <Tarjeta n={4} titulo="Comentario interno · no lo ve el cliente">
          <div className="flex flex-col gap-3.5">
            {catalogoInterno.length > 0 || internos.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {[
                  ...catalogoInterno.map((x) => ({ codigo: x.codigo, nombre: x.nombre })),
                  ...(visita.internos ?? []).filter((x) => !catalogoInterno.some((c) => c.codigo === x.codigo)),
                ].map((x) => (
                  <label key={x.codigo} className="flex items-center gap-2.5 text-[14px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={internos.includes(x.codigo)}
                      onChange={(e) =>
                        setInternos((prev) =>
                          e.target.checked ? [...prev, x.codigo] : prev.filter((c) => c !== x.codigo)
                        )
                      }
                    />
                    {x.nombre}
                  </label>
                ))}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="ea-interno">Descripción</label>
              <textarea
                id="ea-interno"
                className="input"
                rows={3}
                value={interno}
                onChange={(e) => setInterno(e.target.value)}
              />
            </div>
            <Fotos
              titulo="Fotos internas"
              fotos={fotos.filter((f) => f.interno)}
              onQuitar={(id) => setFotos((prev) => prev.filter((f) => f.id !== id))}
              onAgregar={(e) => agregarFotos(e, true)}
            />
            <Videos
              titulo="Videos internos"
              videos={videos.filter((v) => v.interno)}
              nuevos={videosNuevos}
              onQuitar={(id) => setVideos((prev) => prev.filter((v) => v.id !== id))}
              onAgregar={(e) => void agregarVideo(e, true)}
              subida={subida?.interno ? subida : null}
              ocupado={!!subida}
            />
          </div>
        </Tarjeta>

        {/* ── 5 · Fotos y video del trabajo ── */}
        <Tarjeta n={5} titulo="Fotos y video del trabajo">
          <div className="flex flex-col gap-4">
            <Fotos
              titulo="Fotos del trabajo"
              fotos={fotos.filter((f) => !f.interno)}
              onQuitar={(id) => setFotos((prev) => prev.filter((f) => f.id !== id))}
              onAgregar={(e) => agregarFotos(e, false)}
            />
            <Videos
              titulo="Videos del trabajo"
              videos={videos.filter((v) => !v.interno)}
              nuevos={videosNuevos}
              onQuitar={(id) => setVideos((prev) => prev.filter((v) => v.id !== id))}
              onAgregar={(e) => void agregarVideo(e, false)}
              subida={subida && !subida.interno ? subida : null}
              ocupado={!!subida}
            />
            <p className="m-0 text-xs opacity-66">
              Lo que quites no se borra de la base: queda guardado e inactivo, y su número queda en el registro de la
              edición. Un video que pase de 1 minuto o de 720p se recorta y se reescala solo al agregarlo.
            </p>
          </div>
        </Tarjeta>

        {/* ── 6 · Firma ── */}
        <Tarjeta n={6} titulo="Firma de la tienda · no se modifica">
          {firma ? (
            <div className="flex gap-5 items-end flex-wrap">
              <div className="flex-[0_1_300px] min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={firma.imagen} alt={`Firma de ${firma.nombre}`} className="h-[78px] w-full object-contain object-left-bottom" />
                <div className="h-px bg-[var(--color-text)] mt-1.5" />
                <div className="text-sm mt-1.5">{firma.nombre}</div>
                <div className="text-[10px] tracking-[.09em] uppercase opacity-62">
                  Responsable de tienda · {firma.rut || "—"}
                </div>
              </div>
              <p className="m-0 flex-1 min-w-[220px] text-[13px] opacity-70">
                La firma es la que dejó la tienda al cerrar el acta y se conserva tal cual, con su hora. Si corriges el
                nombre o el RUT del responsable y eran los mismos que van bajo la firma, ese texto se corrige también.
              </p>
            </div>
          ) : (
            <div className="text-[13px] opacity-66">Esta acta se cerró sin firma.</div>
          )}
        </Tarjeta>

        {/* ── Guardar ── */}
        <div className="mt-8 border-2 border-[var(--color-text)] bg-[var(--color-surface-3)] px-5 py-5">
          <div className="field">
            <label htmlFor="ea-motivo">¿Por qué se edita el acta? (obligatorio · queda en el registro)</label>
            <textarea
              id="ea-motivo"
              className="input"
              rows={3}
              value={motivoEdicion}
              onChange={(e) => setMotivoEdicion(e.target.value)}
              placeholder="Ej: el técnico anotó mal el RUT del encargado; faltaba registrar el cambio de la antena 2"
            />
          </div>
          {error ? (
            <div
              role="alert"
              className="mt-3.5 px-3.5 py-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)] text-[13px] text-[var(--color-accent-800)]"
            >
              {error}
            </div>
          ) : null}
          <div className="flex items-center gap-3 flex-wrap mt-4">
            <button type="button" onClick={() => void guardar()} disabled={guardando} className="btn btn-primary min-h-11 px-5">
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
            <Link href={hrefActa} className="btn btn-secondary min-h-11 px-4">
              Cancelar
            </Link>
            <span className="text-[13px] opacity-66">Si no cambiaste nada, no se guarda ni se registra nada.</span>
          </div>
        </div>
      </div>

      <Toast texto={toast} variante="panel" />
    </div>
  );
}

// ─────────────────────────────── piezas locales ───────────────────────────────

function Tarjeta({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 border border-[var(--color-divider)] bg-[var(--color-surface-3)]">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b-2 border-[var(--color-divider)]">
        <span className="w-6.5 h-6.5 flex-none grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs tabular-nums">
          {n}
        </span>
        <div className="font-extrabold text-[13px] tracking-[.06em] uppercase">{titulo}</div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

/** Opciones del checklist que se marcan y, las que llevan cantidad, se cuentan. */
function ListaMarcable({
  opciones,
  marcados,
  onCambiar,
}: {
  opciones: { etiqueta: string; conCantidad: boolean }[];
  marcados: SubSeleccion[];
  onCambiar: (fn: (prev: SubSeleccion[]) => SubSeleccion[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {opciones.map((o) => {
        const marcado = marcados.find((x) => x.etiqueta === o.etiqueta);
        return (
          <div key={o.etiqueta} className="flex items-center gap-3 min-h-9">
            <label className="flex items-center gap-2.5 text-[14px] cursor-pointer flex-1 min-w-0">
              <input
                type="checkbox"
                checked={!!marcado}
                onChange={(e) =>
                  onCambiar((prev) =>
                    e.target.checked
                      ? [...prev, { etiqueta: o.etiqueta, cantidad: 1 }]
                      : prev.filter((x) => x.etiqueta !== o.etiqueta)
                  )
                }
              />
              <span className={marcado ? "font-extrabold" : ""}>{o.etiqueta}</span>
            </label>
            {marcado && o.conCantidad ? (
              <input
                type="number"
                min={1}
                max={99}
                value={marcado.cantidad}
                aria-label={`Cantidad de ${o.etiqueta}`}
                onChange={(e) => {
                  const n = Math.min(99, Math.max(1, Math.round(Number(e.target.value)) || 1));
                  onCambiar((prev) => prev.map((x) => (x.etiqueta === o.etiqueta ? { ...x, cantidad: n } : x)));
                }}
                className="input w-[76px] min-h-9 py-1 tabular-nums flex-none"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Fotos({
  titulo,
  fotos,
  onQuitar,
  onAgregar,
}: {
  titulo: string;
  fotos: FotoForm[];
  onQuitar: (id: number) => void;
  onAgregar: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <div className="text-[11px] tracking-[.09em] uppercase opacity-62 mb-2">
        {titulo} ({fotos.length})
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
        {fotos.map((f) => (
          <div key={f.id} className="relative aspect-square border border-black/[.35] overflow-hidden bg-[var(--color-surface)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.src} alt="" className="w-full h-full object-cover" loading="lazy" />
            {!f.dbId ? (
              <span className="absolute left-0 bottom-0 px-1.5 py-0.5 bg-[var(--color-accent)] text-[var(--color-bg)] text-[10px] font-extrabold uppercase tracking-[.06em]">
                Nueva
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onQuitar(f.id)}
              aria-label="Quitar foto"
              title="Quitar del acta"
              className="absolute top-0 right-0 w-8 h-8 grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] border-0 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}
        <label className="relative aspect-square flex flex-col items-center justify-center gap-1.5 border border-dashed border-black/[.5] cursor-pointer text-center hover:bg-black/[.05]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="font-extrabold text-[10px] tracking-[.08em] uppercase">Agregar fotos</span>
          <input type="file" accept="image/*" multiple onChange={onAgregar} className="absolute w-px h-px opacity-0 pointer-events-none" />
        </label>
      </div>
    </div>
  );
}

function Videos({
  titulo,
  videos,
  nuevos,
  onQuitar,
  onAgregar,
  subida,
  ocupado,
}: {
  titulo: string;
  videos: NonNullable<Visita["videos"]>;
  /** Ids de los clips agregados en esta edición. */
  nuevos: Set<number>;
  onQuitar: (id: number) => void;
  onAgregar: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** El avance, si lo que se está subiendo es de esta lista. */
  subida: { paso: string; pct: number } | null;
  /** Hay un video subiendo (acá o en la otra lista): se sube de a uno. */
  ocupado: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] tracking-[.09em] uppercase opacity-62 mb-2">
        {titulo} ({videos.length})
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {videos.map((v) => (
          <figure key={v.id} className="m-0 border border-black/[.35] bg-[var(--color-surface)]">
            <video src={v.archivoUrl} controls preload="metadata" playsInline className="w-full aspect-video bg-black object-contain" />
            <figcaption className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] tabular-nums">
              {nuevos.has(v.id) ? (
                <span className="px-1.5 py-0.5 bg-[var(--color-accent)] text-[var(--color-bg)] text-[10px] font-extrabold uppercase tracking-[.06em]">
                  Nuevo
                </span>
              ) : null}
              <span className="opacity-70">{v.duracionSeg ? reloj(v.duracionSeg) : "—"}</span>
              <button type="button" onClick={() => onQuitar(v.id)} className="btn btn-ghost min-h-7 text-[12px] ml-auto">
                Quitar del acta
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
      {subida ? (
        <div className="mt-2.5 max-w-[420px]">
          <div className="h-1 bg-[var(--color-divider)] overflow-hidden">
            <div className="h-full bg-[var(--color-accent)] transition-[width] duration-300" style={{ width: `${subida.pct}%` }} />
          </div>
          <div className="mt-1 text-xs opacity-66 tabular-nums">
            {subida.paso} {subida.pct}%
          </div>
        </div>
      ) : (
        <label
          className={`btn btn-secondary min-h-10 px-4 mt-2.5 relative ${ocupado ? "opacity-45 cursor-not-allowed" : ""}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7h11v10H3z" />
            <path d="M14 11l7-4v10l-7-4z" />
          </svg>
          <span>Agregar un video</span>
          <input
            type="file"
            accept="video/*"
            disabled={ocupado}
            onChange={onAgregar}
            className="absolute w-px h-px opacity-0 pointer-events-none"
          />
        </label>
      )}
    </div>
  );
}
