"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sinTildes } from "@/lib/ui/formato";
import { useRouter } from "next/navigation";
import type { ConfirmarCfg } from "@/components/ui/Confirmar";
import { useToast } from "@/components/ui/Toast";
import { puede, useReferencias } from "@/lib/ui/referencias";
import {
  guardarChecklistAction,
  guardarPlantillaChecklistAction,
  reiniciarChecklistAction,
} from "@/app/actions/admin";
import type { BorradorChecklist } from "@/lib/contratos/checklist";
import { ESTADO_PROBLEMA_CIERRE } from "@/lib/ui/estado";
import type {
  CatalogoEstadoProblema,
  CatalogoGestionProblema,
  CatalogoInterno,
  CatalogoMotivo,
  CatalogoCargo,
  CatalogoPendiente,
  CatalogoProblema,
  CatalogoSeccion,
  CatalogoTrabajo,
  ChecklistPlantilla,
} from "@/lib/types";
import { Desplegable, MotivoDesplegable } from "@/components/admin/checklist/desplegables";
import {
  type Grupo,
  type Motivo,
  type MotivoConTrabajos,
  type Seccion,
  aGruposProblema,
  aMotivos,
  armarListas,
  listaCorta,
  moverEn,
  nombreDeCopia,
  nuevaClave,
  reubicarEn,
} from "@/components/admin/checklist/modelo";
import { Arrastrable } from "@/components/admin/checklist/piezas";

// El borrador local del checklist y todo lo que lo cambia: las ocho listas,
// las secciones, la búsqueda, lo que se desactiva al guardar y la plantilla.
// Las listas en pantalla solo lo leen (ver components/admin/ChecklistEditor.tsx).

export function useChecklistEditor({
  motivosIniciales,
  tiposIniciales,
  trabajosIniciales,
  internosIniciales,
  pendientesIniciales,
  cargosIniciales,
  gestionProblemasIniciales,
  estadosProblemaIniciales,
  seccionesMotivoIniciales,
  seccionesTrabajoIniciales,
  plantillaInicial,
}: {
  motivosIniciales: CatalogoMotivo[];
  tiposIniciales: CatalogoProblema[];
  trabajosIniciales: CatalogoTrabajo[];
  internosIniciales: CatalogoInterno[];
  pendientesIniciales: CatalogoPendiente[];
  cargosIniciales: CatalogoCargo[];
  gestionProblemasIniciales: CatalogoGestionProblema[];
  /** Solo los activos, en su orden. */
  estadosProblemaIniciales: CatalogoEstadoProblema[];
  seccionesMotivoIniciales: CatalogoSeccion[];
  seccionesTrabajoIniciales: CatalogoSeccion[];
  plantillaInicial: ChecklistPlantilla | null;
}) {
  const router = useRouter();
  const { toast, aviso } = useToast();

  // Motivos y trabajos nacen juntos: los motivos apuntan a sus trabajos por la
  // clave que se les acaba de dar.
  const [inicial] = useState(() =>
    armarListas(motivosIniciales, trabajosIniciales, seccionesMotivoIniciales, seccionesTrabajoIniciales)
  );
  const [motivos, setMotivos] = useState<MotivoConTrabajos[]>(inicial.motivos);
  const [seccionesMotivo, setSeccionesMotivo] = useState<Seccion[]>(inicial.seccionesMotivo);
  const [seccionesTrabajo, setSeccionesTrabajo] = useState<Seccion[]>(inicial.seccionesTrabajo);
  /** Las secciones plegadas. Por defecto todas se ven abiertas. */
  const [plegadas, setPlegadas] = useState<Set<string>>(() => new Set());
  const [tipos, setTipos] = useState<Grupo[]>(() => aGruposProblema(tiposIniciales));
  const [trabajos, setTrabajos] = useState<Grupo[]>(inicial.trabajos);
  const [internos, setInternos] = useState<Motivo[]>(() => aMotivos(internosIniciales));
  const [pendientes, setPendientes] = useState<Motivo[]>(() => aMotivos(pendientesIniciales));
  const [cargos, setCargos] = useState<Motivo[]>(() => aMotivos(cargosIniciales));
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
    cargos: cargosIniciales.length,
    gestionProblemas: gestionProblemasIniciales.length,
    estadosProblema: estadosProblemaIniciales.length,
  });

  // Tras guardar, el servidor vuelve a mandar las listas ya escritas: el
  // borrador se rehace desde ellas para que los ids nuevos queden en pantalla.
  useEffect(() => {
    const listas = armarListas(motivosIniciales, trabajosIniciales, seccionesMotivoIniciales, seccionesTrabajoIniciales);
    setSeccionesMotivo(listas.seccionesMotivo);
    setSeccionesTrabajo(listas.seccionesTrabajo);
    setMotivos(listas.motivos);
    setTipos(aGruposProblema(tiposIniciales));
    setTrabajos(listas.trabajos);
    setInternos(aMotivos(internosIniciales));
    setPendientes(aMotivos(pendientesIniciales));
    setCargos(aMotivos(cargosIniciales));
    setGestionProblemas(aMotivos(gestionProblemasIniciales));
    setEstadosProblema(aMotivos(estadosProblemaIniciales));
    enBase.current = {
      motivos: motivosIniciales.length,
      tipos: tiposIniciales.length,
      trabajos: trabajosIniciales.length,
      internos: internosIniciales.length,
      pendientes: pendientesIniciales.length,
      cargos: cargosIniciales.length,
      gestionProblemas: gestionProblemasIniciales.length,
      estadosProblema: estadosProblemaIniciales.length,
    };
    setSucio(false);
  }, [
    motivosIniciales,
    seccionesMotivoIniciales,
    seccionesTrabajoIniciales,
    tiposIniciales,
    trabajosIniciales,
    internosIniciales,
    pendientesIniciales,
    cargosIniciales,
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
  const cargosVisibles = useMemo(
    () => cargos.map((m, i) => ({ m, i })).filter(({ m }) => coincide(m.nombre)),
    [cargos, coincide]
  );
  const gestionProblemasVisibles = useMemo(
    () => gestionProblemas.map((m, i) => ({ m, i })).filter(({ m }) => coincide(m.nombre)),
    [gestionProblemas, coincide]
  );
  const estadosProblemaVisibles = useMemo(
    () => estadosProblema.map((m, i) => ({ m, i })).filter(({ m }) => coincide(m.nombre)),
    [estadosProblema, coincide]
  );

  const nombreDeSeccion = (lista: Seccion[], key: string | null | undefined) =>
    lista.find((x) => x.key === key)?.nombre.trim() || null;

  const borrador = (): BorradorChecklist => ({
    seccionesMotivo: seccionesMotivo.map((x) => x.nombre.trim()).filter(Boolean),
    seccionesTrabajo: seccionesTrabajo.map((x) => x.nombre.trim()).filter(Boolean),
    motivos: motivos.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      seccion: nombreDeSeccion(seccionesMotivo, m.seccion),
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
      seccion: nombreDeSeccion(seccionesTrabajo, t.seccion),
      subtrabajos: t.items.map((o) => ({ id: o.id, etiqueta: o.etiqueta, permiteCantidad: o.permiteCantidad })),
    })),
    internos: internos.map((m) => ({ id: m.id, nombre: m.nombre })),
    pendientes: pendientes.map((m) => ({ id: m.id, nombre: m.nombre })),
    cargos: cargos.map((m) => ({ id: m.id, nombre: m.nombre })),
    gestionProblemas: gestionProblemas.map((m) => ({ id: m.id, nombre: m.nombre })),
    estadosProblema: estadosProblema.map((m) => ({ id: m.id, nombre: m.nombre })),
  });

  const vacios =
    seccionesMotivo.filter((x) => !x.nombre.trim()).length +
    seccionesTrabajo.filter((x) => !x.nombre.trim()).length +
    motivos.filter((m) => !m.nombre.trim()).length +
    tipos.filter((t) => !t.nombre.trim()).length +
    trabajos.filter((t) => !t.nombre.trim()).length +
    internos.filter((m) => !m.nombre.trim()).length +
    pendientes.filter((m) => !m.nombre.trim()).length +
    cargos.filter((m) => !m.nombre.trim()).length +
    gestionProblemas.filter((m) => !m.nombre.trim()).length +
    estadosProblema.filter((m) => !m.nombre.trim()).length;

  const seDesactivan =
    Math.max(0, enBase.current.motivos - motivos.filter((m) => m.id !== null).length) +
    Math.max(0, enBase.current.tipos - tipos.filter((t) => t.id !== null).length) +
    Math.max(0, enBase.current.trabajos - trabajos.filter((t) => t.id !== null).length) +
    Math.max(0, enBase.current.internos - internos.filter((m) => m.id !== null).length) +
    Math.max(0, enBase.current.pendientes - pendientes.filter((m) => m.id !== null).length) +
    Math.max(0, enBase.current.cargos - cargos.filter((m) => m.id !== null).length) +
    Math.max(0, enBase.current.gestionProblemas - gestionProblemas.filter((m) => m.id !== null).length) +
    Math.max(0, enBase.current.estadosProblema - estadosProblema.filter((m) => m.codigo !== null).length);

  const nuevos =
    motivos.filter((m) => m.id === null).length +
    tipos.filter((t) => t.id === null).length +
    trabajos.filter((t) => t.id === null).length +
    internos.filter((m) => m.id === null).length +
    pendientes.filter((m) => m.id === null).length +
    cargos.filter((m) => m.id === null).length +
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

  function agregarMotivo(seccion: string | null = null) {
    const key = nuevaClave();
    editar(setMotivos, (prev) => [...prev, { key, id: null, codigo: null, nombre: "", seccion, trabajos: [] }]);
    setAbiertoMotivo(key);
    if (seccion) abrirSeccion(seccion);
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

  function agregarCargo() {
    editar(setCargos, (prev) => [...prev, { key: nuevaClave(), id: null, codigo: null, nombre: "" }]);
    aviso("Cargo agregado · escribe su nombre y guarda");
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

  function agregarGrupo(
    set: React.Dispatch<React.SetStateAction<Grupo[]>>,
    abrir: (k: string) => void,
    seccion: string | null = null
  ) {
    const key = nuevaClave();
    editar(set, (prev) => [...prev, { key, id: null, codigo: null, nombre: "", grupoLabel: "", items: [], seccion }]);
    abrir(key);
    if (seccion) abrirSeccion(seccion);
  }

  // ── Secciones ─────────────────────────────────────────────────────────────

  function abrirSeccion(key: string) {
    setPlegadas((prev) => {
      if (!prev.has(key)) return prev;
      const siguiente = new Set(prev);
      siguiente.delete(key);
      return siguiente;
    });
  }

  function alternarSeccion(key: string) {
    setPlegadas((prev) => {
      const siguiente = new Set(prev);
      if (!siguiente.delete(key)) siguiente.add(key);
      return siguiente;
    });
  }

  function agregarSeccion(set: React.Dispatch<React.SetStateAction<Seccion[]>>) {
    const key = nuevaClave();
    editar(set, (prev) => [...prev, { key, nombre: "" }]);
    aviso("Sección agregada · escribe su nombre");
  }

  /** Quitar una sección no quita a nadie: sus entradas pasan a «Sin sección». */
  function quitarSeccion(sec: Seccion, de: "motivos" | "trabajos") {
    const cuantas = (de === "motivos" ? motivos : trabajos).filter((x) => x.seccion === sec.key).length;
    setConfirmar({
      titulo: "¿Quitar esta sección?",
      texto:
        `«${sec.nombre || "Sin nombre"}» deja de existir como sección. ` +
        (cuantas
          ? `Sus ${cuantas} ${de === "motivos" ? "motivos" : "trabajos"} no se quitan: pasan a «Sin sección». `
          : "") +
        "El cambio se aplica al guardar.",
      cta: "Quitar sección",
      accion: () => {
        if (de === "motivos") {
          editar(setSeccionesMotivo, (prev) => prev.filter((x) => x.key !== sec.key));
          setMotivos((prev) => prev.map((m) => (m.seccion === sec.key ? { ...m, seccion: null } : m)));
        } else {
          editar(setSeccionesTrabajo, (prev) => prev.filter((x) => x.key !== sec.key));
          setTrabajos((prev) => prev.map((t) => (t.seccion === sec.key ? { ...t, seccion: null } : t)));
        }
      },
    });
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
      seccion: grupo.seccion,
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
    cargos.length +
    gestionProblemas.length +
    estadosProblema.length;

  /** Una fila de la Lista 3: el trabajo con sus subtrabajos y los motivos donde aparece. */
  const filaTrabajoL3 = (t: Grupo, i: number) => {
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
                  seccion={{
                    valor: t.seccion ?? null,
                    opciones: seccionesTrabajo,
                    onCambiar: (k) =>
                      editar(setTrabajos, (prev) => prev.map((x) => (x.key === t.key ? { ...x, seccion: k } : x))),
                  }}
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
  };

  /**
   * Una fila de la Lista 1. `local` es su lugar dentro de su sección (o de la
   * lista entera si no hay secciones): ahí cuenta el arrastre y la numeración.
   */
  const filaMotivo = (
    m: MotivoConTrabajos,
    local: number,
    totalLocal: number,
    enGrupo: (x: MotivoConTrabajos) => boolean,
    claveGrupo: string
  ) => {
    const i = motivos.findIndex((x) => x.key === m.key);
    return (
      <Arrastrable
        key={m.key}
        grupo={`motivo-${claveGrupo}`}
        indice={local}
        total={totalLocal}
        bloqueado={!!filtro}
        onReordenar={(desde, ranura) => editar(setMotivos, (prev) => reubicarEn(prev, enGrupo, desde, ranura))}
        onMover={(d) => editar(setMotivos, (prev) => moverEn(prev, enGrupo, local, d))}
      >
        {(agarre) => (
                  <MotivoDesplegable
                    agarre={agarre}
                    n={local + 1}
                    motivo={m}
                    motivos={motivos}
                    secciones={seccionesMotivo}
                    onCambiarSeccion={(k) =>
                      editar(setMotivos, (prev) => prev.map((x) => (x.key === m.key ? { ...x, seccion: k } : x)))
                    }
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
                          seccion: m.seccion,
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
    );
  };

  return {
    motivosIniciales,
    tiposIniciales,
    trabajosIniciales,
    internosIniciales,
    pendientesIniciales,
    cargosIniciales,
    gestionProblemasIniciales,
    estadosProblemaIniciales,
    seccionesMotivoIniciales,
    seccionesTrabajoIniciales,
    plantillaInicial,
    router,
    toast,
    aviso,
    inicial,
    motivos,
    setMotivos,
    seccionesMotivo,
    setSeccionesMotivo,
    seccionesTrabajo,
    setSeccionesTrabajo,
    plegadas,
    setPlegadas,
    tipos,
    setTipos,
    trabajos,
    setTrabajos,
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
    plantilla,
    setPlantilla,
    abiertoTipo,
    setAbiertoTipo,
    abiertoTrabajo,
    setAbiertoTrabajo,
    abiertoMotivo,
    setAbiertoMotivo,
    abiertoEnMotivo,
    setAbiertoEnMotivo,
    confirmar,
    setConfirmar,
    busqueda,
    setBusqueda,
    guardando,
    setGuardando,
    soloLectura,
    sucio,
    setSucio,
    enBase,
    editar,
    filtro,
    coincide,
    trabajoPorClave,
    motivosVisibles,
    motivosDeTrabajo,
    motivosSinTrabajos,
    trabajosSinMotivo,
    tiposVisibles,
    trabajosVisibles,
    internosVisibles,
    pendientesVisibles,
    cargosVisibles,
    gestionProblemasVisibles,
    estadosProblemaVisibles,
    nombreDeSeccion,
    borrador,
    vacios,
    seDesactivan,
    nuevos,
    pedirGuardar,
    guardar,
    guardarComoPlantilla,
    reiniciar,
    agregarMotivo,
    agregarInterno,
    agregarPendiente,
    agregarCargo,
    agregarGestionProblema,
    agregarEstadoProblema,
    agregarGrupo,
    abrirSeccion,
    alternarSeccion,
    agregarSeccion,
    quitarSeccion,
    clonarGrupo,
    clonarTrabajo,
    quitarTrabajo,
    alternarEnMotivo,
    crearTrabajoEnMotivo,
    copiarTrabajosDe,
    quitarGrupo,
    total,
    filaTrabajoL3,
    filaMotivo,
  };
}

/** Todo lo que el formulario expone a sus pantallas, secciones y hojas. */
export type ChecklistEditorApi = ReturnType<typeof useChecklistEditor>;
