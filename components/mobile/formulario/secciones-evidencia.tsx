"use client";

import {
  BotonGuardar,
  Cabecera,
  Campo,
  Cuerpo,
  GaleriaFotos,
  ListaVideos,
  ahora,
  entrada,
} from "@/components/mobile/formulario/piezas";
import type { FormularioVisitaApi } from "@/components/mobile/formulario/useFormularioVisita";

// Las secciones 4 a 6 del formulario —comentario interno, fotos y video, firma
// de la tienda— y el botón para ir a revisar.

/** 4 · Comentario interno. */
export function SeccionInterno({ fv }: { fv: FormularioVisitaApi }) {
  const {
    catalogoInterno,
    puedeVideo,
    abierta,
    guardadas,
    setGuardadas,
    interno,
    setInterno,
    internos,
    setInternos,
    clipsRef,
    guardarSeccion,
    toggleSeccion,
    fotosInternas,
    videosInternos,
    onArchivos,
    abrirCamara,
    abrirVideo,
    pedirQuitarFoto,
    pedirQuitarVideo,
    reintentarVideo,
  } = fv;
  return (
    <>
      {/* ── 4 · Comentario interno ── */}
      <Cabecera
        n={4}
        titulo="Comentario interno"
        ok={!!guardadas.interno}
        chip={
          internos.length || interno.trim() || fotosInternas.length || videosInternos.length
            ? { variante: guardadas.interno ? "accent" : "outline", texto: guardadas.interno ? "Guardado" : "Sin guardar" }
            : { variante: guardadas.interno ? "accent" : "neutral", texto: guardadas.interno ? "Sin comentario" : "Opcional" }
        }
        onToggle={() => toggleSeccion("interno")}
      />
      {abierta === "interno" ? (
        <Cuerpo gap={false}>
          <div className="px-3.5 py-2.5 mb-3.5 bg-[var(--color-bg)] border-l-4 border-[var(--color-text)] text-[13px] leading-[1.45]">
            Solo para coordinación. Nada de esta sección sale en el acta que recibe el cliente.
          </div>

          {catalogoInterno.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {catalogoInterno.map((x) => {
                const activo = internos.includes(x.codigo);
                return (
                  <button
                    key={x.codigo}
                    type="button"
                    role="checkbox"
                    aria-checked={activo}
                    onClick={() => {
                      setInternos((prev) => (activo ? prev.filter((c) => c !== x.codigo) : [...prev, x.codigo]));
                      setGuardadas((g) => ({ ...g, interno: false }));
                    }}
                    className="w-full min-h-[50px] flex items-center gap-3 px-3.5 text-[15px] leading-[1.25] text-[var(--color-text)] cursor-pointer text-left hover:brightness-95"
                    style={{
                      background: activo ? "var(--color-accent-100)" : "var(--color-surface-3)",
                      border: `1px solid ${activo ? "var(--color-accent)" : "rgba(32,30,29,.35)"}`,
                      fontWeight: activo ? 800 : 400,
                    }}
                  >
                    <span
                      className="w-[22px] h-[22px] flex-none border-2 border-[var(--color-text)] grid place-items-center"
                      style={{ background: activo ? "var(--color-accent)" : "transparent" }}
                    >
                      {activo ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f3f2f2" strokeWidth="3.4">
                          <path d="M4 12l5 5L20 6" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="flex-1 min-w-0">{x.nombre}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="mt-3.5">
            <Campo label="Descripción" htmlFor="f-int" extra="(opcional · no la ve el cliente)">
              <textarea
                id="f-int"
                rows={3}
                value={interno}
                onChange={(e) => setInterno(e.target.value)}
                autoComplete="off"
                placeholder="Solo para coordinación: algo que deba saber del local, del acceso o del equipo"
                className={`${entrada} min-h-[96px] leading-[1.4] resize-y`}
              />
            </Campo>
          </div>

          <div className="mt-3.5 text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">Fotos y video internos</div>
          <GaleriaFotos
            fotos={fotosInternas}
            onQuitar={pedirQuitarFoto}
            onCamara={() => abrirCamara("interno")}
            onArchivos={(e) => onArchivos(e, true)}
          />
          <ListaVideos
            videos={videosInternos}
            clips={clipsRef.current}
            onQuitar={pedirQuitarVideo}
            onReintentar={reintentarVideo}
          />
          {puedeVideo ? (
          <button
            onClick={() => abrirVideo("interno")}
            className="w-full min-h-[48px] flex items-center gap-2.5 px-4 mt-2 bg-[var(--color-text)] text-[var(--color-bg)] border-0 font-extrabold text-sm cursor-pointer text-left hover:bg-[var(--color-neutral-900)]"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M3 7h11v10H3z" />
              <path d="M14 11l7-4v10l-7-4z" />
            </svg>
            <span>{videosInternos.length ? "Grabar otro video interno" : "Grabar video interno"}</span>
          </button>
          ) : null}

          <div className="mt-3.5">
            <BotonGuardar texto="Guardar y seguir" habilitado onClick={() => guardarSeccion("interno")} />
          </div>
        </Cuerpo>
      ) : null}
    </>
  );
}

/** 5 · Fotos y video del trabajo. */
export function SeccionFotos({ fv }: { fv: FormularioVisitaApi }) {
  const {
    puedeVideo,
    abierta,
    guardadas,
    clipsRef,
    guardarSeccion,
    toggleSeccion,
    fotosTrabajo,
    videosTrabajo,
    onArchivos,
    abrirCamara,
    abrirVideo,
    pedirQuitarFoto,
    pedirQuitarVideo,
    reintentarVideo,
  } = fv;
  return (
    <>
      {/* ── 5 · Fotos y video del trabajo ── */}
      <Cabecera
        n={5}
        titulo="Fotos y video del trabajo"
        ok={!!guardadas.fotos}
        chip={
          guardadas.fotos
            ? {
                variante: "accent",
                texto: videosTrabajo.length
                  ? `${fotosTrabajo.length} fotos · ${videosTrabajo.length} video${videosTrabajo.length > 1 ? "s" : ""}`
                  : `${fotosTrabajo.length} fotos`,
              }
            : { variante: "neutral", texto: "Al final" }
        }
        onToggle={() => toggleSeccion("fotos")}
      />
      {abierta === "fotos" ? (
        <Cuerpo gap={false}>
          <p className="m-0 mb-3.5 text-[13px] opacity-60">
            Al final del trabajo: pórtico terminado, etiqueta de serie y cada problema que dejes anotado.
          </p>
          <GaleriaFotos
            fotos={fotosTrabajo}
            onQuitar={pedirQuitarFoto}
            onCamara={() => abrirCamara("trabajo")}
            onArchivos={(e) => onArchivos(e, false)}
          />
          {/* ── Video: 720p y hasta 1 minuto ── */}
          {puedeVideo ? (
          <div className="mt-5 pt-4 border-t border-[var(--color-divider)]">
            <div className="flex items-center gap-2">
              <div className="text-[10px] tracking-[.12em] uppercase opacity-66">Video del trabajo</div>
              <span className="ml-auto text-[11px] opacity-55 tabular-nums">720p · máx. 1 min</span>
            </div>
            <p className="m-0 mt-1.5 mb-3 text-[13px] opacity-60">
              Para lo que una foto no alcanza a mostrar: la falsa alarma sonando, el pórtico
              mientras pasa el carro, el ruido de la placa.
            </p>

            <ListaVideos
              videos={videosTrabajo}
              clips={clipsRef.current}
              onQuitar={pedirQuitarVideo}
              onReintentar={reintentarVideo}
            />

            <button
              onClick={() => abrirVideo("trabajo")}
              className="w-full min-h-[52px] flex items-center gap-2.5 px-4 mt-2 bg-[var(--color-text)] text-[var(--color-bg)] border-0 font-extrabold text-sm cursor-pointer text-left hover:bg-[var(--color-neutral-900)]"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M3 7h11v10H3z" />
                <path d="M14 11l7-4v10l-7-4z" />
              </svg>
              <span>{videosTrabajo.length ? "Grabar otro video" : "Grabar video"}</span>
            </button>
          </div>
          ) : null}

          <div className="mt-3.5">
            <BotonGuardar
              texto={
                fotosTrabajo.length || videosTrabajo.length
                  ? `Guardar ${fotosTrabajo.length} foto${fotosTrabajo.length === 1 ? "" : "s"}${videosTrabajo.length ? ` y ${videosTrabajo.length} video${videosTrabajo.length > 1 ? "s" : ""}` : ""}`
                  : "Seguir sin fotos"
              }
              habilitado
              onClick={() => guardarSeccion("fotos")}
            />
          </div>
        </Cuerpo>
      ) : null}
    </>
  );
}

/** 6 · Firma de la tienda. */
export function SeccionFirma({ fv }: { fv: FormularioVisitaApi }) {
  const { visita, edicion, abierta, respNombre, firma, setSheet, guardarSeccion, toggleSeccion } = fv;
  return (
    <>
      {/* ── 6 · Firma de la tienda ── */}
      <Cabecera
        n={6}
        titulo="Firma de la tienda"
        ok={!!firma}
        chip={
          firma
            ? { variante: "accent", texto: edicion ? "Se conserva" : "Firmada" }
            : { variante: "neutral", texto: edicion ? "Sin firma" : "Pendiente" }
        }
        onToggle={() => toggleSeccion("firmas")}
      />
      {abierta === "firmas" ? (
        <Cuerpo>
          <div className="bg-[var(--color-surface-3)] border border-[var(--color-divider)] px-3.5 py-3">
            <div className="flex items-center gap-2">
              <div className="text-[10px] tracking-[.12em] uppercase opacity-66">Responsable de tienda</div>
              <span className={`tag ${firma ? "tag-accent" : "tag-neutral"} ml-auto`}>
                {firma ? `Firmado ${firma.hora}` : "Sin firmar"}
              </span>
            </div>
            <div className="font-extrabold text-[15px] leading-[1.2] mt-1.5">
              {firma?.nombre || respNombre || visita.responsableNombre || "Encargado de tienda"}
            </div>
            {firma ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={firma.imagen}
                alt="Firma"
                className="w-full h-[76px] object-contain object-left mt-2 border-b border-black/[.35]"
              />
            ) : null}
            {edicion ? (
              <p className="m-0 mt-3 text-[13px] leading-[1.45] opacity-70">
                {firma
                  ? "La firma es la que dejó la tienda al cerrar el acta: al editar se conserva tal cual y no se vuelve a firmar."
                  : "Esta acta se cerró sin firma. Al editar no se puede agregar."}
              </p>
            ) : (
            <button
              onClick={() => setSheet("firma")}
              className="w-full min-h-[50px] flex items-center justify-between px-3.5 mt-3 border border-[var(--color-divider)] font-extrabold text-sm cursor-pointer text-left"
              style={{
                background: firma ? "transparent" : "var(--color-accent)",
                color: firma ? "var(--color-text)" : "var(--color-bg)",
              }}
            >
              <span>{firma ? "Volver a firmar" : "Firmar"}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 20c4 0 5-14 9-14s2 9 5 9 4-3 4-3" />
              </svg>
            </button>
            )}
          </div>
          {edicion ? null : (
            <BotonGuardar texto="Guardar esta sección" habilitado={!!firma} onClick={() => guardarSeccion("firmas")} />
          )}
        </Cuerpo>
      ) : null}
    </>
  );
}

/** Ir a revisar: guarda la sección abierta y pasa a la revisión. */
export function BotonRevisar({ fv }: { fv: FormularioVisitaApi }) {
  const {
    edicion,
    aviso,
    setPaso,
    abierta,
    setAbierta,
    guardadas,
    setGuardadas,
    setHoraTermino,
    puedeRevisar,
    faltaEnSeccion,
  } = fv;
  return (
    <>
      <div className="px-4 pt-5 pb-6.5">
        <button
          onClick={() => {
            // La sección abierta se guarda sola también al ir a revisar.
            const listas = { ...guardadas };
            if (abierta && !faltaEnSeccion(abierta)) listas[abierta] = true;
            // Las dos obligatorias cuentan como listas si ya están completas,
            // aunque el técnico no haya pasado por ellas (datos precargados).
            if (!faltaEnSeccion("sucursal")) listas.sucursal = true;
            if (!faltaEnSeccion("motivo")) listas.motivo = true;
            setGuardadas(listas);
            if (!listas.sucursal) return aviso(faltaEnSeccion("sucursal") ?? "Guarda los datos del responsable");
            if (!listas.motivo) return aviso(faltaEnSeccion("motivo") ?? "Guarda el motivo y el trabajo realizado");
            const faltaProblemas = faltaEnSeccion("problemas");
            if (faltaProblemas) {
              setAbierta("problemas");
              return aviso(faltaProblemas);
            }
            setAbierta(null);
            setHoraTermino(ahora());
            setPaso("preview");
          }}
          className="w-full min-h-[60px] flex items-center justify-between px-4.5 border-0 font-extrabold text-base cursor-pointer text-left hover:brightness-95"
          style={{
            background: puedeRevisar ? "var(--color-accent)" : "#8f8b8b",
            color: puedeRevisar ? "var(--color-bg)" : "var(--color-surface-3)",
          }}
        >
          <span>{edicion ? "Revisar los cambios" : "Revisar y guardar"}</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        <p className="mt-2.5 mb-0 text-xs opacity-66">
          {puedeRevisar
            ? "Vas a ver el acta completa antes de guardar nada."
            : "Guarda las secciones 1 y 2, y responde los problemas que venías a resolver, para poder revisar el acta."}
        </p>
      </div>
    </>
  );
}
