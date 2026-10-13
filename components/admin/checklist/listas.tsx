"use client";

import { Desplegable } from "@/components/admin/checklist/desplegables";
import { listaCorta, mover, reubicar } from "@/components/admin/checklist/modelo";
import { Arrastrable, Bloque, CajaSeccion, Vacio } from "@/components/admin/checklist/piezas";
import type { ChecklistEditorApi } from "@/components/admin/checklist/useChecklistEditor";

// Las listas 1 a 3 del checklist: motivos con sus trabajos, tipos de problema
// y todos los trabajos.

/** Lista 1 · Motivos y sus trabajos. */
export function ListaMotivos({ fv }: { fv: ChecklistEditorApi }) {
  const {
    motivos,
    seccionesMotivo,
    setSeccionesMotivo,
    plegadas,
    busqueda,
    editar,
    filtro,
    motivosVisibles,
    agregarMotivo,
    alternarSeccion,
    agregarSeccion,
    quitarSeccion,
    filaMotivo,
  } = fv;
  return (
    <>
      {/* Lista 1 · Motivos y sus trabajos */}
      <Bloque
        numero="Lista 1"
        titulo="Motivos y sus trabajos"
        bajada="Coordinación agenda la visita con uno o varios motivos, y bajo cada motivo el técnico registra lo que hizo eligiendo entre SUS trabajos, en este orden. Despliega un motivo para armar su lista. Agrupa los motivos en secciones (ej. «Visitas») y el celular y el panel los muestran plegables por sección. Un mismo trabajo puede ir en varios motivos: sus subtrabajos se editan una vez y valen en todos."
        cta="Nuevo motivo"
        onAgregar={() => agregarMotivo()}
        ctaExtra={{ label: "Nueva sección", onClick: () => agregarSeccion(setSeccionesMotivo) }}
      >
        {seccionesMotivo.length === 0 ? (
          <div className="flex flex-col gap-2.5">
            {motivosVisibles.map(({ m, i }) => filaMotivo(m, i, motivos.length, () => true, "todos"))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {seccionesMotivo.map((sec, si) => {
              const miembros = motivos.filter((m) => m.seccion === sec.key);
              const visibles = motivosVisibles.filter(({ m }) => m.seccion === sec.key);
              if (filtro && visibles.length === 0) return null;
              return (
                <CajaSeccion
                  key={sec.key}
                  nombre={sec.nombre}
                  phNombre="Ej: Visitas"
                  cuenta={`${miembros.length} ${miembros.length === 1 ? "motivo" : "motivos"}`}
                  abierta={!plegadas.has(sec.key) || !!filtro}
                  onToggle={() => alternarSeccion(sec.key)}
                  onRenombrar={(nombre) =>
                    editar(setSeccionesMotivo, (prev) => prev.map((x) => (x.key === sec.key ? { ...x, nombre } : x)))
                  }
                  onSubir={si > 0 && !filtro ? () => editar(setSeccionesMotivo, (prev) => mover(prev, si, -1)) : undefined}
                  onBajar={
                    si < seccionesMotivo.length - 1 && !filtro
                      ? () => editar(setSeccionesMotivo, (prev) => mover(prev, si, 1))
                      : undefined
                  }
                  onQuitar={() => quitarSeccion(sec, "motivos")}
                  cta="Nuevo motivo aquí"
                  onNuevo={() => agregarMotivo(sec.key)}
                >
                  {visibles.map(({ m }) =>
                    filaMotivo(
                      m,
                      miembros.findIndex((x) => x.key === m.key),
                      miembros.length,
                      (x) => x.seccion === sec.key,
                      sec.key
                    )
                  )}
                  {miembros.length === 0 ? (
                    <Vacio>Sección vacía: agrégale un motivo, o cámbialo de sección desde su fila.</Vacio>
                  ) : null}
                </CajaSeccion>
              );
            })}
            {(() => {
              const sueltos = motivos.filter((m) => !m.seccion);
              const visibles = motivosVisibles.filter(({ m }) => !m.seccion);
              if (sueltos.length === 0 || (filtro && visibles.length === 0)) return null;
              return (
                <CajaSeccion
                  fija
                  nombre="Sin sección"
                  cuenta={`${sueltos.length} ${sueltos.length === 1 ? "motivo" : "motivos"}`}
                  abierta={!plegadas.has("sin-motivo") || !!filtro}
                  onToggle={() => alternarSeccion("sin-motivo")}
                  cta="Nuevo motivo aquí"
                  onNuevo={() => agregarMotivo(null)}
                >
                  {visibles.map(({ m }) =>
                    filaMotivo(
                      m,
                      sueltos.findIndex((x) => x.key === m.key),
                      sueltos.length,
                      (x) => !x.seccion,
                      "sin"
                    )
                  )}
                </CajaSeccion>
              );
            })()}
          </div>
        )}
        {motivos.length === 0 ? (
          <Vacio>Sin motivos: el técnico no podría clasificar la visita, y coordinación no puede agendarla.</Vacio>
        ) : null}
        {motivos.length > 0 && motivosVisibles.length === 0 ? (
          <Vacio>Ningún motivo ni trabajo coincide con «{busqueda}».</Vacio>
        ) : null}
      </Bloque>
    </>
  );
}

/** Lista 2 · Tipos de problema. */
export function ListaTiposProblema({ fv }: { fv: ChecklistEditorApi }) {
  const {
    aviso,
    tipos,
    setTipos,
    abiertoTipo,
    setAbiertoTipo,
    setConfirmar,
    busqueda,
    editar,
    filtro,
    tiposVisibles,
    agregarGrupo,
    clonarGrupo,
    quitarGrupo,
  } = fv;
  return (
    <>
      {/* Lista 2 · Tipos de problema */}
      <Bloque
        numero="Lista 2"
        titulo="Tipos de problema"
        bajada="Lo que el técnico elige al levantar un problema. Despliega un tipo para editar sus subdetalles; sin subdetalles, el técnico escribe con sus palabras qué encontró."
        cta="Nuevo tipo"
        onAgregar={() => agregarGrupo(setTipos, setAbiertoTipo)}
      >
        {tiposVisibles.map(({ t, i }) => (
          <Arrastrable
            key={t.key}
            grupo="tipo"
            indice={i}
            total={tipos.length}
            bloqueado={!!filtro}
            onReordenar={(desde, ranura) => editar(setTipos, (prev) => reubicar(prev, desde, ranura))}
            onMover={(d) => editar(setTipos, (prev) => mover(prev, i, d))}
            className="mb-2.5"
          >
            {(agarre) => (
          <Desplegable
            agarre={agarre}
            n={i + 1}
            grupo={t}
            phNombre="Ej: Antena no detecta etiquetas"
            abierto={abiertoTipo === t.key}
            onToggle={() => setAbiertoTipo(abiertoTipo === t.key ? null : t.key)}
            resumen={
              t.items.length
                ? `${t.items.length} ${t.items.length === 1 ? "subdetalle" : "subdetalles"}`
                : "Sin subdetalle · el técnico escribe qué encontró"
            }
            etiquetaSingular="subdetalle"
            etiquetaPlural="subdetalles"
            tituloSub="Título del subdetalle"
            phSub="Ej: Antena afectada"
            phNueva="Ej: Cable de slave a master"
            vacioSub="Sin subdetalles: en el celular este tipo pide directamente una descripción escrita."
            onCambiar={(fn) => editar(setTipos, (prev) => prev.map((x) => (x.key === t.key ? fn(x) : x)))}
            onClonar={() => clonarGrupo(t, tipos, setTipos, setAbiertoTipo)}
            onQuitar={() => quitarGrupo(t, setTipos, "tipo de problema")}
            onConfirmarQuitarItem={setConfirmar}
            onAviso={aviso}
          />
            )}
          </Arrastrable>
        ))}
        {tipos.length === 0 ? (
          <Vacio grande>
            No hay tipos de problema. El técnico no podrá clasificar lo que encuentre hasta que agregues al menos uno.
          </Vacio>
        ) : null}
        {tipos.length > 0 && tiposVisibles.length === 0 ? (
          <Vacio>Ningún tipo de problema coincide con «{busqueda}».</Vacio>
        ) : null}
      </Bloque>
    </>
  );
}

/** Lista 3 · Todos los trabajos: la relación de la Lista 1, vista desde el trabajo. */
export function ListaTrabajos({ fv }: { fv: ChecklistEditorApi }) {
  const {
    seccionesTrabajo,
    setSeccionesTrabajo,
    plegadas,
    trabajos,
    setTrabajos,
    setAbiertoTrabajo,
    busqueda,
    editar,
    filtro,
    trabajosSinMotivo,
    trabajosVisibles,
    agregarGrupo,
    alternarSeccion,
    agregarSeccion,
    quitarSeccion,
    filaTrabajoL3,
  } = fv;
  return (
    <>
      {/* Lista 3 · Todos los trabajos (la misma relación de la Lista 1, vista desde el trabajo) */}
      <Bloque
        numero="Lista 3"
        titulo="Todos los trabajos"
        bajada="Los mismos trabajos de la Lista 1, vistos desde el otro lado: cada uno con los motivos donde aparece. Sirve para poner un trabajo en varios motivos de una vez y para encontrar los que quedaron sin motivo, que el técnico no ve. Agrupa los trabajos (con sus subtrabajos) en secciones: el técnico las ve plegables. El orden lo da cada motivo, no esta lista."
        cta="Nuevo trabajo"
        onAgregar={() => agregarGrupo(setTrabajos, setAbiertoTrabajo)}
        ctaExtra={{ label: "Nueva sección", onClick: () => agregarSeccion(setSeccionesTrabajo) }}
      >
        {trabajosSinMotivo.length > 0 ? (
          <div className="mb-3 px-3.5 py-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)] text-[13px] text-[var(--color-accent-800)] max-w-[720px]">
            {trabajosSinMotivo.length === 1 ? "1 trabajo no está" : `${trabajosSinMotivo.length} trabajos no están`} en
            ningún motivo y el técnico no {trabajosSinMotivo.length === 1 ? "lo" : "los"} ve:{" "}
            {listaCorta(trabajosSinMotivo.map((t) => t.nombre), 5)}. Despliégalo y marca sus motivos, o quítalo.
          </div>
        ) : null}
        {seccionesTrabajo.length === 0 ? (
          trabajosVisibles.map(({ t, i }) => filaTrabajoL3(t, i))
        ) : (
          <div className="flex flex-col gap-3">
            {seccionesTrabajo.map((sec, si) => {
              const miembros = trabajos.filter((t) => t.seccion === sec.key);
              const visibles = trabajosVisibles.filter(({ t }) => t.seccion === sec.key);
              if (filtro && visibles.length === 0) return null;
              return (
                <CajaSeccion
                  key={sec.key}
                  nombre={sec.nombre}
                  phNombre="Ej: Trabajos de antenas"
                  cuenta={`${miembros.length} ${miembros.length === 1 ? "trabajo" : "trabajos"}`}
                  abierta={!plegadas.has(sec.key) || !!filtro}
                  onToggle={() => alternarSeccion(sec.key)}
                  onRenombrar={(nombre) =>
                    editar(setSeccionesTrabajo, (prev) => prev.map((x) => (x.key === sec.key ? { ...x, nombre } : x)))
                  }
                  onSubir={si > 0 && !filtro ? () => editar(setSeccionesTrabajo, (prev) => mover(prev, si, -1)) : undefined}
                  onBajar={
                    si < seccionesTrabajo.length - 1 && !filtro
                      ? () => editar(setSeccionesTrabajo, (prev) => mover(prev, si, 1))
                      : undefined
                  }
                  onQuitar={() => quitarSeccion(sec, "trabajos")}
                  cta="Nuevo trabajo aquí"
                  onNuevo={() => agregarGrupo(setTrabajos, setAbiertoTrabajo, sec.key)}
                >
                  {visibles.map(({ t, i }) => filaTrabajoL3(t, i))}
                  {miembros.length === 0 ? (
                    <Vacio>Sección vacía: agrégale un trabajo, o cámbialo de sección desde su fila.</Vacio>
                  ) : null}
                </CajaSeccion>
              );
            })}
            {(() => {
              const sueltos = trabajos.filter((t) => !t.seccion);
              const visibles = trabajosVisibles.filter(({ t }) => !t.seccion);
              if (sueltos.length === 0 || (filtro && visibles.length === 0)) return null;
              return (
                <CajaSeccion
                  fija
                  nombre="Sin sección"
                  cuenta={`${sueltos.length} ${sueltos.length === 1 ? "trabajo" : "trabajos"}`}
                  abierta={!plegadas.has("sin-trabajo") || !!filtro}
                  onToggle={() => alternarSeccion("sin-trabajo")}
                  cta="Nuevo trabajo aquí"
                  onNuevo={() => agregarGrupo(setTrabajos, setAbiertoTrabajo)}
                >
                  {visibles.map(({ t, i }) => filaTrabajoL3(t, i))}
                </CajaSeccion>
              );
            })()}
          </div>
        )}
        {trabajos.length === 0 ? (
          <Vacio grande>
            No hay trabajos. Créalos desde un motivo de la Lista 1: el técnico no podrá registrar qué hizo hasta que
            cada motivo tenga los suyos.
          </Vacio>
        ) : null}
        {trabajos.length > 0 && trabajosVisibles.length === 0 ? (
          <Vacio>Ningún trabajo coincide con «{busqueda}».</Vacio>
        ) : null}
      </Bloque>
    </>
  );
}
