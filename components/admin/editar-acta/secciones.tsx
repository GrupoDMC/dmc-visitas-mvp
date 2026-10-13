"use client";

import Tag from "@/components/Tag";
import SelectBuscable from "@/components/ui/SelectBuscable";
import EstadoProblemaTag from "@/components/EstadoProblemaTag";
import { fechaHoraCorta } from "@/lib/ui/edicion";
import { fmtRut, fmtTel } from "@/lib/ui/formato";
import { trabajosDelMotivo } from "@/lib/ui/motivos";
import { agruparPorSeccion, hayAlgunaSeccion } from "@/lib/ui/secciones";
import SeccionPlegable from "@/components/ui/SeccionPlegable";
import { BotonAgregar, BotonQuitar, ListaMarcable, Seccion } from "@/components/admin/editar-acta/piezas";
import type { EditarActaApi } from "@/components/admin/editar-acta/useEditarActa";

// La edición del acta, de arriba hacia abajo: de qué acta se trata, el
// responsable, motivos y trabajo realizado, y problemas.

/** De qué acta se trata, y las reglas del juego en una línea. */
export function Encabezado({ fv }: { fv: EditarActaApi }) {
  const { visita, ejec } = fv;
  return (
    <>
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
    </>
  );
}

/** 1 · Responsable. */
export function SeccionResponsable({ fv }: { fv: EditarActaApi }) {
  const {
    respNombre,
    setRespNombre,
    respRut,
    setRespRut,
    respTel,
    setRespTel,
    cargos,
    respCargo,
    setRespCargo,
    errorRut,
    cambio,
  } = fv;
  return (
    <>
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
          {cargos.length > 0 || respCargo ? (
            <div className="field min-w-0">
              <label htmlFor="ea-cargo">Cargo (opcional)</label>
              <SelectBuscable
                id="ea-cargo"
                valor={respCargo}
                opciones={[
                  { v: "", t: "Sin cargo" },
                  ...cargos.map((c) => ({ v: c.nombre, t: c.nombre })),
                  // Un cargo que ya salió del checklist se conserva mientras no se cambie.
                  ...(respCargo && !cargos.some((c) => c.nombre === respCargo) ? [{ v: respCargo, t: respCargo }] : []),
                ]}
                onChange={setRespCargo}
                ariaLabel="Cargo del responsable"
              />
            </div>
          ) : null}
        </div>
      </Seccion>
    </>
  );
}

/** 2 · Motivos y trabajo realizado. */
export function SeccionTrabajo({ fv }: { fv: EditarActaApi }) {
  const {
    motivos,
    catalogoTrabajo,
    nuevoId,
    motivosCodigos,
    setMotivosCodigos,
    trabajos,
    setTrabajos,
    obs,
    setObs,
    agendados,
    nombreMotivo,
    nombreTrabajo,
    motivoDe,
    motivosMarcados,
    cambiarSubs,
    quitarMotivo,
    cambio,
  } = fv;
  return (
    <>
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
            const porAgregar = trabajosDelMotivo(catalogoTrabajo, codigo).filter(
              (t) => !suyos.some((x) => x.codigo === t.codigo)
            );
            return (
              <div key={codigo} className="border border-[var(--color-divider-soft)] border-l-4 border-l-[var(--color-accent)] bg-white">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-divider-faint)]">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] tracking-[.12em] uppercase text-[var(--color-accent-active)]">Motivo</div>
                    <div className="font-extrabold text-[16px] leading-[1.25] mt-0.5">{nombreMotivo(codigo)}</div>
                  </div>
                  {agendados.includes(codigo) ? (
                    <span className="tag tag-neutral flex-none" title="Lo agendó coordinación">
                      Agendado
                    </span>
                  ) : null}
                  <BotonQuitar
                    etiqueta={`Quitar el motivo ${nombreMotivo(codigo)}${suyos.length ? " y sus trabajos" : ""}`}
                    onClick={() => quitarMotivo(codigo)}
                  />
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
                        opciones={agruparPorSeccion(porAgregar)
                          .flatMap((g) => g.items)
                          .map((c) => ({ v: c.codigo, t: c.seccion ? `${c.seccion} · ${c.nombre}` : c.nombre }))}
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
              {(() => {
                const faltan = motivos.filter((m) => !motivosCodigos.includes(m.codigo));
                const chip = (m: (typeof faltan)[number]) => (
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
                );
                return hayAlgunaSeccion(faltan) ? (
                  <div className="flex flex-col gap-1.5 max-w-[560px]">
                    {agruparPorSeccion(faltan).map((g) => (
                      <SeccionPlegable key={g.nombre ?? "__sin"} titulo={g.nombre ?? "Sin sección"} total={g.items.length}>
                        <div className="flex flex-wrap gap-2">{g.items.map(chip)}</div>
                      </SeccionPlegable>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">{faltan.map(chip)}</div>
                );
              })()}
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
    </>
  );
}

/** 3 · Problemas. */
export function SeccionProblemas({ fv }: { fv: EditarActaApi }) {
  const { catalogoProblema, nuevoId, problemas, setProblemas, nombreProblema, cambiarProblema, cambio } = fv;
  return (
    <>
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
    </>
  );
}
