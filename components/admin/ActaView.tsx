"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Tag from "@/components/Tag";
import Dialogo, { type Adjunto } from "@/components/admin/Dialogo";
import VisitaDialogo, { CancelarAdminDialogo, ReprogramarDialogo } from "@/components/admin/VisitaDialogos";
import VisorFotos, { useVisorFotos } from "@/components/ui/VisorFotos";
import { Toast, useToast } from "@/components/ui/Toast";
import { enviarActaAction } from "@/app/actions/admin";
import { ESTADO_PROBLEMA_LABEL, ESTADO_PROBLEMA_TAG, ESTADO_VISITA_LABEL, ESTADO_VISITA_TAG, textoMotivos, textoMotivosReales } from "@/lib/ui/estado";
import { esAdmin, nombreProblema, nombreTrabajo, useReferencias } from "@/lib/ui/referencias";
import { reloj } from "@/lib/ui/video";
import type { Visita } from "@/lib/types";

const AVISO_ESTADO: Record<string, string> = {
  PROGRAMADA: "Esta visita todavía no se ejecuta: cuando el técnico la cierre vas a ver aquí problemas, fotos y firma.",
  EN_CURSO: "El técnico está en terreno: lo que ves puede cambiar hasta que cierre el acta.",
  PENDIENTE: "La visita quedó pendiente: el técnico no pudo cerrarla en terreno.",
  REAGENDADA: "La visita se reagendó antes de cerrarse; el motivo del técnico está en el detalle.",
  CANCELADA_ADMIN:
    "Administración cerró esta visita sin que llegara a hacerse. El motivo está en el detalle y en la trazabilidad.",
};

/** "2026-08-13T08:30:00" → "08:30". */
function hhmm(iso: string | null | undefined): string {
  return iso ? iso.slice(11, 16) : "—";
}

function minutosEntre(a: string, b: string | null): number | null {
  if (!b) return null;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

export default function ActaView({
  visita,
  enviada,
}: {
  visita: Visita;
  enviada: { para: string; cc: string; adjuntos: number } | null;
}) {
  const router = useRouter();
  const ref = useReferencias();
  const { problemas: catalogoProblema, trabajos: catalogoTrabajo } = ref;
  const { toast, aviso } = useToast();
  const [resumenAbierto, setResumenAbierto] = useState(false);
  const [trazaAbierta, setTrazaAbierta] = useState(false);
  const [dialogo, setDialogo] = useState<"correo" | "editar" | "reprogramar" | "cancelarAdmin" | null>(null);
  const visor = useVisorFotos();

  const ejec = visita.ejecucion;
  const ejecutada = visita.estado !== "PROGRAMADA";
  const cerrada = visita.estado === "COMPLETADA";
  const reprogramable = ["REAGENDADA", "PENDIENTE", "CANCELADA"].includes(visita.estado);
  const sinCerrar = !cerrada && visita.estado !== "CANCELADA";
  // El cierre administrativo: solo el administrador, y solo sobre una visita
  // que está en curso o que todavía no se inicia. Una completada ya tiene acta
  // firmada y una cancelada no hay nada que cerrar.
  const cerrablePorAdmin =
    esAdmin(ref) && (visita.estado === "PROGRAMADA" || visita.estado === "EN_CURSO");
  const duracion = ejec ? minutosEntre(ejec.horaInicio, ejec.horaTermino) : null;
  const firma = visita.firmas?.[0];

  const sello = ejecutada && ejec
    ? `${visita.fechaProgramada} · ${hhmm(ejec.horaInicio)}–${hhmm(ejec.horaTermino)}`
    : `${visita.fechaProgramada} · sin ejecutar`;

  const resumen: { k: string; v: string; span?: 2 }[] = [
    { k: "Fecha programada", v: visita.fechaProgramada },
    { k: "Hora de llegada", v: visita.horaProgramada ?? "Sin hora · durante el día" },
    { k: "Cliente", v: visita.cliente?.nombreFantasia ?? "—" },
    { k: "Sucursal", v: visita.sucursal?.nombre ?? "—" },
    { k: visita.motivosCodigos.length > 1 ? "Motivos de la visita" : "Motivo de la visita", v: textoMotivos(visita) },
    { k: "Técnico", v: visita.tecnico?.nombreCompleto ?? "—" },
    {
      k: "Responsable de tienda",
      v: visita.responsableNombre
        ? `${visita.responsableNombre}${ejec?.responsableRut ? ` · ${ejec.responsableRut}` : ""}`
        : "Sin definir",
    },
    { k: "Teléfono", v: visita.responsableTelefono ?? "Sin teléfono" },
    ejecutada && ejec
      ? { k: "Hora de inicio en terreno", v: `${hhmm(ejec.horaInicio)}${duracion ? ` · ${duracion} min en la tienda` : ""}` }
      : { k: "Ejecución", v: "Pendiente · sin registro en terreno" },
    { k: "Estado", v: ESTADO_VISITA_LABEL[visita.estado], span: 2 },
  ];
  if (visita.indicacionesAcceso) resumen.push({ k: "Indicaciones de acceso", v: visita.indicacionesAcceso, span: 2 });
  if (visita.motivoPendiente) resumen.push({ k: "Motivo del técnico", v: visita.motivoPendiente, span: 2 });
  const reagenda = visita.reagendamientos?.[0];
  if (reagenda) resumen.push({ k: "Motivo del reagendamiento (técnico)", v: reagenda.motivo, span: 2 });

  return (
    <div className="pb-12 animate-fade-in">
      {/* Barra de acciones */}
      <div className="flex items-center gap-3 flex-wrap px-7 py-3.5 border-b border-[var(--color-divider-soft)]">
        <Link href="/admin/visitas" className="btn btn-secondary min-h-[38px] px-3.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
          <span>Volver a visitas</span>
        </Link>
        <Tag variant={ESTADO_VISITA_TAG[visita.estado]}>{ESTADO_VISITA_LABEL[visita.estado]}</Tag>
        <div className="text-[11px] tracking-[.08em] uppercase opacity-62 tabular-nums">{sello}</div>
        {enviada ? (
          <span className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-[11px] leading-[1.2] tracking-[.05em]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M4 12l5 5L20 6" />
            </svg>
            <span>
              Enviada a {enviada.para} · {enviada.adjuntos} adjuntos
            </span>
          </span>
        ) : null}

        <div className="ml-auto flex gap-2 flex-wrap">
          {cerrada ? (
            <button onClick={() => setDialogo("correo")} className="btn btn-primary min-h-[38px] px-3.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="5" width="18" height="14" />
                <path d="M3 6l9 7 9-7" />
              </svg>
              <span>Enviar por correo</span>
            </button>
          ) : null}
          {reprogramable ? (
            <button onClick={() => setDialogo("reprogramar")} className="btn btn-primary min-h-[38px] px-3.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="5" width="18" height="16" />
                <path d="M8 3v4M16 3v4M3 11h18M12 15l2 2-2 2" />
              </svg>
              <span>Cambiar fecha y técnico</span>
            </button>
          ) : null}
          {cerrablePorAdmin ? (
            <button
              onClick={() => setDialogo("cancelarAdmin")}
              className="btn btn-secondary min-h-[38px] px-3.5"
              title="Cerrar esta visita sin que llegue a hacerse"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M6 6l12 12" />
              </svg>
              <span>Cancelar por admin</span>
            </button>
          ) : null}
          <button onClick={() => setTrazaAbierta(true)} className="btn btn-secondary min-h-[38px] px-3.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5V12l3 2" />
            </svg>
            <span>Trazabilidad</span>
          </button>
          <button
            onClick={() => aviso(`Acta ${visita.folio} · PDF en preparación`)}
            className="btn btn-secondary min-h-[38px] px-3.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 4v11M7 11l5 5 5-5M4 20h16" />
            </svg>
            <span>Descargar PDF</span>
          </button>
        </div>
      </div>

      {sinCerrar ? (
        <div className="mx-7 mt-5 px-4 py-3.5 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)] text-[13px] text-[var(--color-accent-800)]">
          {AVISO_ESTADO[visita.estado]}
        </div>
      ) : null}

      <div className="px-7 pt-7 pb-10 max-w-[900px]">
        <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">
          Acta de visita en terreno
        </div>
        <h1 className="font-extrabold text-[40px] leading-[1.04] tracking-[-.035em] mt-2.5 mb-1.5 tabular-nums">
          {visita.folio}
        </h1>
        <p className="m-0 mb-6 text-[15px] opacity-60">
          {visita.cliente?.nombreFantasia} · {visita.sucursal?.nombre} · {textoMotivos(visita)}
        </p>

        <div className="border border-[var(--color-divider)] bg-[var(--color-surface-3)]">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b-2 border-[var(--color-divider)]">
            <div className="font-extrabold text-[13px] tracking-[.06em] uppercase">
              {ejecutada ? "Lo que registró el técnico" : "Lo que se programó"}
            </div>
            <span className="tag tag-outline ml-auto">Vista completa</span>
          </div>

          <button
            onClick={() => setResumenAbierto((v) => !v)}
            className="w-full flex items-center gap-2.5 px-5 py-3.5 bg-transparent border-0 border-b border-black/[.2] cursor-pointer text-[var(--color-text)] text-left hover:bg-[#eeeaea]"
          >
            <span className="text-[11px] tracking-[.11em] uppercase opacity-66">Detalle de la visita</span>
            <span className="text-[13px] opacity-62 ml-auto">
              {resumenAbierto ? "" : "Fecha, cliente, sucursal y contacto"}
            </span>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              className="flex-none transition-transform"
              style={{ transform: `rotate(${resumenAbierto ? 180 : 0}deg)` }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {resumenAbierto ? (
            <>
              <div className="grid grid-cols-2">
                {resumen.map((r) => (
                  <div
                    key={r.k}
                    className="px-5 py-3.5 border-b border-black/[.2] border-r border-r-black/[.2] min-w-0"
                    style={{ gridColumn: `span ${r.span ?? 1}` }}
                  >
                    <div className="text-[11px] tracking-[.11em] uppercase opacity-72">{r.k}</div>
                    <div className="text-[18px] leading-[1.35] mt-1.5">{r.v}</div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 border-b border-black/[.2] flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => setDialogo("editar")}
                  className={`btn ${reprogramable ? "btn-secondary" : "btn-primary"} min-h-10 px-4`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M4 20h4l10-10-4-4L4 16v4z" />
                    <path d="M14 6l4 4" />
                  </svg>
                  <span>Corregir visita</span>
                </button>
                <span className="text-[13px] opacity-66">
                  {cerrada
                    ? "El acta ya está cerrada: la corrección queda registrada en la trazabilidad."
                    : "Corrige los datos de arriba: cliente, sucursal, técnico, fecha, hora o el trabajo solicitado."}
                </span>
              </div>
            </>
          ) : null}

          {ejec?.comentarioInterno ? (
            <div className="px-5 py-5 border-b border-black/[.2] border-l-4 border-l-[var(--color-accent)] bg-[var(--color-accent-100)]">
              <div className="text-[10px] tracking-[.12em] uppercase text-[var(--color-accent-active)] mb-2">
                Comentario interno del técnico · no va en el acta al cliente
              </div>
              <div className="text-[15px] leading-[1.5] max-w-[74ch]">{ejec.comentarioInterno}</div>
            </div>
          ) : null}

          {visita.trabajoSolicitado ? (
            <div className="px-5 py-5 border-b border-black/[.2] bg-[var(--color-surface)]">
              <div className="text-[10px] tracking-[.12em] uppercase opacity-62 mb-2">
                Trabajo solicitado por coordinación
              </div>
              <div className="text-base leading-[1.5] max-w-[74ch]">{visita.trabajoSolicitado}</div>
              {visita.indicacionesAcceso ? (
                <div className="text-[13px] leading-[1.5] opacity-60 mt-2.5 max-w-[74ch]">
                  Acceso: {visita.indicacionesAcceso}
                </div>
              ) : null}
            </div>
          ) : null}

          {!ejecutada ? (
            <div className="px-5 pt-8.5 pb-9.5 text-center">
              <div className="font-extrabold text-[19px] leading-[1.25] mb-1.5">
                El técnico aún no registra el formulario
              </div>
              <div className="text-sm opacity-66 max-w-[52ch] mx-auto">
                La visita está en estado {ESTADO_VISITA_LABEL[visita.estado]}. Cuando el técnico la cierre en terreno
                vas a ver aquí problemas, fotos, horarios y la firma de la tienda.
              </div>
            </div>
          ) : null}

          {ejec?.observaciones ? (
            <div className="px-5 py-5 border-b border-black/[.2]">
              <div className="text-[11px] tracking-[.11em] uppercase opacity-66">Observaciones del técnico</div>
              <div className="text-[17px] leading-[1.45] mt-1.5 max-w-[74ch]">{ejec.observaciones}</div>
            </div>
          ) : null}

          {ejecutada ? (
            <div className="px-5 pt-5.5 pb-6">
              {visita.trabajos && visita.trabajos.length > 0 ? (
                <>
                  <div className="text-[11px] tracking-[.11em] uppercase opacity-66 mb-3">
                    Trabajo realizado ({visita.trabajos.length})
                  </div>
                  <div className="flex flex-col gap-2.5 mb-6.5">
                    {visita.trabajos.map((t) => (
                      <div key={t.id} className="border border-black/[.35] bg-white px-4.5 py-3.5">
                        <div className="font-extrabold text-base">
                          {nombreTrabajo(catalogoTrabajo, t.trabajoCodigo)}
                        </div>
                        {t.subtrabajos.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {t.subtrabajos.map((s) => (
                              <span key={s.id} className="tag tag-dark font-extrabold">
                                {s.etiqueta}
                                {s.cantidad > 1 ? ` × ${s.cantidad}` : ""}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {t.detalle ? <div className="text-[15px] leading-[1.45] mt-2.5 max-w-[70ch]">{t.detalle}</div> : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              <div className="text-[11px] tracking-[.11em] uppercase opacity-66 mb-3">
                Problemas levantados ({visita.problemas?.length ?? 0})
              </div>
              {visita.problemas && visita.problemas.length > 0 ? (
                <div className="flex flex-col gap-3.5">
                  {visita.problemas.map((p, i) => (
                    <div key={p.id} className="border border-black/[.35] bg-white">
                      <div className="flex items-center gap-2.5 flex-wrap px-4.5 py-3.5 border-b border-black/[.2] bg-[var(--color-surface)]">
                        <span className="w-6.5 h-6.5 flex-none grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs tabular-nums">
                          {i + 1}
                        </span>
                        <div className="font-extrabold text-xs tracking-[.09em] uppercase">
                          Problema {i + 1} de {visita.problemas!.length}
                        </div>
                        <Tag variant={ESTADO_PROBLEMA_TAG[p.estado]} className="ml-auto">
                          {ESTADO_PROBLEMA_LABEL[p.estado]}
                        </Tag>
                      </div>
                      <div className="px-4.5 pt-4 pb-1.5">
                        <div className="pb-3.5 border-b border-black/[.18]">
                          <div className="text-[11px] tracking-[.11em] uppercase opacity-60">Tipo de problema</div>
                          <div className="font-extrabold text-[19px] leading-[1.3] mt-1.5">
                            {nombreProblema(catalogoProblema, p.tipoCodigo)}
                          </div>
                        </div>
                        {p.items.length > 0 ? (
                          <div className="py-3.5 border-b border-black/[.18]">
                            <div className="text-[11px] tracking-[.11em] uppercase opacity-60">
                              {p.tipoCodigo === "PLACAS_DANADAS" ? "Modelos de placa y cantidad" : "Equipos afectados"}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-2.5">
                              {p.items.map((it) => (
                                <span
                                  key={it.id}
                                  className="inline-flex items-baseline gap-2 px-2.5 py-1.5 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-[13px] leading-[1.2]"
                                >
                                  <span>{it.etiqueta}</span>
                                  <span className="tabular-nums opacity-75">× {it.cantidad}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {p.descripcion ? (
                          <div className="py-3.5 border-b border-black/[.18]">
                            <div className="text-[11px] tracking-[.11em] uppercase opacity-60">
                              Qué encontró el técnico
                            </div>
                            <div className="text-[17px] leading-[1.4] mt-1.5 max-w-[70ch]">{p.descripcion}</div>
                          </div>
                        ) : null}
                        <div className="pt-3.5 pb-4">
                          <div className="text-[11px] tracking-[.11em] uppercase opacity-60">
                            {p.estado === "RESUELTO" ? "Qué se realizó en terreno" : "Solución sugerida por el técnico"}
                          </div>
                          <div className="text-[17px] leading-[1.4] mt-1.5 max-w-[70ch]">
                            {p.solucion ?? "Sin indicación del técnico."}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[15px] opacity-66">Sin problemas registrados en esta visita.</div>
              )}

              <div className="text-[11px] tracking-[.11em] uppercase opacity-66 mt-6.5 mb-3">
                Fotos del trabajo ({visita.fotos?.length ?? 0})
              </div>
              <div className="grid grid-cols-4 gap-2.5">
                {(visita.fotos ?? []).map((f, i) => (
                  // La foto se agranda encima del acta, no en otra pestaña.
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => visor.abrir(i)}
                    className="border border-black/[.35] bg-[var(--color-surface)] aspect-[4/3] block relative overflow-hidden p-0 cursor-zoom-in hover:border-[var(--color-accent)]"
                    title="Ver la foto en grande"
                  >
                    {/* Las fotos van en color: los bytes vienen de
                        dmc.visita_foto.contenido vía /api/visita/foto/<id>. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.archivoUrl}
                      alt={f.etiqueta ?? "Foto del trabajo"}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute left-0 right-0 bottom-0 px-2 py-1 bg-[rgba(32,30,29,.72)] text-[var(--color-bg)] text-left">
                      <div className="font-extrabold text-[11px] leading-[1.2] truncate">{f.etiqueta ?? "Foto"}</div>
                      <div className="text-[10px] leading-[1.3] opacity-80 tabular-nums">{hhmm(f.tomadaEn)}</div>
                    </div>
                  </button>
                ))}
                {(visita.fotos ?? []).length === 0 ? (
                  <div className="col-span-4 text-[13px] opacity-66">Sin fotos registradas.</div>
                ) : null}
              </div>

              {/* Los clips salen de dmc.visita_video vía /api/visita/video/<id>,
                  que responde por rangos: por eso se pueden adelantar sin que
                  el navegador se baje los 11 MB completos. */}
              <div className="text-[11px] tracking-[.11em] uppercase opacity-66 mt-6.5 mb-3">
                Videos del trabajo ({visita.videos?.length ?? 0})
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {(visita.videos ?? []).map((v) => (
                  <figure key={v.id} className="m-0 border border-black/[.35] bg-[var(--color-surface)]">
                    <video
                      src={v.archivoUrl}
                      controls
                      preload="metadata"
                      playsInline
                      className="w-full aspect-video bg-black object-contain"
                    />
                    <figcaption className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] tabular-nums opacity-70">
                      <span className="font-extrabold truncate">{v.etiqueta ?? "Video del trabajo"}</span>
                      <span className="ml-auto flex-none">
                        {v.duracionSeg ? reloj(v.duracionSeg) : "—"}
                        {v.ancho && v.alto ? ` · ${v.ancho}x${v.alto}` : ""}
                      </span>
                    </figcaption>
                  </figure>
                ))}
                {(visita.videos ?? []).length === 0 ? (
                  <div className="col-span-2 text-[13px] opacity-66">Sin videos registrados.</div>
                ) : null}
              </div>

              <div className="flex gap-5 items-end mt-7.5 flex-wrap">
                <div className="flex-[0_1_300px] min-w-0">
                  {firma?.imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={firma.imagenUrl}
                      alt={`Firma de ${firma.nombre}`}
                      className="h-[78px] w-full object-contain object-left-bottom"
                    />
                  ) : (
                    <div className="h-[78px] border border-dashed border-[var(--color-divider)] bg-[var(--color-surface)] grid place-items-center text-[11px] leading-[1.3] tracking-[.06em] uppercase opacity-60">
                      {cerrada ? "Firma capturada en terreno" : "Sin firma todavía"}
                    </div>
                  )}
                  <div className="h-px bg-[var(--color-text)] mt-1.5" />
                  <div className="text-sm mt-1.5">{cerrada ? firma?.nombre ?? "—" : "—"}</div>
                  <div className="text-[10px] tracking-[.09em] uppercase opacity-62">
                    Responsable de tienda · {cerrada ? firma?.rut ?? "—" : "sin firmar"}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Trazabilidad */}
      <div
        onClick={() => setTrazaAbierta(false)}
        className="fixed inset-0 z-40 bg-[rgba(45,43,43,.35)] transition-opacity duration-200"
        style={{ opacity: trazaAbierta ? 1 : 0, pointerEvents: trazaAbierta ? "auto" : "none" }}
      />
      <div
        className="fixed top-0 right-0 bottom-0 w-[min(380px,88vw)] z-41 bg-[var(--color-bg)] border-l-2 border-[var(--color-text)] flex flex-col transition-transform duration-200"
        style={{ transform: `translateX(${trazaAbierta ? "0%" : "100%"})`, zIndex: 41 }}
        aria-hidden={!trazaAbierta}
      >
        <div className="flex-none flex items-center gap-2.5 px-4.5 py-4 border-b-2 border-[var(--color-divider)]">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[.14em] uppercase text-[var(--color-accent-active)]">Trazabilidad</div>
            <div className="font-extrabold text-[17px] leading-[1.15] mt-1 tabular-nums">{visita.folio}</div>
          </div>
          <button
            onClick={() => setTrazaAbierta(false)}
            aria-label="Cerrar trazabilidad"
            className="btn btn-icon ml-auto"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4.5">
          <div className="px-3.5 py-3 bg-[var(--color-surface)] border-l-4 border-[var(--color-accent)]">
            <div className="text-[10px] tracking-[.11em] uppercase opacity-66">Último movimiento</div>
            <div className="font-extrabold text-[15px] leading-[1.3] mt-1.5">
              {cerrada
                ? "Acta cerrada por el técnico"
                : ejecutada
                  ? "Formulario en edición en el móvil"
                  : "Programada, sin registro en terreno"}
            </div>
            <div className="text-xs leading-[1.4] opacity-60 mt-1 tabular-nums">
              {visita.fechaProgramada} · {ejec ? hhmm(cerrada ? ejec.horaTermino : ejec.horaInicio) : "creada"} ·{" "}
              {visita.tecnico?.nombreCompleto}
            </div>
          </div>

          <div className="text-[10px] tracking-[.12em] uppercase opacity-66 mt-5 mb-2.5">Línea de tiempo</div>
          {[
            { estado: "Programada", hora: `${visita.fechaProgramada} · creada`, quien: "Coordinación", color: "var(--color-neutral-300)" },
            ...(ejecutada && ejec
              ? [
                  {
                    estado: "En curso",
                    hora: `${visita.fechaProgramada} ${hhmm(ejec.horaInicio)}`,
                    quien: visita.tecnico?.nombreCompleto ?? "—",
                    color: "var(--color-accent)",
                  },
                ]
              : []),
            ...(ejecutada && ejec?.horaTermino
              ? [
                  {
                    estado: ESTADO_VISITA_LABEL[visita.estado],
                    hora: `${visita.fechaProgramada} ${hhmm(ejec.horaTermino)}`,
                    quien: visita.tecnico?.nombreCompleto ?? "—",
                    color: cerrada ? "var(--color-text)" : "var(--color-accent)",
                  },
                ]
              : []),
          ].map((h) => (
            <div key={h.estado} className="flex gap-3 pb-3.5">
              <div className="w-2.5 flex-none flex flex-col items-center pt-1.5">
                <span className="w-2.5 h-2.5 border border-black/[.45]" style={{ background: h.color }} />
                <span className="flex-1 w-px bg-black/[.25] mt-1" />
              </div>
              <div className="min-w-0">
                <div className="font-extrabold text-sm leading-[1.3]">{h.estado}</div>
                <div className="text-xs leading-[1.4] opacity-60 tabular-nums">
                  {h.hora} · {h.quien}
                </div>
              </div>
            </div>
          ))}

          <div className="text-[10px] tracking-[.12em] uppercase opacity-66 mt-3.5 mb-1">Datos del registro</div>
          {[
            { k: "Creada", v: visita.creadoEn.slice(0, 16).replace("T", " · ") },
            { k: "Sincronizada", v: ejec?.sincronizadoEn ? ejec.sincronizadoEn.slice(0, 16).replace("T", " · ") : "pendiente" },
            // Un acta registrada offline se cerró en terreno antes de llegar
            // acá: la hora de término es la de la tienda, no la de la subida.
            { k: "Captura", v: ejec?.registradoOffline ? "Sin señal · se envió al recuperar cobertura" : "En línea" },
            { k: "Dispositivo", v: ejec?.dispositivo ?? "—" },
            { k: "Folio", v: visita.folio },
          ].map((t) => (
            <div key={t.k} className="flex gap-3 py-2.5 border-b border-black/[.18]">
              <div className="text-[10px] leading-[1.5] tracking-[.08em] uppercase opacity-62 min-w-[92px] flex-none">
                {t.k}
              </div>
              <div className="text-[13px] min-w-0 tabular-nums text-right ml-auto">{t.v}</div>
            </div>
          ))}
        </div>
      </div>

      {dialogo === "correo" ? (
        <CorreoDialogo visita={visita} onCerrar={() => setDialogo(null)} onHecho={aviso} />
      ) : null}
      {dialogo === "editar" ? (
        <VisitaDialogo
          visita={visita}
          onCerrar={() => setDialogo(null)}
          onHecho={(m) => {
            aviso(m);
            router.refresh();
          }}
        />
      ) : null}
      {dialogo === "reprogramar" ? (
        <ReprogramarDialogo
          visita={visita}
          onCerrar={() => setDialogo(null)}
          onHecho={(m) => {
            aviso(m);
            router.refresh();
          }}
        />
      ) : null}

      {dialogo === "cancelarAdmin" ? (
        <CancelarAdminDialogo
          visita={visita}
          onCerrar={() => setDialogo(null)}
          onHecho={(m) => {
            aviso(m);
            router.refresh();
          }}
        />
      ) : null}

      {visor.abierto ? (
        <VisorFotos
          fotos={(visita.fotos ?? []).map((f) => ({
            src: f.archivoUrl,
            titulo: f.etiqueta ?? "Foto del trabajo",
            subtitulo: `${visita.folio} · ${visita.sucursal?.nombre ?? ""} · ${hhmm(f.tomadaEn)}`,
          }))}
          indice={visor.indice ?? 0}
          onIndice={visor.mover}
          onCerrar={visor.cerrar}
        />
      ) : null}

      <Toast texto={toast} variante="panel" />
    </div>
  );
}

/** "Enviar por correo" — destinatarios, cuerpo editable y qué se adjunta. */
function CorreoDialogo({
  visita,
  onCerrar,
  onHecho,
}: {
  visita: Visita;
  onCerrar: () => void;
  onHecho: (mensaje: string) => void;
}) {
  const router = useRouter();
  const ejec = visita.ejecucion;
  const duracion = ejec ? minutosEntre(ejec.horaInicio, ejec.horaTermino) : null;

  const [form, setForm] = useState<Record<string, string | boolean>>({
    para: "",
    cc: "coordinacion@grupodmc.cl",
    asunto: `${visita.sucursal?.nombre} · ${textoMotivos(visita)} · ${visita.fechaProgramada}`,
    cuerpo:
      `Estimados,\n\n` +
      `Informamos que la visita técnica en ${visita.sucursal?.nombre} (${visita.cliente?.nombreFantasia}) fue realizada el ${visita.fechaProgramada}.\n\n` +
      `Motivo: ${textoMotivosReales(visita)}\n` +
      `Técnico: ${visita.tecnico?.nombreCompleto}\n` +
      (ejec
        ? `Horario en tienda: ${hhmm(ejec.horaInicio)} a ${hhmm(ejec.horaTermino)}${duracion ? ` (${duracion} min)` : ""}\n\n`
        : "\n") +
      `Trabajo realizado:\n${ejec?.observaciones ?? ""}\n\n` +
      ((visita.problemas ?? []).length
        ? `Quedaron ${visita.problemas!.length} puntos por resolver; van detallados en el acta adjunta.\n\n`
        : "La visita se cerró sin problemas pendientes en la tienda.\n\n") +
      `Se adjuntan las fotografías del trabajo y la firma de ${visita.firmas?.[0]?.nombre ?? "la tienda"}, responsable de la tienda.\n\n` +
      `Saludos cordiales,\nCoordinación\nGrupo dMC`,
  });

  const [adjuntos, setAdjuntos] = useState<Adjunto[]>(() => [
    ...(visita.fotos ?? []).map((f) => ({
      label: `Foto ${(f.etiqueta ?? "").toLowerCase()} · ${hhmm(f.tomadaEn)}.jpg`,
      incluido: true,
    })),
    ...(visita.videos ?? []).map((v) => ({
      label: `Video · ${reloj(v.duracionSeg ?? 0)}.${v.mime.split("/")[1] ?? "mp4"}`,
      incluido: true,
    })),
    ...(visita.firmas ?? []).map((f) => ({ label: `Firma · ${f.nombre}.png`, incluido: true })),
    { label: `Acta ${visita.folio}.pdf`, incluido: true },
  ]);

  const [guardando, setGuardando] = useState(false);

  async function enviar() {
    setGuardando(true);
    const n = adjuntos.filter((a) => a.incluido).length;
    const res = await enviarActaAction({
      folio: visita.folio,
      para: String(form.para),
      cc: String(form.cc),
      asunto: String(form.asunto),
      adjuntos: n,
    });
    setGuardando(false);
    if (!res.ok) {
      onHecho(res.error ?? "No se pudo enviar.");
      return;
    }
    onHecho(`Acta enviada a ${form.para} · ${n} ${n === 1 ? "adjunto" : "adjuntos"}`);
    router.refresh();
    onCerrar();
  }

  return (
    <Dialogo
      kicker="Acta · enviar al cliente"
      titulo={`Enviar acta ${visita.folio}`}
      cta="Enviar correo"
      nota="Sale desde coordinacion@grupodmc.cl. Puedes editar destinatarios, asunto, cuerpo y qué se adjunta antes de enviar."
      campos={[
        { k: "para", label: "Para", tipo: "email", ph: "encargado@tienda.cl" },
        { k: "cc", label: "CC", ph: "separa varios correos con coma" },
        { k: "asunto", label: "Asunto", span: 2 },
        { k: "cuerpo", label: "Cuerpo del correo", span: 2, tipo: "cuerpo" },
      ]}
      form={form}
      onCampo={(k, v) => setForm((prev) => ({ ...prev, [k]: v }))}
      onCerrar={onCerrar}
      onGuardar={enviar}
      guardando={guardando}
      adjuntos={adjuntos}
      onToggleAdjunto={(i) =>
        setAdjuntos((prev) => prev.map((a, j) => (j === i ? { ...a, incluido: !a.incluido } : a)))
      }
    />
  );
}
