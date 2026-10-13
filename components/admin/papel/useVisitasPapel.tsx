"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import {
  crearVisitasPapelAction,
  firmantesDeSucursalesAction,
  type FirmanteSugerido,
} from "@/app/actions/visitas-papel";
import { useReferencias } from "@/lib/ui/referencias";
import { agruparPorSeccion } from "@/lib/ui/secciones";
import { hoyISO } from "@/lib/ui/fecha";
import { PRIMER_ANIO_PAPEL } from "@/lib/ui/papel";
import type { InformePapel } from "@/lib/contratos/papel";
import { borrarBorradorPapel, escribirBorradorPapel, leerBorradorPapel } from "@/lib/ui/borrador-papel";
import { useUsuarioLocal } from "@/lib/ui/usuario-local";
import {
  type Bloque,
  type Borrador,
  type Grupo,
  type Informe,
  TANDA,
  type Tienda,
  faltante,
  fechaDe,
  nuevaKey,
} from "@/components/admin/papel/modelo";

// El estado de la carga de visitas en papel y todo lo que lo cambia: año,
// técnicos, clientes, tiendas e informes, el borrador del navegador, las firmas
// sugeridas y el guardado por tandas (ver components/admin/VisitasPapel.tsx).

export function useVisitasPapel() {
  const uid = useUsuarioLocal();
  const router = useRouter();
  const ref = useReferencias();
  const { toast, aviso } = useToast();
  const hoy = hoyISO();
  const anioActual = Number(hoy.slice(0, 4));

  const [anio, setAnio] = useState(anioActual - 1);
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [informes, setInformes] = useState<Informe[]>([]);
  const [guardando, setGuardando] = useState<{ hechos: number; total: number } | null>(null);
  const [guardados, setGuardados] = useState<{ folio: string; nombre: string }[]>([]);
  const [cargado, setCargado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  // Quitar algo de la lista pide confirmar antes: se pierde lo ya escrito.
  const [porQuitar, setPorQuitar] = useState<{ titulo: string; cta: string; accion: () => void } | null>(null);
  const foco = useRef<string | null>(null);
  // Quién firmó antes en cada tienda (sucursalId → firmantes), para sugerirlo.
  const [firmantesPrevios, setFirmantesPrevios] = useState<Record<string, FirmanteSugerido[]>>({});
  const pedidos = useRef(new Set<string>());

  // El borrador se lee recién en el navegador: en el servidor no existe.
  useEffect(() => {
    try {
      const crudo = leerBorradorPapel(uid);
      if (crudo) {
        const b = JSON.parse(crudo) as Borrador;
        if (b.anio) setAnio(b.anio);
        if (Array.isArray(b.bloques)) setBloques(b.bloques);
        if (Array.isArray(b.grupos)) setGrupos(b.grupos);
        if (Array.isArray(b.tiendas)) setTiendas(b.tiendas);
        if (Array.isArray(b.informes)) setInformes(b.informes);
      }
    } catch {
      // Sin almacenamiento (ventana privada, bloqueado): se trabaja sin borrador.
    }
    setCargado(true);
  }, [uid]);

  useEffect(() => {
    if (!cargado) return;
    try {
      const b: Borrador = { anio, bloques, grupos, tiendas, informes };
      if (bloques.length) escribirBorradorPapel(uid, JSON.stringify(b));
      else borrarBorradorPapel(uid);
    } catch {
      // Igual que arriba: el borrador es una comodidad, no un requisito.
    }
  }, [uid, cargado, anio, bloques, grupos, tiendas, informes]);

  // Al agregar una tienda se trae, una sola vez, quién ha firmado ahí antes.
  useEffect(() => {
    const nuevos = [...new Set(tiendas.map((t) => t.sucursalId))].filter((id) => id && !pedidos.current.has(id));
    if (!nuevos.length) return;
    nuevos.forEach((id) => pedidos.current.add(id));
    firmantesDeSucursalesAction({ sucursalIds: nuevos.map(Number) })
      .then((res) => setFirmantesPrevios((prev) => ({ ...prev, ...res })))
      .catch(() => nuevos.forEach((id) => pedidos.current.delete(id)));
  }, [tiendas]);

  // El informe recién agregado recibe el cursor: se agrega y se escribe.
  useEffect(() => {
    if (!foco.current) return;
    document.getElementById(foco.current)?.focus();
    foco.current = null;
  }, [informes]);

  // Los informes son de años pasados: también se ofrecen los técnicos, clientes
  // y sucursales que hoy están inactivos, marcados como tales.
  const opcTecnicos = useMemo(
    () =>
      [...ref.tecnicos]
        .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombreCompleto.localeCompare(b.nombreCompleto))
        .map((t) => ({ v: String(t.id), t: t.activo ? t.nombreCompleto : `${t.nombreCompleto} (inactivo)` })),
    [ref.tecnicos]
  );
  const opcMotivos = useMemo(
    () =>
      agruparPorSeccion(ref.motivos)
        .flatMap((g) => g.items)
        .map((m) => ({ v: m.codigo, t: m.seccion ? `${m.seccion} · ${m.nombre}` : m.nombre })),
    [ref.motivos]
  );
  const catalogoTrabajos = useMemo(() => ref.trabajos.filter((t) => t.activo), [ref.trabajos]);
  const nombreCliente = (id: string) => ref.clientes.find((c) => String(c.id) === id)?.nombreFantasia ?? "";
  const nombreTecnico = (id: string) => ref.tecnicos.find((t) => String(t.id) === id)?.nombreCompleto ?? "";
  const sucursal = (id: string) => ref.sucursales.find((s) => String(s.id) === id);

  const tecnicosLibres = opcTecnicos.filter((o) => !bloques.some((b) => b.tecnicoId === o.v));
  const completos = informes.filter((i) => !faltante(i, anio, hoy)).length;

  // Los informes de cada nivel, para los contadores de las cabeceras.
  const grupoDeTienda = new Map(tiendas.map((t) => [t.key, t.grupoKey]));
  const tecnicoDeGrupo = new Map(grupos.map((g) => [g.key, g.tecnicoId]));
  const informesDe = (filtro: { tecnicoId?: string; grupoKey?: string }) =>
    informes.filter((i) => {
      const grupoKey = grupoDeTienda.get(i.tiendaKey);
      if (filtro.grupoKey) return grupoKey === filtro.grupoKey;
      return grupoKey !== undefined && tecnicoDeGrupo.get(grupoKey) === filtro.tecnicoId;
    });

  function agregarTecnico(tecnicoId: string) {
    if (!tecnicoId) return;
    setBloques((prev) =>
      prev.some((b) => b.tecnicoId === tecnicoId)
        ? prev.map((b) => (b.tecnicoId === tecnicoId ? { ...b, abierto: true } : b))
        : [...prev, { tecnicoId, abierto: true }]
    );
  }

  function cambiarBloque(tecnicoId: string, cambios: Partial<Bloque>) {
    setBloques((prev) => prev.map((b) => (b.tecnicoId === tecnicoId ? { ...b, ...cambios } : b)));
  }

  /** Quita un conjunto de grupos con sus tiendas e informes. */
  function quitarGrupos(keys: Set<string>) {
    const tiendasFuera = new Set(tiendas.filter((t) => keys.has(t.grupoKey)).map((t) => t.key));
    setInformes((prev) => prev.filter((i) => !tiendasFuera.has(i.tiendaKey)));
    setTiendas((prev) => prev.filter((t) => !keys.has(t.grupoKey)));
    setGrupos((prev) => prev.filter((g) => !keys.has(g.key)));
  }

  function quitarBloque(tecnicoId: string) {
    quitarGrupos(new Set(grupos.filter((g) => g.tecnicoId === tecnicoId).map((g) => g.key)));
    setBloques((prev) => prev.filter((b) => b.tecnicoId !== tecnicoId));
  }

  function agregarCliente(tecnicoId: string, clienteId: string) {
    if (!clienteId) return;
    setGrupos((prev) =>
      prev.some((g) => g.tecnicoId === tecnicoId && g.clienteId === clienteId)
        ? prev.map((g) => (g.tecnicoId === tecnicoId && g.clienteId === clienteId ? { ...g, abierto: true } : g))
        : [...prev, { key: nuevaKey(), tecnicoId, clienteId, abierto: true, mallId: "" }]
    );
  }

  function cambiarGrupo(key: string, cambios: Partial<Grupo>) {
    setGrupos((prev) => prev.map((g) => (g.key === key ? { ...g, ...cambios } : g)));
  }

  /**
   * Un informe nuevo: copia mes, motivo, quién firmó y los trabajos del último de
   * la tienda o, si no hay, del cliente. Solo quedan por escribir el día y la descripción.
   */
  function informeNuevo(tienda: Tienda, previos: Informe[]): Informe {
    const delGrupo = new Set(tiendas.filter((t) => t.grupoKey === tienda.grupoKey).map((t) => t.key));
    delGrupo.add(tienda.key);
    const previo =
      previos.filter((i) => i.tiendaKey === tienda.key).at(-1) ??
      previos.filter((i) => delGrupo.has(i.tiendaKey)).at(-1);
    return {
      key: nuevaKey(),
      tiendaKey: tienda.key,
      mes: previo?.mes ?? "",
      dia: "",
      motivo: previo?.motivo ?? "",
      trabajos: structuredClone(previo?.trabajos ?? []),
      firmante: previo?.firmante ?? "",
      rut: previo?.rut ?? "",
      descripcion: "",
    };
  }

  /** Copia un informe entero, salvo el día, y lo deja justo debajo para cambiar solo eso. */
  function duplicarInforme(origen: Informe) {
    const copia: Informe = {
      ...origen,
      key: nuevaKey(),
      dia: "",
      trabajos: structuredClone(origen.trabajos ?? []),
      error: undefined,
      repetida: false,
      aunqueRepetida: false,
    };
    foco.current = `pp-${copia.key}-dia`;
    setInformes((prev) => {
      const i = prev.findIndex((x) => x.key === origen.key);
      return i < 0 ? [...prev, copia] : [...prev.slice(0, i + 1), copia, ...prev.slice(i + 1)];
    });
  }

  /** Agrega tiendas al cliente; cada una nace con un informe listo para llenar. */
  function agregarTiendas(grupoKey: string, sucursalIds: string[]) {
    const nuevas: Tienda[] = sucursalIds
      .filter((id) => id && !tiendas.some((t) => t.grupoKey === grupoKey && t.sucursalId === id))
      .map((sucursalId) => ({ key: nuevaKey(), grupoKey, sucursalId, abierto: true }));
    if (!nuevas.length) return;
    const nuevos: Informe[] = [];
    for (const t of nuevas) nuevos.push(informeNuevo(t, [...informes, ...nuevos]));
    const primero = nuevos[0];
    foco.current = `pp-${primero.key}-${primero.mes ? "dia" : "mes"}`;
    setTiendas((prev) => [...prev, ...nuevas]);
    setInformes((prev) => [...prev, ...nuevos]);
  }

  function agregarInforme(tienda: Tienda) {
    const nuevo = informeNuevo(tienda, informes);
    foco.current = `pp-${nuevo.key}-${nuevo.mes ? "dia" : "mes"}`;
    setTiendas((prev) => prev.map((t) => (t.key === tienda.key ? { ...t, abierto: true } : t)));
    setInformes((prev) => {
      // Va justo después del último informe de esa tienda.
      const ultimo = prev.map((i) => i.tiendaKey).lastIndexOf(tienda.key);
      return ultimo < 0 ? [...prev, nuevo] : [...prev.slice(0, ultimo + 1), nuevo, ...prev.slice(ultimo + 1)];
    });
  }

  function cambiarTienda(key: string, cambios: Partial<Tienda>) {
    setTiendas((prev) => prev.map((t) => (t.key === key ? { ...t, ...cambios } : t)));
  }

  function quitarTienda(key: string) {
    setInformes((prev) => prev.filter((i) => i.tiendaKey !== key));
    setTiendas((prev) => prev.filter((t) => t.key !== key));
  }

  function cambiarInforme(key: string, cambios: Partial<Informe>) {
    setInformes((prev) =>
      prev.map((i) => {
        if (i.key !== key) return i;
        if ("aunqueRepetida" in cambios) return { ...i, ...cambios };
        // Al corregir algo, el aviso de la vez anterior deja de aplicar. El de
        // «ya hay una visita ese día» solo cae si cambia la fecha.
        const nuevo: Informe = { ...i, ...cambios, error: undefined };
        if ("mes" in cambios || "dia" in cambios) return { ...nuevo, repetida: false, aunqueRepetida: false };
        return nuevo;
      })
    );
  }

  function quitarInforme(key: string) {
    setInformes((prev) => prev.filter((i) => i.key !== key));
  }

  function vaciar() {
    setInformes([]);
    setTiendas([]);
    setGrupos([]);
    setBloques([]);
  }

  /** El botón de la barra: marca lo incompleto y, si hay algo listo, pide confirmar. */
  function pedirConfirmacion() {
    // Los incompletos quedan marcados con lo que les falta.
    setInformes((prev) => prev.map((i) => ({ ...i, error: faltante(i, anio, hoy) ?? i.error })));
    if (completos === 0) {
      aviso(informes.length ? "Ningún informe está completo todavía: revisa los marcados en rojo." : "Agrega al menos un informe.");
      return;
    }
    setConfirmando(true);
  }

  async function guardar() {
    setConfirmando(false);
    const listos = informes.filter((i) => !faltante(i, anio, hoy));
    if (listos.length === 0) return;

    const tiendaDe = new Map(tiendas.map((t) => [t.key, t]));
    const grupoDe = new Map(grupos.map((g) => [g.key, g]));
    const bloqueDe = new Map(bloques.map((b) => [b.tecnicoId, b]));
    const contexto = (inf: Informe) => {
      const t = tiendaDe.get(inf.tiendaKey)!;
      const g = grupoDe.get(t.grupoKey)!;
      return { t, g, b: bloqueDe.get(g.tecnicoId)! };
    };

    setGuardando({ hechos: 0, total: listos.length });
    const hechos: { key: string; folio: string; nombre: string }[] = [];
    const errores = new Map<string, { error: string; repetida: boolean }>();
    for (let i = 0; i < listos.length; i += TANDA) {
      const tanda = listos.slice(i, i + TANDA);
      const lote: InformePapel[] = tanda.map((inf) => {
        const { t, g, b } = contexto(inf);
        return {
          clienteId: Number(g.clienteId),
          sucursalId: Number(t.sucursalId),
          tecnicoId: Number(b.tecnicoId),
          tecnicoAyudanteId: null,
          motivosCodigos: [inf.motivo],
          trabajos: (inf.trabajos ?? []).map((t) => ({
            codigo: t.codigo,
            motivoCodigo: inf.motivo,
            detalle: null,
            subtrabajos: t.subs,
          })),
          fecha: fechaDe(inf, anio),
          firmanteNombre: inf.firmante.trim(),
          firmanteRut: inf.rut.trim() || null,
          descripcion: inf.descripcion.trim(),
          aunqueRepetida: Boolean(inf.aunqueRepetida),
        };
      });
      try {
        const res = await crearVisitasPapelAction({ informes: lote });
        res.resultados.forEach((r, j) => {
          const inf = tanda[j];
          if (r.ok && r.folio) {
            const { t, g } = contexto(inf);
            hechos.push({
              key: inf.key,
              folio: r.folio,
              nombre: `${nombreTecnico(g.tecnicoId)} · ${nombreCliente(g.clienteId)} · ${sucursal(t.sucursalId)?.nombre ?? ""} · ${fechaDe(inf, anio)}`,
            });
          } else {
            errores.set(inf.key, { error: r.error ?? "No se pudo guardar.", repetida: Boolean(r.repetida) });
          }
        });
      } catch {
        tanda.forEach((inf) => errores.set(inf.key, { error: "Se cortó la conexión. Vuelve a guardar.", repetida: false }));
      }
      setGuardando({ hechos: Math.min(i + TANDA, listos.length), total: listos.length });
    }
    setGuardando(null);

    const guardadosKeys = new Set(hechos.map((h) => h.key));
    setGuardados((prev) => [...hechos.map(({ folio, nombre }) => ({ folio, nombre })), ...prev]);
    const restantes = informes
      .filter((i) => !guardadosKeys.has(i.key))
      .map((i) => {
        const e = errores.get(i.key);
        return e ? { ...i, error: e.error, repetida: e.repetida, aunqueRepetida: false } : i;
      });
    setInformes(restantes);
    // Las tiendas que quedaron sin informes salen; el técnico y el cliente se quedan, por si sigue.
    const conInformes = new Set(restantes.map((i) => i.tiendaKey));
    setTiendas((prev) => prev.filter((t) => conInformes.has(t.key)));
    if (hechos.length) router.refresh();

    const quedan = restantes.length;
    aviso(
      hechos.length
        ? `${hechos.length} ${hechos.length === 1 ? "informe guardado" : "informes guardados"}${quedan ? ` · ${quedan} por revisar` : ""}`
        : "No se guardó ninguno: revisa los marcados en rojo."
    );
  }

  const anios = Array.from({ length: anioActual - PRIMER_ANIO_PAPEL + 1 }, (_, i) => anioActual - i);

  return {
    uid,
    router,
    ref,
    toast,
    aviso,
    hoy,
    anioActual,
    anio,
    setAnio,
    bloques,
    setBloques,
    grupos,
    setGrupos,
    tiendas,
    setTiendas,
    informes,
    setInformes,
    guardando,
    setGuardando,
    guardados,
    setGuardados,
    cargado,
    setCargado,
    confirmando,
    setConfirmando,
    porQuitar,
    setPorQuitar,
    foco,
    firmantesPrevios,
    setFirmantesPrevios,
    pedidos,
    opcTecnicos,
    opcMotivos,
    catalogoTrabajos,
    nombreCliente,
    nombreTecnico,
    sucursal,
    tecnicosLibres,
    completos,
    grupoDeTienda,
    tecnicoDeGrupo,
    informesDe,
    agregarTecnico,
    cambiarBloque,
    quitarGrupos,
    quitarBloque,
    agregarCliente,
    cambiarGrupo,
    informeNuevo,
    duplicarInforme,
    agregarTiendas,
    agregarInforme,
    cambiarTienda,
    quitarTienda,
    cambiarInforme,
    quitarInforme,
    vaciar,
    pedirConfirmacion,
    guardar,
    anios,
  };
}

/** Todo lo que el formulario expone a sus pantallas, secciones y hojas. */
export type VisitasPapelApi = ReturnType<typeof useVisitasPapel>;
