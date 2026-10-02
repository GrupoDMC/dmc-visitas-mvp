"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Tag from "@/components/Tag";
import AdminHeader from "@/components/admin/AdminHeader";
import SelectBuscable from "@/components/ui/SelectBuscable";
import { Toast, useToast } from "@/components/ui/Toast";
import { editarActaAdminAction } from "@/app/actions/ediciones";
import EstadoProblemaTag from "@/components/EstadoProblemaTag";
import { fechaHoraCorta, formularioDesdeActa } from "@/lib/ui/edicion";
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
    responsable: JSON.stringify([respNombre.trim(), respRut, respTel]),
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

  return (
    <div className="pb-16 animate-fade-in">
      <AdminHeader kicker={`Visitas · ${visita.folio}`} title="Editar acta">
        <span className="text-[13px] opacity-66 tabular-nums max-sm:hidden">
          {hayCambios
            ? `${conCambios.length} ${conCambios.length === 1 ? "sección con cambios" : "secciones con cambios"}`
            : "Sin cambios todavía"}
        </span>
        <Link href={hrefActa} className="btn btn-secondary min-h-10 px-3.5">
          Cancelar
        </Link>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando || !hayCambios}
          className="btn btn-primary min-h-10 px-4"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M4 12l5 5L20 6" />
          </svg>
          <span>{guardando ? "Guardando…" : "Guardar cambios"}</span>
        </button>
      </AdminHeader>

      <div className="px-4 md:px-7 pt-6 grid grid-cols-1 xl:grid-cols-[minmax(0,860px)_264px] gap-x-8 items-start">
        <div className="min-w-0 flex flex-col gap-6">
          {/* De qué acta se trata, y las reglas del juego en una línea. */}
          <div className="border border-[var(--color-divider-soft)] bg-[var(--color-surface-3)]">
            <div className="grid grid-cols-2 sm:grid-cols-4">
              {[
                { k: "Cliente", v: visita.cliente?.nombreFantasia ?? "—" },
                { k: "Sucursal", v: visita.sucursal?.nombre ?? "—" },
                { k: "Técnico", v: visita.tecnico?.nombreCompleto ?? "—" },
                { k: "Acta cerrada", v: ejec?.horaTermino ? fechaHoraCorta(ejec.horaTermino) : "—" },
              ].map((d) => (
                <div key={d.k} className="px-4 py-3 min-w-0 border-r border-b border-[var(--color-divider-faint)]">
                  <div className="text-[10px] tracking-[.11em] uppercase opacity-62">{d.k}</div>
                  <div className="text-[14px] font-extrabold leading-[1.3] mt-1 truncate" title={d.v}>
                    {d.v}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 items-start px-4 py-3 text-[13px] leading-[1.5]">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none mt-0.5 opacity-70">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 7.5v.5" />
              </svg>
              <span className="opacity-80">
                Nada cambia hasta que aprietes «Guardar cambios». Ahí queda registrado qué cambiaste, cuándo y por
                qué. El PDF sale con los datos corregidos, sin ninguna marca, y la firma de la tienda no se toca.
              </span>
            </div>
          </div>

          {/* ── 1 · Responsable ── */}
          <Seccion
            id="responsable"
            n={1}
            titulo="Responsable de tienda"
            ayuda="Quien recibió al técnico y firmó el acta."
            cambio={cambio("responsable")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <div className="field min-w-0 sm:col-span-2">
                <label htmlFor="ea-nombre">Nombre</label>
                <input
                  id="ea-nombre"
                  className="input"
                  value={respNombre}
                  onChange={(e) => setRespNombre(e.target.value)}
                  placeholder="Nombre y apellido"
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
                  aria-invalid={!!errorRut}
                  style={errorRut ? { borderColor: "var(--color-accent)" } : undefined}
                />
                {errorRut ? <div className="mt-1.5 text-xs text-[var(--color-accent-800)]">{errorRut}</div> : null}
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
          </Seccion>

          {/* ── 2 · Motivos y trabajo realizado ── */}
          <Seccion
            id="trabajo"
            n={2}
            titulo="Motivo y trabajo realizado"
            ayuda="Cada motivo con lo que se hizo en él. Lo marcado es lo que sale en el acta."
            cambio={cambio("trabajo")}
          >
            <div className="flex flex-col gap-5">
              {motivosMarcados.map((codigo) => {
                const suyos = trabajos.filter((t) => motivoDe(t) === codigo);
                const porAgregar = catalogoTrabajo.filter(
                  (t) => trabajoVaConMotivo(t, codigo) && !suyos.some((x) => x.codigo === t.codigo)
                );
                return (
                  <div key={codigo} className="border border-[var(--color-divider-soft)] border-l-4 border-l-[var(--color-accent)] bg-white">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-divider-faint)]">
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] tracking-[.12em] uppercase text-[var(--color-accent-active)]">Motivo</div>
                        <div className="font-extrabold text-[16px] leading-[1.25] mt-0.5">{nombreMotivo(codigo)}</div>
                      </div>
                      {agendados.includes(codigo) ? (
                        <span className="tag tag-neutral flex-none" title="Lo agendó coordinación: se cambia en «Corregir visita»">
                          Agendado
                        </span>
                      ) : (
                        <BotonQuitar
                          etiqueta={`Quitar el motivo ${nombreMotivo(codigo)}${suyos.length ? " y sus trabajos" : ""}`}
                          onClick={() => quitarMotivo(codigo)}
                        />
                      )}
                    </div>

                    <div className="px-4 py-4 flex flex-col gap-3">
                      {suyos.map((t) => {
                        const cat = catalogoTrabajo.find((c) => c.codigo === t.codigo);
                        // Lo del checklist de hoy más lo que el acta ya traía y
                        // el checklist dejó de ofrecer: eso tampoco se pierde.
                        const opciones = [
                          ...(cat?.subtrabajos ?? []).map((x) => ({ etiqueta: x.etiqueta, conCantidad: x.permiteCantidad })),
                          ...t.subs
                            .filter((x) => !(cat?.subtrabajos ?? []).some((c) => c.etiqueta === x.etiqueta))
                            .map((x) => ({ etiqueta: x.etiqueta, conCantidad: x.cantidad > 1 })),
                        ];
                        return (
                          <div key={t.id} className="border border-[var(--color-divider-faint)] bg-[var(--color-surface-3)]">
                            <div className="flex items-center gap-3 pl-4 pr-2 py-2">
                              <div className="font-extrabold text-[15px] leading-[1.3] flex-1 min-w-0">{nombreTrabajo(t.codigo)}</div>
                              {t.subs.length > 0 ? (
                                <span className="text-[11px] opacity-62 tabular-nums flex-none">
                                  {t.subs.length} {t.subs.length === 1 ? "marcado" : "marcados"}
                                </span>
                              ) : null}
                              <BotonQuitar
                                etiqueta={`Quitar el trabajo ${nombreTrabajo(t.codigo)}`}
                                onClick={() => setTrabajos((prev) => prev.filter((x) => x.id !== t.id))}
                              />
                            </div>
                            {opciones.length > 0 ? (
                              <div className="px-4 pb-4">
                                <div className="text-[10px] tracking-[.11em] uppercase opacity-62 mb-2">
                                  {cat?.grupoLabel ?? "Subtrabajos"}
                                </div>
                                <ListaMarcable opciones={opciones} marcados={t.subs} onCambiar={(fn) => cambiarSubs(t.id, fn)} />
                              </div>
                            ) : null}
                            {t.detalle ? <div className="px-4 pb-3.5 text-[13px] opacity-70">{t.detalle}</div> : null}
                          </div>
                        );
                      })}
                      {suyos.length === 0 ? (
                        <div className="px-3.5 py-3 border border-dashed border-[var(--color-divider)] text-[13px] opacity-70">
                          Este motivo todavía no tiene trabajos. Agrega al menos uno o quita el motivo.
                        </div>
                      ) : null}
                      {porAgregar.length > 0 ? (
                        <div className="max-w-[440px]">
                          <SelectBuscable
                            id={`ea-agregar-${codigo}`}
                            valor=""
                            opciones={porAgregar.map((c) => ({ v: c.codigo, t: c.nombre }))}
                            onChange={(elegido) => {
                              if (!elegido) return;
                              const id = nuevoId();
                              setTrabajos((prev) => [...prev, { id, codigo: elegido, motivo: codigo, subs: [], detalle: "" }]);
                            }}
                            placeholder="+ Agregar un trabajo a este motivo…"
                            ariaLabel={`Agregar un trabajo a ${nombreMotivo(codigo)}`}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {motivos.some((m) => !motivosCodigos.includes(m.codigo)) ? (
                <div>
                  <div className="text-[11px] tracking-[.09em] uppercase opacity-62 mb-2">
                    ¿La visita fue también por otro motivo?
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {motivos
                      .filter((m) => !motivosCodigos.includes(m.codigo))
                      .map((m) => (
                        <button
                          key={m.codigo}
                          type="button"
                          onClick={() => setMotivosCodigos((prev) => [...prev, m.codigo])}
                          className="inline-flex items-center gap-1.5 min-h-9 px-3 bg-transparent border border-dashed border-[var(--color-divider)] text-[13px] text-[var(--color-text)] cursor-pointer hover:bg-black/[.06] hover:border-solid"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                          {m.nombre}
                        </button>
                      ))}
                  </div>
                </div>
              ) : null}

              <div className="field pt-1">
                <label htmlFor="ea-obs">Detalle del trabajo · lo ve el cliente</label>
                <textarea
                  id="ea-obs"
                  className="input leading-[1.5]"
                  rows={3}
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Sin detalle escrito"
                />
              </div>
            </div>
          </Seccion>

          {/* ── 3 · Problemas ── */}
          <Seccion
            id="problemas"
            n={3}
            titulo="Problemas detectados"
            ayuda="El estado de cada problema se cambia en Problemas. Uno que coordinación ya gestionó se puede corregir, pero no quitar."
            cuenta={problemas.length}
            cambio={cambio("problemas")}
          >
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
                  <div key={p.id} className="border border-[var(--color-divider-soft)] bg-white">
                    <div className="flex items-center gap-2.5 pl-4 pr-2 py-2 border-b border-[var(--color-divider-faint)]">
                      <span className="w-6 h-6 flex-none grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-[11px] tabular-nums">
                        {i + 1}
                      </span>
                      <div className="font-extrabold text-[15px] leading-[1.3] flex-1 min-w-0 truncate">
                        {nombreProblema(p.codigo)}
                      </div>
                      {p.dbId ? (
                        <EstadoProblemaTag estado={p.estado} />
                      ) : (
                        <Tag variant="accent">Nuevo</Tag>
                      )}
                      <BotonQuitar
                        etiqueta={`Quitar el problema ${i + 1}`}
                        onClick={() => setProblemas((prev) => prev.filter((x) => x.id !== p.id))}
                      />
                    </div>
                    <div className="px-4 py-4 flex flex-col gap-4">
                      <div className="field max-w-[440px]">
                        <label htmlFor={`ea-tipo-${p.id}`}>Tipo de problema</label>
                        <SelectBuscable
                          id={`ea-tipo-${p.id}`}
                          valor={p.codigo}
                          opciones={[
                            ...(cat ? [] : [{ v: p.codigo, t: p.codigo }]),
                            ...catalogoProblema.map((c) => ({ v: c.codigo, t: c.nombre })),
                          ]}
                          // Cada tipo tiene sus propias opciones: al cambiarlo, lo marcado del anterior no aplica.
                          onChange={(v) => {
                            if (v && v !== p.codigo) cambiarProblema(p.id, { codigo: v, items: [] });
                          }}
                          ariaLabel="Tipo de problema"
                        />
                      </div>
                      {opciones.length > 0 ? (
                        <div>
                          <div className="text-[10px] tracking-[.11em] uppercase opacity-62 mb-2">
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
                        <label htmlFor={`ea-desc-${p.id}`}>{opciones.length > 0 ? "Nota · opcional" : "Qué se encontró"}</label>
                        <textarea
                          id={`ea-desc-${p.id}`}
                          className="input leading-[1.5]"
                          style={{ minHeight: 68 }}
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
                <BotonAgregar
                  texto="Agregar un problema"
                  onClick={() => {
                    const id = nuevoId();
                    setProblemas((prev) => [
                      ...prev,
                      { id, codigo: catalogoProblema[0].codigo, items: [], desc: "", sol: "", estado: "ABIERTO" },
                    ]);
                  }}
                />
              ) : null}
            </div>
          </Seccion>

          {/* ── 4 · Comentario interno ── */}
          <Seccion
            id="interno"
            n={4}
            titulo="Comentario interno"
            ayuda="Solo para coordinación: nada de esto sale en el acta que recibe el cliente."
            cambio={cambio("interno")}
          >
            <div className="flex flex-col gap-5">
              {catalogoInterno.length > 0 || internos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    ...catalogoInterno.map((x) => ({ codigo: x.codigo, nombre: x.nombre })),
                    ...(visita.internos ?? []).filter((x) => !catalogoInterno.some((c) => c.codigo === x.codigo)),
                  ].map((x) => {
                    const activo = internos.includes(x.codigo);
                    return (
                      <Marca
                        key={x.codigo}
                        activo={activo}
                        texto={x.nombre}
                        onClick={() =>
                          setInternos((prev) => (activo ? prev.filter((c) => c !== x.codigo) : [...prev, x.codigo]))
                        }
                      />
                    );
                  })}
                </div>
              ) : null}
              <div className="field">
                <label htmlFor="ea-interno">Descripción</label>
                <textarea
                  id="ea-interno"
                  className="input leading-[1.5]"
                  rows={3}
                  value={interno}
                  onChange={(e) => setInterno(e.target.value)}
                  placeholder="Sin comentario interno"
                />
              </div>
              <Fotos
                titulo="Fotos internas"
                fotos={fotos.filter((f) => f.interno)}
                onQuitar={quitarFoto}
                onAgregar={(e) => agregarFotos(e, true)}
              />
              <Videos
                titulo="Videos internos"
                videos={videos.filter((v) => v.interno)}
                nuevos={videosNuevos}
                onQuitar={quitarVideo}
                onAgregar={(e) => void agregarVideo(e, true)}
                subida={subida?.interno ? subida : null}
                ocupado={!!subida}
              />
            </div>
          </Seccion>

          {/* ── 5 · Fotos y video del trabajo ── */}
          <Seccion
            id="media"
            n={5}
            titulo="Fotos y video del trabajo"
            ayuda="Lo que quites no se borra: queda guardado e inactivo, y su número va al registro. Un video de más de 1 minuto o 720p se ajusta solo al agregarlo."
            cambio={cambio("media")}
          >
            <div className="flex flex-col gap-5">
              <Fotos
                titulo="Fotos del trabajo"
                fotos={fotos.filter((f) => !f.interno)}
                onQuitar={quitarFoto}
                onAgregar={(e) => agregarFotos(e, false)}
              />
              <Videos
                titulo="Videos del trabajo"
                videos={videos.filter((v) => !v.interno)}
                nuevos={videosNuevos}
                onQuitar={quitarVideo}
                onAgregar={(e) => void agregarVideo(e, false)}
                subida={subida && !subida.interno ? subida : null}
                ocupado={!!subida}
              />
            </div>
          </Seccion>

          {/* ── 6 · Firma ── */}
          <Seccion id="firma" n={6} titulo="Firma de la tienda" ayuda="Se conserva tal cual: no se edita." candado>
            {firma ? (
              <div className="flex gap-6 items-center flex-wrap">
                <div className="flex-[0_1_300px] min-w-0 bg-white border border-[var(--color-divider-faint)] px-4 pt-3 pb-3.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={firma.imagen} alt={`Firma de ${firma.nombre}`} className="h-[78px] w-full object-contain object-left-bottom" />
                  <div className="h-px bg-[var(--color-text)] mt-1.5" />
                  <div className="text-sm font-extrabold mt-1.5">{firma.nombre}</div>
                  <div className="text-[10px] tracking-[.09em] uppercase opacity-62">
                    Responsable de tienda · {firma.rut || "—"}
                  </div>
                </div>
                <p className="m-0 flex-1 min-w-[220px] text-[13px] leading-[1.55] opacity-70">
                  Es la firma que dejó la tienda al cerrar el acta, con su hora. Si corriges el nombre o el RUT del
                  responsable y eran los mismos que van bajo la firma, ese texto se corrige también; la firma no.
                </p>
              </div>
            ) : (
              <div className="text-[13px] opacity-66">Esta acta se cerró sin firma.</div>
            )}
          </Seccion>

          {/* ── Guardar ── */}
          <section id="ea-sec-guardar" className="scroll-mt-[120px] border-2 border-[var(--color-text)] bg-white">
            <div className="px-5 pt-5 pb-1">
              <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">Para terminar</div>
              <div className="font-extrabold text-[20px] leading-[1.2] tracking-[-.02em] mt-1.5">¿Por qué se edita el acta?</div>
              <p className="m-0 mt-1 text-[13px] opacity-66">
                Es obligatorio y queda en el registro de la visita junto con lo que cambiaste.
              </p>
            </div>
            <div className="px-5 py-4">
              <textarea
                id="ea-motivo"
                className="input leading-[1.5]"
                rows={3}
                value={motivoEdicion}
                onChange={(e) => setMotivoEdicion(e.target.value)}
                aria-label="Por qué se edita el acta"
                placeholder="Ej: el técnico anotó mal el RUT del encargado; faltaba registrar el cambio de la antena 2"
              />

              <div className="mt-4 text-[10px] tracking-[.11em] uppercase opacity-62 mb-2">Lo que cambiaste</div>
              {hayCambios ? (
                <div className="flex flex-wrap gap-1.5">
                  {conCambios.map((x) => (
                    <button
                      key={x.clave}
                      type="button"
                      onClick={() => irA(x.clave)}
                      className="tag tag-dark font-extrabold border-0 cursor-pointer"
                      title="Ir a la sección"
                    >
                      {x.titulo}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-[13px] opacity-66">Todavía nada: el acta está como quedó guardada.</div>
              )}

              {error ? (
                <div
                  role="alert"
                  className="mt-4 px-3.5 py-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)] text-[13px] leading-[1.45] text-[var(--color-accent-800)]"
                >
                  {error}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-3 flex-wrap px-5 py-4 border-t border-[var(--color-divider-faint)] bg-[var(--color-surface-3)]">
              <button
                type="button"
                onClick={() => void guardar()}
                disabled={guardando || !hayCambios}
                className="btn btn-primary min-h-11 px-5"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                  <path d="M4 12l5 5L20 6" />
                </svg>
                <span>{guardando ? "Guardando…" : "Guardar cambios"}</span>
              </button>
              <Link href={hrefActa} className="btn btn-secondary min-h-11 px-4">
                Salir sin guardar
              </Link>
            </div>
          </section>
        </div>

        {/* Índice: dónde estoy y qué llevo cambiado. Solo en pantallas anchas. */}
        <aside className="hidden xl:block sticky top-[112px]">
          <div className="border border-[var(--color-divider-soft)] bg-[var(--color-surface-3)]">
            <div className="px-4 py-3 border-b border-[var(--color-divider-faint)] text-[10px] tracking-[.14em] uppercase opacity-66">
              Secciones del acta
            </div>
            {[...SECCIONES, { clave: "firma", titulo: "Firma de la tienda" } as const].map((x, i) => {
              const tocada = x.clave !== "firma" && cambio(x.clave);
              return (
                <button
                  key={x.clave}
                  type="button"
                  onClick={() => irA(x.clave)}
                  className="w-full flex items-center gap-2.5 px-4 min-h-10 bg-transparent border-0 border-b border-[var(--color-divider-faint)] text-left text-[13px] text-[var(--color-text)] cursor-pointer hover:bg-black/[.05]"
                >
                  <span className="w-4 text-[11px] tabular-nums opacity-55 flex-none">{i + 1}</span>
                  <span className={`flex-1 min-w-0 truncate ${tocada ? "font-extrabold" : ""}`}>{x.titulo}</span>
                  {tocada ? (
                    <span className="w-2 h-2 flex-none bg-[var(--color-accent)]" title="Con cambios" />
                  ) : x.clave === "firma" ? (
                    <Candado />
                  ) : null}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => irA("guardar")}
              className="w-full flex items-center gap-2.5 px-4 min-h-11 bg-transparent border-0 text-left text-[13px] font-extrabold text-[var(--color-accent-active)] cursor-pointer hover:bg-black/[.05]"
            >
              <span className="flex-1">Motivo y guardar</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 5v14M6 13l6 6 6-6" />
              </svg>
            </button>
          </div>
          <p className="m-0 mt-3 text-xs leading-[1.5] opacity-62">
            El punto rojo marca las secciones que llevan cambios sin guardar.
          </p>
        </aside>
      </div>

      <Toast texto={toast} variante="panel" />
    </div>
  );
}

// ─────────────────────────────── piezas locales ───────────────────────────────

function Candado() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="flex-none opacity-55">
      <rect x="5" y="11" width="14" height="10" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

function Seccion({
  id,
  n,
  titulo,
  ayuda,
  cuenta,
  cambio = false,
  candado = false,
  children,
}: {
  id: string;
  n: number;
  titulo: string;
  ayuda?: string;
  /** Cuántos elementos tiene la sección, junto al título. */
  cuenta?: number;
  /** La sección lleva cambios sin guardar. */
  cambio?: boolean;
  /** La sección solo se mira. */
  candado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`ea-sec-${id}`}
      className="scroll-mt-[120px] border border-[var(--color-divider-soft)] bg-[var(--color-surface-3)]"
    >
      <div className="flex items-start gap-3.5 px-5 py-4 border-b border-[var(--color-divider-soft)]">
        <span
          className="w-7 h-7 flex-none grid place-items-center font-extrabold text-xs tabular-nums mt-0.5"
          style={{
            background: cambio ? "var(--color-accent)" : "var(--color-text)",
            color: "var(--color-bg)",
          }}
        >
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-[17px] leading-[1.25] tracking-[-.01em]">
            {titulo}
            {cuenta !== undefined ? <span className="font-normal opacity-55 tabular-nums"> · {cuenta}</span> : null}
          </div>
          {ayuda ? <div className="text-[13px] leading-[1.45] opacity-66 mt-0.5">{ayuda}</div> : null}
        </div>
        {cambio ? (
          <span className="tag tag-accent flex-none mt-0.5">Con cambios</span>
        ) : candado ? (
          <span className="tag tag-neutral flex-none mt-0.5 gap-1.5">
            <Candado />
            No se modifica
          </span>
        ) : null}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

/** Quitar algo de la lista: un ícono discreto que se enciende al pasar el mouse. */
function BotonQuitar({ etiqueta, onClick }: { etiqueta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className="w-9 h-9 flex-none grid place-items-center bg-transparent border-0 cursor-pointer text-[var(--color-text)] opacity-55 hover:opacity-100 hover:bg-[var(--color-accent-100)] hover:text-[var(--color-accent-active)]"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}

function BotonAgregar({ texto, onClick }: { texto: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-12 flex items-center justify-center gap-2 bg-transparent border border-dashed border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer hover:bg-black/[.05] hover:border-solid"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M12 5v14M5 12h14" />
      </svg>
      {texto}
    </button>
  );
}

/** Una casilla del checklist: toda la fila se aprieta, y marcada queda destacada. */
function Marca({
  activo,
  texto,
  onClick,
  children,
}: {
  activo: boolean;
  texto: string;
  onClick: () => void;
  /** Lo que va a la derecha cuando está marcada: el contador de cantidad. */
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-stretch min-h-11"
      style={{
        background: activo ? "var(--color-accent-100)" : "#fff",
        border: `1px solid ${activo ? "var(--color-accent)" : "var(--color-divider-faint)"}`,
      }}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={activo}
        onClick={onClick}
        className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2 bg-transparent border-0 cursor-pointer text-left text-[14px] leading-[1.3] text-[var(--color-text)]"
        style={{ fontWeight: activo ? 800 : 400 }}
      >
        <span
          className="w-[18px] h-[18px] flex-none grid place-items-center border-2"
          style={{
            borderColor: activo ? "var(--color-accent)" : "var(--color-neutral-500)",
            background: activo ? "var(--color-accent)" : "transparent",
          }}
        >
          {activo ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6">
              <path d="M4 12l5 5L20 6" />
            </svg>
          ) : null}
        </span>
        <span className="min-w-0">{texto}</span>
      </button>
      {children}
    </div>
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
  const sumar = (etiqueta: string, delta: number) =>
    onCambiar((prev) =>
      prev.map((x) => (x.etiqueta === etiqueta ? { ...x, cantidad: Math.min(99, Math.max(1, x.cantidad + delta)) } : x))
    );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {opciones.map((o) => {
        const marcado = marcados.find((x) => x.etiqueta === o.etiqueta);
        return (
          <Marca
            key={o.etiqueta}
            activo={!!marcado}
            texto={o.etiqueta}
            onClick={() =>
              onCambiar((prev) =>
                marcado ? prev.filter((x) => x.etiqueta !== o.etiqueta) : [...prev, { etiqueta: o.etiqueta, cantidad: 1 }]
              )
            }
          >
            {marcado && o.conCantidad ? (
              <div className="flex-none flex items-center border-l border-[var(--color-accent-300)]">
                <button
                  type="button"
                  onClick={() => sumar(o.etiqueta, -1)}
                  disabled={marcado.cantidad <= 1}
                  aria-label={`Uno menos de ${o.etiqueta}`}
                  className="w-8 self-stretch bg-transparent border-0 cursor-pointer font-extrabold text-[17px] leading-none text-[var(--color-text)] hover:bg-[var(--color-accent-200)] disabled:opacity-30 disabled:cursor-default"
                >
                  −
                </button>
                <span className="min-w-[26px] text-center font-extrabold text-[14px] tabular-nums" aria-live="polite">
                  {marcado.cantidad}
                </span>
                <button
                  type="button"
                  onClick={() => sumar(o.etiqueta, 1)}
                  disabled={marcado.cantidad >= 99}
                  aria-label={`Uno más de ${o.etiqueta}`}
                  className="w-8 self-stretch bg-transparent border-0 cursor-pointer font-extrabold text-[17px] leading-none text-[var(--color-text)] hover:bg-[var(--color-accent-200)] disabled:opacity-30 disabled:cursor-default"
                >
                  +
                </button>
              </div>
            ) : null}
          </Marca>
        );
      })}
    </div>
  );
}

function Subtitulo({ texto, cuenta }: { texto: string; cuenta: number }) {
  return (
    <div className="flex items-baseline gap-2 mb-2.5">
      <div className="text-[11px] tracking-[.09em] uppercase opacity-62">{texto}</div>
      <div className="text-[11px] tabular-nums opacity-45">{cuenta}</div>
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
      <Subtitulo texto={titulo} cuenta={fotos.length} />
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
        {fotos.map((f) => (
          <div
            key={f.id}
            className="group relative aspect-square overflow-hidden bg-[var(--color-surface)]"
            style={{ border: `1px solid ${f.dbId ? "var(--color-divider-soft)" : "var(--color-accent)"}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.src} alt="" className="w-full h-full object-cover" loading="lazy" />
            {!f.dbId ? (
              <span className="absolute left-0 bottom-0 px-1.5 py-0.5 bg-[var(--color-accent)] text-white text-[10px] font-extrabold uppercase tracking-[.06em]">
                Nueva
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onQuitar(f.id)}
              aria-label="Quitar la foto del acta"
              title="Quitar del acta"
              className="absolute top-1.5 right-1.5 w-7 h-7 grid place-items-center bg-[rgba(32,30,29,.78)] text-white border-0 cursor-pointer opacity-80 group-hover:opacity-100 hover:bg-[var(--color-accent)] focus-visible:opacity-100"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}
        <label className="relative aspect-square flex flex-col items-center justify-center gap-1.5 border border-dashed border-[var(--color-divider)] cursor-pointer text-center hover:bg-black/[.05] hover:border-solid focus-within:outline focus-within:outline-2 focus-within:outline-[var(--color-accent)]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 8h3l2-3h8l2 3h3v12H3z" />
            <path d="M12 10.5v6M9 13.5h6" />
          </svg>
          <span className="font-extrabold text-[10px] tracking-[.08em] uppercase">Agregar fotos</span>
          <input type="file" accept="image/*" multiple onChange={onAgregar} className="absolute w-px h-px opacity-0" />
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
      <Subtitulo texto={titulo} cuenta={videos.length} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {videos.map((v) => (
          <figure
            key={v.id}
            className="m-0 bg-white"
            style={{ border: `1px solid ${nuevos.has(v.id) ? "var(--color-accent)" : "var(--color-divider-soft)"}` }}
          >
            <video src={v.archivoUrl} controls preload="metadata" playsInline className="w-full aspect-video bg-black object-contain block" />
            <figcaption className="flex items-center gap-2 pl-3 pr-1 text-[12px] tabular-nums">
              {nuevos.has(v.id) ? (
                <span className="px-1.5 py-0.5 bg-[var(--color-accent)] text-white text-[10px] font-extrabold uppercase tracking-[.06em]">
                  Nuevo
                </span>
              ) : null}
              <span className="opacity-70">
                {v.duracionSeg ? reloj(v.duracionSeg) : "—"}
                {v.ancho && v.alto ? ` · ${v.ancho}x${v.alto}` : ""}
              </span>
              <span className="ml-auto">
                <BotonQuitar etiqueta="Quitar el video del acta" onClick={() => onQuitar(v.id)} />
              </span>
            </figcaption>
          </figure>
        ))}

        {subida ? (
          <div className="aspect-video sm:aspect-auto sm:min-h-[120px] flex flex-col justify-center gap-2 px-4 border border-[var(--color-accent)] bg-[var(--color-accent-100)]">
            <div className="font-extrabold text-[13px]">{subida.paso}</div>
            <div className="h-1.5 bg-[var(--color-accent-300)] overflow-hidden">
              <div className="h-full bg-[var(--color-accent)] transition-[width] duration-300" style={{ width: `${subida.pct}%` }} />
            </div>
            <div className="text-xs opacity-70 tabular-nums">{subida.pct}% · no cierres esta página</div>
          </div>
        ) : (
          <label
            className={`relative min-h-[120px] flex flex-col items-center justify-center gap-1.5 border border-dashed border-[var(--color-divider)] text-center focus-within:outline focus-within:outline-2 focus-within:outline-[var(--color-accent)] ${
              ocupado ? "opacity-45 cursor-not-allowed" : "cursor-pointer hover:bg-black/[.05] hover:border-solid"
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 7h11v10H3z" />
              <path d="M14 11l7-4v10l-7-4z" />
            </svg>
            <span className="font-extrabold text-[10px] tracking-[.08em] uppercase">Agregar un video</span>
            <span className="text-[11px] opacity-62">Desde un archivo · hasta 1 minuto</span>
            <input type="file" accept="video/*" disabled={ocupado} onChange={onAgregar} className="absolute w-px h-px opacity-0" />
          </label>
        )}
      </div>
    </div>
  );
}
