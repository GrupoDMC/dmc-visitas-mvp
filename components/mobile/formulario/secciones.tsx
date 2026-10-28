"use client";

import { fmtRut, fmtTel } from "@/lib/ui/formato";
import SelectBuscable from "@/components/ui/SelectBuscable";
import { cargoVigente } from "@/lib/ui/cargos";
import { etiquetaPersona } from "@/lib/ui/personas-local";
import { fechaHoraCorta } from "@/lib/ui/edicion";
import { descartarBorradorAction } from "@/app/actions/borradores";
import { borrarBorrador } from "@/lib/ui/borrador";
import { BotonGuardar, Cabecera, Campo, Cuerpo, EstadoBorrador, entrada } from "@/components/mobile/formulario/piezas";
import { type FormularioVisitaApi, SECCIONES } from "@/components/mobile/formulario/useFormularioVisita";

// El encabezado del formulario y sus secciones 1 a 3: responsable, motivo y
// trabajo realizado, y problemas detectados.

/** Folio, tienda, avance de las secciones y el estado del borrador. */
export function Encabezado({ fv }: { fv: FormularioVisitaApi }) {
  const {
    visita,
    edicion,
    uid,
    aviso,
    setAbierta,
    guardadas,
    setConfirmar,
    horaInicio,
    respaldo,
    setRespaldo,
    recuperado,
    setRecuperado,
    pendiente,
    enviando,
    conSenal,
    otrasPendientes,
    borradorRef,
    aplicarBorrador,
    nGuardadas,
    nombreMotivos,
    reintentarPendiente,
  } = fv;
  return (
    <>
      <div className="px-4 pt-4.5 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="text-xs tabular-nums tracking-[.08em] opacity-66">{visita.folio}</div>
          <span className="tag tag-accent">{edicion ? "Editando acta cerrada" : `En curso desde ${horaInicio}`}</span>
        </div>
        <h1 className="font-extrabold text-2xl leading-[1.1] tracking-[-.025em] mt-2.5 mb-0.5">{visita.sucursal?.nombre}</h1>
        <div className="text-[13px] opacity-66">
          {visita.cliente?.nombreFantasia} · {nombreMotivos(visita.motivosCodigos ?? [visita.motivoCodigo])}
        </div>
        <div className="flex gap-1.5 mt-4">
          {SECCIONES.map((k) => (
            <div key={k} className="flex-1 h-1.5" style={{ background: guardadas[k] ? "var(--color-accent)" : "var(--color-neutral-300)" }} />
          ))}
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] tracking-[.09em] uppercase opacity-62">
          <span>
            {nGuardadas} de {SECCIONES.length} secciones listas
          </span>
          <span>{edicion ? "Los cambios se guardan al final" : "El acta se cierra al final"}</span>
        </div>

        {edicion ? (
          <div className="mt-3 px-3.5 py-3 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)] text-[13px] leading-[1.45]">
            Estás corrigiendo un acta ya cerrada. Todo parte de lo que quedó guardado y la firma de la tienda se
            conserva. Nada cambia hasta que confirmes al final, y ahí se pide el motivo.
            {visita.ejecucion?.editableHasta
              ? ` Puedes editarla hasta el ${fechaHoraCorta(visita.ejecucion.editableHasta)}.`
              : ""}
          </div>
        ) : (
        <EstadoBorrador
          respaldo={respaldo}
          recuperado={recuperado}
          pendiente={pendiente}
          enviando={enviando}
          conSenal={conSenal}
          otrasPendientes={otrasPendientes}
          onOcultarRecuperado={() => setRecuperado(null)}
          onEmpezarDeNuevo={() =>
            setConfirmar({
              titulo: "¿Empezar el acta de nuevo?",
              texto:
                "Se borra lo que habías dejado a medias en este celular —trabajos, problemas, fotos y firma— y el formulario queda en blanco. Los videos ya subidos se quitan aparte, uno por uno.",
              cta: "Empezar de nuevo",
              accion: () => {
                borrarBorrador(uid, visita.folio);
                borradorRef.current = null;
                void descartarBorradorAction(visita.folio);
                setRespaldo(null);
                setRecuperado(null);
                aplicarBorrador({
                  folio: visita.folio,
                  guardadoEn: new Date().toISOString(),
                  respNombre: visita.responsableNombre ?? "",
                  respRut: fmtRut(visita.responsableRut ?? ""),
                  respTel: fmtTel(visita.responsableTelefono ?? ""),
                  motivosCodigos: visita.motivosCodigos ?? [visita.motivoCodigo],
                  obs: "",
                  interno: "",
                  internos: [],
                  trabajos: [],
                  problemas: [],
                  fotos: [],
                  firma: null,
                  guardadas: {},
                  horaInicio,
                });
                setAbierta("sucursal");
                aviso("Formulario en blanco");
              },
            })
          }
          onEnviarPendiente={() => void reintentarPendiente(true)}
        />
        )}
      </div>
    </>
  );
}

/** 1 · Sucursal y responsable. */
export function SeccionResponsable({ fv }: { fv: FormularioVisitaApi }) {
  const {
    abierta,
    guardadas,
    respNombre,
    setRespNombre,
    respRut,
    setRespRut,
    respTel,
    setRespTel,
    respCargo,
    setRespCargo,
    personasLocal,
    cargos,
    guardarSeccion,
    toggleSeccion,
    errorRut,
    sucursalCompleta,
  } = fv;
  return (
    <>
      {/* ── 1 · Sucursal y responsable ── */}
      <Cabecera
        n={1}
        titulo="Sucursal y responsable"
        ok={!!guardadas.sucursal}
        chip={guardadas.sucursal ? { variante: "accent", texto: "Guardada" } : { variante: "neutral", texto: "Pendiente" }}
        onToggle={() => toggleSeccion("sucursal")}
      />
      {abierta === "sucursal" ? (
        <Cuerpo>
          {personasLocal.length > 0 ? (
            <Campo label="Personas del local" htmlFor="f-per">
              <SelectBuscable
                id="f-per"
                valor=""
                opciones={personasLocal.map((p) => ({ v: String(p.id), t: etiquetaPersona(p) }))}
                onChange={(v) => {
                  const p = personasLocal.find((x) => String(x.id) === v);
                  if (!p) return;
                  setRespNombre(p.nombre);
                  setRespRut(fmtRut(p.rut ?? ""));
                  setRespTel(fmtTel(p.telefono ?? ""));
                  setRespCargo(cargoVigente(cargos, p.cargo));
                }}
                ariaLabel="Personas del local"
                placeholder="Elige a quien recibe, o escribe sus datos abajo…"
                claseCampo={entrada}
              />
            </Campo>
          ) : null}
          <Campo label="Responsable de tienda" htmlFor="f-nom">
            <input
              id="f-nom"
              value={respNombre}
              onChange={(e) => setRespNombre(e.target.value)}
              placeholder="Nombre y apellido"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className={entrada}
            />
          </Campo>
          <div className="flex gap-3">
            <Campo label="RUT" htmlFor="f-rut" className="flex-1 min-w-0">
              <input
                id="f-rut"
                // Teclado de texto y no numérico: el dígito verificador puede ser K.
                inputMode="text"
                autoCapitalize="characters"
                value={respRut}
                onChange={(e) => setRespRut(fmtRut(e.target.value))}
                placeholder="11.111.111-1"
                autoComplete="off"
                className={`${entrada} tabular-nums`}
              />
              {errorRut ? <div className="mt-1 text-xs text-[var(--color-accent-800)]">{errorRut}</div> : null}
            </Campo>
            <Campo label="Teléfono" htmlFor="f-tel" className="flex-1 min-w-0">
              <input
                id="f-tel"
                inputMode="tel"
                value={respTel}
                onChange={(e) => setRespTel(fmtTel(e.target.value))}
                onFocus={() => {
                  if (!respTel) setRespTel("+56 9 ");
                }}
                placeholder="+56 9 1234 5678"
                autoComplete="off"
                className={`${entrada} tabular-nums`}
              />
            </Campo>
          </div>
          {cargos.length > 0 ? (
            <Campo label="Cargo (opcional)" htmlFor="f-cargo">
              <SelectBuscable
                id="f-cargo"
                valor={respCargo}
                opciones={[{ v: "", t: "Sin cargo" }, ...cargos.map((c) => ({ v: c.nombre, t: c.nombre }))]}
                onChange={setRespCargo}
                ariaLabel="Cargo del responsable"
                claseCampo={entrada}
              />
            </Campo>
          ) : null}
          {!sucursalCompleta ? (
            <p className="m-0 text-xs text-[var(--color-accent-800)]">
              Completa nombre, RUT y teléfono del responsable para poder guardar esta sección.
            </p>
          ) : null}
          <BotonGuardar
            texto="Guardar y seguir"
            habilitado={sucursalCompleta}
            onClick={() => guardarSeccion("sucursal")}
          />
        </Cuerpo>
      ) : null}
    </>
  );
}

/** 2 · Motivo y trabajo realizado. */
export function SeccionTrabajo({ fv }: { fv: FormularioVisitaApi }) {
  const {
    motivos,
    abierta,
    guardadas,
    setGuardadas,
    setConfirmar,
    motivosAgendados,
    motivosCodigos,
    setMotivosCodigos,
    obs,
    setObs,
    trabajos,
    setTrabajos,
    verOtrosMotivos,
    setVerOtrosMotivos,
    motivoDe,
    trabajosVigentes,
    guardarSeccion,
    toggleSeccion,
    nombreTrabajo,
    abrirHojaTrabajo,
    desmarcarMotivo,
  } = fv;
  return (
    <>
      {/* ── 2 · Motivo y trabajo realizado ── */}
      <Cabecera
        n={2}
        titulo="Motivo y trabajo realizado"
        ok={!!guardadas.motivo}
        chip={
          guardadas.motivo
            ? {
                variante: "accent",
                texto: `${trabajosVigentes.length} ${trabajosVigentes.length === 1 ? "trabajo" : "trabajos"}`,
              }
            : { variante: "neutral", texto: "Pendiente" }
        }
        onToggle={() => toggleSeccion("motivo")}
      />
      {abierta === "motivo" ? (
        <Cuerpo>
          {/* Cada motivo marcado es una subcategoría con sus propios
              trabajos, y la hoja de "agregar" solo ofrece los trabajos que
              el checklist asignó a ese motivo. Los motivos sin marcar
              quedan escondidos para no llenar la pantalla. */}
          <div>
            <div className="text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
              Motivo de la visita
              <span className="opacity-66 normal-case tracking-normal"> (y lo que hiciste en cada uno)</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {motivos
                .filter((m) => motivosCodigos.includes(m.codigo))
                .map((m) => {
                  const suyos = trabajos.filter((t) => motivoDe(t) === m.codigo);
                  return (
                    <div
                      key={m.codigo}
                      className="bg-[var(--color-surface-3)] border border-[var(--color-accent)] border-l-4"
                    >
                      <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2">
                        <span className="w-[22px] h-[22px] flex-none grid place-items-center bg-[var(--color-accent)]">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f3f2f2" strokeWidth="3.4">
                            <path d="M4 12l5 5L20 6" />
                          </svg>
                        </span>
                        <span className="flex-1 min-w-0 font-extrabold text-[15px] leading-[1.25]">{m.nombre}</span>
                        {motivosAgendados.includes(m.codigo) ? (
                          <span className="text-[11px] tracking-[.09em] uppercase opacity-60 flex-none">Agendado</span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => desmarcarMotivo(m.codigo)}
                          className="min-h-9 px-1 bg-transparent border-0 text-[var(--color-accent-active)] text-xs underline underline-offset-[3px] cursor-pointer flex-none"
                        >
                          Quitar
                        </button>
                      </div>

                      <div className="px-3.5 pb-3 flex flex-col gap-2">
                        {suyos.map((t) => (
                          <div key={t.id} className="bg-[var(--color-bg)] border border-[var(--color-divider)] px-3 py-2.5">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0 font-extrabold text-[15px] leading-[1.25]">
                                {nombreTrabajo(t.codigo)}
                              </div>
                              <button
                                onClick={() =>
                                  setConfirmar({
                                    titulo: "¿Quitar este trabajo?",
                                    texto: `«${nombreTrabajo(t.codigo)}» se borra del trabajo realizado de esta visita.`,
                                    cta: "Quitar trabajo",
                                    accion: () => setTrabajos((prev) => prev.filter((x) => x.id !== t.id)),
                                  })
                                }
                                aria-label="Quitar trabajo"
                                className="w-8 h-8 -mr-1 -mt-1 flex-none grid place-items-center bg-transparent border-0 text-[var(--color-text)] cursor-pointer hover:bg-black/[.07]"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                                  <path d="M6 6l12 12M18 6L6 18" />
                                </svg>
                              </button>
                            </div>
                            {t.subs.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {t.subs.map((s) => (
                                  <span
                                    key={s.etiqueta}
                                    className="max-w-full px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2] tabular-nums"
                                  >
                                    {s.etiqueta}
                                    {s.cantidad > 1 ? ` × ${s.cantidad}` : ""}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {t.detalle ? <div className="text-sm opacity-75 mt-1.5">{t.detalle}</div> : null}
                          </div>
                        ))}
                        <button
                          onClick={() => abrirHojaTrabajo(m.codigo)}
                          className="w-full min-h-[48px] flex items-center gap-2.5 px-3.5 bg-transparent border border-dashed border-black/[.5] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.06]"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                          <span>{suyos.length ? "¿Qué más hiciste?" : "Agregar trabajo realizado"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

              {motivos.length === 0 ? (
                <div className="px-3.5 py-3 border border-dashed border-black/[.4] text-[13px] opacity-70">
                  No hay motivos en el checklist. Avisa a coordinación: sin motivos no se puede cerrar el acta.
                </div>
              ) : null}

              {/* Los que no están marcados, plegados. */}
              {motivos.some((m) => !motivosCodigos.includes(m.codigo)) ? (
                motivosCodigos.length === 0 || verOtrosMotivos ? (
                  <div className="flex flex-col gap-1.5">
                    {motivosCodigos.length > 0 ? (
                      <div className="text-[11px] tracking-[.09em] uppercase opacity-60 mt-1">Otros motivos</div>
                    ) : null}
                    {motivos
                      .filter((m) => !motivosCodigos.includes(m.codigo))
                      .map((m) => (
                        <button
                          key={m.codigo}
                          type="button"
                          role="checkbox"
                          aria-checked={false}
                          onClick={() => {
                            setMotivosCodigos((prev) => [...prev, m.codigo]);
                            setGuardadas((g) => ({ ...g, motivo: false }));
                            setVerOtrosMotivos(false);
                          }}
                          className="w-full min-h-[48px] flex items-center gap-3 px-3.5 text-[15px] leading-[1.25] text-[var(--color-text)] cursor-pointer text-left bg-[var(--color-surface-3)] border border-[rgba(32,30,29,.35)] hover:brightness-95"
                        >
                          <span className="w-[22px] h-[22px] flex-none border-2 border-[var(--color-text)]" />
                          <span className="flex-1 min-w-0">{m.nombre}</span>
                        </button>
                      ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setVerOtrosMotivos(true)}
                    className="w-full min-h-[44px] flex items-center gap-2 px-3.5 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] text-[13px] cursor-pointer text-left hover:bg-black/[.06]"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    <span>La visita fue también por otro motivo</span>
                  </button>
                )
              ) : null}
            </div>
          </div>

          {/* Un solo detalle para todo el trabajo, en vez de uno por trabajo. */}
          <Campo label="Detalle del trabajo" htmlFor="f-obs" extra="(opcional · la ve el cliente)">
            <textarea
              id="f-obs"
              rows={3}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              autoComplete="off"
              placeholder="Lo que no calce con la lista: pórtico 2 quedó midiendo 1,1 m, detalles del local, del acceso o del equipo"
              className={`${entrada} min-h-[96px] leading-[1.4] resize-y`}
            />
          </Campo>

          <BotonGuardar
            texto={
              trabajosVigentes.length
                ? `Guardar ${trabajosVigentes.length} trabajo${trabajosVigentes.length > 1 ? "s" : ""} y seguir`
                : "Guardar y seguir"
            }
            habilitado={motivosCodigos.length > 0 && trabajosVigentes.length > 0}
            onClick={() => guardarSeccion("motivo")}
          />
        </Cuerpo>
      ) : null}
    </>
  );
}

/** 3 · Problemas detectados. */
export function SeccionProblemas({ fv }: { fv: FormularioVisitaApi }) {
  const {
    abierta,
    guardadas,
    setConfirmar,
    problemas,
    setProblemas,
    setSheet,
    setNp,
    guardarSeccion,
    toggleSeccion,
    nombreProblema,
    porResolver,
    resoluciones,
    setResoluciones,
    sinResponder,
  } = fv;
  return (
    <>
      {/* ── 3 · Problemas detectados ── */}
      <Cabecera
        n={3}
        titulo="Problemas detectados"
        ok={!!guardadas.problemas && sinResponder.length === 0}
        chip={
          sinResponder.length
            ? { variante: "outline", texto: "Responder" }
            : guardadas.problemas
              ? { variante: "accent", texto: problemas.length ? `${problemas.length} cargados` : "Sin problemas" }
              : problemas.length
                ? { variante: "outline", texto: `${problemas.length} sin guardar` }
                : { variante: "neutral", texto: porResolver.length ? "Respondido" : "Opcional" }
        }
        onToggle={() => toggleSeccion("problemas")}
      />
      {abierta === "problemas" ? (
        <Cuerpo gap={false}>
          {porResolver.length > 0 ? (
            <div className="mb-5">
              <div className="text-[10px] tracking-[.1em] uppercase text-[var(--color-accent-active)]">
                Venías a resolver
              </div>
              <div className="flex flex-col gap-2.5 mt-2">
                {porResolver.map((p) => {
                  const dicho = resoluciones[p.id];
                  return (
                    <div
                      key={p.id}
                      className="bg-[var(--color-surface-3)] border border-[var(--color-divider)] border-l-4 border-l-[var(--color-accent)] px-3.5 py-3"
                    >
                      <div className="font-extrabold text-base leading-[1.25]">{p.tipo}</div>
                      <div className="text-xs opacity-60 mt-1">Levantado en {p.folio}</div>
                      {p.descripcion ? <div className="text-sm opacity-75 mt-2">{p.descripcion}</div> : null}
                      <div className="font-extrabold text-sm mt-3">¿Quedó solucionado?</div>
                      <div className="grid grid-cols-2 gap-2 mt-2" role="radiogroup">
                        {(
                          [
                            [true, "Sí"],
                            [false, "No"],
                          ] as const
                        ).map(([valor, texto]) => {
                          const activo = dicho === valor;
                          return (
                            <button
                              key={texto}
                              type="button"
                              role="radio"
                              aria-checked={activo}
                              onClick={() => setResoluciones((prev) => ({ ...prev, [p.id]: valor }))}
                              className="min-h-12 border border-black/[.35] font-extrabold text-sm cursor-pointer"
                              style={{
                                background: activo ? "var(--color-text)" : "var(--color-bg)",
                                color: activo ? "var(--color-bg)" : "var(--color-text)",
                              }}
                            >
                              {texto}
                            </button>
                          );
                        })}
                      </div>
                      {dicho === false ? (
                        <p className="m-0 mt-2 text-xs opacity-70">Vuelve a quedar abierto para coordinación.</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="font-extrabold text-sm mt-5">¿Surgió algún problema nuevo?</div>
              <p className="m-0 mt-1 text-[13px] opacity-60">Si encontraste otro, agrégalo abajo aunque los de arriba hayan quedado solucionados.</p>
            </div>
          ) : null}
          <p className="m-0 mb-3.5 text-[13px] opacity-60">Cada problema se llena en su propia ficha para no saturar esta pantalla.</p>
          <div className="flex flex-col gap-2.5">
            {problemas.map((p, i) => (
              <div key={p.id} className="bg-[var(--color-surface-3)] border border-[var(--color-divider)] border-l-4 border-l-[var(--color-accent)] px-3.5 py-3">
                <div className="text-[10px] tracking-[.1em] uppercase text-[var(--color-accent-active)]">Problema {i + 1}</div>
                <div className="font-extrabold text-base leading-[1.25] mt-2">{nombreProblema(p.codigo)}</div>
                {p.items.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {p.items.map((z) => (
                      <span
                        key={z.etiqueta}
                        className="max-w-full px-2.5 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2] tabular-nums"
                      >
                        {z.etiqueta} × {z.cantidad}
                      </span>
                    ))}
                  </div>
                ) : null}
                {p.desc ? <div className="text-sm opacity-75 mt-2">{p.desc}</div> : null}
                <button
                  onClick={() => {
                    setNp({ codigo: p.codigo, items: p.items.map((z) => ({ ...z })), desc: p.desc, editando: p.id });
                    setSheet("problema");
                  }}
                  className="min-h-10 mt-2 mr-4 p-0 bg-transparent border-0 text-[var(--color-text)] font-extrabold text-xs underline underline-offset-[3px] cursor-pointer"
                >
                  Corregir
                </button>
                <button
                  onClick={() =>
                    setConfirmar({
                      titulo: "¿Quitar este problema?",
                      texto: `Se borra de esta visita lo que anotaste sobre «${nombreProblema(p.codigo)}».`,
                      cta: "Quitar problema",
                      accion: () => setProblemas((prev) => prev.filter((x) => x.id !== p.id)),
                    })
                  }
                  className="min-h-10 mt-2 p-0 bg-transparent border-0 text-[var(--color-accent-active)] text-xs underline underline-offset-[3px] cursor-pointer"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => {
              setNp({ codigo: "", items: [], desc: "", editando: null });
              setSheet("problema");
            }}
            className="w-full min-h-[54px] flex items-center gap-2.5 px-4 mt-3 bg-transparent border border-dashed border-black/[.5] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.06]"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>{porResolver.length ? "Agregar un problema nuevo" : "Agregar un problema"}</span>
          </button>
          <div className="mt-2.5">
            <BotonGuardar
              texto={problemas.length ? `Guardar ${problemas.length} problema${problemas.length > 1 ? "s" : ""} y seguir` : "Sin problemas · seguir"}
              habilitado
              onClick={() => guardarSeccion("problemas")}
            />
          </div>
        </Cuerpo>
      ) : null}
    </>
  );
}
