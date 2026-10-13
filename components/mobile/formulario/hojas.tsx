"use client";

import Sheet from "@/components/mobile/Sheet";
import { agruparPorSeccion, hayAlgunaSeccion } from "@/lib/ui/secciones";
import SeccionPlegable from "@/components/ui/SeccionPlegable";
import { Campo, Contador, PasoTitulo, entradaSheet } from "@/components/mobile/formulario/piezas";
import type { FormularioVisitaApi } from "@/components/mobile/formulario/useFormularioVisita";
import { nuevoId } from "@/components/mobile/formulario/ids";

// Las hojas que suben desde abajo para agregar un trabajo realizado o un
// problema.

export function HojaTrabajo({ fv }: { fv: FormularioVisitaApi }) {
  const {
    aviso,
    setGuardadas,
    setTrabajos,
    sheet,
    setSheet,
    nt,
    setNt,
    nombreTrabajo,
    nombreMotivo,
    trbSel,
    ofrecidos,
    yaAgregado,
    filaTrabajo,
  } = fv;
  return (
    <>
      {/* ── Hoja: agregar trabajo realizado ── */}
      {sheet === "trabajo" ? (
        <Sheet titulo={`Trabajo realizado · ${nombreMotivo(nt.motivo)}`} onClose={() => setSheet(null)}>
          <div className="px-4 pt-4 pb-5.5 flex flex-col gap-4.5">
            {/* Tras agregar uno la hoja no se cierra: pregunta qué más se hizo,
                para que el técnico no tenga que volver a buscar el botón ni se
                confunda con lo que ya cargó. */}
            {nt.agregados.length > 0 ? (
              <div className="px-3.5 py-3 bg-[var(--color-accent-100)] border-l-4 border-[var(--color-accent)]">
                <div className="text-[10px] tracking-[.12em] uppercase text-[var(--color-accent-800)]">
                  Ya agregaste
                </div>
                <div className="text-sm font-extrabold mt-1">{nt.agregados.map(nombreTrabajo).join(" · ")}</div>
              </div>
            ) : null}
            <div>
              <PasoTitulo n="1" texto={ofrecidos.some((t) => yaAgregado(t.codigo)) ? "¿Qué más hiciste?" : "¿Qué trabajo hiciste?"} />
              <div className="flex flex-col gap-1.5">
                {hayAlgunaSeccion(ofrecidos)
                  ? agruparPorSeccion(ofrecidos).map((g) => {
                      const marcadosAca = g.items.filter((t) => nt.codigo === t.codigo || yaAgregado(t.codigo)).length;
                      return (
                        <SeccionPlegable
                          key={g.nombre ?? "__sin"}
                          titulo={g.nombre ?? "Sin sección"}
                          total={g.items.length}
                          marcados={marcadosAca}
                          abiertaInicial={marcadosAca > 0}
                          tono="movil"
                        >
                          <div className="flex flex-col gap-1.5">{g.items.map(filaTrabajo)}</div>
                        </SeccionPlegable>
                      );
                    })
                  : ofrecidos.map(filaTrabajo)}
                {ofrecidos.length === 0 ? (
                  <div className="px-3.5 py-3 border border-dashed border-black/[.4] text-[13px] opacity-70">
                    El checklist no tiene trabajos para este motivo. Avisa a coordinación.
                  </div>
                ) : null}
              </div>
            </div>

            {trbSel && trbSel.subtrabajos.length > 0 ? (
              <div>
                <PasoTitulo n="2" texto={trbSel.grupoLabel ?? "Subtrabajos"} />
                <div className="flex flex-col gap-1.5">
                  {trbSel.subtrabajos.map((s) => {
                    const marcado = nt.subs.find((x) => x.etiqueta === s.etiqueta);
                    const activo = !!marcado;
                    return (
                      <div key={s.id} className="flex items-stretch gap-2">
                        <button
                          onClick={() =>
                            setNt((p) => ({
                              ...p,
                              subs: activo
                                ? p.subs.filter((x) => x.etiqueta !== s.etiqueta)
                                : [...p.subs, { etiqueta: s.etiqueta, cantidad: 1 }],
                            }))
                          }
                          className="flex-1 min-w-0 min-h-[54px] flex items-center gap-3 px-3.5 text-[15px] leading-[1.2] text-[var(--color-text)] cursor-pointer text-left hover:brightness-95"
                          style={{
                            background: activo ? "var(--color-accent-100)" : "var(--color-surface-3)",
                            border: `1px solid ${activo ? "var(--color-accent)" : "rgba(32,30,29,.35)"}`,
                            fontWeight: activo ? 800 : 400,
                          }}
                        >
                          <span
                            className="w-[18px] h-[18px] flex-none border-2 border-[var(--color-text)] grid place-items-center"
                            style={{ background: activo ? "var(--color-text)" : "transparent" }}
                          >
                            {activo ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f3f2f2" strokeWidth="3.2">
                                <path d="M4 12l5 5L20 6" />
                              </svg>
                            ) : null}
                          </span>
                          <span className="flex-1 min-w-0">{s.etiqueta}</span>
                        </button>
                        {/* El contador solo aparece si el checklist dice que esta
                            opción lleva cantidad; si no, se marca y punto. */}
                        {activo && s.permiteCantidad ? (
                          <Contador
                            valor={marcado.cantidad}
                            onCambiar={(d) =>
                              setNt((p) => ({
                                ...p,
                                subs: p.subs.map((x) =>
                                  x.etiqueta === s.etiqueta
                                    ? { ...x, cantidad: Math.min(99, Math.max(1, x.cantidad + d)) }
                                    : x
                                ),
                              }))
                            }
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <button
              onClick={() => {
                if (!nt.codigo) return aviso("Elige el trabajo realizado");
                if (trbSel && trbSel.subtrabajos.length > 0 && nt.subs.length === 0) {
                  return aviso(`Marca al menos un ${trbSel.singular ?? "subtrabajo"}`);
                }
                setTrabajos((prev) => [
                  ...prev,
                  { id: nuevoId(), codigo: nt.codigo, motivo: nt.motivo, subs: nt.subs.map((x) => ({ ...x })), detalle: "" },
                ]);
                setGuardadas((g) => ({ ...g, motivo: false }));
                // La hoja queda abierta preguntando "¿Qué más hiciste?".
                setNt((p) => ({ ...p, codigo: "", subs: [], agregados: [...p.agregados, p.codigo] }));
                aviso(`${nombreTrabajo(nt.codigo)} agregado · ¿qué más hiciste?`);
              }}
              className="w-full min-h-[58px] flex items-center justify-between px-4.5 border-0 font-extrabold text-base cursor-pointer text-left hover:brightness-95"
              style={{
                background: nt.codigo ? "var(--color-accent)" : "#8f8b8b",
                color: nt.codigo ? "var(--color-bg)" : "var(--color-surface-3)",
              }}
            >
              <span>Agregar a la visita</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            {nt.agregados.length > 0 ? (
              <button
                onClick={() => setSheet(null)}
                className="w-full min-h-[50px] px-4 -mt-2 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
              >
                Listo, no hice nada más
              </button>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

export function HojaProblema({ fv }: { fv: FormularioVisitaApi }) {
  const {
    catalogoProblema,
    aviso,
    setAbierta,
    setGuardadas,
    setProblemas,
    sheet,
    setSheet,
    np,
    setNp,
    probSel,
    probTieneOpciones,
    probListo,
    cambiarCantidad,
  } = fv;
  return (
    <>
      {/* ── Hoja: agregar un problema ── */}
      {sheet === "problema" ? (
        <Sheet titulo={np.editando === null ? "Nuevo problema" : "Corregir problema"} onClose={() => setSheet(null)}>
          <div className="p-4 flex flex-col gap-3.5">
            <div>
              <PasoTitulo n="1" texto="¿Qué tipo de problema es?" />
              <div className="flex flex-col gap-1.5">
                {catalogoProblema.map((t) => {
                  const activo = np.codigo === t.codigo;
                  return (
                    <button
                      key={t.codigo}
                      onClick={() => setNp((p) => ({ ...p, codigo: t.codigo, items: [] }))}
                      className="w-full min-h-[54px] flex items-center gap-3 px-3.5 font-extrabold text-[15px] leading-[1.3] cursor-pointer text-left"
                      style={{
                        background: activo ? "var(--color-text)" : "var(--color-surface-3)",
                        color: activo ? "var(--color-bg)" : "var(--color-text)",
                        border: `1px solid ${activo ? "var(--color-text)" : "rgba(32,30,29,.35)"}`,
                      }}
                    >
                      <span className="w-[18px] h-[18px] flex-none border-2 border-current grid place-items-center">
                        {activo ? <span className="w-2 h-2 bg-current" /> : null}
                      </span>
                      <span className="flex-1 min-w-0">{t.nombre}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {probSel && probSel.opciones.length > 0 ? (
              <div className="border-t border-black/[.3] pt-4">
                <PasoTitulo n="2" texto={probSel.grupoLabel ?? "Detalle"} />
                <p className="m-0 mb-3 ml-[33px] text-[13px] opacity-60">
                  {probSel.ayuda ?? `Marca ${(probSel.grupoLabel ?? "el detalle").toLowerCase()} y ajusta la cantidad.`}
                </p>
                <div className="flex flex-col gap-2">
                  {probSel.opciones.map((o) => {
                    const item = np.items.find((x) => x.etiqueta === o.etiqueta);
                    const activo = !!item;
                    return (
                      <div key={o.id} className="flex items-stretch gap-2">
                        <button
                          onClick={() =>
                            setNp((p) => ({
                              ...p,
                              items: activo
                                ? p.items.filter((x) => x.etiqueta !== o.etiqueta)
                                : [...p.items, { etiqueta: o.etiqueta, cantidad: 1 }],
                            }))
                          }
                          className="flex-1 min-w-0 min-h-[58px] flex items-center gap-3 px-3.5 text-base leading-[1.3] text-[var(--color-text)] cursor-pointer text-left"
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
                          <span className="flex-1 min-w-0">{o.etiqueta}</span>
                        </button>
                        {activo && o.permiteCantidad ? (
                          <Contador valor={item!.cantidad} onCambiar={(d) => cambiarCantidad(o.etiqueta, d)} alto />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 mb-0 text-xs opacity-62">
                  Toca para marcar. Las opciones que llevan cantidad muestran − y + al marcarlas.
                </p>
              </div>
            ) : null}

            <Campo label={probTieneOpciones ? "Nota corta" : "Qué encontraste"} htmlFor="p-desc" extra={probTieneOpciones ? "(opcional)" : undefined}>
              <textarea
                id="p-desc"
                rows={2}
                value={np.desc}
                onChange={(e) => setNp((p) => ({ ...p, desc: e.target.value }))}
                autoComplete="off"
                placeholder="Ej: las placas del pórtico 1 están quemadas"
                className={`${entradaSheet} min-h-[96px] leading-[1.4] resize-y`}
              />
            </Campo>

            <button
              onClick={() => {
                if (!np.codigo) return aviso("Elige primero el tipo de problema");
                if (probTieneOpciones && np.items.length === 0) {
                  return aviso(`Marca al menos un ${probSel?.singular ?? "detalle"}`);
                }
                if (!probTieneOpciones && !np.desc.trim()) return aviso("Escribe qué encontraste");
                if (np.editando === null) {
                  setProblemas((prev) => [
                    ...prev,
                    { id: nuevoId(), codigo: np.codigo, items: [...np.items], desc: np.desc.trim(), sol: "", estado: "ABIERTO" },
                  ]);
                } else {
                  // Se corrige en su misma fila: conserva su id de la base y su estado.
                  setProblemas((prev) =>
                    prev.map((x) =>
                      x.id === np.editando ? { ...x, codigo: np.codigo, items: [...np.items], desc: np.desc.trim() } : x
                    )
                  );
                }
                setGuardadas((g) => ({ ...g, problemas: false }));
                setSheet(null);
                setAbierta("problemas");
                aviso(np.editando === null ? "Problema agregado a la ficha" : "Problema corregido");
              }}
              className="w-full min-h-[58px] flex items-center justify-between px-4.5 border-0 font-extrabold text-base cursor-pointer text-left hover:brightness-95"
              style={{
                background: probListo ? "var(--color-accent)" : "#8f8b8b",
                color: probListo ? "var(--color-bg)" : "var(--color-surface-3)",
              }}
            >
              <span>{np.editando === null ? "Agregar a la visita" : "Guardar la corrección"}</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
