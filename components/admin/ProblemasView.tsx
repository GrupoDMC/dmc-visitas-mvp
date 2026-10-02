"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Tag from "@/components/Tag";
import EstadoProblemaTag from "@/components/EstadoProblemaTag";
import AdminHeader from "@/components/admin/AdminHeader";
import FiltrosBar, { type ChipFiltro } from "@/components/admin/FiltrosBar";
import ProblemasAnalisis, { enTramo, TRAMOS, type ProblemaConTienda } from "@/components/admin/ProblemasAnalisis";
import VisitaDialogo, { type OrigenProblema } from "@/components/admin/VisitaDialogos";
import { Toast, useToast } from "@/components/ui/Toast";
import { actualizarProblemaAction, marcarGestionProblemaAction } from "@/app/actions/admin";
import {
  ESTADO_PROBLEMA_INICIAL,
  ESTADO_VISITA_LABEL,
  ESTADO_VISITA_TAG,
  etiquetaEstadoProblema,
} from "@/lib/ui/estado";
import { fechaHoraLegible } from "@/lib/ui/fecha";
import { sinTildes } from "@/lib/ui/formato";
import { puede, useReferencias } from "@/lib/ui/referencias";
import type { GestionMarca } from "@/lib/data/pendientes";
import type { DatosProblemas, GrupoProblemas, ProblemaPanel } from "@/lib/data/problemas";
import type { CatalogoGestionProblema, EstadoProblema } from "@/lib/types";

/**
 * El panel "Problemas": cada falla levantada en terreno, por tienda.
 *
 * Arriba, los gráficos (cuánto hay sin cerrar, si entra más de lo que se
 * resuelve, qué tan viejo es lo pendiente, qué tipos y qué tiendas pesan más).
 * Abajo, la lista: cada problema con su antigüedad, el checklist de gestión
 * (la Lista 6 del Checklist), su bitácora de cambios y, por tienda, el
 * historial de visitas y de problemas del local.
 */

/** Desde cuántos días abierto un problema se resalta como atrasado. */
const DIAS_ATRASO = 15;

interface Filtros {
  clienteId: string;
  tipo: string;
  /** "" = sin cerrar (por defecto), "TODOS" = incluidos los resueltos. */
  estado: string;
  /** Clave de un tramo de antigüedad. Solo aplica a lo que sigue sin cerrar. */
  tramo: string;
  /** "" = cualquiera · SIN = sin visita agendada · CON = con visita agendada. */
  agenda: string;
  /** "" = cualquiera · SIN = nada marcado · PARCIAL = a medias · LISTA = todo marcado. */
  avance: string;
}

const SIN_FILTROS: Filtros = { clienteId: "", tipo: "", estado: "", tramo: "", agenda: "", avance: "" };

const AVANCE_LABEL: Record<string, string> = { SIN: "sin empezar", PARCIAL: "a medias", LISTA: "completa" };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function textoAntiguedad(p: ProblemaPanel): string {
  if (p.estado === "RESUELTO") return p.dias === 0 ? "Resuelto el mismo día" : `Resuelto en ${plural(p.dias, "día", "días")}`;
  return p.dias === 0 ? "Levantado hoy" : `Abierto hace ${plural(p.dias, "día", "días")}`;
}

const marcasIniciales = (grupos: GrupoProblemas[]): Record<number, GestionMarca[]> =>
  Object.fromEntries(grupos.flatMap((g) => g.items.map((p) => [p.id, p.gestion])));

export default function ProblemasView({ datos }: { datos: DatosProblemas }) {
  const router = useRouter();
  const ref = useReferencias();
  const { clientes, problemas: catalogoProblema } = ref;
  const { grupos, pasos, conGestion, hoy } = datos;
  const OPC_TIPOS = useMemo(() => catalogoProblema.map((t) => ({ v: t.codigo, t: t.nombre })), [catalogoProblema]);
  const nombreTipo = (codigo: string) => catalogoProblema.find((t) => t.codigo === codigo)?.nombre ?? codigo;
  // Los estados salen de la Lista 7 del Checklist. Para elegir, solo los
  // activos; para nombrar, todos: un problema puede seguir en uno ya quitado.
  const estados = ref.estadosProblema.filter((e) => e.activo);
  const nombreEstado = (codigo: string) => etiquetaEstadoProblema(codigo, ref.estadosProblema);

  const { toast, aviso } = useToast();
  const [busqueda, setBusqueda] = useState("");
  const [f, setF] = useState<Filtros>(SIN_FILTROS);
  const [verAnalisis, setVerAnalisis] = useState(true);
  /** Problema con el panel "Cambiar estado o tipo" desplegado. */
  const [editando, setEditando] = useState<number | null>(null);
  /** Cambios sin confirmar del panel abierto. */
  const [pendiente, setPendiente] = useState<{ estado: EstadoProblema; tipo: string; nota: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [agendar, setAgendar] = useState<OrigenProblema | null>(null);
  /** Problemas con la bitácora desplegada y tiendas con el historial desplegado. */
  const [bitacoras, setBitacoras] = useState<number[]>([]);
  const [historiales, setHistoriales] = useState<number[]>([]);
  /** Lo marcado del checklist, por id de problema. Se adelanta al servidor. */
  const [marcas, setMarcas] = useState(() => marcasIniciales(grupos));
  /** Pasos con el guardado en camino, como "<problema>:<código>". */
  const [ocupados, setOcupados] = useState<string[]>([]);
  const lista = useRef<HTMLDivElement>(null);

  // Tras cada guardado el servidor manda la lista de nuevo, ya con quién marcó
  // cada paso y cuándo.
  useEffect(() => setMarcas(marcasIniciales(grupos)), [grupos]);

  const puedeEditar = puede(ref, "problemas.editar");
  const puedeGestionar = conGestion && puedeEditar;

  // ── Recorte común a los gráficos y a la lista: cliente, tipo y búsqueda ──
  const q = sinTildes(busqueda.trim());
  const enAlcance = useMemo(() => {
    return grupos
      .filter((g) => !f.clienteId || String(g.clienteId) === f.clienteId)
      .map((g) => {
        const tiendaCoincide = !q || sinTildes(`${g.nombre} ${g.cliente} ${g.comuna}`).includes(q);
        return {
          ...g,
          items: g.items.filter((p) => {
            if (f.tipo && p.tipoCodigo !== f.tipo) return false;
            if (tiendaCoincide) return true;
            const hay = `${p.visita.folio} ${p.agenda?.folio ?? ""} ${p.visita.tecnico} ${p.descripcion ?? ""} ${
              p.solucion ?? ""
            } ${catalogoProblema.find((t) => t.codigo === p.tipoCodigo)?.nombre ?? p.tipoCodigo} ${p.items
              .map((i) => i.etiqueta)
              .join(" ")}`;
            return sinTildes(hay).includes(q);
          }),
        };
      })
      .filter((g) => g.items.length > 0);
  }, [grupos, f.clienteId, f.tipo, q, catalogoProblema]);

  const paraGraficos = useMemo<ProblemaConTienda[]>(
    () =>
      enAlcance.flatMap((g) =>
        g.items.map((p) => ({ ...p, sucursalId: g.sucursalId, sucursal: g.nombre, cliente: g.cliente }))
      ),
    [enAlcance]
  );

  // ── Lo que además recorta solo la lista: estado, antigüedad, agenda, gestión ──
  const filtrados = useMemo(() => {
    return enAlcance
      .map((g) => ({
        ...g,
        items: g.items
          .filter((p) => {
            const resuelto = p.estado === "RESUELTO";
            if (f.estado === "") {
              if (resuelto) return false;
            } else if (f.estado !== "TODOS" && p.estado !== f.estado) return false;
            if (f.tramo && (resuelto || !enTramo(p.dias, f.tramo))) return false;
            if (f.agenda === "SIN" && (resuelto || p.agenda)) return false;
            if (f.agenda === "CON" && !p.agenda) return false;
            if (f.avance) {
              const n = (marcas[p.id] ?? []).length;
              const avance = n === 0 ? "SIN" : n >= pasos.length ? "LISTA" : "PARCIAL";
              if (avance !== f.avance) return false;
            }
            return true;
          })
          // Primero lo que sigue sin cerrar, de lo más viejo a lo más nuevo;
          // después lo resuelto, de lo más reciente hacia atrás.
          .sort((a, b) => {
            const ra = Number(a.estado === "RESUELTO");
            const rb = Number(b.estado === "RESUELTO");
            if (ra !== rb) return ra - rb;
            return ra ? (b.resueltoEn ?? "").localeCompare(a.resueltoEn ?? "") : a.creadoEn.localeCompare(b.creadoEn);
          }),
      }))
      .filter((g) => g.items.length > 0);
  }, [enAlcance, f.estado, f.tramo, f.agenda, f.avance, marcas, pasos.length]);

  const totalProblemas = filtrados.reduce((acc, g) => acc + g.items.length, 0);

  const chips: ChipFiltro[] = [];
  if (f.clienteId) {
    const c = clientes.find((x) => String(x.id) === f.clienteId);
    chips.push({ label: `Cliente: ${c?.nombreFantasia ?? ""}`, onQuitar: () => setF((p) => ({ ...p, clienteId: "" })) });
  }
  if (f.tipo) chips.push({ label: `Falla: ${nombreTipo(f.tipo)}`, onQuitar: () => setF((p) => ({ ...p, tipo: "" })) });
  if (f.estado) {
    chips.push({
      label: `Estado: ${f.estado === "TODOS" ? "todos" : nombreEstado(f.estado)}`,
      onQuitar: () => setF((p) => ({ ...p, estado: "" })),
    });
  }
  if (f.tramo) {
    chips.push({
      label: `Antigüedad: ${TRAMOS.find((t) => t.clave === f.tramo)?.label ?? f.tramo}`,
      onQuitar: () => setF((p) => ({ ...p, tramo: "" })),
    });
  }
  if (f.agenda) {
    chips.push({
      label: f.agenda === "SIN" ? "Sin visita agendada" : "Con visita agendada",
      onQuitar: () => setF((p) => ({ ...p, agenda: "" })),
    });
  }
  if (f.avance) {
    chips.push({ label: `Gestión: ${AVANCE_LABEL[f.avance]}`, onQuitar: () => setF((p) => ({ ...p, avance: "" })) });
  }

  const alcance =
    [
      f.clienteId ? clientes.find((x) => String(x.id) === f.clienteId)?.nombreFantasia : null,
      f.tipo ? nombreTipo(f.tipo) : null,
      q ? `«${busqueda.trim()}»` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "todos los clientes y tipos";

  /** Aplica un filtro pedido desde un gráfico y baja a la lista. */
  function irALista(cambio: Partial<Filtros>, buscar?: string) {
    setF((p) => ({ ...p, ...cambio }));
    if (buscar !== undefined) setBusqueda(buscar);
    requestAnimationFrame(() => lista.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function confirmarCambio(p: ProblemaPanel) {
    if (!pendiente || (pendiente.estado === p.estado && pendiente.tipo === p.tipoCodigo)) {
      return aviso("No hay cambios que confirmar");
    }
    setGuardando(true);
    const res = await actualizarProblemaAction({
      problemaId: p.id,
      estado: pendiente.estado,
      tipoCodigo: pendiente.tipo,
      nota: pendiente.nota,
    });
    setGuardando(false);
    if (!res.ok) return aviso(res.error ?? "No se pudo guardar el cambio.");

    const partes: string[] = [];
    if (pendiente.estado !== p.estado) partes.push(nombreEstado(pendiente.estado));
    if (pendiente.tipo !== p.tipoCodigo) partes.push(`reclasificado como «${nombreTipo(pendiente.tipo)}»`);
    aviso(
      partes.join(" · ") +
        (pendiente.estado === "RESUELTO" && p.estado !== "RESUELTO" && f.estado === ""
          ? " · sale de la lista de sin cerrar"
          : "")
    );
    setEditando(null);
    setPendiente(null);
    router.refresh();
  }

  async function alternarPaso(p: ProblemaPanel, codigo: string) {
    const clave = `${p.id}:${codigo}`;
    if (ocupados.includes(clave)) return;
    const estaba = (marcas[p.id] ?? []).some((m) => m.codigo === codigo);

    const poner = (marcado: boolean) =>
      setMarcas((prev) => {
        const sin = (prev[p.id] ?? []).filter((m) => m.codigo !== codigo);
        return { ...prev, [p.id]: marcado ? [...sin, { codigo, por: null, en: "" }] : sin };
      });

    setOcupados((prev) => [...prev, clave]);
    poner(!estaba);
    const res = await marcarGestionProblemaAction({ problemaId: p.id, codigo, marcado: !estaba });
    setOcupados((prev) => prev.filter((k) => k !== clave));
    if (!res.ok) {
      poner(estaba);
      return aviso(res.error ?? "No se pudo guardar la marca.");
    }
    router.refresh();
  }

  const alternar = (set: React.Dispatch<React.SetStateAction<number[]>>, id: number) =>
    set((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <>
      <AdminHeader kicker="Operación · análisis" title="Tiendas con problemas">
        <button
          onClick={() => setVerAnalisis((v) => !v)}
          aria-pressed={verAnalisis}
          className="btn btn-secondary"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
          </svg>
          <span>{verAnalisis ? "Ocultar gráficos" : "Ver gráficos"}</span>
        </button>
        {puede(ref, "checklist.ver") ? (
          <Link href="/admin/checklist" className="btn btn-secondary">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M4 6l2 2 3-3M4 13l2 2 3-3M4 20h5M13 7h8M13 14h8M13 20h8" />
            </svg>
            <span>Checklist de gestión</span>
          </Link>
        ) : null}
      </AdminHeader>

      <div className="pb-10 animate-fade-in">
        {/* Un solo juego de filtros, arriba de todo lo que recortan. */}
        <FiltrosBar
          busqueda={busqueda}
          phBusqueda="Buscar tienda, cliente, folio, detalle…"
          onBusqueda={setBusqueda}
          conteo={`${plural(totalProblemas, "problema", "problemas")} en ${plural(filtrados.length, "tienda", "tiendas")}`}
          chips={chips}
          onLimpiar={() => setF(SIN_FILTROS)}
          campos={[
            {
              id: "fp-cliente",
              label: "Cliente",
              valor: f.clienteId,
              opciones: [
                { v: "", t: "Todos los clientes" },
                ...clientes.map((c) => ({ v: String(c.id), t: c.nombreFantasia })),
              ],
              onChange: (v) => setF((p) => ({ ...p, clienteId: v })),
            },
            {
              id: "fp-tipo",
              label: "Tipo de falla",
              valor: f.tipo,
              opciones: [{ v: "", t: "Todas las fallas" }, ...OPC_TIPOS],
              onChange: (v) => setF((p) => ({ ...p, tipo: v })),
            },
            {
              id: "fp-estado",
              label: "Estado del problema",
              valor: f.estado,
              opciones: [
                { v: "", t: "Sin cerrar (por defecto)" },
                ...estados.map((e) => ({ v: e.codigo, t: e.nombre })),
                { v: "TODOS", t: "Todos, incluidos los resueltos" },
              ],
              onChange: (v) => setF((p) => ({ ...p, estado: v })),
            },
            {
              id: "fp-tramo",
              label: "Antigüedad (sin cerrar)",
              valor: f.tramo,
              opciones: [{ v: "", t: "Cualquier antigüedad" }, ...TRAMOS.map((t) => ({ v: t.clave, t: t.label }))],
              onChange: (v) => setF((p) => ({ ...p, tramo: v })),
            },
            {
              id: "fp-agenda",
              label: "Visita para resolverlo",
              valor: f.agenda,
              opciones: [
                { v: "", t: "Con o sin visita" },
                { v: "SIN", t: "Sin visita agendada" },
                { v: "CON", t: "Con visita agendada" },
              ],
              onChange: (v) => setF((p) => ({ ...p, agenda: v })),
            },
            ...(pasos.length
              ? [
                  {
                    id: "fp-avance",
                    label: "Avance de la gestión",
                    valor: f.avance,
                    opciones: [
                      { v: "", t: "Cualquier avance" },
                      { v: "SIN", t: "Sin empezar" },
                      { v: "PARCIAL", t: "A medias" },
                      { v: "LISTA", t: "Completa" },
                    ],
                    onChange: (v: string) => setF((p) => ({ ...p, avance: v })),
                  },
                ]
              : []),
          ]}
        />

        {verAnalisis ? (
          <ProblemasAnalisis
            problemas={paraGraficos}
            hoy={hoy}
            alcance={alcance}
            nombreTipo={nombreTipo}
            nombreEstado={nombreEstado}
            onTipo={(codigo) => irALista({ tipo: codigo })}
            onTramo={(clave) => irALista({ tramo: clave, estado: "" })}
            onSinAgenda={() => irALista({ agenda: "SIN", estado: "" })}
            onTienda={(sucursalId) => {
              const g = grupos.find((x) => x.sucursalId === sucursalId);
              if (!g) return;
              setHistoriales((prev) => (prev.includes(sucursalId) ? prev : [...prev, sucursalId]));
              irALista({ tramo: "", agenda: "", avance: "", estado: "" }, g.nombre);
            }}
          />
        ) : null}

        <div ref={lista} className="px-4 md:px-7 scroll-mt-28">
          {pasos.length === 0 && puedeEditar ? (
            <div className="mt-6 px-3.5 py-3 border border-dashed border-black/[.4] text-[13px] opacity-75 max-w-[90ch]">
              {conGestion
                ? "Todavía no hay checklist de gestión. Agrega los pasos en Maestros › Checklist › Lista 6 «Gestión de problemas» y aparecen en cada problema para ir marcándolos."
                : "El checklist de gestión de problemas necesita la migración 015 en la base."}
            </div>
          ) : null}

          {filtrados.map((g) => {
            const original = grupos.find((x) => x.sucursalId === g.sucursalId) ?? g;
            const masViejo = original.items
              .filter((p) => p.estado !== "RESUELTO")
              .reduce((m, p) => Math.max(m, p.dias), 0);
            const historialAbierto = historiales.includes(g.sucursalId);

            return (
              <div
                key={g.sucursalId}
                className="border-2 border-[var(--color-text)] mt-7 shadow-[3px_3px_0_rgba(32,30,29,.1)]"
              >
                <div className="flex items-center gap-3 flex-wrap px-5 py-4 bg-[var(--color-surface-2)] border-b-2 border-[var(--color-text)]">
                  <div className="min-w-0">
                    <div className="font-extrabold text-lg">{g.nombre}</div>
                    <div className="text-[13px] opacity-60 mt-0.5">
                      {g.cliente} · {g.comuna}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2.5 flex-wrap">
                    <span className="tag tag-outline">{original.abiertos} sin cerrar</span>
                    <span className="text-xs opacity-62">de {original.total} en total</span>
                    {original.abiertos > 0 ? (
                      <span className={`tag ${masViejo > DIAS_ATRASO ? "tag-accent" : "tag-neutral border border-black/[.2]"}`}>
                        El más antiguo: {plural(masViejo, "día", "días")}
                      </span>
                    ) : null}
                    <button
                      onClick={() => alternar(setHistoriales, g.sucursalId)}
                      aria-expanded={historialAbierto}
                      className="min-h-[34px] flex items-center gap-2 px-3 bg-transparent border border-black/[.35] text-xs cursor-pointer text-[var(--color-text)] hover:bg-black/[.07]"
                    >
                      <span>
                        {historialAbierto ? "Ocultar historial del local" : "Historial del local"} ·{" "}
                        {plural(original.visitas.length, "visita", "visitas")}
                      </span>
                      <Flecha abierta={historialAbierto} />
                    </button>
                  </div>
                </div>

                {historialAbierto ? <HistorialLocal grupo={original} nombreTipo={nombreTipo} /> : null}

                <div className="bg-white">
                  {g.items.map((p) => {
                    const resuelto = p.estado === "RESUELTO";
                    const abierto = editando === p.id;
                    const estadoSel = abierto && pendiente ? pendiente.estado : p.estado;
                    const tipoSel = abierto && pendiente ? pendiente.tipo : p.tipoCodigo;
                    const hayCambio = estadoSel !== p.estado || tipoSel !== p.tipoCodigo;
                    // Resuelto en gris, abierto en el acento y todo estado intermedio un tono más suave.
                    const color = resuelto
                      ? "#7a7676"
                      : p.estado === ESTADO_PROBLEMA_INICIAL
                        ? "var(--color-accent)"
                        : "#e15b47";
                    const marcasP = marcas[p.id] ?? [];
                    const bitacoraAbierta = bitacoras.includes(p.id);
                    const eventos = p.cambios.length + marcasP.length + (p.agenda ? 1 : 0) + 1;

                    return (
                      <div
                        key={p.id}
                        className="flex gap-3.5 px-5 py-4 border-b border-black/[.15]"
                        style={{
                          borderLeft: `5px solid ${color}`,
                          background: resuelto ? "var(--color-surface-3)" : "var(--color-accent-100)",
                        }}
                      >
                        <div
                          className="flex-none w-6.5 h-6.5 rounded-full grid place-items-center mt-0.5"
                          style={{ background: color }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                            {resuelto ? <path d="M4 12l5 5L20 6" /> : <path d="M12 8v5M12 17h.01" />}
                          </svg>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <div className="font-extrabold text-base leading-[1.25]">{nombreTipo(p.tipoCodigo)}</div>
                            <EstadoProblemaTag estado={p.estado} />
                            <span
                              className={`tag tabular-nums ${
                                !resuelto && p.dias > DIAS_ATRASO ? "tag-accent" : "tag-neutral border border-black/[.2]"
                              }`}
                            >
                              {textoAntiguedad(p)}
                            </span>
                            {p.agenda && !resuelto ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-[11px] leading-[1.2] tracking-[.06em] uppercase">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                                  <circle cx="12" cy="12" r="9" />
                                  <path d="M12 7.5V12l3 2" />
                                </svg>
                                <span>Con visita agendada</span>
                              </span>
                            ) : null}
                            <button
                              onClick={() => router.push(`/admin/visitas/${p.visita.folio}`)}
                              className="ml-auto min-h-8 px-2.5 bg-transparent border border-black/[.3] text-[11px] leading-none tracking-[.07em] uppercase cursor-pointer hover:bg-black/[.07]"
                            >
                              {p.visita.folio}
                            </button>
                          </div>

                          <div className="text-xs opacity-62 mt-1.5 tabular-nums">
                            Levantado el {fechaHoraLegible(p.creadoEn)} · {p.visita.tecnico}
                            {p.visita.motivo ? ` · ${p.visita.motivo}` : ""}
                          </div>

                          {p.items.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {p.items.map((it) => (
                                <span
                                  key={it.id}
                                  className="px-2.5 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2] tabular-nums"
                                >
                                  {it.etiqueta} × {it.cantidad}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          {p.descripcion ? <div className="text-sm mt-2 max-w-[76ch]">{p.descripcion}</div> : null}
                          {p.solucion ? (
                            <div className="text-sm mt-1.5 max-w-[76ch]">
                              <strong className="font-extrabold">{resuelto ? "Se realizó:" : "Sugerencia:"}</strong>{" "}
                              {p.solucion}
                            </div>
                          ) : null}

                          {p.agenda ? (
                            <div className="flex gap-2.5 items-center flex-wrap mt-3 px-3.5 py-2.5 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)]">
                              <svg
                                width="17"
                                height="17"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="var(--color-text)"
                                strokeWidth="2.2"
                                className="flex-none"
                              >
                                <rect x="3" y="5" width="18" height="16" />
                                <path d="M8 3v4M16 3v4M3 11h18" />
                              </svg>
                              <div className="text-[13px] tabular-nums">
                                Visita para resolverlo: {p.agenda.fecha} · {p.agenda.tecnico}
                              </div>
                              <Tag variant={ESTADO_VISITA_TAG[p.agenda.estado]}>{ESTADO_VISITA_LABEL[p.agenda.estado]}</Tag>
                              <button
                                onClick={() => router.push(`/admin/visitas/${p.agenda!.folio}`)}
                                className="ml-auto min-h-7 px-2 bg-transparent border border-black/[.3] text-[10px] leading-none tracking-[.07em] uppercase cursor-pointer hover:bg-black/[.07]"
                              >
                                {p.agenda.folio}
                              </button>
                            </div>
                          ) : null}

                          {/* Checklist de gestión */}
                          {pasos.length ? (
                            <Gestion
                              pasos={pasos}
                              marcas={marcasP}
                              ocupados={ocupados}
                              problemaId={p.id}
                              editable={puedeGestionar && !resuelto}
                              onPaso={(codigo) => alternarPaso(p, codigo)}
                            />
                          ) : null}

                          <div className="flex items-center gap-2.5 flex-wrap mt-3.5 pt-3 border-t border-black/[.18]">
                            {!resuelto && puede(ref, "visitas.crear") ? (
                              <button
                                onClick={() =>
                                  setAgendar({
                                    problemaId: p.id,
                                    folio: p.visita.folio,
                                    clienteId: g.clienteId,
                                    sucursalId: g.sucursalId,
                                    tipoCodigo: p.tipoCodigo,
                                    tipoNombre: nombreTipo(p.tipoCodigo),
                                    descripcion: p.descripcion,
                                    solucion: p.solucion,
                                  })
                                }
                                className="btn btn-primary min-h-[34px] px-3 gap-2 text-[13px]"
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                  <rect x="3" y="5" width="18" height="16" />
                                  <path d="M8 3v4M16 3v4M3 11h18M12 15h4" />
                                </svg>
                                <span>{p.agenda ? "Agendar otra visita" : "Agendar visita"}</span>
                              </button>
                            ) : null}

                            <button
                              onClick={() => alternar(setBitacoras, p.id)}
                              aria-expanded={bitacoraAbierta}
                              className="min-h-[34px] flex items-center gap-2 px-3 bg-transparent border border-black/[.35] text-xs cursor-pointer text-[var(--color-text)] hover:bg-black/[.07]"
                            >
                              <span>
                                {bitacoraAbierta ? "Ocultar bitácora" : "Bitácora"} · {plural(eventos, "registro", "registros")}
                              </span>
                              <Flecha abierta={bitacoraAbierta} />
                            </button>

                            {/* También resuelto o con visita agendada: si se
                                cerró por otra vía, o hay que reabrirlo,
                                coordinación tiene que poder cambiarlo. */}
                            {puedeEditar ? (
                              <button
                                onClick={() => {
                                  const abrir = editando !== p.id;
                                  setEditando(abrir ? p.id : null);
                                  setPendiente(abrir ? { estado: p.estado, tipo: p.tipoCodigo, nota: "" } : null);
                                }}
                                aria-expanded={abierto}
                                className="ml-auto min-h-[34px] flex items-center gap-2 px-3 bg-transparent border border-black/[.35] text-xs cursor-pointer text-[var(--color-text)] hover:bg-black/[.07]"
                              >
                                <span>{abierto ? "Ocultar" : "Cambiar estado o tipo"}</span>
                                <Flecha abierta={abierto} />
                              </button>
                            ) : null}
                          </div>

                          {bitacoraAbierta ? (
                            <Bitacora
                              problema={p}
                              marcas={marcasP}
                              pasos={pasos}
                              nombreTipo={nombreTipo}
                              nombreEstado={nombreEstado}
                            />
                          ) : null}

                          {abierto && pendiente ? (
                            <div className="mt-2.5 px-3.5 py-3 bg-[var(--color-surface)] border border-black/[.25]">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="text-[10px] tracking-[.12em] uppercase opacity-60">Estado</span>
                                <div className="flex gap-1.5 flex-wrap">
                                  {/* El estado actual va siempre, aunque ya no esté en el checklist. */}
                                  {(estados.some((e) => e.codigo === p.estado)
                                    ? estados
                                    : [...ref.estadosProblema.filter((e) => e.codigo === p.estado), ...estados]
                                  ).map((a) => (
                                    <button
                                      key={a.codigo}
                                      onClick={() => setPendiente({ ...pendiente, estado: a.codigo })}
                                      aria-pressed={estadoSel === a.codigo}
                                      className="min-h-[34px] px-3 border border-black/[.35] font-extrabold text-xs cursor-pointer hover:bg-black/[.1]"
                                      style={{
                                        background: estadoSel === a.codigo ? "var(--color-text)" : "transparent",
                                        color: estadoSel === a.codigo ? "var(--color-bg)" : "var(--color-text)",
                                      }}
                                    >
                                      {a.nombre}
                                    </button>
                                  ))}
                                </div>

                                <div className="ml-auto flex items-center gap-2.5">
                                  <label htmlFor={`ft-${p.id}`} className="text-[10px] tracking-[.12em] uppercase opacity-60">
                                    Reclasificar
                                  </label>
                                  <div className="relative">
                                    <select
                                      id={`ft-${p.id}`}
                                      value={tipoSel}
                                      onChange={(e) => setPendiente({ ...pendiente, tipo: e.target.value })}
                                      className="input min-h-[34px] pl-2.5 pr-8.5 text-[13px] appearance-none"
                                    >
                                      {/* El tipo actual puede estar ya fuera del checklist. */}
                                      {OPC_TIPOS.some((o) => o.v === p.tipoCodigo) ? null : (
                                        <option value={p.tipoCodigo}>{nombreTipo(p.tipoCodigo)}</option>
                                      )}
                                      {OPC_TIPOS.map((o) => (
                                        <option key={o.v} value={o.v}>
                                          {o.t}
                                        </option>
                                      ))}
                                    </select>
                                    <svg
                                      width="15"
                                      height="15"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="var(--color-text)"
                                      strokeWidth="2.2"
                                      className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                                    >
                                      <path d="M6 9l6 6 6-6" />
                                    </svg>
                                  </div>
                                </div>
                              </div>

                              <label
                                htmlFor={`fn-${p.id}`}
                                className="block text-[10px] tracking-[.12em] uppercase opacity-60 mt-3 mb-1.5"
                              >
                                Nota del cambio <span className="normal-case tracking-normal">(opcional · queda en la bitácora)</span>
                              </label>
                              <textarea
                                id={`fn-${p.id}`}
                                rows={2}
                                value={pendiente.nota}
                                onChange={(e) => setPendiente({ ...pendiente, nota: e.target.value })}
                                autoComplete="off"
                                placeholder="Ej: el repuesto llega el viernes; se resolvió por teléfono con la tienda."
                                className="input max-w-[76ch]"
                              />

                              <div className="flex items-center gap-2.5 flex-wrap mt-3">
                                <button
                                  onClick={() => confirmarCambio(p)}
                                  disabled={guardando}
                                  className="min-h-[38px] flex items-center gap-2 px-3.5 text-[var(--color-bg)] border-0 font-extrabold text-[13px] cursor-pointer hover:brightness-95 disabled:opacity-60"
                                  style={{ background: hayCambio ? "var(--color-accent)" : "#8f8b8b" }}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                                    <path d="M4 12l5 5L20 6" />
                                  </svg>
                                  <span>{guardando ? "Guardando…" : "Confirmar cambio"}</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setEditando(null);
                                    setPendiente(null);
                                  }}
                                  className="min-h-[38px] px-3.5 bg-transparent border border-black/[.35] text-[13px] cursor-pointer text-[var(--color-text)] hover:bg-black/[.07]"
                                >
                                  Cancelar
                                </button>
                                <span className="text-xs opacity-66 max-w-[46ch]">
                                  Nada cambia hasta que confirmes. El cambio queda en la bitácora con tu usuario.
                                </span>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filtrados.length === 0 ? (
            <div className="py-14 text-center">
              <div className="font-extrabold text-[17px] mb-1.5">Nada que mostrar</div>
              <div className="text-[13px] opacity-66">
                {grupos.length === 0
                  ? "Todavía no se ha levantado ningún problema en terreno."
                  : "Ajusta la búsqueda o los filtros. Por defecto solo se ven los problemas sin cerrar."}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {agendar ? (
        <VisitaDialogo
          origen={agendar}
          onCerrar={() => setAgendar(null)}
          onHecho={(m) => {
            aviso(m);
            router.refresh();
          }}
        />
      ) : null}

      <Toast texto={toast} variante="panel" />
    </>
  );
}

function Flecha({ abierta }: { abierta: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      className="flex-none transition-transform"
      style={{ transform: `rotate(${abierta ? 180 : 0}deg)` }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** El checklist de gestión de un problema: un paso por casilla. */
function Gestion({
  pasos,
  marcas,
  ocupados,
  problemaId,
  editable,
  onPaso,
}: {
  pasos: CatalogoGestionProblema[];
  marcas: GestionMarca[];
  ocupados: string[];
  problemaId: number;
  editable: boolean;
  onPaso: (codigo: string) => void;
}) {
  return (
    <div className="mt-3.5">
      <div className="flex items-baseline gap-2.5 mb-2">
        <div className="font-extrabold text-[12px] tracking-[.08em] uppercase">Gestión</div>
        <div className="text-xs opacity-62 tabular-nums">
          {marcas.length} de {pasos.length} {pasos.length === 1 ? "paso" : "pasos"}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pasos.map((paso) => {
          const marca = marcas.find((m) => m.codigo === paso.codigo);
          const hecho = Boolean(marca);
          return (
            <button
              key={paso.codigo}
              type="button"
              role="checkbox"
              aria-checked={hecho}
              disabled={!editable || ocupados.includes(`${problemaId}:${paso.codigo}`)}
              onClick={() => onPaso(paso.codigo)}
              title={
                marca
                  ? marca.en
                    ? `${marca.por ?? "Sin autor"} · ${fechaHoraLegible(marca.en)}`
                    : "Guardando…"
                  : editable
                    ? "Marcar como hecho"
                    : undefined
              }
              className="min-h-[34px] inline-flex items-center gap-2 px-3 border text-[13px] leading-[1.2] cursor-pointer disabled:cursor-default"
              style={{
                background: hecho ? "var(--color-text)" : "var(--color-bg)",
                color: hecho ? "var(--color-bg)" : "var(--color-text)",
                borderColor: hecho ? "var(--color-text)" : "rgba(32,30,29,.35)",
                fontWeight: hecho ? 800 : 400,
              }}
            >
              <span className="w-3.5 h-3.5 flex-none border-2 border-current grid place-items-center" aria-hidden="true">
                {hecho ? (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="5">
                    <path d="M4 12l5 5L20 6" />
                  </svg>
                ) : null}
              </span>
              <span>{paso.nombre}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * La bitácora de un problema: cuándo se levantó, cada cambio de estado o de
 * tipo con quién lo hizo y su nota, cada paso de gestión marcado, la visita
 * agendada para resolverlo y el cierre. De lo más viejo a lo más nuevo.
 */
function Bitacora({
  problema: p,
  marcas,
  pasos,
  nombreTipo,
  nombreEstado,
}: {
  problema: ProblemaPanel;
  marcas: GestionMarca[];
  pasos: CatalogoGestionProblema[];
  nombreTipo: (codigo: string) => string;
  nombreEstado: (codigo: string) => string;
}) {
  const filas: { en: string; titulo: string; detalle: string; nota?: string | null; fuerte?: boolean }[] = [
    {
      en: p.creadoEn,
      titulo: "Levantado en terreno",
      detalle: `${p.visita.tecnico} · visita ${p.visita.folio}`,
      fuerte: true,
    },
    ...p.cambios.map((c) => ({
      en: c.en,
      titulo:
        c.campo === "ESTADO"
          ? `${nombreEstado(c.antes)} → ${nombreEstado(c.ahora)}`
          : `Reclasificado: ${nombreTipo(c.antes)} → ${nombreTipo(c.ahora)}`,
      detalle: c.por ?? "Sin autor registrado",
      nota: c.nota,
      fuerte: c.campo === "ESTADO" && c.ahora === "RESUELTO",
    })),
    ...marcas
      // Una marca recién hecha todavía no trae su fecha: aparece al refrescar.
      .filter((m) => m.en)
      .map((m) => ({
        en: m.en,
        titulo: `Gestión: ${pasos.find((x) => x.codigo === m.codigo)?.nombre ?? m.codigo}`,
        detalle: m.por ?? "Sin autor registrado",
      })),
  ].sort((a, b) => a.en.localeCompare(b.en));

  return (
    <div className="mt-2.5 px-3.5 py-3 bg-[var(--color-surface)] border border-black/[.25]">
      <div className="text-[10px] tracking-[.12em] uppercase opacity-62 mb-2.5">Bitácora del problema</div>
      <ol className="m-0 p-0 list-none border-l-2 border-black/[.3] ml-1.5">
        {filas.map((fila, i) => (
          <li key={`${fila.en}-${i}`} className="relative pl-4 pb-3 last:pb-0">
            <span
              className="absolute -left-[6px] top-1 w-2.5 h-2.5"
              style={{ background: fila.fuerte ? "var(--color-text)" : "var(--color-neutral-500)" }}
              aria-hidden="true"
            />
            <div className="text-[13px] leading-[1.35]">
              <strong className="font-extrabold">{fila.titulo}</strong>
            </div>
            <div className="text-xs opacity-62 mt-0.5 tabular-nums">
              {fechaHoraLegible(fila.en)} · {fila.detalle}
            </div>
            {fila.nota ? <div className="text-[13px] leading-[1.45] mt-1 max-w-[70ch]">«{fila.nota}»</div> : null}
          </li>
        ))}
        {p.agenda ? (
          <li className="relative pl-4 pt-0 pb-0 mt-3">
            <span className="absolute -left-[6px] top-1 w-2.5 h-2.5 bg-[var(--color-neutral-500)]" aria-hidden="true" />
            <div className="text-[13px] leading-[1.35]">
              <strong className="font-extrabold">Visita agendada para resolverlo</strong>
            </div>
            <div className="text-xs opacity-62 mt-0.5 tabular-nums">
              {p.agenda.folio} · {p.agenda.fecha} · {p.agenda.tecnico} · {ESTADO_VISITA_LABEL[p.agenda.estado].toLowerCase()}
            </div>
          </li>
        ) : null}
      </ol>
      {p.estado !== "RESUELTO" ? (
        <div className="text-xs opacity-62 mt-3">Sigue sin cerrar: lleva {plural(p.dias, "día", "días")} abierto.</div>
      ) : null}
    </div>
  );
}

/**
 * El historial de una tienda: todas sus visitas, de la más nueva a la más
 * vieja, y bajo cada una los problemas que se levantaron en ella — también los
 * ya resueltos, que la lista de abajo esconde por defecto.
 */
function HistorialLocal({ grupo, nombreTipo }: { grupo: GrupoProblemas; nombreTipo: (codigo: string) => string }) {
  const router = useRouter();
  const resueltos = grupo.items.filter((p) => p.estado === "RESUELTO");
  const promedio = resueltos.length
    ? Math.round(resueltos.reduce((acc, p) => acc + p.dias, 0) / resueltos.length)
    : null;
  const porFolio = new Map<string, ProblemaPanel[]>();
  for (const p of grupo.items) porFolio.set(p.visita.folio, [...(porFolio.get(p.visita.folio) ?? []), p]);

  // El tipo que más se repite en el local: si hay uno, es la falla de fondo.
  const cuenta = new Map<string, number>();
  for (const p of grupo.items) cuenta.set(p.tipoCodigo, (cuenta.get(p.tipoCodigo) ?? 0) + 1);
  const repetido = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];

  const resumen = [
    { k: "Visitas al local", v: String(grupo.visitas.length) },
    { k: "Problemas levantados", v: String(grupo.total) },
    { k: "Resueltos", v: `${resueltos.length} de ${grupo.total}` },
    { k: "Tardan en resolverse", v: promedio === null ? "—" : `${plural(promedio, "día", "días")} en promedio` },
    {
      k: "Falla que más se repite",
      v: repetido && repetido[1] > 1 ? `${nombreTipo(repetido[0])} · ${repetido[1]} veces` : "Ninguna se repite",
    },
  ];

  return (
    <div className="px-5 py-4 bg-[var(--color-surface)] border-b-2 border-[var(--color-text)]">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-x-5 gap-y-3">
        {resumen.map((r) => (
          <div key={r.k} className="min-w-0">
            <div className="text-[10px] tracking-[.11em] uppercase opacity-62">{r.k}</div>
            <div className="font-extrabold text-sm mt-1">{r.v}</div>
          </div>
        ))}
      </div>

      <div className="text-[10px] tracking-[.12em] uppercase opacity-62 mt-4 mb-2">
        Visitas al local, de la más reciente a la más antigua
      </div>
      <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
        {grupo.visitas.map((v) => {
          const problemas = porFolio.get(v.folio) ?? [];
          return (
            <div key={v.folio} className="px-3 py-2.5 bg-white border-l-4 border-black/[.35]">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-extrabold text-sm tabular-nums">{v.fecha}</div>
                <Tag variant={ESTADO_VISITA_TAG[v.estado]}>{ESTADO_VISITA_LABEL[v.estado]}</Tag>
                <span className="text-xs opacity-62">
                  {v.tecnico}
                  {v.motivo ? ` · ${v.motivo}` : ""}
                </span>
                <button
                  onClick={() => router.push(`/admin/visitas/${v.folio}`)}
                  className="ml-auto min-h-7 px-2 bg-transparent border border-black/[.3] text-[10px] leading-none tracking-[.07em] uppercase cursor-pointer hover:bg-black/[.07]"
                >
                  {v.folio}
                </button>
              </div>
              {v.trabajos ? (
                <div className="text-[13px] leading-[1.45] mt-1.5">
                  <strong className="font-extrabold">Trabajo:</strong> {v.trabajos}
                </div>
              ) : null}
              {v.observaciones ? <div className="text-[13px] leading-[1.45] mt-1 max-w-[90ch]">{v.observaciones}</div> : null}
              {problemas.length > 0 ? (
                <div className="flex flex-col gap-1 mt-2">
                  {problemas.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 flex-wrap text-[13px]">
                      <span
                        className="w-2 h-2 flex-none"
                        style={{ background: p.estado === "RESUELTO" ? "#7a7676" : "var(--color-accent)" }}
                        aria-hidden="true"
                      />
                      <span className="font-extrabold">{nombreTipo(p.tipoCodigo)}</span>
                      <EstadoProblemaTag estado={p.estado} />
                      <span className="text-xs opacity-62 tabular-nums">{textoAntiguedad(p).toLowerCase()}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
