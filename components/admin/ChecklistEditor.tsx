"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import Confirmar, { type ConfirmarCfg } from "@/components/admin/Confirmar";
import { Toast, useToast } from "@/components/ui/Toast";
import {
  guardarChecklistAction,
  guardarPlantillaChecklistAction,
  reiniciarChecklistAction,
} from "@/app/actions/admin";
import type { BorradorChecklist } from "@/lib/data/catalogos";
import type { CatalogoMotivo, CatalogoProblema, CatalogoTrabajo, ChecklistPlantilla } from "@/lib/types";

/**
 * Editor de las tres listas.
 *
 * Trabaja sobre un borrador local: mover, renombrar, clonar y quitar solo tocan
 * la pantalla. Nada llega a SQL Server hasta que se aprieta "Guardar cambios" y
 * se confirma — antes esto guardaba en cada blur y era imposible saber qué
 * había quedado escrito y qué no.
 *
 * Quitar una entrada nunca borra la fila: la deja inactiva. Las visitas y las
 * actas ya registradas apuntan a ella por su código y tienen que seguir
 * mostrándose tal como se firmaron.
 */

interface Item {
  /** Clave estable de React. No viaja al servidor. */
  key: string;
  id: number | null;
  etiqueta: string;
  permiteCantidad: boolean;
}

interface Motivo {
  key: string;
  id: number | null;
  codigo: string | null;
  nombre: string;
}

interface Grupo {
  key: string;
  id: number | null;
  codigo: string | null;
  nombre: string;
  grupoLabel: string;
  items: Item[];
}

let contadorClave = 0;
const nuevaClave = () => `k${(contadorClave += 1)}`;

function aMotivos(lista: CatalogoMotivo[]): Motivo[] {
  return lista.map((m) => ({ key: nuevaClave(), id: m.id, codigo: m.codigo, nombre: m.nombre }));
}

function aGruposProblema(lista: CatalogoProblema[]): Grupo[] {
  return lista.map((p) => ({
    key: nuevaClave(),
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    grupoLabel: p.grupoLabel ?? "",
    items: p.opciones.map((o) => ({
      key: nuevaClave(),
      id: o.id,
      etiqueta: o.etiqueta,
      permiteCantidad: o.permiteCantidad,
    })),
  }));
}

function aGruposTrabajo(lista: CatalogoTrabajo[]): Grupo[] {
  return lista.map((t) => ({
    key: nuevaClave(),
    id: t.id,
    codigo: t.codigo,
    nombre: t.nombre,
    grupoLabel: t.grupoLabel ?? "",
    items: t.subtrabajos.map((s) => ({
      key: nuevaClave(),
      id: s.id,
      etiqueta: s.etiqueta,
      permiteCantidad: s.permiteCantidad,
    })),
  }));
}

/** Mueve un elemento del arreglo `delta` posiciones sin salirse de los bordes. */
function mover<T>(lista: T[], indice: number, delta: number): T[] {
  const destino = indice + delta;
  if (destino < 0 || destino >= lista.length) return lista;
  const copia = [...lista];
  const [fuera] = copia.splice(indice, 1);
  copia.splice(destino, 0, fuera);
  return copia;
}

/** "Calibración" → "Calibración (copia)", "Calibración (copia 2)"… */
function nombreDeCopia(nombre: string, usados: string[]): string {
  const base = `${nombre} (copia)`;
  const set = new Set(usados.map((n) => n.trim().toLowerCase()));
  if (!set.has(base.toLowerCase())) return base;
  let n = 2;
  while (set.has(`${nombre} (copia ${n})`.toLowerCase())) n += 1;
  return `${nombre} (copia ${n})`;
}

export default function ChecklistEditor({
  motivosIniciales,
  tiposIniciales,
  trabajosIniciales,
  plantillaInicial,
}: {
  motivosIniciales: CatalogoMotivo[];
  tiposIniciales: CatalogoProblema[];
  trabajosIniciales: CatalogoTrabajo[];
  plantillaInicial: ChecklistPlantilla | null;
}) {
  const router = useRouter();
  const { toast, aviso } = useToast();

  const [motivos, setMotivos] = useState<Motivo[]>(() => aMotivos(motivosIniciales));
  const [tipos, setTipos] = useState<Grupo[]>(() => aGruposProblema(tiposIniciales));
  const [trabajos, setTrabajos] = useState<Grupo[]>(() => aGruposTrabajo(trabajosIniciales));
  const [plantilla, setPlantilla] = useState(plantillaInicial);

  const [abiertoTipo, setAbiertoTipo] = useState<string | null>(null);
  const [abiertoTrabajo, setAbiertoTrabajo] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<ConfirmarCfg | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [sucio, setSucio] = useState(false);

  /** Lo que hay ahora mismo en la base, para saber qué se está por desactivar. */
  const enBase = useRef({
    motivos: motivosIniciales.length,
    tipos: tiposIniciales.length,
    trabajos: trabajosIniciales.length,
  });

  // Tras guardar, el servidor vuelve a mandar las listas ya escritas: el
  // borrador se rehace desde ellas para que los ids nuevos queden en pantalla.
  useEffect(() => {
    setMotivos(aMotivos(motivosIniciales));
    setTipos(aGruposProblema(tiposIniciales));
    setTrabajos(aGruposTrabajo(trabajosIniciales));
    enBase.current = {
      motivos: motivosIniciales.length,
      tipos: tiposIniciales.length,
      trabajos: trabajosIniciales.length,
    };
    setSucio(false);
  }, [motivosIniciales, tiposIniciales, trabajosIniciales]);

  // Con cambios sin guardar, cerrar la pestaña pide confirmación al navegador.
  useEffect(() => {
    if (!sucio) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sucio]);

  /** Todo cambio del borrador pasa por acá: marca la pantalla como sucia. */
  const editar = useCallback(<T,>(set: React.Dispatch<React.SetStateAction<T>>, fn: (prev: T) => T) => {
    setSucio(true);
    set(fn);
  }, []);

  const filtro = busqueda.trim().toLowerCase();
  const coincide = useCallback(
    (nombre: string, extras: string[] = []) =>
      !filtro || [nombre, ...extras].some((t) => t.toLowerCase().includes(filtro)),
    [filtro]
  );

  const motivosVisibles = useMemo(
    () => motivos.map((m, i) => ({ m, i })).filter(({ m }) => coincide(m.nombre)),
    [motivos, coincide]
  );
  const tiposVisibles = useMemo(
    () => tipos.map((t, i) => ({ t, i })).filter(({ t }) => coincide(t.nombre, t.items.map((o) => o.etiqueta))),
    [tipos, coincide]
  );
  const trabajosVisibles = useMemo(
    () => trabajos.map((t, i) => ({ t, i })).filter(({ t }) => coincide(t.nombre, t.items.map((o) => o.etiqueta))),
    [trabajos, coincide]
  );

  const borrador = (): BorradorChecklist => ({
    motivos: motivos.map((m) => ({ id: m.id, nombre: m.nombre })),
    problemas: tipos.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      grupoLabel: t.grupoLabel.trim() || null,
      opciones: t.items.map((o) => ({ id: o.id, etiqueta: o.etiqueta, permiteCantidad: o.permiteCantidad })),
    })),
    trabajos: trabajos.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      grupoLabel: t.grupoLabel.trim() || null,
      subtrabajos: t.items.map((o) => ({ id: o.id, etiqueta: o.etiqueta, permiteCantidad: o.permiteCantidad })),
    })),
  });

  const vacios =
    motivos.filter((m) => !m.nombre.trim()).length +
    tipos.filter((t) => !t.nombre.trim()).length +
    trabajos.filter((t) => !t.nombre.trim()).length;

  const seDesactivan =
    Math.max(0, enBase.current.motivos - motivos.filter((m) => m.id !== null).length) +
    Math.max(0, enBase.current.tipos - tipos.filter((t) => t.id !== null).length) +
    Math.max(0, enBase.current.trabajos - trabajos.filter((t) => t.id !== null).length);

  const nuevos =
    motivos.filter((m) => m.id === null).length +
    tipos.filter((t) => t.id === null).length +
    trabajos.filter((t) => t.id === null).length;

  // ── Guardado ──────────────────────────────────────────────────────────────

  function pedirGuardar() {
    if (!sucio) return aviso("No hay cambios que guardar");
    if (vacios > 0) return aviso("Hay entradas sin nombre. Escríbelas o quítalas antes de guardar.");

    const lineas = [
      `Van a quedar ${motivos.length} motivos, ${tipos.length} tipos de problema y ${trabajos.length} trabajos.`,
      nuevos > 0 ? `Se agregan ${nuevos} entradas nuevas.` : "",
      seDesactivan > 0
        ? `${seDesactivan} entradas dejan de aparecer en el celular. No se borra nada: las visitas y actas ya registradas las siguen mostrando.`
        : "",
      "El técnico ve la lista nueva en cuanto abra el formulario.",
    ].filter(Boolean);

    setConfirmar({
      titulo: "¿Guardar los cambios del checklist?",
      texto: lineas.join(" "),
      cta: "Guardar cambios",
      accion: guardar,
    });
  }

  async function guardar() {
    setGuardando(true);
    const res = await guardarChecklistAction(borrador());
    setGuardando(false);

    if (!res.ok) return aviso(res.error ?? "No se pudo guardar el checklist");
    setSucio(false);
    const r = res.resumen;
    aviso(
      r
        ? `Checklist guardado · ${r.motivos} motivos, ${r.problemas} tipos, ${r.trabajos} trabajos` +
            (r.desactivados ? ` · ${r.desactivados} entradas desactivadas` : "")
        : "Checklist guardado"
    );
    router.refresh();
  }

  function guardarComoPlantilla() {
    if (sucio) return aviso("Guarda los cambios antes de fijar la plantilla");
    setConfirmar({
      titulo: "¿Fijar esta lista como tu plantilla?",
      texto:
        "Se guarda una copia de las tres listas tal como están ahora. El botón «Reiniciar» va a devolverlas siempre a esta copia. " +
        (plantilla ? "Reemplaza la plantilla que tenías guardada." : ""),
      cta: "Fijar plantilla",
      accion: async () => {
        const res = await guardarPlantillaChecklistAction();
        if (!res.ok) return aviso(res.error ?? "No se pudo guardar la plantilla");
        setPlantilla(res.plantilla ?? null);
        aviso("Plantilla guardada");
      },
    });
  }

  function reiniciar() {
    if (!plantilla) {
      return aviso("Todavía no has fijado ninguna plantilla: arma tus listas y aprieta «Fijar como mi plantilla»");
    }
    setConfirmar({
      titulo: "¿Reiniciar a tu plantilla?",
      texto:
        `Las tres listas vuelven a la plantilla que fijaste ` +
        `(${plantilla.motivos} motivos, ${plantilla.problemas} tipos, ${plantilla.trabajos} trabajos). ` +
        "Todo lo que hayas agregado después deja de aparecer en el celular. Nada se borra de la base.",
      cta: "Reiniciar checklist",
      accion: async () => {
        const res = await reiniciarChecklistAction();
        if (!res.ok) return aviso(res.error ?? "No se pudo reiniciar el checklist");
        setAbiertoTipo(null);
        setAbiertoTrabajo(null);
        setSucio(false);
        aviso("Checklist reiniciado a tu plantilla");
        router.refresh();
      },
    });
  }

  // ── Altas y clones ────────────────────────────────────────────────────────

  function agregarMotivo() {
    editar(setMotivos, (prev) => [...prev, { key: nuevaClave(), id: null, codigo: null, nombre: "" }]);
    aviso("Motivo agregado · escribe su nombre y guarda");
  }

  function agregarGrupo(set: React.Dispatch<React.SetStateAction<Grupo[]>>, abrir: (k: string) => void) {
    const key = nuevaClave();
    editar(set, (prev) => [...prev, { key, id: null, codigo: null, nombre: "", grupoLabel: "", items: [] }]);
    abrir(key);
  }

  function clonarGrupo(
    grupo: Grupo,
    lista: Grupo[],
    set: React.Dispatch<React.SetStateAction<Grupo[]>>,
    abrir: (k: string) => void
  ) {
    const key = nuevaClave();
    const copia: Grupo = {
      key,
      id: null,
      codigo: null,
      nombre: nombreDeCopia(grupo.nombre, lista.map((g) => g.nombre)),
      grupoLabel: grupo.grupoLabel,
      // Los subdetalles van sin id: son filas nuevas colgando de la copia.
      items: grupo.items.map((o) => ({ ...o, key: nuevaClave(), id: null })),
    };
    const posicion = lista.findIndex((g) => g.key === grupo.key);
    editar(set, (prev) => {
      const copiaLista = [...prev];
      copiaLista.splice(posicion + 1, 0, copia);
      return copiaLista;
    });
    abrir(key);
    aviso(`Se clonó «${grupo.nombre}» con sus ${grupo.items.length} subdetalles`);
  }

  function quitarGrupo(grupo: Grupo, set: React.Dispatch<React.SetStateAction<Grupo[]>>, que: string) {
    setConfirmar({
      titulo: `¿Quitar este ${que}?`,
      texto:
        `«${grupo.nombre || "Sin nombre"}» deja de aparecer en el celular del técnico. ` +
        "No se borra: las visitas y actas ya registradas lo siguen mostrando. El cambio se aplica al guardar.",
      cta: `Quitar ${que}`,
      accion: () => editar(set, (prev) => prev.filter((g) => g.key !== grupo.key)),
    });
  }

  const total = motivos.length + tipos.length + trabajos.length;

  return (
    <>
      <AdminHeader kicker="Maestros · listas que ve el técnico en terreno" title="Checklist">
        <button className="btn btn-primary" onClick={pedirGuardar} disabled={guardando || !sucio}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M4 12l5 5L20 6" />
          </svg>
          <span>{guardando ? "Guardando…" : sucio ? "Guardar cambios" : "Sin cambios"}</span>
        </button>
      </AdminHeader>

      <div className="px-7 pt-6 pb-12 animate-fade-in max-w-[1000px]">
        <p className="mb-4 text-[13px] leading-[1.65] opacity-72 max-w-[74ch]">
          Acá vive todo lo que el técnico elige desde listas en su celular. Cada bloque es una lista distinta. Puedes
          mover las filas con las flechas, clonar una entrada con todos sus subdetalles y decidir si cada subdetalle se
          marca a secas o lleva cantidad.
        </p>

        <div className="flex items-center gap-3 flex-wrap mb-6.5">
          <div className="relative flex-1 min-w-[240px] max-w-[380px]">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en las tres listas…"
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

        {/* Lista 1 · Motivos */}
        <Bloque
          numero="Lista 1"
          titulo="Motivo de la visita"
          bajada="Lo que el técnico marca al abrir la ficha. Puede marcar varios. Sin subdetalles."
          cta="Nuevo motivo"
          onAgregar={agregarMotivo}
        >
          <div className="flex flex-col gap-2 max-w-[720px]">
            {motivosVisibles.map(({ m, i }) => (
              <div key={m.key} className="flex items-center gap-2.5">
                <Numero n={i + 1} />
                <Flechas
                  deshabilitado={!!filtro}
                  arriba={i > 0}
                  abajo={i < motivos.length - 1}
                  onMover={(d) => editar(setMotivos, (prev) => mover(prev, i, d))}
                />
                <input
                  value={m.nombre}
                  onChange={(e) =>
                    editar(setMotivos, (prev) =>
                      prev.map((x) => (x.key === m.key ? { ...x, nombre: e.target.value } : x))
                    )
                  }
                  placeholder="Ej: Calibración de las antenas"
                  className="input flex-1 min-w-0 bg-[var(--color-surface-3)]"
                  aria-label="Nombre del motivo"
                  autoComplete="off"
                />
                <Codigo codigo={m.codigo} />
                <button
                  onClick={() =>
                    editar(setMotivos, (prev) => {
                      const copia: Motivo = {
                        key: nuevaClave(),
                        id: null,
                        codigo: null,
                        nombre: nombreDeCopia(m.nombre, prev.map((x) => x.nombre)),
                      };
                      const lista = [...prev];
                      lista.splice(i + 1, 0, copia);
                      return lista;
                    })
                  }
                  className="btn btn-icon w-10 h-10 flex-none border border-black/[.3]"
                  aria-label="Clonar motivo"
                  title="Clonar este motivo"
                >
                  <IconoClonar />
                </button>
                <button
                  onClick={() =>
                    setConfirmar({
                      titulo: "¿Quitar este motivo?",
                      texto: `«${m.nombre || "Sin nombre"}» deja de aparecer en el celular del técnico. No se borra: las visitas ya registradas con este motivo lo siguen mostrando. El cambio se aplica al guardar.`,
                      cta: "Quitar motivo",
                      accion: () => editar(setMotivos, (prev) => prev.filter((x) => x.key !== m.key)),
                    })
                  }
                  className="btn btn-icon w-10 h-10 flex-none border border-black/[.3]"
                  aria-label="Quitar motivo"
                >
                  <IconoBasura />
                </button>
              </div>
            ))}
            {motivos.length === 0 ? (
              <Vacio>Sin motivos: el técnico no podría clasificar la visita, y coordinación no puede agendarla.</Vacio>
            ) : null}
            {motivos.length > 0 && motivosVisibles.length === 0 ? (
              <Vacio>Ningún motivo coincide con «{busqueda}».</Vacio>
            ) : null}
          </div>
        </Bloque>

        {/* Lista 2 · Tipos de problema */}
        <Bloque
          numero="Lista 2"
          titulo="Tipos de problema"
          bajada="Lo que el técnico elige al levantar un problema. Despliega un tipo para editar sus subdetalles; sin subdetalles, el técnico escribe con sus palabras qué encontró."
          cta="Nuevo tipo"
          onAgregar={() => agregarGrupo(setTipos, setAbiertoTipo)}
        >
          {tiposVisibles.map(({ t, i }) => (
            <Desplegable
              key={t.key}
              n={i + 1}
              grupo={t}
              total={tipos.length}
              bloqueadoMover={!!filtro}
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
              onMover={(d) => editar(setTipos, (prev) => mover(prev, i, d))}
              onClonar={() => clonarGrupo(t, tipos, setTipos, setAbiertoTipo)}
              onQuitar={() => quitarGrupo(t, setTipos, "tipo de problema")}
              onConfirmarQuitarItem={setConfirmar}
              onAviso={aviso}
            />
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

        {/* Lista 3 · Trabajos realizados */}
        <Bloque
          numero="Lista 3"
          titulo="Trabajos realizados"
          bajada="Lo que el técnico agrega en «Agregar trabajo realizado». Despliega un trabajo para editar sus subtrabajos; sin subtrabajos, el técnico solo escribe un detalle."
          cta="Nuevo trabajo"
          onAgregar={() => agregarGrupo(setTrabajos, setAbiertoTrabajo)}
        >
          {trabajosVisibles.map(({ t, i }) => (
            <Desplegable
              key={t.key}
              n={i + 1}
              grupo={t}
              total={trabajos.length}
              bloqueadoMover={!!filtro}
              phNombre="Ej: Calibración de antenas"
              abierto={abiertoTrabajo === t.key}
              onToggle={() => setAbiertoTrabajo(abiertoTrabajo === t.key ? null : t.key)}
              resumen={
                t.items.length
                  ? `${t.items.length} ${t.items.length === 1 ? "subtrabajo" : "subtrabajos"}`
                  : "Sin subtrabajo · solo detalle escrito"
              }
              etiquetaSingular="subtrabajo"
              etiquetaPlural="subtrabajos"
              tituloSub="Título del subtrabajo"
              phSub="Ej: Repuesto cambiado"
              phNueva="Ej: Tarjeta electrónica"
              vacioSub="Sin subtrabajos: en el celular este trabajo se agrega directo, con detalle escrito opcional."
              onCambiar={(fn) => editar(setTrabajos, (prev) => prev.map((x) => (x.key === t.key ? fn(x) : x)))}
              onMover={(d) => editar(setTrabajos, (prev) => mover(prev, i, d))}
              onClonar={() => clonarGrupo(t, trabajos, setTrabajos, setAbiertoTrabajo)}
              onQuitar={() => quitarGrupo(t, setTrabajos, "trabajo")}
              onConfirmarQuitarItem={setConfirmar}
              onAviso={aviso}
            />
          ))}
          {trabajos.length === 0 ? (
            <Vacio grande>
              No hay trabajos. El técnico no podrá registrar qué hizo en la tienda hasta que agregues al menos uno.
            </Vacio>
          ) : null}
          {trabajos.length > 0 && trabajosVisibles.length === 0 ? (
            <Vacio>Ningún trabajo coincide con «{busqueda}».</Vacio>
          ) : null}
        </Bloque>

        {/* Plantilla propia */}
        <div className="border-t-2 border-[var(--color-divider)] pt-4.5 mt-2">
          <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">Tu plantilla</div>
          <h2 className="font-extrabold text-[19px] leading-[1.15] tracking-[-.02em] mt-1.5 mb-1">
            La lista a la que vuelve «Reiniciar»
          </h2>
          <p className="m-0 mb-3.5 text-[13px] opacity-68 max-w-[70ch]">
            {plantilla
              ? `Guardada con ${plantilla.motivos} motivos, ${plantilla.problemas} tipos de problema y ${plantilla.trabajos} trabajos. Vuelve a fijarla cuando cambies las listas y quieras que ese sea el nuevo punto de partida.`
              : "Todavía no has fijado ninguna. Arma las tres listas como las quieres y fíjalas: desde ahí, «Reiniciar» siempre las devuelve a ese estado."}
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

        <div className="flex items-center gap-3.5 mt-6 pt-4.5 border-t border-[var(--color-divider-soft)] flex-wrap">
          <button className="btn btn-primary" onClick={pedirGuardar} disabled={guardando || !sucio}>
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
      </div>

      {confirmar ? <Confirmar cfg={confirmar} onCerrar={() => setConfirmar(null)} /> : null}
      <Toast texto={toast} variante="panel" />
    </>
  );
}

function Bloque({
  numero,
  titulo,
  bajada,
  cta,
  onAgregar,
  children,
}: {
  numero: string;
  titulo: string;
  bajada: string;
  cta: string;
  onAgregar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t-2 border-[var(--color-divider)] pt-4 mb-11">
      <div className="flex items-end gap-3.5 flex-wrap mb-4">
        <div className="min-w-0">
          <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">{numero}</div>
          <h2 className="font-extrabold text-[21px] leading-[1.15] tracking-[-.02em] mt-1.5 mb-1">{titulo}</h2>
          <p className="m-0 text-[13px] opacity-68 max-w-[64ch]">{bajada}</p>
        </div>
        <button className="btn btn-secondary ml-auto min-h-10 px-3.5 text-[13px]" onClick={onAgregar}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>{cta}</span>
        </button>
      </div>
      {children}
    </div>
  );
}

/** Fila de un tipo/trabajo con sus subdetalles escondidos tras "Ver…". */
function Desplegable({
  n,
  grupo,
  total,
  bloqueadoMover,
  phNombre,
  abierto,
  onToggle,
  resumen,
  etiquetaSingular,
  etiquetaPlural,
  tituloSub,
  phSub,
  phNueva,
  vacioSub,
  onCambiar,
  onMover,
  onClonar,
  onQuitar,
  onConfirmarQuitarItem,
  onAviso,
}: {
  n: number;
  grupo: Grupo;
  total: number;
  bloqueadoMover: boolean;
  phNombre: string;
  abierto: boolean;
  onToggle: () => void;
  resumen: string;
  etiquetaSingular: string;
  etiquetaPlural: string;
  tituloSub: string;
  phSub: string;
  phNueva: string;
  vacioSub: string;
  onCambiar: (fn: (g: Grupo) => Grupo) => void;
  onMover: (delta: number) => void;
  onClonar: () => void;
  onQuitar: () => void;
  onConfirmarQuitarItem: (cfg: ConfirmarCfg) => void;
  onAviso: (texto: string) => void;
}) {
  const [nueva, setNueva] = useState("");

  function agregarItem() {
    const etiqueta = nueva.trim();
    if (!etiqueta) return onAviso(`Escribe el ${etiquetaSingular} antes de agregarlo`);
    if (grupo.items.some((o) => o.etiqueta.trim().toLowerCase() === etiqueta.toLowerCase())) {
      return onAviso(`Ese ${etiquetaSingular} ya está en la lista`);
    }
    onCambiar((g) => ({
      ...g,
      // El técnico necesita un título para el grupo: si no lo pusieron, se deja
      // uno genérico al aparecer el primer subdetalle.
      grupoLabel: g.grupoLabel || (etiquetaSingular === "subtrabajo" ? "Subtrabajo" : "Detalle"),
      items: [...g.items, { key: nuevaClave(), id: null, etiqueta, permiteCantidad: false }],
    }));
    setNueva("");
  }

  return (
    <div className="border border-black/[.35] mb-2.5 bg-[var(--color-surface-3)]">
      <div
        className="flex items-center gap-2.5 flex-wrap px-3 py-2.5"
        style={{ background: abierto ? "#e3e1e0" : "var(--color-surface)" }}
      >
        <Numero n={n} />
        <Flechas deshabilitado={bloqueadoMover} arriba={n > 1} abajo={n < total} onMover={onMover} />
        <input
          value={grupo.nombre}
          onChange={(e) => onCambiar((g) => ({ ...g, nombre: e.target.value }))}
          placeholder={phNombre}
          className="input flex-1 min-w-[200px] min-h-10 font-extrabold text-[15px] bg-[var(--color-bg)]"
          aria-label={phNombre}
          autoComplete="off"
        />
        <Codigo codigo={grupo.codigo} />
        <span className="text-[11px] leading-[1.2] tracking-[.06em] uppercase opacity-62">{resumen}</span>
        <button
          onClick={onToggle}
          aria-label={abierto ? `Ocultar ${etiquetaPlural}` : `Ver ${etiquetaPlural}`}
          className="min-h-[34px] flex items-center gap-2 px-2.5 flex-none bg-transparent border border-black/[.3] cursor-pointer text-[var(--color-text)] text-[11px] leading-none tracking-[.07em] uppercase hover:bg-black/[.07]"
        >
          <span>{abierto ? `Ocultar ${etiquetaPlural}` : `Ver ${etiquetaPlural}`}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            className="transition-transform duration-150"
            style={{ transform: `rotate(${abierto ? 180 : 0}deg)` }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <button
          onClick={onClonar}
          className="btn btn-icon w-8.5 h-8.5 flex-none border border-black/[.3]"
          aria-label={`Clonar ${etiquetaSingular === "subtrabajo" ? "trabajo" : "tipo de problema"}`}
          title="Clonar con todos sus subdetalles"
        >
          <IconoClonar />
        </button>
        <button
          onClick={onQuitar}
          className="btn btn-icon w-8.5 h-8.5 flex-none border border-black/[.3]"
          aria-label="Quitar de la lista"
        >
          <IconoBasura />
        </button>
      </div>

      {abierto ? (
        <div className="px-3.5 pt-3.5 pb-4 border-t border-black/[.25]">
          <label className="block text-[10px] tracking-[.11em] uppercase opacity-62 mb-1.5">{tituloSub}</label>
          <input
            value={grupo.grupoLabel}
            onChange={(e) => onCambiar((g) => ({ ...g, grupoLabel: e.target.value }))}
            placeholder={phSub}
            className="input max-w-[420px] min-h-10 bg-[var(--color-bg)]"
            autoComplete="off"
          />

          <div className="flex flex-col gap-2 mt-4 max-w-[640px]">
            {grupo.items.map((o, j) => (
              <div key={o.key} className="flex gap-2 items-center">
                <Flechas
                  deshabilitado={false}
                  arriba={j > 0}
                  abajo={j < grupo.items.length - 1}
                  onMover={(d) => onCambiar((g) => ({ ...g, items: mover(g.items, j, d) }))}
                />
                <input
                  value={o.etiqueta}
                  onChange={(e) =>
                    onCambiar((g) => ({
                      ...g,
                      items: g.items.map((x) => (x.key === o.key ? { ...x, etiqueta: e.target.value } : x)),
                    }))
                  }
                  placeholder={phNueva}
                  className="input flex-1 min-w-0 min-h-10 bg-[var(--color-bg)]"
                  aria-label={etiquetaSingular}
                  autoComplete="off"
                />
                <ModoItem
                  permiteCantidad={o.permiteCantidad}
                  onCambiar={(v) =>
                    onCambiar((g) => ({
                      ...g,
                      items: g.items.map((x) => (x.key === o.key ? { ...x, permiteCantidad: v } : x)),
                    }))
                  }
                />
                <button
                  onClick={() =>
                    onConfirmarQuitarItem({
                      titulo: `¿Quitar este ${etiquetaSingular}?`,
                      texto: `«${o.etiqueta || "Sin nombre"}» deja de aparecer dentro de «${grupo.nombre}». No se borra: las actas ya firmadas lo siguen mostrando. El cambio se aplica al guardar.`,
                      cta: `Quitar ${etiquetaSingular}`,
                      accion: () => onCambiar((g) => ({ ...g, items: g.items.filter((x) => x.key !== o.key) })),
                    })
                  }
                  className="btn btn-icon w-10 h-10 flex-none border border-black/[.3]"
                  aria-label={`Quitar ${etiquetaSingular}`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            ))}
            {grupo.items.length === 0 ? (
              <div className="px-3.5 py-2.5 border border-dashed border-black/[.35] text-[13px] opacity-68">
                {vacioSub}
              </div>
            ) : null}
          </div>

          <div className="flex gap-2 mt-3 max-w-[640px]">
            <input
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                agregarItem();
              }}
              placeholder={phNueva}
              className="input flex-1 min-w-0 bg-[var(--color-bg)]"
              aria-label={`Nuevo ${etiquetaSingular}`}
              autoComplete="off"
            />
            <button onClick={agregarItem} className="btn btn-secondary shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Agregar</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Elige si el subdetalle se marca a secas o si además lleva cantidad. */
function ModoItem({
  permiteCantidad,
  onCambiar,
}: {
  permiteCantidad: boolean;
  onCambiar: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-none" role="group" aria-label="Cómo se registra en el celular">
      <button
        type="button"
        onClick={() => onCambiar(false)}
        title="En el celular sale como una casilla: se marca y listo."
        className="min-h-10 px-2.5 border border-black/[.3] border-r-0 cursor-pointer text-[11px] leading-none tracking-[.06em] uppercase"
        style={{
          background: permiteCantidad ? "transparent" : "var(--color-text)",
          color: permiteCantidad ? "var(--color-text)" : "var(--color-bg)",
        }}
      >
        Marcar
      </button>
      <button
        type="button"
        onClick={() => onCambiar(true)}
        title="En el celular sale con un contador: se marca y se indica cuántos."
        className="min-h-10 px-2.5 border border-black/[.3] cursor-pointer text-[11px] leading-none tracking-[.06em] uppercase"
        style={{
          background: permiteCantidad ? "var(--color-text)" : "transparent",
          color: permiteCantidad ? "var(--color-bg)" : "var(--color-text)",
        }}
      >
        Cantidad
      </button>
    </div>
  );
}

/** Sube o baja una fila. Es el orden con el que el técnico la va a ver. */
function Flechas({
  arriba,
  abajo,
  onMover,
  deshabilitado,
}: {
  arriba: boolean;
  abajo: boolean;
  onMover: (delta: number) => void;
  /** Con la búsqueda puesta no se ven todas las filas: mover sería a ciegas. */
  deshabilitado: boolean;
}) {
  const clase =
    "w-6.5 h-5 grid place-items-center border border-black/[.3] bg-transparent cursor-pointer text-[var(--color-text)] hover:bg-black/[.08] disabled:opacity-30 disabled:cursor-not-allowed";
  return (
    <div className="flex flex-col flex-none" title={deshabilitado ? "Quita la búsqueda para poder reordenar" : "Cambiar el orden"}>
      <button
        type="button"
        onClick={() => onMover(-1)}
        disabled={deshabilitado || !arriba}
        aria-label="Subir"
        className={`${clase} border-b-0`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onMover(1)}
        disabled={deshabilitado || !abajo}
        aria-label="Bajar"
        className={clase}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}

/**
 * El código interno de la entrada.
 *
 * Es la llave con la que las visitas y las actas apuntan a esta fila
 * (motivo_codigo, trabajo_codigo, tipo_codigo). Se genera solo a partir del
 * nombre la primera vez y no cambia nunca más: si cambiara, un acta firmada
 * hace un año dejaría de poder decir qué trabajo se hizo. Por eso se muestra
 * pero no se edita.
 */
function Codigo({ codigo }: { codigo: string | null }) {
  if (!codigo) {
    return (
      <span
        className="flex-none text-[10px] tracking-[.06em] uppercase opacity-45"
        title="El código interno se genera solo al guardar, a partir del nombre."
      >
        sin código aún
      </span>
    );
  }
  return (
    <code
      className="flex-none px-1.5 py-0.5 text-[10px] tracking-[.04em] bg-black/[.06] opacity-70"
      title="Código interno: con él las visitas y las actas ya firmadas apuntan a esta entrada. Se genera solo y no cambia aunque le cambies el nombre."
    >
      {codigo}
    </code>
  );
}

function Numero({ n }: { n: number }) {
  return (
    <span className="w-6.5 h-6.5 flex-none grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs tabular-nums">
      {n}
    </span>
  );
}

function Vacio({ children, grande }: { children: React.ReactNode; grande?: boolean }) {
  return (
    <div
      className={`border border-dashed border-black/[.4] opacity-70 ${grande ? "p-6.5 text-sm" : "p-3.5 text-[13px]"}`}
    >
      {children}
    </div>
  );
}

function IconoClonar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 9h11v11H9z" />
      <path d="M4 15V4h11" />
    </svg>
  );
}

function IconoBasura() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </svg>
  );
}
