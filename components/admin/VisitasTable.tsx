"use client";

import { useMemo, useState } from "react";
import { sinTildes } from "@/lib/ui/formato";
import type { FormValores } from "@/components/admin/Dialogo";
import { useRouter } from "next/navigation";
import Tag from "@/components/Tag";
import AdminHeader from "@/components/admin/AdminHeader";
import FiltrosBar, { type ChipFiltro } from "@/components/admin/FiltrosBar";
import VisitaDialogo from "@/components/admin/VisitaDialogos";
import VisitasMasivasDialogo from "@/components/admin/VisitasMasivasDialogo";
import { Toast, useToast } from "@/components/ui/Toast";
import { ESTADO_VISITA_LABEL, ESTADO_VISITA_TAG, textoMotivos } from "@/lib/ui/estado";
import { textoFechaVisita } from "@/lib/ui/fecha";
import { puede, useReferencias } from "@/lib/ui/referencias";
import type { Visita, EstadoVisita } from "@/lib/types";

const ESTADOS: EstadoVisita[] = [
  "PROGRAMADA",
  "EN_CURSO",
  "COMPLETADA",
  "PENDIENTE",
  "REAGENDADA",
  "CANCELADA",
  "CANCELADA_ADMIN",
];

interface Filtros {
  estado: string;
  fecha: string;
  tecnicoId: string;
  tipo: string;
}

/**
 * No es un estado: es la opción del filtro que le muestra al administrador las
 * visitas eliminadas. Nadie más la tiene, y sin elegirla no aparecen.
 */
const ELIMINADAS = "ELIMINADAS";

const SIN_FILTROS: Filtros = { estado: "TODAS", fecha: "", tecnicoId: "", tipo: "" };

export default function VisitasTable({
  kicker,
  title,
  visitas,
  eliminadas,
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
  /** Las eliminadas. Solo le llegan al administrador; para el resto, undefined. */
  eliminadas?: Visita[];
  estadoInicial?: string;
  fechaInicial?: string;
  tecnicoInicial?: string;
  tipoInicial?: string;
  conMotivoTecnico?: boolean;
  permiteCrear?: boolean;
}) {
  const router = useRouter();
  const ref = useReferencias();
  const { tecnicos, problemas: catalogoProblema } = ref;
  const { toast, aviso } = useToast();
  const [busqueda, setBusqueda] = useState("");
  const [f, setF] = useState<Filtros>({
    estado: estadoInicial ?? "TODAS",
    fecha: fechaInicial ?? "",
    tecnicoId: tecnicoInicial ?? "",
    tipo: tipoInicial ?? "",
  });
  const [nueva, setNueva] = useState(false);
  // Con `porMall` el diálogo de la ruta abre eligiendo tiendas de un mall, y
  // con `inicial` trae lo que ya se había escrito en "Nueva visita".
  const [masivas, setMasivas] = useState<{ porMall: boolean; inicial?: FormValores } | null>(null);

  const fechas = useMemo(
    () => [...new Set(visitas.map((v) => v.fechaProgramada))].sort().reverse(),
    [visitas]
  );

  const filtradas = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    // Las eliminadas van en su propia lista: nunca se mezclan con las vigentes.
    const verEliminadas = f.estado === ELIMINADAS;
    return (verEliminadas ? eliminadas ?? [] : visitas).filter((v) => {
      if (!verEliminadas && f.estado !== "TODAS" && v.estado !== f.estado) return false;
      if (f.fecha && v.fechaProgramada !== f.fecha) return false;
      // Filtrar por técnico trae también las visitas en las que va de ayudante.
      if (f.tecnicoId && String(v.tecnicoId) !== f.tecnicoId && String(v.tecnicoAyudanteId) !== f.tecnicoId) {
        return false;
      }
      if (f.tipo && !(v.problemas ?? []).some((p) => p.tipoCodigo === f.tipo)) return false;
      if (!q) return true;
      const hay = `${v.folio} ${v.sucursal?.nombre ?? ""} ${v.cliente?.nombreFantasia ?? ""} ${v.tecnico?.nombreCompleto ?? ""} ${v.tecnicoAyudante?.nombreCompleto ?? ""} ${v.motivosNombres.join(" ")}`;
      return sinTildes(hay).includes(q);
    });
  }, [visitas, eliminadas, busqueda, f]);

  // La fecha con margen de días ("desde → hasta") necesita el doble de ancho.
  const hayMargen = filtradas.some((v) => v.fechaHasta);
  const mostrarMotivo = conMotivoTecnico || f.estado === "REAGENDADA" || f.estado === "PENDIENTE";

  const chips: ChipFiltro[] = [];
  if (f.estado !== "TODAS") {
    chips.push({
      label: f.estado === ELIMINADAS ? "Eliminadas" : `Estado: ${ESTADO_VISITA_LABEL[f.estado as EstadoVisita]}`,
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
        {permiteCrear && puede(ref, "visitas.crear") ? (
          <>
            <button onClick={() => setMasivas({ porMall: false })} className="btn btn-secondary">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
              <span>Visitas masivas</span>
            </button>
            <button onClick={() => setNueva(true)} className="btn btn-primary">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Nueva visita</span>
            </button>
          </>
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
                ...(eliminadas ? [{ v: ELIMINADAS, t: `Eliminadas (${eliminadas.length})` }] : []),
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

        {/* Anchos fijos: las columnas de texto se reparten lo que sobra y se
            cortan con "…", así el botón de ver nunca se sale de la pantalla. */}
        <div className="px-4 md:px-7 overflow-x-auto">
          <table className="table table-fixed min-w-[980px]">
            <colgroup>
              <col style={{ width: 124 }} />
              <col style={{ width: hayMargen ? 200 : 108 }} />
              <col style={{ width: 80 }} />
              <col />
              <col />
              <col />
              <col />
              <col style={{ width: 164 }} />
              {mostrarMotivo ? <col /> : null}
              <col style={{ width: 52 }} />
            </colgroup>
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
                <th />
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
                  <td className="tabular-nums opacity-65 whitespace-nowrap">{textoFechaVisita(v)}</td>
                  <td className={`tabular-nums whitespace-nowrap ${v.horaProgramada ? "opacity-90" : "opacity-45"}`}>
                    {v.horaProgramada ?? "Sin hora"}
                  </td>
                  <td>
                    <Recorte texto={v.cliente?.nombreFantasia} />
                  </td>
                  <td className="opacity-70">
                    <Recorte texto={v.sucursal?.nombre} />
                  </td>
                  <td className="opacity-70">
                    <Recorte
                      texto={
                        v.tecnicoAyudante
                          ? `${v.tecnico?.nombreCompleto ?? ""} + ${v.tecnicoAyudante.nombreCompleto}`
                          : v.tecnico?.nombreCompleto
                      }
                    />
                  </td>
                  <td className="opacity-70">
                    <Recorte texto={textoMotivos(v)} />
                  </td>
                  <td>
                    {v.eliminacion ? (
                      <Tag variant="dark">Eliminada</Tag>
                    ) : (
                      <Tag variant={ESTADO_VISITA_TAG[v.estado]}>{ESTADO_VISITA_LABEL[v.estado]}</Tag>
                    )}
                  </td>
                  {mostrarMotivo ? (
                    <td className="opacity-70">
                      <Recorte
                        texto={v.motivoPendiente ?? v.reagendamientos?.[0]?.motivo ?? "Sin motivo registrado"}
                      />
                    </td>
                  ) : null}
                  <td className="text-right whitespace-nowrap max-lg:sticky max-lg:right-0 max-lg:bg-[var(--color-bg)]">
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
          onPorMall={(inicial) => {
            setNueva(false);
            setMasivas({ porMall: true, inicial });
          }}
          onCerrar={() => setNueva(false)}
          onHecho={(mensaje, folio) => {
            aviso(mensaje);
            if (folio) router.refresh();
          }}
        />
      ) : null}

      {masivas ? (
        <VisitasMasivasDialogo
          porMall={masivas.porMall}
          inicial={masivas.inicial}
          onCerrar={() => setMasivas(null)}
          onHecho={(mensaje, creadas) => {
            aviso(mensaje);
            if (creadas > 0) router.refresh();
          }}
        />
      ) : null}

      <Toast texto={toast} variante="panel" />
    </>
  );
}

/**
 * Texto de celda en una sola línea, cortado con "…" si no cabe.
 *
 * Un motivo o un nombre largo estiraba la fila y desordenaba toda la tabla.
 * Así todas las filas quedan de la misma altura; el texto completo sale al
 * pasar el mouse y, entero, en el acta.
 */
function Recorte({ texto }: { texto: string | null | undefined }) {
  return (
    <span className="block truncate" title={texto ?? undefined}>
      {texto}
    </span>
  );
}
