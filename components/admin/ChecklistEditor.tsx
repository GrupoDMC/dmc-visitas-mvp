"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sinTildes } from "@/lib/ui/formato";
import { useRouter } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import SelectBuscable, { type OpcionSelect } from "@/components/ui/SelectBuscable";
import { trabajosDelMotivo } from "@/lib/ui/motivos";
import Confirmar, { type ConfirmarCfg } from "@/components/admin/Confirmar";
import { Toast, useToast } from "@/components/ui/Toast";
import { puede, useReferencias } from "@/lib/ui/referencias";
import {
  guardarChecklistAction,
  guardarPlantillaChecklistAction,
  reiniciarChecklistAction,
} from "@/app/actions/admin";
import type { BorradorChecklist } from "@/lib/data/catalogos";
import { ESTADO_PROBLEMA_CIERRE, ESTADO_PROBLEMA_INICIAL } from "@/lib/ui/estado";
import type {
  CatalogoEstadoProblema,
  CatalogoGestionProblema,
  CatalogoInterno,
  CatalogoMotivo,
  CatalogoPendiente,
  CatalogoProblema,
  CatalogoTrabajo,
  ChecklistPlantilla,
} from "@/lib/types";

/**
 * Editor de las listas del checklist.
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

/**
 * Un motivo de la Lista 1 con sus trabajos. La relación vive acá y solo acá:
 * el trabajo no sabe en qué motivos está, se calcula mirando los motivos.
 */
interface MotivoConTrabajos extends Motivo {
  /**
   * Las claves (`key`) de sus trabajos, en el orden en que el técnico los ve.
   * Por clave y no por nombre para que renombrar un trabajo no suelte el enlace.
   */
  trabajos: string[];
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

function aMotivos(lista: (CatalogoMotivo | CatalogoInterno | CatalogoPendiente | CatalogoEstadoProblema)[]): Motivo[] {
  return lista.map((m) => ({ key: nuevaClave(), id: m.id, codigo: m.codigo, nombre: m.nombre }));
}

/** Los motivos con sus trabajos ya ordenados, enlazados por la clave de cada trabajo. */
function aMotivosConTrabajos(lista: CatalogoMotivo[], catalogo: CatalogoTrabajo[], grupos: Grupo[]): MotivoConTrabajos[] {
  const clavePorCodigo = new Map(grupos.map((g) => [g.codigo, g.key]));
  return lista.map((m) => ({
    key: nuevaClave(),
    id: m.id,
    codigo: m.codigo,
    nombre: m.nombre,
    trabajos: trabajosDelMotivo(catalogo, m.codigo)
      .map((t) => clavePorCodigo.get(t.codigo))
      .filter((k): k is string => Boolean(k)),
  }));
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

/**
 * Saca el elemento de `desde` y lo mete justo antes de `ranura`.
 *
 * `ranura` es un hueco entre filas, no una fila: con 3 filas hay 4 huecos (0 a
 * 3). Por eso al arrastrar hacia abajo hay que descontar el que se sacó.
 */
function reubicar<T>(lista: T[], desde: number, ranura: number): T[] {
  if (desde < 0 || desde >= lista.length) return lista;
  if (ranura === desde || ranura === desde + 1) return lista;
  const copia = [...lista];
  const [fuera] = copia.splice(desde, 1);
  copia.splice(desde < ranura ? ranura - 1 : ranura, 0, fuera);
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

/** «A, B, C y 4 más»: para nombrar varias entradas en un aviso sin alargarlo. */
function listaCorta(nombres: string[], max = 3): string {
  const limpios = nombres.map((n) => n.trim() || "Sin nombre");
  if (limpios.length <= max) return limpios.join(", ");
  return `${limpios.slice(0, max).join(", ")} y ${limpios.length - max} más`;
}

export default function ChecklistEditor({
  motivosIniciales,
  tiposIniciales,
  trabajosIniciales,
  internosIniciales,
  pendientesIniciales,
  gestionDisponible,
  gestionProblemasIniciales,
  gestionProblemasDisponible,
  estadosProblemaIniciales,
  estadosProblemaDisponible,
  trabajosPorMotivoDisponible,
  plantillaInicial,
}: {
  motivosIniciales: CatalogoMotivo[];
  tiposIniciales: CatalogoProblema[];
  trabajosIniciales: CatalogoTrabajo[];
  internosIniciales: CatalogoInterno[];
  pendientesIniciales: CatalogoPendiente[];
  /** false = falta la migración 014: la Lista 5 se muestra, pero no se puede guardar. */
  gestionDisponible: boolean;
  gestionProblemasIniciales: CatalogoGestionProblema[];
  /** false = falta la migración 015: la Lista 6 se muestra, pero no se puede guardar. */
  gestionProblemasDisponible: boolean;
  /** Solo los activos, en su orden. */
  estadosProblemaIniciales: CatalogoEstadoProblema[];
  /** false = falta la migración 016: la Lista 7 se muestra con los tres de siempre, sin poder cambiarla. */
  estadosProblemaDisponible: boolean;
  /** false = falta la migración 019: un trabajo sin motivos sigue apareciendo en todos. */
  trabajosPorMotivoDisponible: boolean;
  plantillaInicial: ChecklistPlantilla | null;
}) {
  const router = useRouter();
  const { toast, aviso } = useToast();

  // Motivos y trabajos nacen juntos: los motivos apuntan a sus trabajos por la
  // clave que se les acaba de dar.
  const [inicial] = useState(() => {
    const t = aGruposTrabajo(trabajosIniciales);
    return { motivos: aMotivosConTrabajos(motivosIniciales, trabajosIniciales, t), trabajos: t };
  });
  const [motivos, setMotivos] = useState<MotivoConTrabajos[]>(inicial.motivos);
  const [tipos, setTipos] = useState<Grupo[]>(() => aGruposProblema(tiposIniciales));
  const [trabajos, setTrabajos] = useState<Grupo[]>(inicial.trabajos);
  const [internos, setInternos] = useState<Motivo[]>(() => aMotivos(internosIniciales));
  const [pendientes, setPendientes] = useState<Motivo[]>(() => aMotivos(pendientesIniciales));
  const [gestionProblemas, setGestionProblemas] = useState<Motivo[]>(() => aMotivos(gestionProblemasIniciales));
  const [estadosProblema, setEstadosProblema] = useState<Motivo[]>(() => aMotivos(estadosProblemaIniciales));
  const [plantilla, setPlantilla] = useState(plantillaInicial);

  const [abiertoTipo, setAbiertoTipo] = useState<string | null>(null);
  const [abiertoTrabajo, setAbiertoTrabajo] = useState<string | null>(null);
  const [abiertoMotivo, setAbiertoMotivo] = useState<string | null>(null);
  /** El trabajo desplegado dentro de un motivo: «claveMotivo:claveTrabajo». */
  const [abiertoEnMotivo, setAbiertoEnMotivo] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<ConfirmarCfg | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const soloLectura = !puede(useReferencias(), "checklist.editar");
  const [sucio, setSucio] = useState(false);

  /** Lo que hay ahora mismo en la base, para saber qué se está por desactivar. */
  const enBase = useRef({
    motivos: motivosIniciales.length,
    tipos: tiposIniciales.length,
    trabajos: trabajosIniciales.length,
    internos: internosIniciales.length,
    pendientes: pendientesIniciales.length,
    gestionProblemas: gestionProblemasIniciales.length,
    estadosProblema: estadosProblemaIniciales.length,
  });

  // Tras guardar, el servidor vuelve a mandar las listas ya escritas: el
  // borrador se rehace desde ellas para que los ids nuevos queden en pantalla.
  useEffect(() => {
    const t = aGruposTrabajo(trabajosIniciales);
    setMotivos(aMotivosConTrabajos(motivosIniciales, trabajosIniciales, t));
    setTipos(aGruposProblema(tiposIniciales));
    setTrabajos(t);
    setInternos(aMotivos(internosIniciales));
    setPendientes(aMotivos(pendientesIniciales));
    setGestionProblemas(aMotivos(gestionProblemasIniciales));
    setEstadosProblema(aMotivos(estadosProblemaIniciales));
    enBase.current = {
      motivos: motivosIniciales.length,
      tipos: tiposIniciales.length,
      trabajos: trabajosIniciales.length,
      internos: internosIniciales.length,
      pendientes: pendientesIniciales.length,
      gestionProblemas: gestionProblemasIniciales.length,
      estadosProblema: estadosProblemaIniciales.length,
    };
    setSucio(false);
  }, [
    motivosIniciales,
    tiposIniciales,
    trabajosIniciales,
    internosIniciales,
    pendientesIniciales,
    gestionProblemasIniciales,
    estadosProblemaIniciales,
  ]);

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

  const filtro = sinTildes(busqueda.trim());
  const coincide = useCallback(
    (nombre: string, extras: string[] = []) =>
      !filtro || [nombre, ...extras].some((t) => sinTildes(t).includes(filtro)),
    [filtro]
  );

  const trabajoPorClave = useMemo(() => new Map(trabajos.map((t) => [t.key, t])), [trabajos]);
  const motivosVisibles = useMemo(
    () =>
      motivos
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => coincide(m.nombre, m.trabajos.map((k) => trabajoPorClave.get(k)?.nombre ?? ""))),
    [motivos, coincide, trabajoPorClave]
  );
  /** En qué motivos está cada trabajo, para la vista por trabajo y los avisos. */
  const motivosDeTrabajo = useMemo(() => {
    const mapa = new Map<string, MotivoConTrabajos[]>();
    for (const m of motivos) for (const k of m.trabajos) mapa.set(k, [...(mapa.get(k) ?? []), m]);
    return mapa;
  }, [motivos]);
  const motivosSinTrabajos = motivos.filter((m) => m.nombre.trim() && m.trabajos.length === 0);
  const trabajosSinMotivo = trabajos.filter((t) => !motivosDeTrabajo.has(t.key));
  const tiposVisibles = useMemo(
    () => tipos.map((t, i) => ({ t, i })).filter(({ t }) => coincide(t.nombre, t.items.map((o) => o.etiqueta))),
    [tipos, coincide]
  );
  const trabajosVisibles = useMemo(
    () => trabajos.map((t, i) => ({ t, i })).filter(({ t }) => coincide(t.nombre, t.items.map((o) => o.etiqueta))),
    [trabajos, coincide]
  );
  const internosVisibles = useMemo(
    () => internos.map((m, i) => ({ m, i })).filter(({ m }) => coincide(m.nombre)),
    [internos, coincide]
  );
  const pendientesVisibles = useMemo(
    () => pendientes.map((m, i) => ({ m, i })).filter(({ m }) => coincide(m.nombre)),
    [pendientes, coincide]
  );
  const gestionProblemasVisibles = useMemo(
    () => gestionProblemas.map((m, i) => ({ m, i })).filter(({ m }) => coincide(m.nombre)),
    [gestionProblemas, coincide]
  );
  const estadosProblemaVisibles = useMemo(
    () => estadosProblema.map((m, i) => ({ m, i })).filter(({ m }) => coincide(m.nombre)),
    [estadosProblema, coincide]
  );

  const borrador = (): BorradorChecklist => ({
    motivos: motivos.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      trabajos: m.trabajos.map((k) => trabajoPorClave.get(k)?.nombre.trim() ?? "").filter(Boolean),
    })),
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
    internos: internos.map((m) => ({ id: m.id, nombre: m.nombre })),
    pendientes: pendientes.map((m) => ({ id: m.id, nombre: m.nombre })),
    gestionProblemas: gestionProblemas.map((m) => ({ id: m.id, nombre: m.nombre })),
    estadosProblema: estadosProblema.map((m) => ({ id: m.id, nombre: m.nombre })),
  });

  const vacios =
    motivos.filter((m) => !m.nombre.trim()).length +
    tipos.filter((t) => !t.nombre.trim()).length +
    trabajos.filter((t) => !t.nombre.trim()).length +
    internos.filter((m) => !m.nombre.trim()).length +
    pendientes.filter((m) => !m.nombre.trim()).length +
    gestionProblemas.filter((m) => !m.nombre.trim()).length +
    estadosProblema.filter((m) => !m.nombre.trim()).length;

  const seDesactivan =
    Math.max(0, enBase.current.motivos - motivos.filter((m) => m.id !== null).length) +
    Math.max(0, enBase.current.tipos - tipos.filter((t) => t.id !== null).length) +
    Math.max(0, enBase.current.trabajos - trabajos.filter((t) => t.id !== null).length) +
    Math.max(0, enBase.current.internos - internos.filter((m) => m.id !== null).length) +
    Math.max(0, enBase.current.pendientes - pendientes.filter((m) => m.id !== null).length) +
    Math.max(0, enBase.current.gestionProblemas - gestionProblemas.filter((m) => m.id !== null).length) +
    Math.max(0, enBase.current.estadosProblema - estadosProblema.filter((m) => m.codigo !== null).length);

  const nuevos =
    motivos.filter((m) => m.id === null).length +
    tipos.filter((t) => t.id === null).length +
    trabajos.filter((t) => t.id === null).length +
    internos.filter((m) => m.id === null).length +
    pendientes.filter((m) => m.id === null).length +
    gestionProblemas.filter((m) => m.id === null).length +
    estadosProblema.filter((m) => m.codigo === null).length;

  // ── Guardado ──────────────────────────────────────────────────────────────

  function pedirGuardar() {
    if (!sucio) return aviso("No hay cambios que guardar");
    if (vacios > 0) return aviso("Hay entradas sin nombre. Escríbelas o quítalas antes de guardar.");

    const lineas = [
      `Van a quedar ${motivos.length} motivos, ${tipos.length} tipos de problema, ${trabajos.length} trabajos, ${internos.length} ítems del comentario interno, ${pendientes.length} pasos de gestión de pendientes y ${gestionProblemas.length} de gestión de problemas, y ${estadosProblema.length} estados de problema.`,
      nuevos > 0 ? `Se agregan ${nuevos} entradas nuevas.` : "",
      seDesactivan > 0
        ? `${seDesactivan} entradas dejan de aparecer en el celular. No se borra nada: las visitas y actas ya registradas las siguen mostrando.`
        : "",
      motivosSinTrabajos.length > 0
        ? `Ojo: ${motivosSinTrabajos.length === 1 ? "1 motivo queda" : `${motivosSinTrabajos.length} motivos quedan`} sin trabajos (${listaCorta(motivosSinTrabajos.map((m) => m.nombre))}); una visita con solo ese motivo no se puede cerrar.`
        : "",
      trabajosSinMotivo.length > 0
        ? `${trabajosSinMotivo.length === 1 ? "1 trabajo no está" : `${trabajosSinMotivo.length} trabajos no están`} en ningún motivo (${listaCorta(trabajosSinMotivo.map((t) => t.nombre))}): el técnico no ${trabajosSinMotivo.length === 1 ? "lo" : "los"} va a ver.`
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
        ? `Checklist guardado · ${r.motivos} motivos, ${r.problemas} tipos, ${r.trabajos} trabajos, ${r.internos} internos, ${r.pendientes + r.gestionProblemas} de gestión` +
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
        "Se guarda una copia de las listas tal como están ahora. El botón «Reiniciar» va a devolverlas siempre a esta copia. " +
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
        `Las listas vuelven a la plantilla que fijaste ` +
        `(${plantilla.motivos} motivos, ${plantilla.problemas} tipos, ${plantilla.trabajos} trabajos, ${plantilla.internos} internos, ${plantilla.pendientes + plantilla.gestionProblemas} de gestión). ` +
        "Todo lo que hayas agregado después deja de aparecer en el celular. Nada se borra de la base.",
      cta: "Reiniciar checklist",
      accion: async () => {
        const res = await reiniciarChecklistAction();
        if (!res.ok) return aviso(res.error ?? "No se pudo reiniciar el checklist");
        setAbiertoTipo(null);
        setAbiertoTrabajo(null);
        setAbiertoMotivo(null);
        setAbiertoEnMotivo(null);
        setSucio(false);
        aviso("Checklist reiniciado a tu plantilla");
        router.refresh();
      },
    });
  }

  // ── Altas y clones ────────────────────────────────────────────────────────

  function agregarMotivo() {
    const key = nuevaClave();
    editar(setMotivos, (prev) => [...prev, { key, id: null, codigo: null, nombre: "", trabajos: [] }]);
    setAbiertoMotivo(key);
    aviso("Motivo agregado · escribe su nombre y agrégale sus trabajos");
  }

  function agregarInterno() {
    editar(setInternos, (prev) => [...prev, { key: nuevaClave(), id: null, codigo: null, nombre: "" }]);
    aviso("Ítem agregado · escribe su nombre y guarda");
  }

  function agregarPendiente() {
    editar(setPendientes, (prev) => [...prev, { key: nuevaClave(), id: null, codigo: null, nombre: "" }]);
    aviso("Paso agregado · escribe su nombre y guarda");
  }

  function agregarGestionProblema() {
    editar(setGestionProblemas, (prev) => [...prev, { key: nuevaClave(), id: null, codigo: null, nombre: "" }]);
    aviso("Paso agregado · escribe su nombre y guarda");
  }

  function agregarEstadoProblema() {
    // Entra antes del estado de cierre: «Resuelto» se queda al final.
    editar(setEstadosProblema, (prev) => {
      const nuevo: Motivo = { key: nuevaClave(), id: null, codigo: null, nombre: "" };
      const cierre = prev.findIndex((m) => m.codigo === ESTADO_PROBLEMA_CIERRE);
      if (cierre < 0) return [...prev, nuevo];
      const copia = [...prev];
      copia.splice(cierre, 0, nuevo);
      return copia;
    });
    aviso("Estado agregado · escribe su nombre y guarda");
  }

  function agregarGrupo(set: React.Dispatch<React.SetStateAction<Grupo[]>>, abrir: (k: string) => void) {
    const key = nuevaClave();
    editar(set, (prev) => [...prev, { key, id: null, codigo: null, nombre: "", grupoLabel: "", items: [] }]);
    abrir(key);
  }

  /**
   * Copia un tipo o un trabajo con todos sus subdetalles, justo debajo del
   * original. Devuelve la clave de la copia.
   */
  function clonarGrupo(
    grupo: Grupo,
    lista: Grupo[],
    set: React.Dispatch<React.SetStateAction<Grupo[]>>,
    abrir: (k: string) => void
  ): string {
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
    return key;
  }

  /**
   * Clona un trabajo. La copia entra justo debajo del original en `soloEn`, o
   * en todos los motivos que tienen al original si no se indica uno.
   */
  function clonarTrabajo(t: Grupo, soloEn?: string) {
    const copia = clonarGrupo(t, trabajos, setTrabajos, soloEn ? () => undefined : setAbiertoTrabajo);
    if (soloEn) setAbiertoEnMotivo(`${soloEn}:${copia}`);
    setMotivos((prev) =>
      prev.map((m) => {
        const i = m.trabajos.indexOf(t.key);
        if (i < 0 || (soloEn && m.key !== soloEn)) return m;
        const lista = [...m.trabajos];
        lista.splice(i + 1, 0, copia);
        return { ...m, trabajos: lista };
      })
    );
  }

  /** Quitar un trabajo del checklist lo suelta también de todos sus motivos. */
  function quitarTrabajo(t: Grupo) {
    const en = motivosDeTrabajo.get(t.key) ?? [];
    setConfirmar({
      titulo: "¿Quitar este trabajo de todo el checklist?",
      texto:
        `«${t.nombre || "Sin nombre"}» deja de aparecer en el celular del técnico` +
        (en.length
          ? ` en ${en.length === 1 ? "el motivo" : `los ${en.length} motivos`} donde está (${listaCorta(en.map((m) => m.nombre))}). `
          : ". ") +
        "No se borra: las visitas y actas ya registradas lo siguen mostrando. Si solo quieres sacarlo de un motivo, hazlo desde ese motivo. El cambio se aplica al guardar.",
      cta: "Quitar trabajo",
      accion: () => {
        editar(setTrabajos, (prev) => prev.filter((g) => g.key !== t.key));
        setMotivos((prev) => prev.map((m) => ({ ...m, trabajos: m.trabajos.filter((k) => k !== t.key) })));
      },
    });
  }

  /** Pone o saca un trabajo de un motivo. Al ponerlo, entra al final. */
  function alternarEnMotivo(motivoKey: string, trabajoKey: string) {
    editar(setMotivos, (prev) =>
      prev.map((m) =>
        m.key !== motivoKey
          ? m
          : {
              ...m,
              trabajos: m.trabajos.includes(trabajoKey)
                ? m.trabajos.filter((k) => k !== trabajoKey)
                : [...m.trabajos, trabajoKey],
            }
      )
    );
  }

  /** Un trabajo nuevo, que nace ya dentro del motivo y desplegado para escribirlo. */
  function crearTrabajoEnMotivo(motivoKey: string) {
    const key = nuevaClave();
    editar(setTrabajos, (prev) => [...prev, { key, id: null, codigo: null, nombre: "", grupoLabel: "", items: [] }]);
    setMotivos((prev) => prev.map((m) => (m.key === motivoKey ? { ...m, trabajos: [...m.trabajos, key] } : m)));
    setAbiertoEnMotivo(`${motivoKey}:${key}`);
  }

  /** Suma a un motivo los trabajos de otro, sin repetir los que ya tenía. */
  function copiarTrabajosDe(destino: string, origen: string) {
    const desde = motivos.find((m) => m.key === origen);
    if (!desde) return;
    const actual = motivos.find((m) => m.key === destino)?.trabajos ?? [];
    const nuevos = desde.trabajos.filter((k) => !actual.includes(k));
    if (!nuevos.length) return aviso(`«${desde.nombre}» no tiene trabajos que este motivo no tenga ya`);
    editar(setMotivos, (prev) =>
      prev.map((m) => (m.key === destino ? { ...m, trabajos: [...m.trabajos, ...nuevos] } : m))
    );
    aviso(`Se sumaron ${nuevos.length} ${nuevos.length === 1 ? "trabajo" : "trabajos"} de «${desde.nombre}»`);
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

  const total =
    motivos.length + tipos.length + trabajos.length + internos.length +
    pendientes.length +
    gestionProblemas.length +
    estadosProblema.length;


  return (
    <>
      <AdminHeader kicker="Maestros · listas que ve el técnico en terreno" title="Checklist">
        <button className="btn btn-primary" onClick={pedirGuardar} disabled={guardando || !sucio || soloLectura}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M4 12l5 5L20 6" />
          </svg>
          <span>
            {soloLectura ? "Solo lectura" : guardando ? "Guardando…" : sucio ? "Guardar cambios" : "Sin cambios"}
          </span>
        </button>
      </AdminHeader>

      <div className="px-4 md:px-7 pt-6 pb-12 animate-fade-in max-w-[1000px]">
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

        {/* Lista 1 · Motivos y sus trabajos */}
        <Bloque
          numero="Lista 1"
          titulo="Motivos y sus trabajos"
          bajada="Coordinación agenda la visita con uno o varios motivos, y bajo cada motivo el técnico registra lo que hizo eligiendo entre SUS trabajos, en este orden. Despliega un motivo para armar su lista. Un mismo trabajo puede ir en varios motivos: sus subtrabajos se editan una vez y valen en todos."
          cta="Nuevo motivo"
          onAgregar={agregarMotivo}
        >
          {!trabajosPorMotivoDisponible ? (
            <div className="mb-3 px-3.5 py-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)] text-[13px] text-[var(--color-accent-800)] max-w-[720px]">
              Falta la migración 019 en la base. Hasta que se corra, el orden de los trabajos dentro de cada motivo no
              se guarda y un trabajo que no esté en ningún motivo le sigue apareciendo al técnico en todos.
            </div>
          ) : null}
          <div className="flex flex-col gap-2.5">
            {motivosVisibles.map(({ m, i }) => (
              <Arrastrable
                key={m.key}
                grupo="motivo"
                indice={i}
                total={motivos.length}
                bloqueado={!!filtro}
                onReordenar={(desde, ranura) => editar(setMotivos, (prev) => reubicar(prev, desde, ranura))}
                onMover={(d) => editar(setMotivos, (prev) => mover(prev, i, d))}
              >
                {(agarre) => (
                  <MotivoDesplegable
                    agarre={agarre}
                    n={i + 1}
                    motivo={m}
                    motivos={motivos}
                    trabajos={trabajos}
                    motivosDeTrabajo={motivosDeTrabajo}
                    abierto={abiertoMotivo === m.key}
                    onToggle={() => setAbiertoMotivo(abiertoMotivo === m.key ? null : m.key)}
                    abiertoEnMotivo={abiertoEnMotivo}
                    setAbiertoEnMotivo={setAbiertoEnMotivo}
                    onRenombrar={(nombre) =>
                      editar(setMotivos, (prev) => prev.map((x) => (x.key === m.key ? { ...x, nombre } : x)))
                    }
                    onOrdenar={(fn) =>
                      editar(setMotivos, (prev) =>
                        prev.map((x) => (x.key === m.key ? { ...x, trabajos: fn(x.trabajos) } : x))
                      )
                    }
                    onAlternar={(k) => alternarEnMotivo(m.key, k)}
                    onCrearTrabajo={() => crearTrabajoEnMotivo(m.key)}
                    onCopiarDe={(origen) => copiarTrabajosDe(m.key, origen)}
                    onCambiarTrabajo={(k, fn) =>
                      editar(setTrabajos, (prev) => prev.map((x) => (x.key === k ? fn(x) : x)))
                    }
                    onClonarTrabajo={(t) => clonarTrabajo(t, m.key)}
                    onClonar={() => {
                      const key = nuevaClave();
                      editar(setMotivos, (prev) => {
                        const copia: MotivoConTrabajos = {
                          key,
                          id: null,
                          codigo: null,
                          nombre: nombreDeCopia(m.nombre, prev.map((x) => x.nombre)),
                          trabajos: [...m.trabajos],
                        };
                        const lista = [...prev];
                        lista.splice(i + 1, 0, copia);
                        return lista;
                      });
                      setAbiertoMotivo(key);
                      aviso(`Se clonó «${m.nombre}» con sus ${m.trabajos.length} trabajos`);
                    }}
                    onQuitar={() =>
                      setConfirmar({
                        titulo: "¿Quitar este motivo?",
                        texto: `«${m.nombre || "Sin nombre"}» deja de aparecer al agendar y en el celular del técnico. No se borra: las visitas ya registradas con este motivo lo siguen mostrando. Sus trabajos siguen en los demás motivos donde estén. El cambio se aplica al guardar.`,
                        cta: "Quitar motivo",
                        accion: () => editar(setMotivos, (prev) => prev.filter((x) => x.key !== m.key)),
                      })
                    }
                    onConfirmar={setConfirmar}
                    onAviso={aviso}
                  />
                )}
              </Arrastrable>
            ))}
          </div>
          {motivos.length === 0 ? (
            <Vacio>Sin motivos: el técnico no podría clasificar la visita, y coordinación no puede agendarla.</Vacio>
          ) : null}
          {motivos.length > 0 && motivosVisibles.length === 0 ? (
            <Vacio>Ningún motivo ni trabajo coincide con «{busqueda}».</Vacio>
          ) : null}
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

        {/* Lista 3 · Todos los trabajos (la misma relación de la Lista 1, vista desde el trabajo) */}
        <Bloque
          numero="Lista 3"
          titulo="Todos los trabajos"
          bajada="Los mismos trabajos de la Lista 1, vistos desde el otro lado: cada uno con los motivos donde aparece. Sirve para poner un trabajo en varios motivos de una vez y para encontrar los que quedaron sin motivo, que el técnico no ve. El orden lo da cada motivo, no esta lista."
          cta="Nuevo trabajo"
          onAgregar={() => agregarGrupo(setTrabajos, setAbiertoTrabajo)}
        >
          {trabajosSinMotivo.length > 0 ? (
            <div className="mb-3 px-3.5 py-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)] text-[13px] text-[var(--color-accent-800)] max-w-[720px]">
              {trabajosSinMotivo.length === 1 ? "1 trabajo no está" : `${trabajosSinMotivo.length} trabajos no están`} en
              ningún motivo y el técnico no {trabajosSinMotivo.length === 1 ? "lo" : "los"} ve:{" "}
              {listaCorta(trabajosSinMotivo.map((t) => t.nombre), 5)}. Despliégalo y marca sus motivos, o quítalo.
            </div>
          ) : null}
          {trabajosVisibles.map(({ t, i }) => {
            const en = motivosDeTrabajo.get(t.key) ?? [];
            return (
              <div key={t.key} className="mb-2.5">
                <Desplegable
                  agarre={null}
                  n={i + 1}
                  grupo={t}
                  phNombre="Ej: Calibración de antenas"
                  abierto={abiertoTrabajo === t.key}
                  onToggle={() => setAbiertoTrabajo(abiertoTrabajo === t.key ? null : t.key)}
                  resumen={
                    (t.items.length
                      ? `${t.items.length} ${t.items.length === 1 ? "subtrabajo" : "subtrabajos"}`
                      : "Sin subtrabajo") +
                    (en.length ? ` · en ${en.length} ${en.length === 1 ? "motivo" : "motivos"}` : " · sin motivo")
                  }
                  alerta={en.length === 0}
                  enMotivos={{ lista: motivos, onAlternar: (motivoKey) => alternarEnMotivo(motivoKey, t.key) }}
                  etiquetaSingular="subtrabajo"
                  etiquetaPlural="subtrabajos"
                  tituloSub="Título del subtrabajo"
                  phSub="Ej: Repuesto cambiado"
                  phNueva="Ej: Tarjeta electrónica"
                  vacioSub="Sin subtrabajos: en el celular este trabajo se agrega directo, con un toque."
                  onCambiar={(fn) => editar(setTrabajos, (prev) => prev.map((x) => (x.key === t.key ? fn(x) : x)))}
                  onClonar={() => clonarTrabajo(t)}
                  onQuitar={() => quitarTrabajo(t)}
                  onConfirmarQuitarItem={setConfirmar}
                  onAviso={aviso}
                />
              </div>
            );
          })}
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
          {!gestionDisponible ? (
            <div className="mb-3 px-3.5 py-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)] text-[13px] text-[var(--color-accent-800)] max-w-[720px]">
              Esta lista necesita la migración 014 en la base. Hasta que se corra, lo que agregues acá no se puede
              guardar.
            </div>
          ) : null}
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
          {!gestionProblemasDisponible ? (
            <div className="mb-3 px-3.5 py-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)] text-[13px] text-[var(--color-accent-800)] max-w-[720px]">
              Esta lista necesita la migración 015 en la base. Hasta que se corra, lo que agregues acá no se puede
              guardar.
            </div>
          ) : null}
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
          {!estadosProblemaDisponible ? (
            <div className="mb-3 px-3.5 py-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)] text-[13px] text-[var(--color-accent-800)] max-w-[720px]">
              Esta lista necesita la migración 016 en la base. Hasta que se corra siguen los tres estados de siempre y
              lo que cambies acá no se puede guardar.
            </div>
          ) : null}
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
  agarre,
  n,
  grupo,
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
  onClonar,
  onQuitar,
  onConfirmarQuitarItem,
  onAviso,
  enMotivos,
  alerta,
  quitarLabel = "Quitar de la lista",
  nota,
}: {
  /** La manilla de arrastre, que pone el contenedor Arrastrable. Null = no se reordena. */
  agarre: React.ReactNode;
  n: number;
  grupo: Grupo;
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
  onClonar: () => void;
  onQuitar: () => void;
  onConfirmarQuitarItem: (cfg: ConfirmarCfg) => void;
  onAviso: (texto: string) => void;
  /** Solo en «Todos los trabajos»: los motivos entre los que se elige dónde se ofrece. */
  enMotivos?: { lista: MotivoConTrabajos[]; onAlternar: (motivoKey: string) => void };
  /** Resalta el resumen: algo falta (un trabajo sin motivo). */
  alerta?: boolean;
  quitarLabel?: string;
  /** Una línea arriba de los subdetalles, al desplegar. */
  nota?: React.ReactNode;
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
    <div className="border border-black/[.35] bg-[var(--color-surface-3)]">
      <div
        className="flex items-center gap-2.5 flex-wrap px-3 py-2.5"
        style={{ background: abierto ? "#e3e1e0" : "var(--color-surface)" }}
      >
        {agarre}
        <Numero n={n} />
        <input
          value={grupo.nombre}
          onChange={(e) => onCambiar((g) => ({ ...g, nombre: e.target.value }))}
          placeholder={phNombre}
          className="input flex-1 min-w-[200px] min-h-10 font-extrabold text-[15px] bg-[var(--color-bg)]"
          aria-label={phNombre}
          autoComplete="off"
        />
        <Codigo codigo={grupo.codigo} />
        <span
          className={`text-[11px] leading-[1.2] tracking-[.06em] uppercase ${alerta ? "font-extrabold text-[var(--color-accent-800)]" : "opacity-62"}`}
        >
          {resumen}
        </span>
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
          aria-label={quitarLabel}
          title={quitarLabel}
        >
          <IconoBasura />
        </button>
      </div>

      {abierto ? (
        <div className="px-3.5 pt-3.5 pb-4 border-t border-black/[.25]">
          {nota ? <p className="m-0 mb-3.5 text-xs opacity-72 max-w-[72ch]">{nota}</p> : null}
          {enMotivos ? (
            <div className="mb-4.5">
              <div className="block text-[10px] tracking-[.11em] uppercase opacity-62 mb-1.5">
                Aparece bajo estos motivos
              </div>
              <div className="flex flex-wrap gap-1.5 max-w-[720px]">
                {enMotivos.lista
                  .filter((m) => m.nombre.trim())
                  .map((m) => {
                    const activo = m.trabajos.includes(grupo.key);
                    return (
                      <button
                        key={m.key}
                        type="button"
                        role="checkbox"
                        aria-checked={activo}
                        onClick={() => enMotivos.onAlternar(m.key)}
                        className="min-h-[34px] px-3 border cursor-pointer text-[12px] leading-[1.2]"
                        style={{
                          background: activo ? "var(--color-text)" : "transparent",
                          color: activo ? "var(--color-bg)" : "var(--color-text)",
                          borderColor: activo ? "var(--color-text)" : "rgba(32,30,29,.3)",
                          fontWeight: activo ? 800 : 400,
                        }}
                      >
                        {m.nombre}
                      </button>
                    );
                  })}
              </div>
              <p className="m-0 mt-1.5 text-xs opacity-62">
                {enMotivos.lista.some((m) => m.trabajos.includes(grupo.key))
                  ? "El técnico solo ve este trabajo bajo los motivos marcados. Al marcar uno, el trabajo entra al final de ese motivo."
                  : "Sin ningún motivo marcado, el técnico no ve este trabajo."}
              </p>
            </div>
          ) : null}
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
              // Cada grupo es su propio corral: un subdetalle no se puede
              // arrastrar desde acá hasta otro tipo o trabajo.
              <Arrastrable
                key={o.key}
                grupo={`sub-${grupo.key}`}
                indice={j}
                total={grupo.items.length}
                bloqueado={false}
                onReordenar={(desde, ranura) =>
                  onCambiar((g) => ({ ...g, items: reubicar(g.items, desde, ranura) }))
                }
                onMover={(d) => onCambiar((g) => ({ ...g, items: mover(g.items, j, d) }))}
                className="flex gap-2 items-center"
              >
                {(agarreItem) => (
              <>
                {agarreItem}
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
              </>
                )}
              </Arrastrable>
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

/**
 * Un motivo de la Lista 1, con sus trabajos adentro.
 *
 * Plegado es una fila con el nombre y cuántos trabajos tiene. Desplegado
 * muestra esos trabajos en el orden en que los ve el técnico (se reordenan
 * arrastrando), cada uno con sus subtrabajos editables ahí mismo, y abajo las
 * tres formas de sumar trabajos: uno que ya existe, uno nuevo, o todos los de
 * otro motivo parecido.
 */
function MotivoDesplegable({
  agarre,
  n,
  motivo,
  motivos,
  trabajos,
  motivosDeTrabajo,
  abierto,
  onToggle,
  abiertoEnMotivo,
  setAbiertoEnMotivo,
  onRenombrar,
  onOrdenar,
  onAlternar,
  onCrearTrabajo,
  onCopiarDe,
  onCambiarTrabajo,
  onClonarTrabajo,
  onClonar,
  onQuitar,
  onConfirmar,
  onAviso,
}: {
  agarre: React.ReactNode;
  n: number;
  motivo: MotivoConTrabajos;
  motivos: MotivoConTrabajos[];
  trabajos: Grupo[];
  motivosDeTrabajo: Map<string, MotivoConTrabajos[]>;
  abierto: boolean;
  onToggle: () => void;
  abiertoEnMotivo: string | null;
  setAbiertoEnMotivo: (v: string | null) => void;
  onRenombrar: (nombre: string) => void;
  /** Cambia la lista de claves de trabajo del motivo (para reordenar). */
  onOrdenar: (fn: (claves: string[]) => string[]) => void;
  /** Pone o saca un trabajo de este motivo. */
  onAlternar: (trabajoKey: string) => void;
  onCrearTrabajo: () => void;
  onCopiarDe: (motivoKey: string) => void;
  onCambiarTrabajo: (trabajoKey: string, fn: (g: Grupo) => Grupo) => void;
  onClonarTrabajo: (t: Grupo) => void;
  onClonar: () => void;
  onQuitar: () => void;
  onConfirmar: (cfg: ConfirmarCfg) => void;
  onAviso: (texto: string) => void;
}) {
  const porClave = new Map(trabajos.map((t) => [t.key, t]));
  const suyos = motivo.trabajos.map((k) => porClave.get(k)).filter((t): t is Grupo => Boolean(t));
  const disponibles: OpcionSelect[] = trabajos
    .filter((t) => !motivo.trabajos.includes(t.key) && t.nombre.trim())
    .map((t) => ({ v: t.key, t: t.nombre }));
  const parecidos = motivos.filter((m) => m.key !== motivo.key && m.trabajos.length > 0 && m.nombre.trim());
  const sinTrabajos = suyos.length === 0;

  return (
    <div className="border border-black/[.35] bg-[var(--color-surface-3)]">
      <div
        className="flex items-center gap-2.5 flex-wrap px-3 py-2.5"
        style={{ background: abierto ? "#e3e1e0" : "var(--color-surface)" }}
      >
        {agarre}
        <Numero n={n} />
        <input
          value={motivo.nombre}
          onChange={(e) => onRenombrar(e.target.value)}
          placeholder="Ej: Calibración de las antenas"
          className="input flex-1 min-w-[200px] min-h-10 font-extrabold text-[15px] bg-[var(--color-bg)]"
          aria-label="Nombre del motivo"
          autoComplete="off"
        />
        <Codigo codigo={motivo.codigo} />
        <span
          className={`text-[11px] leading-[1.2] tracking-[.06em] uppercase ${sinTrabajos ? "font-extrabold text-[var(--color-accent-800)]" : "opacity-62"}`}
          title={sinTrabajos ? "Una visita con solo este motivo no se puede cerrar: el técnico no tiene qué registrar." : undefined}
        >
          {sinTrabajos ? "Sin trabajos" : `${suyos.length} ${suyos.length === 1 ? "trabajo" : "trabajos"}`}
        </span>
        <button
          onClick={onToggle}
          aria-expanded={abierto}
          className="min-h-[34px] flex items-center gap-2 px-2.5 flex-none bg-transparent border border-black/[.3] cursor-pointer text-[var(--color-text)] text-[11px] leading-none tracking-[.07em] uppercase hover:bg-black/[.07]"
        >
          <span>{abierto ? "Ocultar trabajos" : "Ver trabajos"}</span>
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
          aria-label="Clonar motivo"
          title="Clonar con todos sus trabajos"
        >
          <IconoClonar />
        </button>
        <button
          onClick={onQuitar}
          className="btn btn-icon w-8.5 h-8.5 flex-none border border-black/[.3]"
          aria-label="Quitar motivo"
          title="Quitar motivo"
        >
          <IconoBasura />
        </button>
      </div>

      {abierto ? (
        <div className="px-3.5 pt-3.5 pb-4 border-t border-black/[.25]">
          <div className="text-[10px] tracking-[.11em] uppercase opacity-62 mb-2">
            Trabajos que el técnico puede registrar bajo este motivo
          </div>
          <div className="flex flex-col gap-2">
            {suyos.map((t, j) => {
              const otros = (motivosDeTrabajo.get(t.key) ?? []).filter((m) => m.key !== motivo.key);
              const clave = `${motivo.key}:${t.key}`;
              return (
                <Arrastrable
                  key={t.key}
                  grupo={`mt-${motivo.key}`}
                  indice={j}
                  total={suyos.length}
                  bloqueado={false}
                  onReordenar={(desde, ranura) => onOrdenar((claves) => reubicar(claves, desde, ranura))}
                  onMover={(d) => onOrdenar((claves) => mover(claves, j, d))}
                >
                  {(agarreT) => (
                    <Desplegable
                      agarre={agarreT}
                      n={j + 1}
                      grupo={t}
                      phNombre="Ej: Calibración de antenas"
                      abierto={abiertoEnMotivo === clave}
                      onToggle={() => setAbiertoEnMotivo(abiertoEnMotivo === clave ? null : clave)}
                      resumen={
                        (t.items.length
                          ? `${t.items.length} ${t.items.length === 1 ? "subtrabajo" : "subtrabajos"}`
                          : "Sin subtrabajo") +
                        (otros.length ? ` · también en ${otros.length} ${otros.length === 1 ? "motivo" : "motivos"}` : "")
                      }
                      nota={
                        otros.length
                          ? `Este trabajo también está en ${listaCorta(otros.map((m) => m.nombre))}. El nombre y los subtrabajos que cambies acá cambian allá también; si este motivo necesita una versión distinta, clónalo.`
                          : undefined
                      }
                      etiquetaSingular="subtrabajo"
                      etiquetaPlural="subtrabajos"
                      tituloSub="Título del subtrabajo"
                      phSub="Ej: Repuesto cambiado"
                      phNueva="Ej: Tarjeta electrónica"
                      vacioSub="Sin subtrabajos: en el celular este trabajo se agrega directo, con un toque."
                      onCambiar={(fn) => onCambiarTrabajo(t.key, fn)}
                      onClonar={() => onClonarTrabajo(t)}
                      quitarLabel="Sacar de este motivo"
                      onQuitar={() => {
                        onAlternar(t.key);
                        onAviso(
                          otros.length
                            ? `«${t.nombre}» salió de este motivo; sigue en ${otros.length} ${otros.length === 1 ? "otro" : "otros"}`
                            : `«${t.nombre || "Sin nombre"}» salió de este motivo y no queda en ninguno: el técnico no lo verá`
                        );
                      }}
                      onConfirmarQuitarItem={onConfirmar}
                      onAviso={onAviso}
                    />
                  )}
                </Arrastrable>
              );
            })}
            {sinTrabajos ? (
              <Vacio>
                Sin trabajos: el técnico no tendría qué registrar bajo este motivo y una visita con solo este motivo no
                se podría cerrar. Agrega al menos uno.
              </Vacio>
            ) : null}
          </div>

          <div className="flex items-end gap-2.5 flex-wrap mt-3.5 max-w-[860px]">
            <div className="flex-1 min-w-[240px]">
              <div className="text-[10px] tracking-[.11em] uppercase opacity-62 mb-1.5">Agregar un trabajo que ya existe</div>
              {disponibles.length ? (
                <SelectBuscable
                  valor=""
                  opciones={disponibles}
                  onChange={(k) => k && onAlternar(k)}
                  placeholder="Escribe para buscar el trabajo…"
                  ariaLabel="Agregar un trabajo que ya existe"
                />
              ) : (
                <div className="text-xs opacity-62 min-h-10 flex items-center">Ya tiene todos los trabajos del checklist.</div>
              )}
            </div>
            <button onClick={onCrearTrabajo} className="btn btn-secondary shrink-0 min-h-10">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Crear trabajo nuevo</span>
            </button>
            {parecidos.length ? (
              <select
                value=""
                onChange={(e) => {
                  const origen = e.target.value;
                  if (!origen) return;
                  const desde = motivos.find((m) => m.key === origen);
                  onConfirmar({
                    titulo: "¿Copiar los trabajos de otro motivo?",
                    texto: `Se suman a «${motivo.nombre || "este motivo"}» los trabajos de «${desde?.nombre}» que todavía no tiene, al final de la lista. Son los mismos trabajos, no copias: después puedes sacar los que sobren. El cambio se aplica al guardar.`,
                    cta: "Copiar trabajos",
                    accion: () => onCopiarDe(origen),
                  });
                }}
                className="input min-h-10 max-w-[280px] bg-[var(--color-bg)]"
                aria-label="Copiar los trabajos de otro motivo"
              >
                <option value="">Copiar los de otro motivo…</option>
                {parecidos.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.nombre} ({m.trabajos.length})
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Lista plana y reordenable: comentario interno, gestión y estados. Cada fila es un
 * nombre con su código, un botón para clonar y otro para quitar.
 */
function FilasSimples({
  grupo,
  lista,
  visibles,
  bloqueado,
  que,
  placeholder,
  onEditar,
  onPedirQuitar,
}: {
  grupo: string;
  lista: Motivo[];
  visibles: { m: Motivo; i: number }[];
  bloqueado: boolean;
  que: string;
  placeholder: string;
  onEditar: (fn: (prev: Motivo[]) => Motivo[]) => void;
  onPedirQuitar: (m: Motivo) => void;
}) {
  return (
    <div className="flex flex-col gap-2 max-w-[720px]">
      {visibles.map(({ m, i }) => (
        <Arrastrable
          key={m.key}
          grupo={grupo}
          indice={i}
          total={lista.length}
          bloqueado={bloqueado}
          onReordenar={(desde, ranura) => onEditar((prev) => reubicar(prev, desde, ranura))}
          onMover={(d) => onEditar((prev) => mover(prev, i, d))}
          className="flex items-center gap-2.5"
        >
          {(agarre) => (
            <>
              {agarre}
              <Numero n={i + 1} />
              <input
                value={m.nombre}
                onChange={(e) =>
                  onEditar((prev) => prev.map((x) => (x.key === m.key ? { ...x, nombre: e.target.value } : x)))
                }
                placeholder={placeholder}
                className="input flex-1 min-w-0 bg-[var(--color-surface-3)]"
                aria-label={`Nombre del ${que}`}
                autoComplete="off"
              />
              <Codigo codigo={m.codigo} />
              <button
                onClick={() =>
                  onEditar((prev) => {
                    const copia: Motivo = {
                      key: nuevaClave(),
                      id: null,
                      codigo: null,
                      nombre: nombreDeCopia(m.nombre, prev.map((x) => x.nombre)),
                    };
                    const nueva = [...prev];
                    nueva.splice(i + 1, 0, copia);
                    return nueva;
                  })
                }
                className="btn btn-icon w-10 h-10 flex-none border border-black/[.3]"
                aria-label={`Clonar ${que}`}
                title={`Clonar este ${que}`}
              >
                <IconoClonar />
              </button>
              <button
                onClick={() => onPedirQuitar(m)}
                className="btn btn-icon w-10 h-10 flex-none border border-black/[.3]"
                aria-label={`Quitar ${que}`}
              >
                <IconoBasura />
              </button>
            </>
          )}
        </Arrastrable>
      ))}
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

/**
 * Fila que se reordena arrastrándola.
 *
 * Antes el orden se cambiaba de a un clic por posición, con dos flechitas: para
 * bajar una entrada seis lugares había que apretar seis veces. Ahora se agarra
 * de la manilla y se suelta donde va.
 *
 * Solo la manilla arrastra: si la fila entera fuera arrastrable, seleccionar
 * texto dentro de sus campos empezaría a mover la fila. Y la manilla también
 * responde a las flechas del teclado, para quien no usa el mouse.
 */
function Arrastrable({
  grupo,
  indice,
  total,
  bloqueado,
  onReordenar,
  onMover,
  className,
  children,
}: {
  /** Filas del mismo grupo se aceptan entre sí; de otro grupo, no. */
  grupo: string;
  indice: number;
  total: number;
  /** Con la búsqueda puesta no se ven todas las filas: mover sería a ciegas. */
  bloqueado: boolean;
  /** Suelta la fila `desde` en la ranura `ranura` (hueco entre filas). */
  onReordenar: (desde: number, ranura: number) => void;
  /** El equivalente por teclado: una posición arriba o abajo. */
  onMover: (delta: number) => void;
  className?: string;
  children: (agarre: React.ReactNode) => React.ReactNode;
}) {
  const [asido, setAsido] = useState(false);
  const [borde, setBorde] = useState<"arriba" | "abajo" | null>(null);
  // El tipo del dataTransfer es lo único legible durante el dragover, así que
  // el grupo viaja en el nombre del tipo. Debe ir en minúsculas.
  const tipo = `application/x-dmc-${grupo.toLowerCase()}`;

  const mitadDeArriba = (e: React.DragEvent<HTMLDivElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    return e.clientY < caja.top + caja.height / 2;
  };

  const agarre = (
    <button
      type="button"
      draggable={false}
      disabled={bloqueado}
      onPointerDown={() => setAsido(true)}
      onPointerUp={() => setAsido(false)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        onMover(e.key === "ArrowUp" ? -1 : 1);
      }}
      aria-label={`Mover: fila ${indice + 1} de ${total}`}
      title={
        bloqueado
          ? "Quita la búsqueda para poder reordenar"
          : "Arrastra para cambiar el orden (o usa ↑ ↓ del teclado)"
      }
      className="w-7 h-9 flex-none grid place-items-center border border-black/[.3] bg-[var(--color-bg)] text-[var(--color-text)] cursor-grab active:cursor-grabbing hover:bg-black/[.08] disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="9" cy="6" r="1.7" />
        <circle cx="15" cy="6" r="1.7" />
        <circle cx="9" cy="12" r="1.7" />
        <circle cx="15" cy="12" r="1.7" />
        <circle cx="9" cy="18" r="1.7" />
        <circle cx="15" cy="18" r="1.7" />
      </svg>
    </button>
  );

  return (
    <div
      draggable={asido && !bloqueado}
      onDragStart={(e) => {
        if (!asido || bloqueado) return e.preventDefault();
        e.dataTransfer.setData(tipo, String(indice));
        e.dataTransfer.effectAllowed = "move";
        // Las filas de subdetalle viven dentro de la fila de su grupo: sin esto
        // el arrastre del sub burbujea al Arrastrable de afuera, que —al no
        // estar asido— lo cancela con preventDefault y nada se mueve.
        e.stopPropagation();
      }}
      onDragEnd={(e) => {
        setAsido(false);
        setBorde(null);
        e.stopPropagation();
      }}
      onDragOver={(e) => {
        if (bloqueado || !e.dataTransfer.types.includes(tipo)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setBorde(mitadDeArriba(e) ? "arriba" : "abajo");
      }}
      onDragLeave={() => setBorde(null)}
      onDrop={(e) => {
        setBorde(null);
        if (bloqueado || !e.dataTransfer.types.includes(tipo)) return;
        e.preventDefault();
        e.stopPropagation();
        const desde = Number(e.dataTransfer.getData(tipo));
        if (!Number.isInteger(desde)) return;
        onReordenar(desde, mitadDeArriba(e) ? indice : indice + 1);
      }}
      className={`relative ${className ?? ""}`}
      style={{ opacity: asido ? 0.55 : 1 }}
    >
      {borde ? (
        <span
          aria-hidden="true"
          className="absolute left-0 right-0 h-[3px] bg-[var(--color-accent)] pointer-events-none z-10"
          style={borde === "arriba" ? { top: -2 } : { bottom: -2 }}
        />
      ) : null}
      {children(agarre)}
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
