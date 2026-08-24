"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Tag from "@/components/Tag";
import AdminHeader from "@/components/admin/AdminHeader";
import FiltrosBar, { type ChipFiltro } from "@/components/admin/FiltrosBar";
import VisitaDialogo from "@/components/admin/VisitaDialogos";
import { Toast, useToast } from "@/components/ui/Toast";
import { ESTADO_VISITA_LABEL, ESTADO_VISITA_TAG, textoMotivos } from "@/lib/ui/estado";
import { useReferencias } from "@/lib/ui/referencias";
import type { Visita, EstadoVisita } from "@/lib/types";

const ESTADOS: EstadoVisita[] = ["PROGRAMADA", "EN_CURSO", "COMPLETADA", "PENDIENTE", "REAGENDADA", "CANCELADA"];

interface Filtros {
  estado: string;
  fecha: string;
  tecnicoId: string;
  tipo: string;
}

const SIN_FILTROS: Filtros = { estado: "TODAS", fecha: "", tecnicoId: "", tipo: "" };

export default function VisitasTable({
  kicker,
  title,
  visitas,
  estadoInicial,
  fechaInicial,
  tecnicoInicial,
  tipoInicial,
  /** Reagendas y pendientes: siempre muestra la columna con el motivo del técnico. */
  conMotivoTecnico = false,
  /** La vista de reagendas no crea visitas nuevas. */
  permiteCrear = true,
}: {
  kicker: string;
  title: string;
  visitas: Visita[];
  estadoInicial?: string;
  fechaInicial?: string;
  tecnicoInicial?: string;
  tipoInicial?: string;
  conMotivoTecnico?: boolean;
  permiteCrear?: boolean;
}) {
  const router = useRouter();
  const { tecnicos, problemas: catalogoProblema } = useReferencias();
  const { toast, aviso } = useToast();
  const [busqueda, setBusqueda] = useState("");
  const [f, setF] = useState<Filtros>({
    estado: estadoInicial ?? "TODAS",
    fecha: fechaInicial ?? "",
    tecnicoId: tecnicoInicial ?? "",
    tipo: tipoInicial ?? "",
  });
  const [nueva, setNueva] = useState(false);

  const fechas = useMemo(
    () => [...new Set(visitas.map((v) => v.fechaProgramada))].sort().reverse(),
    [visitas]
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return visitas.filter((v) => {
      if (f.estado !== "TODAS" && v.estado !== f.estado) return false;
      if (f.fecha && v.fechaProgramada !== f.fecha) return false;
      if (f.tecnicoId && String(v.tecnicoId) !== f.tecnicoId) return false;
      if (f.tipo && !(v.problemas ?? []).some((p) => p.tipoCodigo === f.tipo)) return false;
      if (!q) return true;
      const hay = `${v.folio} ${v.sucursal?.nombre ?? ""} ${v.cliente?.nombreFantasia ?? ""} ${v.tecnico?.nombreCompleto ?? ""} ${v.motivosNombres.join(" ")}`;
      return hay.toLowerCase().includes(q);
    });
  }, [visitas, busqueda, f]);

  const mostrarMotivo = conMotivoTecnico || f.estado === "REAGENDADA" || f.estado === "PENDIENTE";

  const chips: ChipFiltro[] = [];
  if (f.estado !== "TODAS") {
    chips.push({
      label: `Estado: ${ESTADO_VISITA_LABEL[f.estado as EstadoVisita]}`,
      onQuitar: () => setF((p) => ({ ...p, estado: "TODAS" })),
    });
  }
  if (f.fecha) chips.push({ label: `Fecha: ${f.fecha}`, onQuitar: () => setF((p) => ({ ...p, fecha: "" })) });
  if (f.tecnicoId) {
    const t = tecnicos.find((x) => String(x.id) === f.tecnicoId);
    chips.push({ label: `Técnico: ${t?.nombreCompleto ?? ""}`, onQuitar: () => setF((p) => ({ ...p, tecnicoId: "" })) });
  }
  if (f.tipo) {
    const t = catalogoProblema.find((x) => x.codigo === f.tipo);
    chips.push({ label: `Falla: ${t?.nombre ?? f.tipo}`, onQuitar: () => setF((p) => ({ ...p, tipo: "" })) });
  }

  return (
    <>
      <AdminHeader kicker={kicker} title={title}>
        {permiteCrear ? (
          <button onClick={() => setNueva(true)} className="btn btn-primary">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Nueva visita</span>
          </button>
        ) : null}
      </AdminHeader>

      <div className="pb-10 animate-fade-in">
        <FiltrosBar
          busqueda={busqueda}
          phBusqueda={
            conMotivoTecnico ? "Buscar folio, cliente, sucursal reagendada…" : "Buscar folio, cliente, sucursal…"
          }
          onBusqueda={setBusqueda}
          conteo={`${filtradas.length} ${filtradas.length === 1 ? "registro" : "registros"}`}
          chips={chips}
          onLimpiar={() => setF(SIN_FILTROS)}
          campos={[
            {
              id: "fv-estado",
              label: "Estado de la visita",
              valor: f.estado,
              opciones: [
                { v: "TODAS", t: "Todos los estados" },
                ...ESTADOS.map((e) => ({ v: e, t: ESTADO_VISITA_LABEL[e] })),
              ],
              onChange: (v) => setF((p) => ({ ...p, estado: v })),
            },
            {
              id: "fv-fecha",
              label: "Fecha",
              valor: f.fecha,
              opciones: [{ v: "", t: "Todas las fechas" }, ...fechas.map((x) => ({ v: x, t: x }))],
              onChange: (v) => setF((p) => ({ ...p, fecha: v })),
            },
            {
              id: "fv-tecnico",
              label: "Técnico",
              valor: f.tecnicoId,
              opciones: [
                { v: "", t: "Todos los técnicos" },
                ...tecnicos.map((t) => ({ v: String(t.id), t: t.nombreCompleto })),
              ],
              onChange: (v) => setF((p) => ({ ...p, tecnicoId: v })),
            },
            {
              id: "fv-tipo",
              label: "Tipo de falla registrada",
              valor: f.tipo,
              opciones: [
                { v: "", t: "Todas las fallas" },
                ...catalogoProblema.map((t) => ({ v: t.codigo, t: t.nombre })),
              ],
              onChange: (v) => setF((p) => ({ ...p, tipo: v })),
            },
          ]}
        />

        <div className="px-7">
          <table className="table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Cliente</th>
                <th>Sucursal</th>
                <th>Técnico</th>
                <th>Motivo</th>
                <th>Estado</th>
                {mostrarMotivo ? <th>Motivo del técnico</th> : null}
                <th style={{ width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {filtradas.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => router.push(`/admin/visitas/${v.folio}`)}
                  className="cursor-pointer hover:bg-black/5"
                >
                  <td className="font-semibold tabular-nums whitespace-nowrap">{v.folio}</td>
                  <td className="tabular-nums opacity-65 whitespace-nowrap">{v.fechaProgramada}</td>
                  <td className={`tabular-nums whitespace-nowrap ${v.horaProgramada ? "opacity-90" : "opacity-45"}`}>
                    {v.horaProgramada ?? "Sin hora"}
                  </td>
                  <td className="whitespace-nowrap">{v.cliente?.nombreFantasia}</td>
                  <td className="opacity-70 whitespace-nowrap">{v.sucursal?.nombre}</td>
                  <td className="opacity-70 whitespace-nowrap">{v.tecnico?.nombreCompleto}</td>
                  <td className="opacity-70">{textoMotivos(v)}</td>
                  <td>
                    <Tag variant={ESTADO_VISITA_TAG[v.estado]}>{ESTADO_VISITA_LABEL[v.estado]}</Tag>
                  </td>
                  {mostrarMotivo ? (
                    <td className="opacity-70 max-w-[320px]">
                      {v.motivoPendiente ?? v.reagendamientos?.[0]?.motivo ?? "Sin motivo registrado"}
                    </td>
                  ) : null}
                  <td className="text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/admin/visitas/${v.folio}`);
                      }}
                      className="btn btn-icon w-8 h-8 border border-black/[.3]"
                      aria-label={`Ver acta ${v.folio}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
                        <circle cx="12" cy="12" r="2.6" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtradas.length === 0 ? (
            <div className="py-14 text-center">
              <div className="font-extrabold text-[17px] mb-1.5">Nada que mostrar</div>
              <div className="text-[13px] opacity-66">Ajusta la búsqueda o los filtros.</div>
            </div>
          ) : null}
        </div>
      </div>

      {nueva ? (
        <VisitaDialogo
          onCerrar={() => setNueva(false)}
          onHecho={(mensaje, folio) => {
            aviso(mensaje);
            if (folio) router.refresh();
          }}
        />
      ) : null}

      <Toast texto={toast} variante="panel" />
    </>
  );
}
