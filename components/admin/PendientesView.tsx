"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Tag from "@/components/Tag";
import AdminHeader from "@/components/admin/AdminHeader";
import FiltrosBar, { type ChipFiltro } from "@/components/admin/FiltrosBar";
import VisitaDialogo, { ReprogramarDialogo } from "@/components/admin/VisitaDialogos";
import VisitasLoteDialogo, { type AccionLote } from "@/components/admin/VisitasLoteDialogo";
import { Casilla } from "@/components/admin/VisitasTable";
import { Toast, useToast } from "@/components/ui/Toast";
import { marcarGestionPendienteAction } from "@/app/actions/admin";
import EstadoProblemaTag from "@/components/EstadoProblemaTag";
import {
  ESTADO_VISITA_LABEL,
  ESTADO_VISITA_TAG,
  textoMotivos,
} from "@/lib/ui/estado";
import { fechaHoraLegible, textoFechaVisita } from "@/lib/ui/fecha";
import { sinTildes, urlTel } from "@/lib/ui/formato";
import { nombreProblema, nombreTrabajo, puede, useReferencias } from "@/lib/ui/referencias";
import type { DatosPendientes, GestionMarca, HistorialLocal, Pendiente } from "@/lib/data/pendientes";
import type { Visita } from "@/lib/types";

/**
 * "Reagendas y pendientes": las visitas que no se pudieron hacer, una tarjeta
 * por visita.
 *
 * Antes era la tabla general de visitas con una columna más, y para saber qué
 * pasaba con cada una había que abrir su ficha. Acá va todo junto: por qué no
 * se hizo y desde cuándo espera, el checklist de gestión (la Lista 5 del
 * Checklist) para ir marcando lo que ya se hizo por destrabarla, el historial
 * de problemas y visitas del local, y las acciones para sacarla de la lista.
 */

/** Desde cuántos días de espera una visita se marca como atrasada. */
const DIAS_ATRASO = 7;
/** Cuántas visitas anteriores del local se muestran antes de cortar. */
const VISITAS_VISIBLES = 8;

interface Filtros {
  estado: string;
  clienteId: string;
  tecnicoId: string;
  /** "" = cualquiera · SIN = nada marcado · PARCIAL = a medias · LISTA = todo marcado. */
  avance: string;
}

const SIN_FILTROS: Filtros = { estado: "", clienteId: "", tecnicoId: "", avance: "" };

const AVANCE_LABEL: Record<string, string> = {
  SIN: "sin empezar",
  PARCIAL: "a medias",
  LISTA: "completa",
};

function textoEspera(dias: number): string {
  if (dias === 0) return "Desde hoy";
  return dias === 1 ? "Hace 1 día" : `Hace ${dias} días`;
}

const marcasIniciales = (pendientes: Pendiente[]): Record<number, GestionMarca[]> =>
  Object.fromEntries(pendientes.map((p) => [p.visita.id, p.gestion]));

export default function PendientesView({ datos }: { datos: DatosPendientes }) {
  const router = useRouter();
  const ref = useReferencias();
  const { toast, aviso } = useToast();
  const { pendientes, historial, pasos, conGestion } = datos;

  const [busqueda, setBusqueda] = useState("");
  const [f, setF] = useState<Filtros>(SIN_FILTROS);
  /** Folios con el historial del local desplegado. */
  const [abiertos, setAbiertos] = useState<string[]>([]);
  /** Lo marcado del checklist, por id de visita. Se adelanta al servidor. */
  const [marcas, setMarcas] = useState(() => marcasIniciales(pendientes));
  /** Pasos con el guardado en camino, como "<visita>:<código>". */
  const [ocupados, setOcupados] = useState<string[]>([]);
  const [dialogo, setDialogo] = useState<{ tipo: "reprogramar" | "editar"; visita: Visita } | null>(null);
  const [seleccionando, setSeleccionando] = useState(false);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [lote, setLote] = useState<AccionLote | null>(null);

  // Tras cada guardado el servidor manda la lista de nuevo, ya con quién marcó
  // cada paso y cuándo.
  useEffect(() => setMarcas(marcasIniciales(pendientes)), [pendientes]);

  const puedeGestionar = conGestion && puede(ref, "reagendas.gestionar");
  // «Cancelar por admin» no va: solo vale sobre visitas programadas o en curso.
  const accionesLote: { accion: AccionLote; label: string }[] = puede(ref, "visitas.masivo")
    ? [
        ...(puede(ref, "visitas.editar") ? [{ accion: "modificar" as const, label: "Editar o reagendar" }] : []),
        ...(puede(ref, "visitas.eliminar") ? [{ accion: "eliminar" as const, label: "Eliminar" }] : []),
      ]
    : [];

  const marcasDe = (p: Pendiente) => marcas[p.visita.id] ?? [];

  const filtrados = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    return pendientes.filter((p) => {
      const v = p.visita;
      if (f.estado && v.estado !== f.estado) return false;
      if (f.clienteId && String(v.clienteId) !== f.clienteId) return false;
      if (f.tecnicoId && String(v.tecnicoId) !== f.tecnicoId && String(v.tecnicoAyudanteId) !== f.tecnicoId) {
        return false;
      }
      if (f.avance) {
        const n = (marcas[v.id] ?? []).length;
        const avance = n === 0 ? "SIN" : n >= pasos.length ? "LISTA" : "PARCIAL";
        if (avance !== f.avance) return false;
      }
      if (!q) return true;
      const hay = `${v.folio} ${v.sucursal?.nombre ?? ""} ${v.sucursal?.comuna ?? ""} ${v.cliente?.nombreFantasia ?? ""} ${
        v.tecnico?.nombreCompleto ?? ""
      } ${v.motivosNombres.join(" ")} ${v.motivoPendiente ?? ""} ${v.reagendamientos?.[0]?.motivo ?? ""}`;
      return sinTildes(hay).includes(q);
    });
  }, [pendientes, busqueda, f, marcas, pasos.length]);

  const seleccionadas = useMemo(
    () => pendientes.filter((p) => marcadas.includes(p.visita.folio)).map((p) => p.visita),
    [pendientes, marcadas]
  );

  const resumen = [
    { label: "Pendientes", n: pendientes.filter((p) => p.visita.estado === "PENDIENTE").length },
    { label: "Reagendadas", n: pendientes.filter((p) => p.visita.estado === "REAGENDADA").length },
    { label: `Más de ${DIAS_ATRASO} días esperando`, n: pendientes.filter((p) => p.dias > DIAS_ATRASO).length },
    ...(pasos.length
      ? [{ label: "Sin gestión empezada", n: pendientes.filter((p) => marcasDe(p).length === 0).length }]
      : []),
  ];

  const clientes = useMemo(() => {
    const ids = new Set(pendientes.map((p) => p.visita.clienteId));
    return ref.clientes.filter((c) => ids.has(c.id));
  }, [pendientes, ref.clientes]);
  const tecnicos = useMemo(() => {
    const ids = new Set(pendientes.flatMap((p) => [p.visita.tecnicoId, p.visita.tecnicoAyudanteId]));
    return ref.tecnicos.filter((t) => ids.has(t.id));
  }, [pendientes, ref.tecnicos]);

  const chips: ChipFiltro[] = [];
  if (f.estado) {
    chips.push({
      label: `Estado: ${ESTADO_VISITA_LABEL[f.estado as "PENDIENTE" | "REAGENDADA"]}`,
      onQuitar: () => setF((p) => ({ ...p, estado: "" })),
    });
  }
  if (f.clienteId) {
    const c = ref.clientes.find((x) => String(x.id) === f.clienteId);
    chips.push({ label: `Cliente: ${c?.nombreFantasia ?? ""}`, onQuitar: () => setF((p) => ({ ...p, clienteId: "" })) });
  }
  if (f.tecnicoId) {
    const t = ref.tecnicos.find((x) => String(x.id) === f.tecnicoId);
    chips.push({ label: `Técnico: ${t?.nombreCompleto ?? ""}`, onQuitar: () => setF((p) => ({ ...p, tecnicoId: "" })) });
  }
  if (f.avance) {
    chips.push({ label: `Gestión: ${AVANCE_LABEL[f.avance]}`, onQuitar: () => setF((p) => ({ ...p, avance: "" })) });
  }

  async function alternarPaso(p: Pendiente, codigo: string) {
    const id = p.visita.id;
    const clave = `${id}:${codigo}`;
    if (ocupados.includes(clave)) return;
    const estaba = marcasDe(p).some((m) => m.codigo === codigo);

    const poner = (marcado: boolean) =>
      setMarcas((prev) => {
        const sin = (prev[id] ?? []).filter((m) => m.codigo !== codigo);
        return { ...prev, [id]: marcado ? [...sin, { codigo, por: null, en: "" }] : sin };
      });

    setOcupados((prev) => [...prev, clave]);
    poner(!estaba);
    const res = await marcarGestionPendienteAction({ folio: p.visita.folio, codigo, marcado: !estaba });
    setOcupados((prev) => prev.filter((k) => k !== clave));
    if (!res.ok) {
      poner(estaba);
      return aviso(res.error ?? "No se pudo guardar la marca.");
    }
    router.refresh();
  }

  function alternarSeleccion(folio: string) {
    setMarcadas((prev) => (prev.includes(folio) ? prev.filter((x) => x !== folio) : [...prev, folio]));
  }

  return (
    <>
      <AdminHeader kicker="Operación · visitas que no se pudieron hacer" title="Reagendas y pendientes">
        {accionesLote.length ? (
          <button
            onClick={() => {
              setSeleccionando((v) => !v);
              setMarcadas([]);
            }}
            aria-pressed={seleccionando}
            className={`btn ${seleccionando ? "btn-primary" : "btn-secondary"}`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="3" y="3" width="8" height="8" />
              <rect x="3" y="14" width="8" height="7" />
              <path d="M14 7l2 2 4-4M14 17.5h7" />
            </svg>
            <span>{seleccionando ? "Salir de acciones múltiples" : "Acciones múltiples"}</span>
          </button>
        ) : null}
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 md:px-7 pt-5">
          {resumen.map((r) => (
            <div key={r.label} className="px-4 py-3 border border-black/[.3] bg-[var(--color-surface)]">
              <div className="font-extrabold text-[26px] leading-none tabular-nums">{r.n}</div>
              <div className="text-[10px] tracking-[.11em] uppercase opacity-62 mt-1.5">{r.label}</div>
            </div>
          ))}
        </div>

        <FiltrosBar
          busqueda={busqueda}
          phBusqueda="Buscar folio, cliente, sucursal, motivo…"
          onBusqueda={setBusqueda}
          conteo={`${filtrados.length} ${filtrados.length === 1 ? "visita" : "visitas"}`}
          chips={chips}
          onLimpiar={() => setF(SIN_FILTROS)}
          campos={[
            {
              id: "fp-estado",
              label: "Estado",
              valor: f.estado,
              opciones: [
                { v: "", t: "Pendientes y reagendadas" },
                { v: "PENDIENTE", t: "Solo pendientes" },
                { v: "REAGENDADA", t: "Solo reagendadas" },
              ],
              onChange: (v) => setF((p) => ({ ...p, estado: v })),
            },
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
              id: "fp-tecnico",
              label: "Técnico",
              valor: f.tecnicoId,
              opciones: [
                { v: "", t: "Todos los técnicos" },
                ...tecnicos.map((t) => ({ v: String(t.id), t: t.nombreCompleto })),
              ],
              onChange: (v) => setF((p) => ({ ...p, tecnicoId: v })),
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

        <div className="px-4 md:px-7">
          {filtrados.map((p) => (
            <Tarjeta
              key={p.visita.id}
              pendiente={p}
              local={historial[p.visita.sucursalId]}
              marcas={marcasDe(p)}
              ocupados={ocupados}
              puedeGestionar={puedeGestionar}
              historialAbierto={abiertos.includes(p.visita.folio)}
              onHistorial={() =>
                setAbiertos((prev) =>
                  prev.includes(p.visita.folio) ? prev.filter((x) => x !== p.visita.folio) : [...prev, p.visita.folio]
                )
              }
              onPaso={(codigo) => alternarPaso(p, codigo)}
              onReprogramar={() => setDialogo({ tipo: "reprogramar", visita: p.visita })}
              onEditar={() => setDialogo({ tipo: "editar", visita: p.visita })}
              seleccion={
                seleccionando
                  ? { marcada: marcadas.includes(p.visita.folio), onAlternar: () => alternarSeleccion(p.visita.folio) }
                  : null
              }
              datos={datos}
            />
          ))}

          {filtrados.length === 0 ? (
            <div className="py-14 text-center">
              <div className="font-extrabold text-[17px] mb-1.5">
                {pendientes.length === 0 ? "No hay visitas reagendadas ni pendientes" : "Nada que mostrar"}
              </div>
              <div className="text-[13px] opacity-66">
                {pendientes.length === 0
                  ? "Cuando un técnico reagende una visita o la deje pendiente, aparece acá."
                  : "Ajusta la búsqueda o los filtros."}
              </div>
            </div>
          ) : null}
        </div>

        {seleccionando ? (
          <div className="sticky bottom-0 z-10 mt-4 flex items-center gap-2.5 flex-wrap px-4 md:px-7 py-3 bg-[var(--color-bg)] border-t-2 border-[var(--color-divider)]">
            <div className="font-extrabold text-[13px] tabular-nums">
              {seleccionadas.length === 0
                ? "Marca las visitas con su casilla"
                : `${seleccionadas.length} ${seleccionadas.length === 1 ? "visita marcada" : "visitas marcadas"}`}
            </div>
            <button
              type="button"
              onClick={() => setMarcadas([...new Set([...marcadas, ...filtrados.map((p) => p.visita.folio)])])}
              className="min-h-8 px-1 bg-transparent border-0 text-[var(--color-accent-active)] text-xs underline underline-offset-[3px] cursor-pointer"
            >
              Marcar las que se ven
            </button>
            {marcadas.length > 0 ? (
              <button
                type="button"
                onClick={() => setMarcadas([])}
                className="min-h-8 px-1 bg-transparent border-0 text-[var(--color-accent-active)] text-xs underline underline-offset-[3px] cursor-pointer"
              >
                Desmarcar todas
              </button>
            ) : null}
            <div className="ml-auto flex gap-2 flex-wrap">
              {accionesLote.map((a) => (
                <button
                  key={a.accion}
                  type="button"
                  disabled={seleccionadas.length === 0}
                  onClick={() => setLote(a.accion)}
                  className={`btn ${a.accion === "modificar" ? "btn-primary" : "btn-secondary"} min-h-10 px-3.5`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {dialogo?.tipo === "reprogramar" ? (
        <ReprogramarDialogo
          visita={dialogo.visita}
          onCerrar={() => setDialogo(null)}
          onHecho={(m) => {
            aviso(m);
            router.refresh();
          }}
        />
      ) : null}

      {dialogo?.tipo === "editar" ? (
        <VisitaDialogo
          visita={dialogo.visita}
          onCerrar={() => setDialogo(null)}
          onHecho={(m, folio) => {
            aviso(m);
            if (folio) router.refresh();
          }}
        />
      ) : null}

      {lote ? (
        <VisitasLoteDialogo
          accion={lote}
          visitas={seleccionadas}
          onCerrar={() => setLote(null)}
          onHecho={(mensaje, hechas) => {
            aviso(mensaje);
            if (hechas.length === 0) return;
            setMarcadas((prev) => prev.filter((x) => !hechas.includes(x)));
            router.refresh();
          }}
        />
      ) : null}

      <Toast texto={toast} variante="panel" />
    </>
  );
}

function Tarjeta({
  pendiente,
  local,
  marcas,
  ocupados,
  puedeGestionar,
  historialAbierto,
  onHistorial,
  onPaso,
  onReprogramar,
  onEditar,
  seleccion,
  datos,
}: {
  pendiente: Pendiente;
  local: HistorialLocal | undefined;
  marcas: GestionMarca[];
  ocupados: string[];
  puedeGestionar: boolean;
  historialAbierto: boolean;
  onHistorial: () => void;
  onPaso: (codigo: string) => void;
  onReprogramar: () => void;
  onEditar: () => void;
  /** Presente con «Acciones múltiples» prendido. */
  seleccion: { marcada: boolean; onAlternar: () => void } | null;
  datos: DatosPendientes;
}) {
  const router = useRouter();
  const ref = useReferencias();
  const { visita: v, desde, dias } = pendiente;
  const { pasos, conGestion } = datos;

  const reagenda = v.reagendamientos?.[0];
  const motivoTecnico = v.motivoPendiente ?? reagenda?.motivo ?? null;
  const atrasada = dias > DIAS_ATRASO;

  // La propia visita no cuenta como historial del local.
  const otrasVisitas = (local?.visitas ?? []).filter((x) => x.folio !== v.folio);
  const problemas = [...(local?.problemas ?? [])].sort(
    (a, b) => Number(a.estado === "RESUELTO") - Number(b.estado === "RESUELTO")
  );
  const sinCerrar = problemas.filter((x) => x.estado !== "RESUELTO").length;

  const filas: { k: string; v: string }[] = [
    {
      k: v.fechaHasta ? "Margen de días" : "Fecha programada",
      v: textoFechaVisita(v) + (v.horaProgramada ? ` · ${v.horaProgramada}` : " · sin hora"),
    },
    ...(reagenda
      ? [{ k: "Fecha anterior", v: reagenda.fechaAnterior + (reagenda.horaAnterior ? ` · ${reagenda.horaAnterior}` : "") }]
      : []),
    {
      k: "Técnico",
      v: v.tecnicoAyudante
        ? `${v.tecnico?.nombreCompleto ?? "—"} + ${v.tecnicoAyudante.nombreCompleto}`
        : v.tecnico?.nombreCompleto ?? "—",
    },
    { k: v.motivosCodigos.length > 1 ? "Motivos de la visita" : "Motivo de la visita", v: textoMotivos(v) },
  ];

  return (
    <div
      className="border-2 border-[var(--color-text)] mt-6 shadow-[3px_3px_0_rgba(32,30,29,.1)]"
      style={seleccion?.marcada ? { outline: "3px solid var(--color-accent)", outlineOffset: 2 } : undefined}
    >
      {/* Cabecera: qué visita es y cuánto lleva esperando */}
      <div className="flex items-center gap-3 flex-wrap px-5 py-4 bg-[var(--color-surface-2)] border-b-2 border-[var(--color-text)]">
        {seleccion ? (
          <Casilla marcada={seleccion.marcada} onAlternar={seleccion.onAlternar} label={`Marcar ${v.folio}`} />
        ) : null}
        <div className="min-w-0">
          <div className="font-extrabold text-lg leading-[1.2]">{v.sucursal?.nombre}</div>
          <div className="text-[13px] opacity-60 mt-0.5">
            {[v.cliente?.nombreFantasia, v.sucursal?.comuna, v.sucursal?.direccion].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <Tag variant={ESTADO_VISITA_TAG[v.estado]}>{ESTADO_VISITA_LABEL[v.estado]}</Tag>
          <span className={`tag ${atrasada ? "tag-accent" : "tag-neutral border border-black/[.2]"} tabular-nums`}>
            {textoEspera(dias)}
          </span>
          <button
            onClick={() => router.push(`/admin/visitas/${v.folio}`)}
            className="min-h-8 px-2.5 bg-transparent border border-black/[.3] text-[11px] leading-none tracking-[.07em] uppercase cursor-pointer hover:bg-black/[.07]"
          >
            {v.folio}
          </button>
        </div>
      </div>

      <div className="px-5 py-4 bg-white">
        {/* Por qué no se hizo */}
        <div className="px-3.5 py-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)]">
          <div className="text-[10px] tracking-[.12em] uppercase text-[var(--color-accent-800)]">
            {v.estado === "REAGENDADA" ? "Por qué se reagendó" : "Por qué quedó pendiente"}
          </div>
          <div className="text-sm leading-[1.5] text-[var(--color-accent-800)] mt-1.5 max-w-[80ch]">
            {motivoTecnico ?? "Sin motivo registrado."}
          </div>
          {desde ? (
            <div className="text-xs text-[var(--color-accent-800)] opacity-75 mt-1.5 tabular-nums">
              {desde.por ?? "Sin autor registrado"} · {fechaHoraLegible(desde.en)} ·{" "}
              {desde.origen === "MOVIL" ? "desde el celular" : "desde el panel"}
            </div>
          ) : null}
        </div>

        {/* Datos de la visita */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-3 mt-4">
          {filas.map((fila) => (
            <div key={fila.k} className="min-w-0">
              <div className="text-[10px] tracking-[.11em] uppercase opacity-62">{fila.k}</div>
              <div className="text-sm mt-1 tabular-nums">{fila.v}</div>
            </div>
          ))}
          <div className="min-w-0">
            <div className="text-[10px] tracking-[.11em] uppercase opacity-62">Responsable de tienda</div>
            <div className="text-sm mt-1">
              {v.responsableNombre ?? "Sin definir"}
              {v.responsableTelefono ? (
                <>
                  {" · "}
                  <a href={urlTel(v.responsableTelefono)} className="underline underline-offset-[3px] tabular-nums">
                    {v.responsableTelefono}
                  </a>
                </>
              ) : null}
            </div>
          </div>
          {v.trabajoSolicitado ? (
            <div className="min-w-0 sm:col-span-2 lg:col-span-3">
              <div className="text-[10px] tracking-[.11em] uppercase opacity-62">Qué había que hacer</div>
              <div className="text-sm leading-[1.5] mt-1 max-w-[80ch]">{v.trabajoSolicitado}</div>
            </div>
          ) : null}
          {v.indicacionesAcceso ? (
            <div className="min-w-0 sm:col-span-2 lg:col-span-4">
              <div className="text-[10px] tracking-[.11em] uppercase opacity-62">Indicaciones de acceso</div>
              <div className="text-sm leading-[1.5] mt-1 max-w-[80ch]">{v.indicacionesAcceso}</div>
            </div>
          ) : null}
        </div>

        {/* Checklist de gestión */}
        <div className="mt-4 pt-3.5 border-t border-black/[.18]">
          <div className="flex items-baseline gap-2.5 flex-wrap mb-2">
            <div className="font-extrabold text-[13px] tracking-[.08em] uppercase">Gestión</div>
            {pasos.length ? (
              <div className="text-xs opacity-62 tabular-nums">
                {marcas.length} de {pasos.length} {pasos.length === 1 ? "paso" : "pasos"}
              </div>
            ) : null}
          </div>
          {pasos.length ? (
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
                    disabled={!puedeGestionar || ocupados.includes(`${v.id}:${paso.codigo}`)}
                    onClick={() => onPaso(paso.codigo)}
                    title={
                      marca
                        ? marca.en
                          ? `${marca.por ?? "Sin autor"} · ${fechaHoraLegible(marca.en)}`
                          : "Guardando…"
                        : puedeGestionar
                          ? "Marcar como hecho"
                          : undefined
                    }
                    className="min-h-[34px] inline-flex items-center gap-2 px-3 border text-[13px] leading-[1.2] cursor-pointer disabled:cursor-default"
                    style={{
                      background: hecho ? "var(--color-text)" : "transparent",
                      color: hecho ? "var(--color-bg)" : "var(--color-text)",
                      borderColor: hecho ? "var(--color-text)" : "rgba(32,30,29,.35)",
                      fontWeight: hecho ? 800 : 400,
                    }}
                  >
                    <span
                      className="w-3.5 h-3.5 flex-none border-2 border-current grid place-items-center"
                      aria-hidden="true"
                    >
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
          ) : (
            <div className="px-3.5 py-2.5 border border-dashed border-black/[.35] text-[13px] opacity-70 max-w-[80ch]">
              {conGestion
                ? "Todavía no hay pasos de gestión. Agrégalos en Maestros › Checklist › Lista 5 «Gestión de pendientes» y aparecen acá para marcarlos en cada visita."
                : "El checklist de gestión necesita la migración 014 en la base."}
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2.5 flex-wrap mt-4 pt-3 border-t border-black/[.18]">
          {puede(ref, "visitas.reprogramar") ? (
            <button onClick={onReprogramar} className="btn btn-primary min-h-[34px] px-3 gap-2 text-[13px]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="5" width="18" height="16" />
                <path d="M8 3v4M16 3v4M3 11h18M12 15l2 2-2 2" />
              </svg>
              <span>Cambiar fecha y técnico</span>
            </button>
          ) : null}
          {puede(ref, "visitas.editar") ? (
            <button onClick={onEditar} className="btn btn-secondary min-h-[34px] px-3 gap-2 text-[13px]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 20h4l10-10-4-4L4 16v4z" />
                <path d="M14 6l4 4" />
              </svg>
              <span>Corregir visita</span>
            </button>
          ) : null}
          <button
            onClick={() => router.push(`/admin/visitas/${v.folio}`)}
            className="btn btn-secondary min-h-[34px] px-3 text-[13px]"
          >
            Ver ficha
          </button>

          <button
            onClick={onHistorial}
            aria-expanded={historialAbierto}
            className="ml-auto min-h-[34px] flex items-center gap-2 px-3 bg-transparent border border-black/[.35] text-xs cursor-pointer text-[var(--color-text)] hover:bg-black/[.07]"
          >
            <span>
              {historialAbierto ? "Ocultar historial del local" : "Historial del local"}
              {" · "}
              {sinCerrar > 0 ? `${sinCerrar} sin cerrar` : `${problemas.length} problemas`}
              {" · "}
              {otrasVisitas.length} {otrasVisitas.length === 1 ? "visita" : "visitas"}
            </span>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              className="transition-transform"
              style={{ transform: `rotate(${historialAbierto ? 180 : 0}deg)` }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        {/* Historial del local */}
        {historialAbierto ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-3 px-3.5 py-3.5 bg-[var(--color-surface)] border border-black/[.25]">
            <div className="min-w-0">
              <div className="text-[10px] tracking-[.12em] uppercase opacity-62 mb-2">
                Problemas levantados en el local ({problemas.length})
              </div>
              {problemas.length === 0 ? (
                <div className="text-[13px] opacity-70">Nunca se ha levantado un problema en este local.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {problemas.map((pr) => {
                    const resuelto = pr.estado === "RESUELTO";
                    return (
                      <div
                        key={pr.id}
                        className="px-3 py-2.5 bg-white"
                        style={{ borderLeft: `4px solid ${resuelto ? "#7a7676" : "var(--color-accent)"}` }}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-extrabold text-sm leading-[1.25]">
                            {nombreProblema(ref.problemas, pr.tipoCodigo)}
                          </div>
                          <EstadoProblemaTag estado={pr.estado} />
                          <button
                            onClick={() => router.push(`/admin/visitas/${pr.folio}`)}
                            className="ml-auto min-h-7 px-2 bg-transparent border border-black/[.3] text-[10px] leading-none tracking-[.07em] uppercase cursor-pointer hover:bg-black/[.07]"
                          >
                            {pr.folio}
                          </button>
                        </div>
                        <div className="text-xs opacity-62 mt-1 tabular-nums">
                          Levantado el {pr.fecha}
                          {pr.resueltoEn ? ` · resuelto el ${pr.resueltoEn.slice(0, 10)}` : ""}
                        </div>
                        {pr.items.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {pr.items.map((it) => (
                              <span
                                key={it.etiqueta}
                                className="px-2 py-0.5 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-[11px] leading-[1.3] tabular-nums"
                              >
                                {it.etiqueta} × {it.cantidad}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {pr.descripcion ? <div className="text-[13px] leading-[1.45] mt-1.5">{pr.descripcion}</div> : null}
                        {pr.solucion ? (
                          <div className="text-[13px] leading-[1.45] mt-1">
                            <strong className="font-extrabold">{resuelto ? "Se realizó:" : "Sugerencia:"}</strong>{" "}
                            {pr.solucion}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="text-[10px] tracking-[.12em] uppercase opacity-62 mb-2">
                Otras visitas al local ({otrasVisitas.length})
              </div>
              {otrasVisitas.length === 0 ? (
                <div className="text-[13px] opacity-70">Es la única visita registrada en este local.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {otrasVisitas.slice(0, VISITAS_VISIBLES).map((x) => (
                    <div key={x.folio} className="px-3 py-2.5 bg-white border-l-4 border-black/[.35]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-extrabold text-sm tabular-nums">{x.fecha}</div>
                        <Tag variant={ESTADO_VISITA_TAG[x.estado]}>{ESTADO_VISITA_LABEL[x.estado]}</Tag>
                        <button
                          onClick={() => router.push(`/admin/visitas/${x.folio}`)}
                          className="ml-auto min-h-7 px-2 bg-transparent border border-black/[.3] text-[10px] leading-none tracking-[.07em] uppercase cursor-pointer hover:bg-black/[.07]"
                        >
                          {x.folio}
                        </button>
                      </div>
                      <div className="text-xs opacity-62 mt-1">
                        {x.tecnico} · {x.motivos.join(" · ") || "Sin motivo"}
                      </div>
                      {x.trabajosCodigos.length > 0 ? (
                        <div className="text-[13px] leading-[1.45] mt-1.5">
                          <strong className="font-extrabold">Trabajo:</strong>{" "}
                          {x.trabajosCodigos.map((c) => nombreTrabajo(ref.trabajos, c)).join(" · ")}
                        </div>
                      ) : null}
                      {x.observaciones ? <div className="text-[13px] leading-[1.45] mt-1">{x.observaciones}</div> : null}
                      {x.motivoTecnico ? (
                        <div className="text-[13px] leading-[1.45] mt-1">
                          <strong className="font-extrabold">No se hizo:</strong> {x.motivoTecnico}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {otrasVisitas.length > VISITAS_VISIBLES ? (
                    <div className="text-xs opacity-62">
                      Y {otrasVisitas.length - VISITAS_VISIBLES} más antiguas: búscalas por sucursal en Visitas.
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
