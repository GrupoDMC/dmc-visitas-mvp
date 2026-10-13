"use client";

import { ESTADO_PROBLEMA_CIERRE, ESTADO_PROBLEMA_INICIAL } from "@/lib/ui/estado";
import { Bloque, FilasSimples, Vacio } from "@/components/admin/checklist/piezas";
import type { ChecklistEditorApi } from "@/components/admin/checklist/useChecklistEditor";

// Las listas planas del checklist (4 a 8), la búsqueda, la plantilla propia y
// el pie con el botón de guardar.

/** La explicación de arriba y la búsqueda en todas las listas. */
export function Introduccion({ fv }: { fv: ChecklistEditorApi }) {
  const { busqueda, setBusqueda, sucio, filtro, total } = fv;
  return (
    <>
      <p className="mb-4 text-[13px] leading-[1.65] opacity-72 max-w-[74ch]">
        Acá vive todo lo que el técnico elige desde listas en su celular. Cada bloque es una lista distinta. Para
        cambiar el orden, agarra una fila de su manilla (⣿) y suéltala donde va; también puedes clonar una entrada con
        todos sus subdetalles y decidir si cada subdetalle se marca a secas o lleva cantidad.
      </p>

      <div className="flex items-center gap-3 flex-wrap mb-6.5">
        <div className="relative flex-1 min-w-[240px] max-w-[380px]">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en las listas…"
            aria-label="Buscar en el checklist"
            autoComplete="off"
            className="input pl-9.5"
          />
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text)"
            strokeWidth="2"
            className="absolute left-3 top-1/2 -translate-y-1/2 opacity-62 pointer-events-none"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M16.5 16.5L21 21" />
          </svg>
        </div>
        {filtro ? (
          <button
            onClick={() => setBusqueda("")}
            className="min-h-8 px-1 bg-transparent border-0 text-[var(--color-accent-active)] text-xs underline underline-offset-[3px] cursor-pointer"
          >
            Quitar la búsqueda
          </button>
        ) : null}
        <div className="ml-auto text-[11px] tracking-[.08em] uppercase opacity-62 tabular-nums">
          {sucio ? "Cambios sin guardar" : `${total} entradas guardadas`}
        </div>
      </div>
    </>
  );
}

/** Listas 4 a 8: comentario interno, gestión de pendientes y de problemas, estados y cargos. */
export function ListasSimples({ fv }: { fv: ChecklistEditorApi }) {
  const {
    aviso,
    internos,
    setInternos,
    pendientes,
    setPendientes,
    cargos,
    setCargos,
    gestionProblemas,
    setGestionProblemas,
    estadosProblema,
    setEstadosProblema,
    setConfirmar,
    busqueda,
    editar,
    filtro,
    internosVisibles,
    pendientesVisibles,
    cargosVisibles,
    gestionProblemasVisibles,
    estadosProblemaVisibles,
    agregarInterno,
    agregarPendiente,
    agregarCargo,
    agregarGestionProblema,
    agregarEstadoProblema,
  } = fv;
  return (
    <>
      {/* Lista 4 · Comentario interno */}
      <Bloque
        numero="Lista 4"
        titulo="Comentario interno"
        bajada="Lo que el técnico marca en la sección «Comentario interno» del acta, junto con su texto, fotos y video. Es solo para coordinación: no aparece en el PDF ni en el correo al cliente."
        cta="Nuevo ítem"
        onAgregar={agregarInterno}
      >
        <FilasSimples
          grupo="interno"
          lista={internos}
          visibles={internosVisibles}
          bloqueado={!!filtro}
          que="ítem"
          placeholder="Ej: El cliente pidió cotización"
          onEditar={(fn) => editar(setInternos, fn)}
          onPedirQuitar={(m) =>
            setConfirmar({
              titulo: "¿Quitar este ítem?",
              texto: `«${m.nombre || "Sin nombre"}» deja de aparecer en el celular del técnico. No se borra: las actas que ya lo marcaron lo siguen mostrando. El cambio se aplica al guardar.`,
              cta: "Quitar ítem",
              accion: () => editar(setInternos, (prev) => prev.filter((x) => x.key !== m.key)),
            })
          }
        />
        {internos.length === 0 ? (
          <Vacio>Sin ítems: el técnico igual puede dejar el comentario interno escrito, con fotos y video.</Vacio>
        ) : null}
        {internos.length > 0 && internosVisibles.length === 0 ? (
          <Vacio>Ningún ítem coincide con «{busqueda}».</Vacio>
        ) : null}
      </Bloque>

      {/* Lista 5 · Gestión de pendientes */}
      <Bloque
        numero="Lista 5"
        titulo="Gestión de pendientes"
        bajada="Los pasos que coordinación va marcando en «Reagendas y pendientes» mientras destraba una visita que no se pudo hacer. Solo se ve en el panel: el técnico y el cliente no la ven."
        cta="Nuevo paso"
        onAgregar={agregarPendiente}
      >
        <FilasSimples
          grupo="pendiente"
          lista={pendientes}
          visibles={pendientesVisibles}
          bloqueado={!!filtro}
          que="paso"
          placeholder="Ej: Repuesto pedido a bodega"
          onEditar={(fn) => editar(setPendientes, fn)}
          onPedirQuitar={(m) =>
            setConfirmar({
              titulo: "¿Quitar este paso?",
              texto: `«${m.nombre || "Sin nombre"}» deja de aparecer en el checklist de «Reagendas y pendientes». No se borra: lo que ya se marcó con él queda guardado, pero deja de contarse. El cambio se aplica al guardar.`,
              cta: "Quitar paso",
              accion: () => editar(setPendientes, (prev) => prev.filter((x) => x.key !== m.key)),
            })
          }
        />
        {pendientes.length === 0 ? (
          <Vacio>
            Sin pasos: en «Reagendas y pendientes» cada visita se ve con toda su información, pero sin checklist que
            marcar.
          </Vacio>
        ) : null}
        {pendientes.length > 0 && pendientesVisibles.length === 0 ? (
          <Vacio>Ningún paso coincide con «{busqueda}».</Vacio>
        ) : null}
      </Bloque>

      {/* Lista 6 · Gestión de problemas */}
      <Bloque
        numero="Lista 6"
        titulo="Gestión de problemas"
        bajada="Los pasos que coordinación va marcando en «Problemas» mientras lleva cada falla hasta cerrarla: cotizar, pedir el repuesto, esperar la aprobación del cliente. Solo se ve en el panel: el técnico y el cliente no la ven."
        cta="Nuevo paso"
        onAgregar={agregarGestionProblema}
      >
        <FilasSimples
          grupo="gestionproblema"
          lista={gestionProblemas}
          visibles={gestionProblemasVisibles}
          bloqueado={!!filtro}
          que="paso"
          placeholder="Ej: Repuesto cotizado al cliente"
          onEditar={(fn) => editar(setGestionProblemas, fn)}
          onPedirQuitar={(m) =>
            setConfirmar({
              titulo: "¿Quitar este paso?",
              texto: `«${m.nombre || "Sin nombre"}» deja de aparecer en el checklist de «Problemas». No se borra: lo que ya se marcó con él queda guardado, pero deja de contarse. El cambio se aplica al guardar.`,
              cta: "Quitar paso",
              accion: () => editar(setGestionProblemas, (prev) => prev.filter((x) => x.key !== m.key)),
            })
          }
        />
        {gestionProblemas.length === 0 ? (
          <Vacio>
            Sin pasos: en «Problemas» cada falla se ve con su historial y sus gráficos, pero sin checklist que marcar.
          </Vacio>
        ) : null}
        {gestionProblemas.length > 0 && gestionProblemasVisibles.length === 0 ? (
          <Vacio>Ningún paso coincide con «{busqueda}».</Vacio>
        ) : null}
      </Bloque>

      {/* Lista 7 · Estados del problema */}
      <Bloque
        numero="Lista 7"
        titulo="Estados del problema"
        bajada="Los estados entre los que se elige en «Cambiar estado o tipo» de un problema, en este orden. «Abierto» es con el que nace todo problema que levanta el técnico y «Resuelto» es el único que lo cierra: los dos se pueden renombrar, pero no quitar. Todo lo que agregues es un estado intermedio y el problema sigue contando como sin cerrar."
        cta="Nuevo estado"
        onAgregar={agregarEstadoProblema}
      >
        <FilasSimples
          grupo="estadoproblema"
          lista={estadosProblema}
          visibles={estadosProblemaVisibles}
          bloqueado={!!filtro}
          que="estado"
          placeholder="Ej: En cotización"
          onEditar={(fn) => editar(setEstadosProblema, fn)}
          onPedirQuitar={(m) => {
            if (m.codigo === ESTADO_PROBLEMA_INICIAL || m.codigo === ESTADO_PROBLEMA_CIERRE) {
              return aviso(
                m.codigo === ESTADO_PROBLEMA_INICIAL
                  ? "Este es el estado con que nace todo problema: se puede renombrar, pero no quitar."
                  : "Este es el estado que cierra un problema: se puede renombrar, pero no quitar."
              );
            }
            setConfirmar({
              titulo: "¿Quitar este estado?",
              texto: `«${m.nombre || "Sin nombre"}» deja de ofrecerse al cambiar el estado de un problema. No se borra: los problemas que hoy están en él lo siguen mostrando hasta que les pongas otro. El cambio se aplica al guardar.`,
              cta: "Quitar estado",
              accion: () => editar(setEstadosProblema, (prev) => prev.filter((x) => x.key !== m.key)),
            });
          }}
        />
        {estadosProblema.length > 0 && estadosProblemaVisibles.length === 0 ? (
          <Vacio>Ningún estado coincide con «{busqueda}».</Vacio>
        ) : null}
      </Bloque>

      {/* Lista 8 · Cargos del responsable */}
      <Bloque
        numero="Lista 8"
        titulo="Cargos del responsable"
        bajada="Los cargos que se ofrecen para quien recibe y firma en la tienda: al agendar la visita y al llenar el acta. Es opcional en cada visita; el que se elige sale en el acta y en el PDF, al lado del nombre."
        cta="Nuevo cargo"
        onAgregar={agregarCargo}
      >
        <FilasSimples
          grupo="cargo"
          lista={cargos}
          visibles={cargosVisibles}
          bloqueado={!!filtro}
          que="cargo"
          placeholder="Ej: Jefe de tienda"
          onEditar={(fn) => editar(setCargos, fn)}
          onPedirQuitar={(m) =>
            setConfirmar({
              titulo: "¿Quitar este cargo?",
              texto: `«${m.nombre || "Sin nombre"}» deja de ofrecerse al agendar y al llenar el acta. No se borra: las actas que ya lo tienen lo siguen mostrando. El cambio se aplica al guardar.`,
              cta: "Quitar cargo",
              accion: () => editar(setCargos, (prev) => prev.filter((x) => x.key !== m.key)),
            })
          }
        />
        {cargos.length === 0 ? (
          <Vacio>Sin cargos: el formulario no pregunta por el cargo de quien recibe.</Vacio>
        ) : null}
        {cargos.length > 0 && cargosVisibles.length === 0 ? (
          <Vacio>Ningún cargo coincide con «{busqueda}».</Vacio>
        ) : null}
      </Bloque>
    </>
  );
}

/** La plantilla a la que vuelve «Reiniciar». */
export function PlantillaPropia({ fv }: { fv: ChecklistEditorApi }) {
  const { plantilla, guardarComoPlantilla, reiniciar } = fv;
  return (
    <>
      {/* Plantilla propia */}
      <div className="border-t-2 border-[var(--color-divider)] pt-4.5 mt-2">
        <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">Tu plantilla</div>
        <h2 className="font-extrabold text-[19px] leading-[1.15] tracking-[-.02em] mt-1.5 mb-1">
          La lista a la que vuelve «Reiniciar»
        </h2>
        <p className="m-0 mb-3.5 text-[13px] opacity-68 max-w-[70ch]">
          {plantilla
            ? `Guardada con ${plantilla.motivos} motivos, ${plantilla.problemas} tipos de problema, ${plantilla.trabajos} trabajos, ${plantilla.internos} ítems internos y ${plantilla.pendientes + plantilla.gestionProblemas} pasos de gestión. Vuelve a fijarla cuando cambies las listas y quieras que ese sea el nuevo punto de partida.`
            : "Todavía no has fijado ninguna. Arma las listas como las quieres y fíjalas: desde ahí, «Reiniciar» siempre las devuelve a ese estado."}
        </p>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button className="btn btn-secondary border border-black/[.3]" onClick={guardarComoPlantilla}>
            Fijar como mi plantilla
          </button>
          <button
            className="btn btn-secondary border border-black/[.3]"
            onClick={reiniciar}
            disabled={!plantilla}
          >
            Reiniciar a mi plantilla
          </button>
        </div>
      </div>
    </>
  );
}

/** Guardar cambios, otra vez al final de la página. */
export function PieGuardar({ fv }: { fv: ChecklistEditorApi }) {
  const { guardando, soloLectura, sucio, pedirGuardar } = fv;
  return (
    <>
      <div className="flex items-center gap-3.5 mt-6 pt-4.5 border-t border-[var(--color-divider-soft)] flex-wrap">
        <button className="btn btn-primary" onClick={pedirGuardar} disabled={guardando || !sucio || soloLectura}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M4 12l5 5L20 6" />
          </svg>
          <span>{guardando ? "Guardando…" : "Guardar cambios"}</span>
        </button>
        <span className="text-xs opacity-62">
          {sucio
            ? "Hay cambios en pantalla que todavía no están en la base."
            : "Todo lo que ves está guardado y es lo que ve el técnico."}
        </span>
      </div>
    </>
  );
}
