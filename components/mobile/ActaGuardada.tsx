"use client";

import Link from "next/link";
import VisorFotos, { useVisorFotos } from "@/components/ui/VisorFotos";
import EstadoProblemaTag from "@/components/EstadoProblemaTag";
import { textoMotivosReales } from "@/lib/ui/estado";
import { nombreProblema, nombreTrabajo, puede, useReferencias } from "@/lib/ui/referencias";
import { fechaHoraCorta, resumenEdicion } from "@/lib/ui/edicion";
import type { CatalogoProblema, CatalogoTrabajo, Visita } from "@/lib/types";

/**
 * El acta ya guardada, vista desde el celular del técnico.
 *
 * Es lo que se abre con "Ver acta guardada": lo que quedó escrito en la base,
 * no un borrador ni la pantalla previa a guardar. Muestra el acta completa
 * —horarios, responsable, trabajos, problemas, fotos y firma—, porque antes se
 * quedaba en cuatro datos y no servía para revisar lo que se firmó.
 */

/** "2026-08-13T08:30:00" → "08:30". */
function hhmm(iso: string | null | undefined): string {
  return iso ? iso.slice(11, 16) : "—";
}

export default function ActaGuardada({
  visita,
  catalogoTrabajos,
  catalogoProblemas,
}: {
  visita: Visita;
  catalogoTrabajos: CatalogoTrabajo[];
  catalogoProblemas: CatalogoProblema[];
}) {
  const visor = useVisorFotos();
  const referencias = useReferencias();
  const { motivos } = referencias;
  const puedeEditar = puede(referencias, "celular.editarActa");
  const ejec = visita.ejecucion;
  // Primero las fotos del trabajo y después las del comentario interno: el
  // visor las recorre en ese orden.
  const fotosTrabajo = (visita.fotos ?? []).filter((f) => !f.interno);
  const fotosInternas = (visita.fotos ?? []).filter((f) => f.interno);
  const fotos = [...fotosTrabajo, ...fotosInternas];
  const videosInternos = (visita.videos ?? []).filter((v) => v.interno);
  const internos = visita.internos ?? [];
  const firma = visita.firmas?.[0];
  const nombreMotivo = (codigo: string) => motivos.find((m) => m.codigo === codigo)?.nombre ?? codigo;
  const ediciones = visita.ediciones ?? [];
  const cerrada = visita.estado === "COMPLETADA";
  // El técnico puede corregir su acta hasta un día después de cerrarla.
  const editable = cerrada && puedeEditar && Boolean(ejec?.editablePorTecnico);

  const filas: { k: string; v: string }[] = [
    { k: "Motivo", v: textoMotivosReales(visita) },
    { k: "Técnico", v: visita.tecnico?.nombreCompleto ?? "—" },
    ...(visita.tecnicoAyudante ? [{ k: "Ayudante", v: visita.tecnicoAyudante.nombreCompleto }] : []),
    { k: "Fecha", v: visita.fechaProgramada },
    { k: "Horario", v: ejec ? `${hhmm(ejec.horaInicio)} – ${hhmm(ejec.horaTermino)}` : "Sin registro de horas" },
    {
      k: "Responsable",
      v: ejec?.responsableNombre
        ? `${ejec.responsableNombre}${ejec.responsableRut ? ` · ${ejec.responsableRut}` : ""}`
        : visita.responsableNombre ?? "—",
    },
  ];
  if (ejec?.observaciones) filas.push({ k: "Observación", v: ejec.observaciones });

  return (
    <div className="animate-fade-in">
      <div className="px-4 pt-5">
        <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">Acta de visita</div>
        <h1 className="font-extrabold text-[26px] leading-[1.1] tracking-[-.02em] mt-2 mb-0.5">
          {visita.sucursal?.nombre}
        </h1>
        <div className="text-sm opacity-60">
          {visita.cliente?.nombreFantasia} · {visita.folio}
        </div>
        {visita.estado === "COMPLETADA" ? (
          <a
            href={`/api/visita/acta/${encodeURIComponent(visita.folio)}`}
            download={`Acta ${visita.folio}.pdf`}
            className="w-full min-h-[50px] flex items-center justify-between px-4 mt-3.5 bg-[var(--color-accent)] text-[var(--color-bg)] font-extrabold text-sm hover:bg-[var(--color-accent-hover)]"
          >
            <span>Descargar acta en PDF</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 4v11M7 11l5 5 5-5M4 20h16" />
            </svg>
          </a>
        ) : null}
        {editable ? (
          <>
            <Link
              href={`/tecnico/visitas/${encodeURIComponent(visita.folio)}/editar`}
              className="w-full min-h-[50px] flex items-center justify-between px-4 mt-2.5 border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm hover:bg-black/[.07]"
            >
              <span>Editar el acta</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 20h4l10-10-4-4L4 16v4z" />
                <path d="M14 6l4 4" />
              </svg>
            </Link>
            <div className="mt-1.5 text-xs opacity-66">
              Puedes corregirla hasta el {fechaHoraCorta(ejec?.editableHasta)}. La firma de la tienda se conserva.
            </div>
          </>
        ) : cerrada && !puedeEditar ? (
          <div className="mt-2.5 text-xs opacity-66">
            Tu rol no puede editar actas cerradas. Si hay que corregir algo, pídeselo a coordinación.
          </div>
        ) : cerrada ? (
          <div className="mt-2.5 text-xs opacity-66">
            Ya pasó el plazo de un día para editar esta acta. Si hay que corregir algo, pídeselo a coordinación.
          </div>
        ) : null}
        {ediciones.length > 0 ? (
          <div className="mt-3 px-3.5 py-3 bg-[var(--color-accent-100)] border-l-4 border-[var(--color-accent)]">
            <div className="text-[10px] tracking-[.12em] uppercase text-[var(--color-accent-800)]">
              Acta editada · {ediciones.length} {ediciones.length === 1 ? "vez" : "veces"}
            </div>
            {ediciones.map((e) => (
              <div key={e.id} className="mt-2.5 pt-2.5 border-t border-black/[.15] first:border-t-0 first:pt-0 text-[13px] leading-[1.45]">
                <div className="font-extrabold">{e.secciones.join(" · ")}</div>
                <div className="mt-0.5">Motivo: {e.motivo}</div>
                <div className="text-xs opacity-66 mt-0.5">{resumenEdicion(e)}</div>
              </div>
            ))}
          </div>
        ) : null}
        {ejec?.registradoOffline ? (
          <div className="mt-3 px-3.5 py-2.5 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)] text-[13px] leading-[1.45]">
            Se llenó sin señal y se sincronizó
            {ejec.sincronizadoEn ? ` el ${ejec.sincronizadoEn.slice(0, 16).replace("T", " a las ")}` : " al recuperar cobertura"}.
          </div>
        ) : null}
      </div>

      <div className="mx-4 mt-4 border border-[var(--color-divider)] bg-[var(--color-surface-3)] px-4 pt-1 pb-4">
        {filas.map((f) => (
          <div key={f.k} className="py-2.5 border-b border-black/[.2]">
            <div className="text-[11px] tracking-[.1em] uppercase opacity-66">{f.k}</div>
            <div className="text-sm mt-1">{f.v || "—"}</div>
          </div>
        ))}

        {visita.trabajos && visita.trabajos.length > 0 ? (
          <div className="pt-3.5">
            <div className="text-[11px] tracking-[.1em] uppercase opacity-66 mb-2">Trabajo realizado</div>
            {visita.trabajos.map((t) => (
              <div key={t.id} className="border-l-[3px] border-[var(--color-text)] pl-3 mb-2.5">
                {t.motivoCodigo ? (
                  <div className="text-[10px] tracking-[.1em] uppercase opacity-62">{nombreMotivo(t.motivoCodigo)}</div>
                ) : null}
                <div className="font-extrabold text-[15px] leading-[1.25]">
                  {nombreTrabajo(catalogoTrabajos, t.trabajoCodigo)}
                </div>
                {t.subtrabajos.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {t.subtrabajos.map((s) => (
                      <span
                        key={s.id}
                        className="px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2] tabular-nums"
                      >
                        {s.etiqueta}
                        {s.cantidad > 1 ? ` × ${s.cantidad}` : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
                {t.detalle ? <div className="text-sm opacity-72 mt-1.5">{t.detalle}</div> : null}
              </div>
            ))}
          </div>
        ) : null}

        {visita.problemas && visita.problemas.length > 0 ? (
          <div className="pt-3.5">
            <div className="text-[11px] tracking-[.1em] uppercase opacity-66 mb-2">Problemas</div>
            {visita.problemas.map((p) => (
              <div key={p.id} className="px-3 py-3 mb-2 bg-[var(--color-accent-200)] border-l-[3px] border-[var(--color-accent)]">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <div className="font-extrabold text-sm leading-[1.25] text-[var(--color-accent-800)]">
                    {nombreProblema(catalogoProblemas, p.tipoCodigo)}
                  </div>
                  <EstadoProblemaTag estado={p.estado} className="ml-auto" />
                </div>
                {p.items.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {p.items.map((it) => (
                      <span
                        key={it.id}
                        className="px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2] tabular-nums"
                      >
                        {it.etiqueta} × {it.cantidad}
                      </span>
                    ))}
                  </div>
                ) : null}
                {p.descripcion ? (
                  <div className="text-[13px] leading-[1.5] text-[var(--color-accent-800)] mt-1.5">{p.descripcion}</div>
                ) : null}
                {p.solucion ? (
                  <div className="text-[13px] leading-[1.5] text-[var(--color-accent-800)] mt-1.5 pt-1.5 border-t border-black/[.15]">
                    {p.estado === "RESUELTO" ? "Se realizó: " : "Sugerido: "}
                    {p.solucion}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {/* Fotos: se agrandan acá mismo, sin salir del acta. */}
        <div className="pt-3.5">
          <div className="text-[11px] tracking-[.1em] uppercase opacity-66 mb-2">Fotos ({fotosTrabajo.length})</div>
          {fotosTrabajo.length > 0 ? (
            <div className="grid grid-cols-3 gap-1.5">
              {fotosTrabajo.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => visor.abrir(i)}
                  aria-label={`Ver la foto ${i + 1} en grande`}
                  className="relative aspect-square p-0 border border-black/[.3] overflow-hidden bg-[var(--color-neutral-300)] cursor-zoom-in"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.archivoUrl}
                    alt={f.etiqueta ?? "Foto del trabajo"}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="text-[13px] opacity-66">No se tomaron fotos en esta visita.</div>
          )}
        </div>

        {/* Comentario interno: lo ve coordinación, no el cliente ni el PDF. */}
        {ejec?.comentarioInterno || internos.length || fotosInternas.length || videosInternos.length ? (
          <div className="mt-4 px-3 py-3 bg-[var(--color-surface)] border-l-[3px] border-[var(--color-text)]">
            <div className="text-[11px] tracking-[.1em] uppercase opacity-66">Comentario interno · no lo ve el cliente</div>
            {internos.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {internos.map((x) => (
                  <span
                    key={x.codigo}
                    className="px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2]"
                  >
                    {x.nombre}
                  </span>
                ))}
              </div>
            ) : null}
            {ejec?.comentarioInterno ? <div className="text-sm mt-2">{ejec.comentarioInterno}</div> : null}
            {fotosInternas.length > 0 ? (
              <div className="grid grid-cols-4 gap-1.5 mt-2.5">
                {fotosInternas.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => visor.abrir(fotosTrabajo.length + i)}
                    aria-label="Ver la foto interna en grande"
                    className="relative aspect-square p-0 border border-black/[.3] overflow-hidden cursor-zoom-in"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.archivoUrl} alt="Foto interna" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : null}
            {videosInternos.map((v) => (
              <video
                key={v.id}
                src={v.archivoUrl}
                controls
                preload="metadata"
                playsInline
                className="w-full aspect-video bg-black object-contain mt-2.5"
              />
            ))}
          </div>
        ) : null}

        {firma ? (
          <div className="pt-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={firma.imagenUrl}
              alt={`Firma de ${firma.nombre}`}
              className="w-full max-w-[260px] h-[70px] object-contain object-left-bottom"
            />
            <div className="h-px bg-[var(--color-text)] mt-1" />
            <div className="text-xs mt-1.5">
              {firma.nombre}
              {firma.rut ? ` · ${firma.rut}` : ""}
            </div>
            <div className="text-[10px] tracking-[.09em] uppercase opacity-62">Responsable de tienda</div>
          </div>
        ) : (
          <div className="pt-5 text-[13px] opacity-66">Esta visita no quedó firmada.</div>
        )}
      </div>

      <div className="h-6" />

      {visor.abierto ? (
        <VisorFotos
          fotos={fotos.map((f, i) => ({
            src: f.archivoUrl,
            titulo: f.interno ? "Foto interna" : f.etiqueta ?? `Foto ${i + 1}`,
            subtitulo: `${visita.folio} · ${hhmm(f.tomadaEn)}`,
          }))}
          indice={visor.indice ?? 0}
          onIndice={visor.mover}
          onCerrar={visor.cerrar}
        />
      ) : null}
    </div>
  );
}
