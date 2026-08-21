"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Tag from "@/components/Tag";
import AdminHeader from "@/components/admin/AdminHeader";
import FiltrosBar, { type ChipFiltro } from "@/components/admin/FiltrosBar";
import VisitaDialogo, { type OrigenProblema } from "@/components/admin/VisitaDialogos";
import { Toast, useToast } from "@/components/ui/Toast";
import { actualizarProblemaAction } from "@/app/actions/admin";
import { ESTADO_PROBLEMA_LABEL, ESTADO_PROBLEMA_TAG } from "@/lib/ui/estado";
import { catalogoProblema } from "@/lib/mock/catalogos";
import { clientes } from "@/lib/mock/maestros";
import type { EstadoProblema } from "@/lib/types";

interface Item {
  problema: {
    id: number;
    tipoCodigo: string;
    estado: EstadoProblema;
    descripcion: string | null;
    solucion: string | null;
    items: { id: number; etiqueta: string; cantidad: number }[];
  };
  visita: {
    folio: string;
    fechaProgramada: string;
    tecnico?: { nombreCompleto: string };
    motivo?: { nombre: string };
  };
  agenda: { folio: string; fecha: string; tecnico: string } | null;
}

export interface GrupoProblemas {
  sucursalId: number;
  nombre: string;
  cliente: string;
  clienteId: number;
  comuna: string;
  total: number;
  abiertos: number;
  items: Item[];
}

const ESTADOS: { codigo: EstadoProblema; label: string }[] = [
  { codigo: "ABIERTO", label: "Abierto" },
  { codigo: "PENDIENTE", label: "Espera repuesto" },
  { codigo: "RESUELTO", label: "Resuelto" },
];

const OPC_TIPOS = catalogoProblema.map((t) => ({ v: t.codigo, t: t.nombre }));

function nombreTipo(codigo: string) {
  return catalogoProblema.find((t) => t.codigo === codigo)?.nombre ?? codigo;
}

interface Filtros {
  clienteId: string;
  fecha: string;
  tipo: string;
  /** "" = sin cerrar (por defecto), "TODOS" = incluidos los resueltos. */
  estado: string;
}

const SIN_FILTROS: Filtros = { clienteId: "", fecha: "", tipo: "", estado: "" };

export default function ProblemasView({ grupos }: { grupos: GrupoProblemas[] }) {
  const router = useRouter();
  const { toast, aviso } = useToast();
  const [f, setF] = useState<Filtros>(SIN_FILTROS);
  /** Problema con el panel "Cambiar estado o tipo" desplegado. */
  const [editando, setEditando] = useState<number | null>(null);
  /** Cambios sin confirmar del panel abierto. */
  const [pendiente, setPendiente] = useState<{ estado: EstadoProblema; tipo: string } | null>(null);
  const [agendar, setAgendar] = useState<OrigenProblema | null>(null);

  const fechas = useMemo(
    () => [...new Set(grupos.flatMap((g) => g.items.map((i) => i.visita.fechaProgramada)))].sort().reverse(),
    [grupos]
  );

  const filtrados = useMemo(() => {
    return grupos
      .filter((g) => !f.clienteId || String(g.clienteId) === f.clienteId)
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => {
          if (f.fecha && i.visita.fechaProgramada !== f.fecha) return false;
          if (f.tipo && i.problema.tipoCodigo !== f.tipo) return false;
          if (f.estado === "TODOS") return true;
          if (f.estado) return i.problema.estado === f.estado;
          return i.problema.estado !== "RESUELTO";
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [grupos, f]);

  const totalProblemas = filtrados.reduce((acc, g) => acc + g.items.length, 0);

  const chips: ChipFiltro[] = [];
  if (f.clienteId) {
    const c = clientes.find((x) => String(x.id) === f.clienteId);
    chips.push({ label: `Cliente: ${c?.nombreFantasia ?? ""}`, onQuitar: () => setF((p) => ({ ...p, clienteId: "" })) });
  }
  if (f.fecha) chips.push({ label: `Fecha: ${f.fecha}`, onQuitar: () => setF((p) => ({ ...p, fecha: "" })) });
  if (f.tipo) chips.push({ label: `Falla: ${nombreTipo(f.tipo)}`, onQuitar: () => setF((p) => ({ ...p, tipo: "" })) });
  if (f.estado) {
    chips.push({
      label: `Estado: ${f.estado === "TODOS" ? "todos" : ESTADO_PROBLEMA_LABEL[f.estado as EstadoProblema]}`,
      onQuitar: () => setF((p) => ({ ...p, estado: "" })),
    });
  }

  async function confirmarCambio(problemaId: number, estadoPrev: EstadoProblema, tipoPrev: string) {
    if (!pendiente) return aviso("No hay cambios que confirmar");
    if (pendiente.estado === estadoPrev && pendiente.tipo === tipoPrev) {
      return aviso("No hay cambios que confirmar");
    }
    const res = await actualizarProblemaAction({
      problemaId,
      estado: pendiente.estado,
      tipoCodigo: pendiente.tipo,
    });
    if (!res.ok) return aviso(res.error ?? "No se pudo guardar el cambio.");

    const partes: string[] = [];
    if (pendiente.estado !== estadoPrev) partes.push(ESTADO_PROBLEMA_LABEL[pendiente.estado]);
    if (pendiente.tipo !== tipoPrev) partes.push(`reclasificado como «${nombreTipo(pendiente.tipo)}»`);
    aviso(
      partes.join(" · ") +
        (pendiente.estado === "RESUELTO" && estadoPrev !== "RESUELTO" ? " · sale de la lista de problemas" : "")
    );
    setEditando(null);
    setPendiente(null);
    router.refresh();
  }

  return (
    <>
      <AdminHeader kicker="Operación · análisis" title="Tiendas con problemas" />

      <div className="pb-10 animate-fade-in">
        <FiltrosBar
          conteo={`${totalProblemas} ${totalProblemas === 1 ? "problema" : "problemas"} en ${filtrados.length} ${
            filtrados.length === 1 ? "tienda" : "tiendas"
          }`}
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
              id: "fp-fecha",
              label: "Fecha de la visita",
              valor: f.fecha,
              opciones: [{ v: "", t: "Todas las fechas" }, ...fechas.map((x) => ({ v: x, t: x }))],
              onChange: (v) => setF((p) => ({ ...p, fecha: v })),
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
                { v: "ABIERTO", t: "Abierto" },
                { v: "PENDIENTE", t: "Pendiente de repuesto" },
                { v: "RESUELTO", t: "Resuelto" },
                { v: "TODOS", t: "Todos, incluidos los resueltos" },
              ],
              onChange: (v) => setF((p) => ({ ...p, estado: v })),
            },
          ]}
        />

        <div className="px-7">
          {filtrados.map((g) => (
            <div key={g.sucursalId} className="border-2 border-[var(--color-text)] mt-7 shadow-[3px_3px_0_rgba(32,30,29,.1)]">
              <div className="flex items-center gap-3 flex-wrap px-5 py-4 bg-[var(--color-surface-2)] border-b-2 border-[var(--color-text)]">
                <div className="min-w-0">
                  <div className="font-extrabold text-lg">{g.nombre}</div>
                  <div className="text-[13px] opacity-60 mt-0.5">
                    {g.cliente} · {g.comuna}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2.5">
                  <span className="tag tag-outline">{g.abiertos} sin cerrar</span>
                  <span className="text-xs opacity-62">de {g.total} en total</span>
                </div>
              </div>

              <div className="bg-white">
                {g.items.map(({ problema: p, visita: v, agenda }) => {
                  const resuelto = p.estado === "RESUELTO";
                  const abierto = editando === p.id;
                  const estadoSel = abierto && pendiente ? pendiente.estado : p.estado;
                  const tipoSel = abierto && pendiente ? pendiente.tipo : p.tipoCodigo;
                  const hayCambio = estadoSel !== p.estado || tipoSel !== p.tipoCodigo;

                  return (
                    <div
                      key={p.id}
                      className="flex gap-3.5 px-5 py-4 border-b border-black/[.15]"
                      style={{
                        borderLeft: `5px solid ${
                          resuelto ? "#7a7676" : p.estado === "PENDIENTE" ? "#e15b47" : "var(--color-accent)"
                        }`,
                        background: resuelto ? "var(--color-surface-3)" : "var(--color-accent-100)",
                      }}
                    >
                      <div
                        className="flex-none w-6.5 h-6.5 rounded-full grid place-items-center mt-0.5"
                        style={{
                          background: resuelto ? "#7a7676" : p.estado === "PENDIENTE" ? "#e15b47" : "var(--color-accent)",
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                          {resuelto ? <path d="M4 12l5 5L20 6" /> : <path d="M12 8v5M12 17h.01" />}
                        </svg>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <div className="font-extrabold text-base leading-[1.25]">{nombreTipo(p.tipoCodigo)}</div>
                          <Tag variant={ESTADO_PROBLEMA_TAG[p.estado]}>{ESTADO_PROBLEMA_LABEL[p.estado]}</Tag>
                          {agenda ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-[11px] leading-[1.2] tracking-[.06em] uppercase">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 7.5V12l3 2" />
                              </svg>
                              <span>Agendado · esperando visita</span>
                            </span>
                          ) : null}
                          <button
                            onClick={() => router.push(`/admin/visitas/${v.folio}`)}
                            className="ml-auto min-h-8 px-2.5 bg-transparent border border-black/[.3] text-[11px] leading-none tracking-[.07em] uppercase cursor-pointer hover:bg-black/[.07]"
                          >
                            {v.folio}
                          </button>
                        </div>

                        <div className="text-xs opacity-62 mt-1.5 tabular-nums">
                          {v.fechaProgramada} · {v.tecnico?.nombreCompleto} · {v.motivo?.nombre}
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

                        {agenda ? (
                          <div className="flex gap-2.5 items-start mt-3 px-3.5 py-3 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)]">
                            <svg
                              width="17"
                              height="17"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="var(--color-text)"
                              strokeWidth="2.2"
                              className="flex-none mt-px"
                            >
                              <rect x="3" y="5" width="18" height="16" />
                              <path d="M8 3v4M16 3v4M3 11h18" />
                            </svg>
                            <div className="text-[13px] max-w-[70ch]">
                              Agendado: no hay nada que hacer con este problema hasta que {agenda.tecnico} cierre la
                              visita {agenda.folio} del {agenda.fecha}.
                            </div>
                          </div>
                        ) : null}

                        <div className="flex items-center gap-2.5 flex-wrap mt-3.5 pt-3 border-t border-black/[.18]">
                          <button
                            onClick={() =>
                              setAgendar({
                                problemaId: p.id,
                                folio: v.folio,
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
                            <span>{agenda ? "Agendar otra visita" : "Agendar visita"}</span>
                          </button>

                          {agenda ? (
                            <span className="inline-flex items-center gap-2 min-h-[34px] px-3 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2] tabular-nums">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                <path d="M4 12l5 5L20 6" />
                              </svg>
                              <span>
                                Visita {agenda.folio} · {agenda.fecha} · {agenda.tecnico}
                              </span>
                            </span>
                          ) : null}

                          {!agenda ? (
                            <button
                              onClick={() => {
                                const abrir = editando !== p.id;
                                setEditando(abrir ? p.id : null);
                                setPendiente(abrir ? { estado: p.estado, tipo: p.tipoCodigo } : null);
                              }}
                              className="ml-auto min-h-[34px] flex items-center gap-2 px-3 bg-transparent border border-black/[.35] text-xs cursor-pointer text-[var(--color-text)] hover:bg-black/[.07]"
                            >
                              <span>{abierto ? "Ocultar" : "Cambiar estado o tipo"}</span>
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.4"
                                className="transition-transform"
                                style={{ transform: `rotate(${abierto ? 180 : 0}deg)` }}
                              >
                                <path d="M6 9l6 6 6-6" />
                              </svg>
                            </button>
                          ) : null}
                        </div>

                        {abierto ? (
                          <div className="flex items-center gap-2.5 flex-wrap mt-2.5 px-3.5 py-3 bg-[var(--color-surface)] border border-black/[.25]">
                            <span className="text-[10px] tracking-[.12em] uppercase opacity-60">Estado</span>
                            <div className="flex gap-1.5 flex-wrap">
                              {ESTADOS.map((a) => (
                                <button
                                  key={a.codigo}
                                  onClick={() => setPendiente((prev) => ({ estado: a.codigo, tipo: prev?.tipo ?? p.tipoCodigo }))}
                                  className="min-h-[34px] px-3 border border-black/[.35] font-extrabold text-xs cursor-pointer hover:bg-black/[.1]"
                                  style={{
                                    background: estadoSel === a.codigo ? "var(--color-text)" : "transparent",
                                    color: estadoSel === a.codigo ? "var(--color-bg)" : "var(--color-text)",
                                  }}
                                >
                                  {a.label}
                                </button>
                              ))}
                            </div>

                            <div className="ml-auto flex items-center gap-2.5">
                              <label
                                htmlFor={`ft-${p.id}`}
                                className="text-[10px] tracking-[.12em] uppercase opacity-60"
                              >
                                Reclasificar
                              </label>
                              <div className="relative">
                                <select
                                  id={`ft-${p.id}`}
                                  value={tipoSel}
                                  onChange={(e) =>
                                    setPendiente((prev) => ({ estado: prev?.estado ?? p.estado, tipo: e.target.value }))
                                  }
                                  className="input min-h-[34px] pl-2.5 pr-8.5 text-[13px] appearance-none"
                                >
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

                            <div className="basis-full h-0" />

                            <button
                              onClick={() => confirmarCambio(p.id, p.estado, p.tipoCodigo)}
                              className="min-h-[38px] flex items-center gap-2 px-3.5 text-[var(--color-bg)] border-0 font-extrabold text-[13px] cursor-pointer hover:brightness-95"
                              style={{ background: hayCambio ? "var(--color-accent)" : "#8f8b8b" }}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                                <path d="M4 12l5 5L20 6" />
                              </svg>
                              <span>Confirmar cambio</span>
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
                              Nada cambia hasta que confirmes. Al marcarlo Resuelto el problema sale de esta lista.
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {filtrados.length === 0 ? (
            <div className="py-14 text-center">
              <div className="font-extrabold text-[17px] mb-1.5">Nada que mostrar</div>
              <div className="text-[13px] opacity-66">Ajusta los filtros de cliente, fecha o tipo de falla.</div>
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
