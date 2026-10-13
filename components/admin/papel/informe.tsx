"use client";

import SelectBuscable from "@/components/ui/SelectBuscable";
import type { FirmanteSugerido } from "@/app/actions/visitas-papel";
import { trabajoVaConMotivo } from "@/lib/ui/referencias";
import { trabajosDelMotivo } from "@/lib/ui/motivos";
import { agruparPorSeccion, hayAlgunaSeccion } from "@/lib/ui/secciones";
import SeccionPlegable from "@/components/ui/SeccionPlegable";
import { fmtRut, mensajeRut } from "@/lib/ui/formato";
import type { CatalogoTrabajo } from "@/lib/types";
import { type Informe, MESES, type TrabajoPapel, diasDelMes, dos } from "@/components/admin/papel/modelo";
import { BotonQuitar, Chip } from "@/components/admin/papel/piezas";

// Un informe en papel: cuándo, por qué, quién firmó, qué dice y los trabajos
// que se hicieron.

/** Un informe: cuándo, por qué, quién firmó y qué dice. */
export function FilaInforme({
  n,
  informe: inf,
  anio,
  hoy,
  opcMotivos,
  catalogoTrabajos,
  sugeridos,
  onCambiar,
  onDuplicar,
  onQuitar,
}: {
  n: number;
  informe: Informe;
  anio: number;
  hoy: string;
  opcMotivos: { v: string; t: string }[];
  catalogoTrabajos: CatalogoTrabajo[];
  sugeridos: FirmanteSugerido[];
  onCambiar: (key: string, cambios: Partial<Informe>) => void;
  onDuplicar: (informe: Informe) => void;
  onQuitar: (key: string) => void;
}) {
  const id = (k: string) => `pp-${inf.key}-${k}`;
  const poner = (k: keyof Informe) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onCambiar(inf.key, { [k]: e.target.value });
  const errorRut = mensajeRut(inf.rut);
  const hoyAnio = Number(hoy.slice(0, 4));
  const hoyMes = Number(hoy.slice(5, 7));
  // En el año en curso no se ofrecen meses que todavía no llegan.
  const meses = MESES.map((m, i) => ({ v: dos(i + 1), t: m })).filter((_, i) => anio < hoyAnio || i + 1 <= hoyMes);
  const dias = Array.from({ length: diasDelMes(anio, inf.mes) }, (_, i) => dos(i + 1));

  return (
    <div
      className="mt-2.5 border border-black/[.2] p-3"
      style={inf.error ? { background: "var(--color-accent-100)" } : { background: "var(--color-surface-3)" }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <span className="w-6 h-6 mb-2.5 flex-none grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-[11px] tabular-nums">
          {n}
        </span>
        <div className="field w-[150px]">
          <label htmlFor={id("mes")}>Mes</label>
          <select id={id("mes")} value={inf.mes} onChange={poner("mes")} className="input appearance-none">
            <option value="">Mes…</option>
            {meses.map((m) => (
              <option key={m.v} value={m.v}>
                {m.t}
              </option>
            ))}
          </select>
        </div>
        <div className="field w-[90px]">
          <label htmlFor={id("dia")}>Día</label>
          <select id={id("dia")} value={inf.dia} onChange={poner("dia")} className="input appearance-none tabular-nums">
            <option value="">Día…</option>
            {dias.map((d) => (
              <option key={d} value={d}>
                {Number(d)}
              </option>
            ))}
          </select>
        </div>
        <div className="field flex-1 min-w-[200px] border-l-4 border-[var(--color-text)] pl-2.5">
          <label htmlFor={id("motivo")} className="font-extrabold">
            Motivo de la visita
          </label>
          <SelectBuscable
            id={id("motivo")}
            valor={inf.motivo}
            opciones={opcMotivos}
            onChange={(v) =>
              // Los trabajos que no van con el motivo nuevo se sueltan.
              onCambiar(inf.key, {
                motivo: v,
                trabajos: (inf.trabajos ?? []).filter((t) => {
                  const c = catalogoTrabajos.find((x) => x.codigo === t.codigo);
                  return c ? trabajoVaConMotivo(c, v) : false;
                }),
              })
            }
            placeholder="Escribe para buscar el motivo…"
            ariaLabel="Motivo"
          />
        </div>
        <div className="mb-1 ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDuplicar(inf)}
            className="btn btn-secondary min-h-8 px-2.5 text-[12px]"
            title="Copia este informe con otro día"
          >
            Duplicar
          </button>
          <BotonQuitar label={`Quitar el informe ${n}`} onClick={() => onQuitar(inf.key)} />
        </div>
      </div>

      {inf.motivo ? (
        <TrabajosDelInforme
          motivo={inf.motivo}
          trabajos={inf.trabajos ?? []}
          catalogo={catalogoTrabajos}
          onCambiar={(trabajos) => onCambiar(inf.key, { trabajos })}
        />
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_170px_minmax(0,2fr)] gap-3 mt-3 sm:pl-9">
        <div className="field min-w-0">
          <label htmlFor={id("firmante")}>Firmó</label>
          <input
            id={id("firmante")}
            value={inf.firmante}
            list={id("firmantes")}
            onChange={(e) => {
              const nombre = e.target.value;
              // Si es uno de los sugeridos y el RUT está vacío, el RUT viene con él.
              const conocido = sugeridos.find((f) => f.nombre.toLowerCase() === nombre.trim().toLowerCase());
              onCambiar(inf.key, !inf.rut && conocido?.rut ? { firmante: nombre, rut: conocido.rut } : { firmante: nombre });
            }}
            placeholder="Nombre de quien firmó"
            autoComplete="off"
            className="input"
          />
          <datalist id={id("firmantes")}>
            {sugeridos.map((f) => (
              <option key={f.nombre} value={f.nombre}>
                {f.rut}
              </option>
            ))}
          </datalist>
        </div>
        <div className="field min-w-0">
          <label htmlFor={id("rut")}>RUT (opcional)</label>
          <input
            id={id("rut")}
            value={inf.rut}
            onChange={(e) => onCambiar(inf.key, { rut: fmtRut(e.target.value) })}
            placeholder="12.345.678-9"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="input tabular-nums"
          />
          {errorRut ? (
            <div className="text-[11px] leading-[1.4] mt-1.5 text-[var(--color-accent-800)]">
              {errorRut} Se guarda igual, tal como está en el papel.
            </div>
          ) : null}
        </div>
        <div className="field min-w-0 sm:col-span-2 lg:col-span-1">
          <label htmlFor={id("descripcion")}>Descripción / detalle</label>
          <textarea
            id={id("descripcion")}
            rows={2}
            value={inf.descripcion}
            onChange={poner("descripcion")}
            placeholder="Lo que dice el informe: el detalle de lo que se hizo o se encontró."
            className="input min-h-[42px] px-3 py-2 resize-y leading-[1.45]"
          />
        </div>
      </div>

      {inf.error || inf.repetida ? (
        <div className="mt-2 sm:pl-9 flex items-center gap-3 flex-wrap text-[12px] text-[var(--color-accent-800)]">
          {inf.error ? <span>{inf.error}</span> : null}
          {inf.repetida ? (
            <label className="flex items-center gap-1.5 cursor-pointer text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={Boolean(inf.aunqueRepetida)}
                onChange={(e) => onCambiar(inf.key, { aunqueRepetida: e.target.checked })}
              />
              Es otro informe: guardarlo igual
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Los trabajos del checklist que van con el motivo, como en el acta del
 * celular: se marca el trabajo y se despliegan sus subtrabajos para marcar lo
 * que se hizo, con cantidad donde el checklist la pide. Es opcional: la
 * descripción sigue estando para el detalle.
 */
export function TrabajosDelInforme({
  motivo,
  trabajos,
  catalogo,
  onCambiar,
}: {
  motivo: string;
  trabajos: TrabajoPapel[];
  catalogo: CatalogoTrabajo[];
  onCambiar: (trabajos: TrabajoPapel[]) => void;
}) {
  const delMotivo = trabajosDelMotivo(catalogo, motivo);
  if (delMotivo.length === 0) return null;

  const marcado = (codigo: string) => trabajos.find((t) => t.codigo === codigo);
  const alternarTrabajo = (codigo: string) =>
    onCambiar(marcado(codigo) ? trabajos.filter((t) => t.codigo !== codigo) : [...trabajos, { codigo, subs: [] }]);
  const cambiarSubs = (codigo: string, subs: TrabajoPapel["subs"]) =>
    onCambiar(trabajos.map((t) => (t.codigo === codigo ? { ...t, subs } : t)));

  const tarjeta = (t: (typeof delMotivo)[number]) => {
          const sel = marcado(t.codigo);
          const subsActivos = t.subtrabajos.filter((x) => x.activo);
          return (
            <div
              key={t.codigo}
              className="border"
              style={{
                borderColor: sel ? "var(--color-text)" : "rgba(32,30,29,.3)",
                background: sel ? "var(--color-surface)" : "transparent",
              }}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={Boolean(sel)}
                onClick={() => alternarTrabajo(t.codigo)}
                className="w-full min-h-10 px-2.5 flex items-center gap-2.5 bg-transparent border-0 cursor-pointer text-left text-[var(--color-text)]"
              >
                <span
                  className="w-[18px] h-[18px] flex-none grid place-items-center border-2"
                  style={{
                    borderColor: "var(--color-text)",
                    background: sel ? "var(--color-text)" : "transparent",
                    color: "var(--color-bg)",
                  }}
                >
                  {sel ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                      <path d="M4 12l5 5L20 6" />
                    </svg>
                  ) : null}
                </span>
                <span className="text-[14px] leading-[1.25]" style={{ fontWeight: sel ? 800 : 500 }}>
                  {t.nombre}
                </span>
                {sel && subsActivos.length ? (
                  <span className="ml-auto text-[11px] tabular-nums opacity-66 flex-none">
                    {sel.subs.length}/{subsActivos.length}
                  </span>
                ) : null}
              </button>

              {sel && subsActivos.length ? (
                <div className="px-2.5 pb-2.5 pt-1 border-t border-[var(--color-divider-soft)]">
                  <div className="text-[11px] tracking-[.06em] uppercase opacity-62 mb-1.5">
                    {t.grupoLabel ?? "Subtrabajos"}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {subsActivos.map((x) => {
                      const sub = sel.subs.find((y) => y.etiqueta === x.etiqueta);
                      return (
                        <div key={x.id} className="flex items-stretch">
                          <Chip
                            activo={Boolean(sub)}
                            onClick={() =>
                              cambiarSubs(
                                t.codigo,
                                sub
                                  ? sel.subs.filter((y) => y.etiqueta !== x.etiqueta)
                                  : [...sel.subs, { etiqueta: x.etiqueta, cantidad: 1 }]
                              )
                            }
                          >
                            {x.etiqueta}
                          </Chip>
                          {sub && x.permiteCantidad ? (
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={sub.cantidad}
                              aria-label={`Cantidad de ${x.etiqueta}`}
                              onChange={(e) =>
                                cambiarSubs(
                                  t.codigo,
                                  sel.subs.map((y) =>
                                    y.etiqueta === x.etiqueta
                                      ? { ...y, cantidad: Math.min(99, Math.max(1, Number(e.target.value) || 1)) }
                                      : y
                                  )
                                )
                              }
                              className="w-14 -ml-px px-2 border border-[var(--color-accent)] bg-[var(--color-surface)] text-[13px] tabular-nums text-center"
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          );
  };

  return (
    <div className="mt-3 sm:ml-9 pl-3 border-l-2 border-black/[.3]">
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[11px] tracking-[.09em] uppercase opacity-62">Trabajos realizados (opcional)</span>
        {trabajos.length ? (
          <span className="text-[11px] font-extrabold tabular-nums">{trabajos.length} marcados</span>
        ) : null}
      </div>
      {hayAlgunaSeccion(delMotivo) ? (
        <div className="flex flex-col gap-1.5">
          {agruparPorSeccion(delMotivo).map((g) => {
            const marcadosAca = g.items.filter((t) => marcado(t.codigo)).length;
            return (
              <SeccionPlegable
                key={g.nombre ?? "__sin"}
                etiqueta="Sección"
                titulo={g.nombre ?? "Sin sección"}
                total={g.items.length}
                marcados={marcadosAca}
                abiertaInicial={marcadosAca > 0}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{g.items.map(tarjeta)}</div>
              </SeccionPlegable>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{delMotivo.map(tarjeta)}</div>
      )}
    </div>
  );
}
