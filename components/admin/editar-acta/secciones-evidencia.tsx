"use client";

import Link from "next/link";
import { Candado, Fotos, Marca, Seccion, Videos } from "@/components/admin/editar-acta/piezas";
import type { EditarActaApi } from "@/components/admin/editar-acta/useEditarActa";

// La edición del acta, segunda mitad: comentario interno, fotos y video,
// firma, el guardado y el índice lateral.

/** 4 · Comentario interno. */
export function SeccionInterno({ fv }: { fv: EditarActaApi }) {
  const {
    visita,
    catalogoInterno,
    interno,
    setInterno,
    internos,
    setInternos,
    fotos,
    videos,
    subida,
    videosNuevos,
    agregarFotos,
    pegarFotos,
    pegarDesdePortapapeles,
    copiarFoto,
    agregarVideo,
    cambio,
    quitarFoto,
    quitarVideo,
  } = fv;
  return (
    <>
      {/* ── 4 · Comentario interno ── */}
      <Seccion
        id="interno"
        n={4}
        titulo="Comentario interno"
        ayuda="Solo para coordinación: nada de esto sale en el acta que recibe el cliente."
        cambio={cambio("interno")}
      >
        <div className="flex flex-col gap-5" onPaste={(e) => pegarFotos(e, true)}>
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
            onPegar={() => void pegarDesdePortapapeles(true)}
            onCopiar={(id) => void copiarFoto(id, false)}
            copiarA="el trabajo realizado"
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
    </>
  );
}

/** 5 · Fotos y video del trabajo. */
export function SeccionFotos({ fv }: { fv: EditarActaApi }) {
  const {
    fotos,
    videos,
    subida,
    videosNuevos,
    agregarFotos,
    pegarFotos,
    pegarDesdePortapapeles,
    copiarFoto,
    agregarVideo,
    cambio,
    quitarFoto,
    quitarVideo,
  } = fv;
  return (
    <>
      {/* ── 5 · Fotos y video del trabajo ── */}
      <Seccion
        id="media"
        n={5}
        titulo="Fotos y video del trabajo"
        ayuda="Lo que quites no se borra: queda guardado e inactivo, y su número va al registro. Un video de más de 1 minuto o 720p se ajusta solo al agregarlo."
        cambio={cambio("media")}
      >
        <div className="flex flex-col gap-5" onPaste={(e) => pegarFotos(e, false)}>
          <Fotos
            titulo="Fotos del trabajo"
            fotos={fotos.filter((f) => !f.interno)}
            onQuitar={quitarFoto}
            onAgregar={(e) => agregarFotos(e, false)}
            onPegar={() => void pegarDesdePortapapeles(false)}
            onCopiar={(id) => void copiarFoto(id, true)}
            copiarA="el comentario interno"
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
    </>
  );
}

/** 6 · Firma: se conserva tal cual. */
export function SeccionFirma({ fv }: { fv: EditarActaApi }) {
  const { firma } = fv;
  return (
    <>
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
    </>
  );
}

/** Guardar: el motivo de la edición y lo que cambió. */
export function SeccionGuardar({ fv }: { fv: EditarActaApi }) {
  const { motivoEdicion, setMotivoEdicion, guardando, error, hrefActa, guardar, conCambios, hayCambios, irA } = fv;
  return (
    <>
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
    </>
  );
}

/** Índice: dónde estoy y qué llevo cambiado. Solo en pantallas anchas. */
export function Indice({ fv }: { fv: EditarActaApi }) {
  const { SECCIONES, cambio, irA } = fv;
  return (
    <>
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
    </>
  );
}
