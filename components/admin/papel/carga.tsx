"use client";

import Link from "next/link";
import Dialogo from "@/components/admin/Dialogo";
import SelectBuscable from "@/components/ui/SelectBuscable";
import { faltante } from "@/components/admin/papel/modelo";
import { BloqueTienda, BotonQuitar, Flecha } from "@/components/admin/papel/piezas";
import type { VisitasPapelApi } from "@/components/admin/papel/useVisitasPapel";

// Lo que se ve de la carga de visitas en papel: el año, los recuadros de cada
// técnico, la barra para guardar y los diálogos.

/** La explicación, el año y lo que ya quedó guardado. */
export function EncabezadoPapel({ fv }: { fv: VisitasPapelApi }) {
  const { anio, setAnio, guardados, tecnicosLibres, agregarTecnico, anios } = fv;
  return (
    <>
      <p className="text-[13px] leading-[1.55] opacity-75 max-w-[760px]">
        Para pasar al sistema los informes que se hicieron a mano. Cada informe entra como visita{" "}
        <strong>completada</strong>, con el folio del año del informe, sin fotos, video ni firma dibujada. Lo que
        escribes se guarda en este navegador hasta que lo guardes en el sistema.
      </p>

      <div className="mt-5 border border-black/[.3]">
        <div className="grid grid-cols-1 sm:grid-cols-[200px_minmax(0,360px)] gap-4 p-3.5">
          <div className="field min-w-0">
            <label htmlFor="pp-anio">Año</label>
            <select
              id="pp-anio"
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              className="input appearance-none tabular-nums"
            >
              {anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="field min-w-0">
            <label htmlFor="pp-tecnico">Agregar técnico</label>
            <SelectBuscable
              id="pp-tecnico"
              valor=""
              opciones={tecnicosLibres}
              onChange={agregarTecnico}
              placeholder={tecnicosLibres.length ? "Elige el técnico…" : "Ya están todos"}
              ariaLabel="Agregar técnico"
            />
          </div>
        </div>
      </div>

      {guardados.length ? (
        <details className="mt-5 border border-[var(--color-divider-soft)] bg-[var(--color-surface)]">
          <summary className="px-3.5 py-2.5 cursor-pointer text-[13px]">
            <strong>{guardados.length}</strong> {guardados.length === 1 ? "informe guardado" : "informes guardados"} en
            esta sesión
          </summary>
          <ul className="px-3.5 pb-3 m-0 list-none grid gap-1 text-[13px] max-h-60 overflow-y-auto">
            {guardados.map((g) => (
              <li key={g.folio} className="flex gap-2">
                <Link href={`/admin/visitas/${encodeURIComponent(g.folio)}`} className="font-extrabold tabular-nums underline">
                  {g.folio}
                </Link>
                <span className="opacity-75 truncate">{g.nombre}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

/** Un recuadro por técnico, con sus clientes, tiendas e informes. */
export function RecuadrosTecnicos({ fv }: { fv: VisitasPapelApi }) {
  const {
    ref,
    hoy,
    anio,
    bloques,
    grupos,
    tiendas,
    informes,
    setPorQuitar,
    firmantesPrevios,
    opcMotivos,
    catalogoTrabajos,
    nombreCliente,
    nombreTecnico,
    sucursal,
    informesDe,
    cambiarBloque,
    quitarGrupos,
    quitarBloque,
    agregarCliente,
    cambiarGrupo,
    duplicarInforme,
    agregarTiendas,
    agregarInforme,
    cambiarTienda,
    quitarTienda,
    cambiarInforme,
    quitarInforme,
  } = fv;
  return (
    <>
      {bloques.length === 0 ? (
        <div className="mt-5 px-3.5 py-6 border border-dashed border-[var(--color-divider)] text-[13px] opacity-70">
          Elige el año y agrega un técnico: dentro de su recuadro van sus clientes, sus tiendas y los informes.
        </div>
      ) : null}

      {bloques.map((b) => {
        const gruposDelTecnico = grupos.filter((g) => g.tecnicoId === b.tecnicoId);
        const clientesLibres = ref.clientes
          .filter((c) => !gruposDelTecnico.some((g) => g.clienteId === String(c.id)))
          .map((c) => ({ v: String(c.id), t: c.activo ? c.nombreFantasia : `${c.nombreFantasia} (inactivo)` }));
        const delTecnico = informesDe({ tecnicoId: b.tecnicoId });
        const incompletosTecnico = delTecnico.filter((i) => faltante(i, anio, hoy)).length;
        const nombreTec = nombreTecnico(b.tecnicoId);

        return (
          <section key={b.tecnicoId} className="mt-6 border-2 border-[var(--color-text)]">
            <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[var(--color-text)] text-[var(--color-bg)]">
              <button
                type="button"
                aria-expanded={b.abierto}
                onClick={() => cambiarBloque(b.tecnicoId, { abierto: !b.abierto })}
                className="flex-1 min-w-0 flex items-center gap-2.5 min-h-10 bg-transparent border-0 cursor-pointer text-inherit text-left"
              >
                <Flecha abierto={b.abierto} />
                <span className="text-[10px] tracking-[.14em] uppercase opacity-70 flex-none">Técnico</span>
                <span className="font-extrabold text-[17px] truncate">{nombreTec}</span>
                <span className="text-[11px] tracking-[.06em] uppercase opacity-70 tabular-nums flex-none">
                  {gruposDelTecnico.length} {gruposDelTecnico.length === 1 ? "cliente" : "clientes"} · {delTecnico.length}{" "}
                  {delTecnico.length === 1 ? "informe" : "informes"}
                </span>
                {incompletosTecnico ? <span className="tag tag-accent flex-none">{incompletosTecnico} sin completar</span> : null}
              </button>
              <button
                type="button"
                onClick={() =>
                  setPorQuitar({
                    titulo: `¿Quitar a ${nombreTec} y sus informes?`,
                    cta: "Sí, quitar",
                    accion: () => quitarBloque(b.tecnicoId),
                  })
                }
                className="btn btn-icon w-8 h-8 flex-none border border-current text-inherit"
                aria-label={`Quitar a ${nombreTec} y sus informes`}
                title={`Quitar a ${nombreTec} y sus informes`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {b.abierto ? (
              <div className="p-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="field min-w-0">
                    <label htmlFor={`pp-cli-${b.tecnicoId}`}>Agregar cliente</label>
                    <SelectBuscable
                      id={`pp-cli-${b.tecnicoId}`}
                      valor=""
                      opciones={clientesLibres}
                      onChange={(v) => agregarCliente(b.tecnicoId, v)}
                      placeholder={clientesLibres.length ? "Elige el cliente…" : "Ya están todos"}
                      ariaLabel={`Agregar cliente a ${nombreTec}`}
                    />
                  </div>
                </div>

                {gruposDelTecnico.length === 0 ? (
                  <div className="mt-3.5 px-3.5 py-4 border border-dashed border-[var(--color-divider)] text-[13px] opacity-70">
                    Agrega un cliente de {nombreTec} para empezar con sus tiendas.
                  </div>
                ) : null}

                {gruposDelTecnico.map((g) => {
                  const tiendasDelGrupo = tiendas.filter((t) => t.grupoKey === g.key);
                  const libres = ref.sucursales
                    .filter(
                      (s) =>
                        String(s.clienteId) === g.clienteId &&
                        (!g.mallId || String(s.mallId ?? "") === g.mallId) &&
                        !tiendasDelGrupo.some((t) => t.sucursalId === String(s.id))
                    )
                    .map((s) => ({ v: String(s.id), t: s.activo ? s.nombre : `${s.nombre} (inactiva)` }));
                  // Solo los malls donde el cliente tiene tiendas.
                  const mallsDelCliente = ref.malls
                    .filter((m) => ref.sucursales.some((s) => String(s.clienteId) === g.clienteId && s.mallId === m.id))
                    .map((m) => ({ v: String(m.id), t: m.nombre }));
                  const delGrupo = informesDe({ grupoKey: g.key });
                  const incompletos = delGrupo.filter((i) => faltante(i, anio, hoy)).length;
                  const nombre = nombreCliente(g.clienteId);

                  return (
                    <div key={g.key} className="mt-3.5 border-2 border-black/[.45]">
                      <div className="flex items-center gap-2 px-3.5 py-2 bg-[var(--color-surface)]">
                        <button
                          type="button"
                          aria-expanded={g.abierto}
                          onClick={() => cambiarGrupo(g.key, { abierto: !g.abierto })}
                          className="flex-1 min-w-0 flex items-center gap-2.5 min-h-10 bg-transparent border-0 cursor-pointer text-[var(--color-text)] text-left"
                        >
                          <Flecha abierto={g.abierto} />
                          <span className="font-extrabold text-[16px] truncate">{nombre}</span>
                          <span className="text-[11px] tracking-[.06em] uppercase opacity-66 tabular-nums flex-none">
                            {tiendasDelGrupo.length} {tiendasDelGrupo.length === 1 ? "tienda" : "tiendas"} · {delGrupo.length}{" "}
                            {delGrupo.length === 1 ? "informe" : "informes"}
                          </span>
                          {incompletos ? <span className="tag tag-accent flex-none">{incompletos} sin completar</span> : null}
                        </button>
                        <BotonQuitar
                          label={`Quitar ${nombre}${delGrupo.length ? " y sus informes" : ""}`}
                          onClick={() =>
                            setPorQuitar({
                              titulo: `¿Quitar ${nombre}${delGrupo.length ? " y sus informes" : ""}?`,
                              cta: "Sí, quitar",
                              accion: () => quitarGrupos(new Set([g.key])),
                            })
                          }
                        />
                      </div>

                      {g.abierto ? (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-3.5 py-3 border-t border-[var(--color-divider-soft)]">
                            <div className="field min-w-0">
                              <label htmlFor={`pp-mall-${g.key}`}>Mall (opcional)</label>
                              <SelectBuscable
                                id={`pp-mall-${g.key}`}
                                valor={g.mallId}
                                opciones={[{ v: "", t: "Todas las tiendas del cliente" }, ...mallsDelCliente]}
                                onChange={(v) => cambiarGrupo(g.key, { mallId: v })}
                                placeholder="Todas las tiendas del cliente"
                                ariaLabel="Filtrar por mall"
                              />
                            </div>
                            <div className="field min-w-0">
                              <label htmlFor={`pp-tienda-${g.key}`}>Agregar tienda</label>
                              <SelectBuscable
                                id={`pp-tienda-${g.key}`}
                                valor=""
                                opciones={libres}
                                onChange={(v) => agregarTiendas(g.key, [v])}
                                placeholder={libres.length ? "Escribe el nombre y se agrega…" : "No quedan tiendas por agregar"}
                                ariaLabel="Agregar tienda"
                              />
                            </div>
                            {g.mallId && libres.length > 1 ? (
                              <div className="sm:col-span-2 -mt-1">
                                <button
                                  type="button"
                                  onClick={() => agregarTiendas(g.key, libres.map((s) => s.v))}
                                  className="btn btn-secondary min-h-9 px-3 text-[13px]"
                                >
                                  Agregar las {libres.length} tiendas del mall
                                </button>
                              </div>
                            ) : null}
                          </div>

                          {tiendasDelGrupo.map((t) => (
                            <BloqueTienda
                              key={t.key}
                              tienda={t}
                              nombre={sucursal(t.sucursalId)?.nombre ?? ""}
                              informes={informes.filter((i) => i.tiendaKey === t.key)}
                              anio={anio}
                              hoy={hoy}
                              opcMotivos={opcMotivos}
                              catalogoTrabajos={catalogoTrabajos}
                              onAlternar={() => cambiarTienda(t.key, { abierto: !t.abierto })}
                              onQuitar={() =>
                                setPorQuitar({
                                  titulo: `¿Quitar ${sucursal(t.sucursalId)?.nombre ?? "la tienda"} y sus informes?`,
                                  cta: "Sí, quitar",
                                  accion: () => quitarTienda(t.key),
                                })
                              }
                              firmantesPrevios={firmantesPrevios[t.sucursalId] ?? []}
                              onAgregarInforme={() => agregarInforme(t)}
                              onDuplicarInforme={duplicarInforme}
                              onCambiarInforme={cambiarInforme}
                              onQuitarInforme={(key) =>
                                setPorQuitar({
                                  titulo: "¿Quitar este informe?",
                                  cta: "Sí, quitar",
                                  accion: () => quitarInforme(key),
                                })
                              }
                            />
                          ))}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </>
  );
}

/** La barra fija de abajo para guardar lo completo. */
export function BarraGuardar({ fv }: { fv: VisitasPapelApi }) {
  const { anio, bloques, informes, guardando, setPorQuitar, completos, vaciar, pedirConfirmacion } = fv;
  return (
    <>
      {/* Barra fija para guardar */}
      {informes.length || guardando ? (
        <div className="fixed bottom-0 right-0 left-0 lg:left-[248px] z-20 bg-[var(--color-bg)] border-t-2 border-[var(--color-divider)] px-4 md:px-7 py-3 flex items-center gap-3 flex-wrap">
          <div className="text-[13px] tabular-nums">
            <strong>{completos}</strong> de {informes.length} {informes.length === 1 ? "informe completo" : "informes completos"}
            {" · "}
            {anio}
            {bloques.length > 1 ? ` · ${bloques.length} técnicos` : ""}
            {guardando ? (
              <span className="ml-2 opacity-70">
                · guardando {guardando.hechos}/{guardando.total}…
              </span>
            ) : null}
          </div>
          <button type="button" onClick={() => setPorQuitar({ titulo: "¿Vaciar toda la lista?", cta: "Sí, vaciar", accion: vaciar })} disabled={Boolean(guardando)} className="btn btn-ghost ml-auto">
            Vaciar la lista
          </button>
          <button
            type="button"
            onClick={pedirConfirmacion}
            disabled={Boolean(guardando) || completos === 0}
            className="btn btn-primary"
          >
            {guardando ? "Guardando…" : `Guardar ${completos} ${completos === 1 ? "informe" : "informes"}`}
          </button>
        </div>
      ) : null}
    </>
  );
}

/** Confirmar el guardado y confirmar lo que se quita. */
export function DialogosPapel({ fv }: { fv: VisitasPapelApi }) {
  const {
    hoy,
    anio,
    bloques,
    informes,
    confirmando,
    setConfirmando,
    porQuitar,
    setPorQuitar,
    nombreTecnico,
    completos,
    informesDe,
    guardar,
  } = fv;
  return (
    <>
      {confirmando ? (
        <Dialogo
          kicker="Visitas en papel · confirmar"
          titulo={`¿Guardar ${completos} ${completos === 1 ? "informe" : "informes"} de ${anio}?`}
          cta={`Sí, guardar ${completos}`}
          nota="Cada informe entra como visita completada, con su folio. Después se corrige desde «Editar acta»."
          campos={[]}
          form={{}}
          onCampo={() => {}}
          onCerrar={() => setConfirmando(false)}
          onGuardar={guardar}
        >
          <ul className="m-0 p-0 list-none grid gap-1.5 text-[14px]">
            {bloques.map((b) => {
              const del = informesDe({ tecnicoId: b.tecnicoId });
              const listos = del.filter((i) => !faltante(i, anio, hoy)).length;
              if (!del.length) return null;
              return (
                <li key={b.tecnicoId} className="flex gap-3 border-b border-[var(--color-divider-soft)] pb-1.5">
                  <span className="font-extrabold truncate">{nombreTecnico(b.tecnicoId)}</span>
                  <span className="ml-auto tabular-nums flex-none">
                    {listos} {listos === 1 ? "informe" : "informes"}
                  </span>
                </li>
              );
            })}
          </ul>
          {informes.length > completos ? (
            <p className="mt-3.5 mb-0 text-[13px] text-[var(--color-accent-800)]">
              {informes.length - completos} {informes.length - completos === 1 ? "informe incompleto queda" : "informes incompletos quedan"}{" "}
              en la lista sin guardarse.
            </p>
          ) : null}
        </Dialogo>
      ) : null}

      {porQuitar ? (
        <Dialogo
          kicker="Visitas en papel · quitar"
          titulo={porQuitar.titulo}
          cta={porQuitar.cta}
          nota="Se pierde lo que ya está escrito ahí. No se puede deshacer."
          campos={[]}
          form={{}}
          onCampo={() => {}}
          onCerrar={() => setPorQuitar(null)}
          onGuardar={() => {
            const { accion } = porQuitar;
            setPorQuitar(null);
            accion();
          }}
        />
      ) : null}
    </>
  );
}
