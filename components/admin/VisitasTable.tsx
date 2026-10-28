"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { FormValores } from "@/components/admin/Dialogo";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Tag from "@/components/Tag";
import AdminHeader from "@/components/admin/AdminHeader";
import FiltrosBar, { type ChipFiltro } from "@/components/admin/FiltrosBar";
import VisitaDialogo from "@/components/admin/VisitaDialogos";
import VisitasMasivasDialogo from "@/components/admin/VisitasMasivasDialogo";
import VisitasLoteDialogo, { type AccionLote } from "@/components/admin/VisitasLoteDialogo";
import { Toast, useToast } from "@/components/ui/Toast";
import { ESTADO_VISITA_LABEL, ESTADO_VISITA_TAG, textoMotivos } from "@/lib/ui/estado";
import { textoFechaVisita } from "@/lib/ui/fecha";
import {
  ELIMINADAS,
  ESTADOS_FILTRO,
  LIMITES,
  lunesDe,
  rangoSemana,
  SIN_FILTROS,
  urlFiltrosVisitas,
  type FiltrosVisitas,
  type OpcionesFiltroVisitas,
  type PaginaVisitas,
} from "@/lib/ui/filtros-visitas";
import { armarZip, type ArchivoZip } from "@/lib/ui/zip";
import { puede, useReferencias } from "@/lib/ui/referencias";
import type { Visita, EstadoVisita } from "@/lib/types";

/**
 * La lista de Visitas del panel. Filtrar y paginar lo hace el servidor: los
 * filtros viven en la URL y cambiarlos es navegar (ver lib/ui/filtros-visitas).
 */
export default function VisitasTable({
  kicker,
  title,
  filtros: f,
  pagina,
  opciones,
  eliminadas,
  /** Reagendas y pendientes: siempre muestra la columna con el motivo del técnico. */
  conMotivoTecnico = false,
  /** La vista de reagendas no crea visitas nuevas. */
  permiteCrear = true,
}: {
  kicker: string;
  title: string;
  /** Los filtros de la URL, ya validados por el servidor. */
  filtros: FiltrosVisitas;
  pagina: PaginaVisitas;
  opciones: OpcionesFiltroVisitas;
  /** Cuántas eliminadas hay. Solo le llega al administrador; para el resto, undefined. */
  eliminadas?: number;
  conMotivoTecnico?: boolean;
  permiteCrear?: boolean;
}) {
  const router = useRouter();
  const ref = useReferencias();
  const { tecnicos, problemas: catalogoProblema } = ref;
  const { toast, aviso } = useToast();
  const [cargando, iniciar] = useTransition();
  const visitas = pagina.visitas;

  /** Cambia filtros: es navegar a la URL nueva. Cualquier cambio vuelve a la primera página. */
  function ir(cambios: Partial<FiltrosVisitas>) {
    const destino = urlFiltrosVisitas({ ...f, pagina: 1, ...cambios });
    iniciar(() => router.replace(destino, { scroll: false }));
  }
  const setF = (fn: (p: FiltrosVisitas) => Partial<FiltrosVisitas>) => ir(fn(f));

  // La búsqueda se escribe aquí y viaja a la URL cuando se deja de teclear.
  const [busqueda, setBusqueda] = useState(f.q);
  useEffect(() => {
    if (busqueda.trim() === f.q) return;
    const espera = setTimeout(() => {
      iniciar(() => router.replace(urlFiltrosVisitas({ ...f, q: busqueda, pagina: 1 }), { scroll: false }));
    }, 350);
    return () => clearTimeout(espera);
  }, [busqueda, f, router]);

  const [nueva, setNueva] = useState(false);
  // Con `porMall` el diálogo de la ruta abre eligiendo tiendas de un mall, y
  // con `inicial` trae lo que ya se había escrito en "Nueva visita".
  const [masivas, setMasivas] = useState<{ porMall: boolean; inicial?: FormValores } | null>(null);
  // "Acciones múltiples": con el modo prendido, el clic en una fila la marca en
  // vez de abrir su acta. Lo marcado se guarda entero y sobrevive a los
  // filtros y a las páginas, para poder juntar visitas de varias búsquedas.
  const [seleccionando, setSeleccionando] = useState(false);
  const [marcadas, setMarcadas] = useState<Visita[]>([]);
  const [lote, setLote] = useState<AccionLote | null>(null);

  // El permiso abre la selección; cada acción pide además el suyo.
  const accionesLote: { accion: AccionLote; label: string }[] = puede(ref, "visitas.masivo")
    ? [
        ...(puede(ref, "visitas.editar") ? [{ accion: "modificar" as const, label: "Editar o reagendar" }] : []),
        ...(puede(ref, "visitas.cancelar") ? [{ accion: "cancelar" as const, label: "Cancelar por admin" }] : []),
        ...(puede(ref, "visitas.eliminar") ? [{ accion: "eliminar" as const, label: "Eliminar" }] : []),
      ]
    : [];
  // Las eliminadas solo se miran: sobre ellas no hay nada que marcar.
  const verEliminadas = f.estados.includes(ELIMINADAS);
  const conCasillas = seleccionando && !verEliminadas;
  const esMarcada = (folio: string) => marcadas.some((m) => m.folio === folio);
  // Las de la página a la vista van con lo que acaba de traer el servidor.
  const seleccionadas = useMemo(
    () => marcadas.map((m) => visitas.find((v) => v.folio === m.folio) ?? m),
    [visitas, marcadas]
  );

  // Solo las actas cerradas tienen PDF.
  const cerradasMarcadas = seleccionadas.filter((v) => v.estado === "COMPLETADA");
  const [descargando, setDescargando] = useState(false);

  /** Baja el PDF de cada acta cerrada; si son varias, las junta en un .zip. */
  async function descargarActas() {
    if (cerradasMarcadas.length === 0) {
      aviso("Ninguna de las visitas marcadas tiene el acta cerrada.");
      return;
    }
    setDescargando(true);
    try {
      const archivos: ArchivoZip[] = [];
      const fallidas: string[] = [];
      const cola = [...cerradasMarcadas];
      // Unas pocas a la vez: cada PDF lo arma el servidor con sus fotos.
      await Promise.all(
        Array.from({ length: Math.min(3, cola.length) }, async () => {
          for (let v = cola.shift(); v; v = cola.shift()) {
            try {
              const r = await fetch(`/api/visita/acta/${encodeURIComponent(v.folio)}`);
              if (!r.ok) throw new Error(String(r.status));
              archivos.push({ nombre: `Acta ${v.folio}.pdf`, bytes: new Uint8Array(await r.arrayBuffer()) });
            } catch {
              fallidas.push(v.folio);
            }
          }
        })
      );
      if (archivos.length === 0) {
        aviso("No se pudo descargar ninguna acta.");
        return;
      }
      archivos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      const unica = archivos.length === 1;
      const blob = unica ? new Blob([archivos[0].bytes as BlobPart], { type: "application/pdf" }) : armarZip(archivos);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = unica ? archivos[0].nombre : `Actas ${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      const omitidas = seleccionadas.length - cerradasMarcadas.length;
      const notas = [
        omitidas ? `${omitidas} sin acta cerrada` : "",
        fallidas.length ? `no se pudo: ${fallidas.join(", ")}` : "",
      ].filter(Boolean);
      aviso(`${archivos.length} ${unica ? "acta descargada" : "actas descargadas"}${notas.length ? ` (${notas.join("; ")})` : ""}.`);
    } finally {
      setDescargando(false);
    }
  }

  function alternar(v: Visita) {
    setMarcadas((prev) => (prev.some((m) => m.folio === v.folio) ? prev.filter((m) => m.folio !== v.folio) : [...prev, v]));
  }

  function salirDeSeleccion() {
    setSeleccionando(false);
    setMarcadas([]);
  }

  const { clientes, tiendas, malls, regiones } = opciones;

  const todasMarcadas = visitas.length > 0 && visitas.every((v) => esMarcada(v.folio));

  /** La casilla del encabezado: marca o desmarca lo que se está viendo. */
  function alternarVisibles() {
    const visibles = new Set(visitas.map((v) => v.folio));
    setMarcadas((prev) =>
      todasMarcadas
        ? prev.filter((m) => !visibles.has(m.folio))
        : [...prev, ...visitas.filter((v) => !prev.some((m) => m.folio === v.folio))]
    );
  }

  // La fecha con margen de días ("desde → hasta") necesita el doble de ancho.
  const hayMargen = visitas.some((v) => v.fechaHasta);
  const mostrarMotivo = conMotivoTecnico || f.estados.includes("REAGENDADA") || f.estados.includes("PENDIENTE");
  const sinEste = (lista: string[], v: string) => lista.filter((x) => x !== v);

  const chips: ChipFiltro[] = [];
  for (const e of f.estados) {
    chips.push({
      label: e === ELIMINADAS ? "Eliminadas" : `Estado: ${ESTADO_VISITA_LABEL[e as EstadoVisita]}`,
      onQuitar: () => setF((p) => ({ estados: sinEste(p.estados, e) })),
    });
  }
  for (const cid of f.clienteIds) {
    const c = clientes.find(([id]) => String(id) === cid);
    chips.push({
      label: `Cliente: ${c?.[1] ?? ""}`,
      // Sin ese cliente las tiendas elegidas pueden dejar de corresponder: se limpian.
      onQuitar: () => setF((p) => ({ clienteIds: sinEste(p.clienteIds, cid), sucursalIds: [] })),
    });
  }
  for (const sid of f.sucursalIds) {
    const t = tiendas.find(([id]) => String(id) === sid);
    chips.push({ label: `Tienda: ${t?.[1] ?? ""}`, onQuitar: () => setF((p) => ({ sucursalIds: sinEste(p.sucursalIds, sid) })) });
  }
  for (const r of f.regiones) {
    chips.push({ label: `Zona: ${r}`, onQuitar: () => setF((p) => ({ regiones: sinEste(p.regiones, r) })) });
  }
  if (f.semana) {
    const s = rangoSemana(f.semana);
    chips.push({
      label: `Semana: ${textoDiaMes(s.desde)} – ${textoDiaMes(s.hasta)}`,
      onQuitar: () => setF(() => ({ semana: "" })),
    });
  }
  if (f.mallId) {
    const m = malls.find(([id]) => String(id) === f.mallId);
    chips.push({ label: `Mall: ${m?.[1] ?? ""}`, onQuitar: () => setF(() => ({ mallId: "" })) });
  }
  if (f.desde) chips.push({ label: `Desde: ${f.desde}`, onQuitar: () => setF(() => ({ desde: "" })) });
  if (f.hasta) chips.push({ label: `Hasta: ${f.hasta}`, onQuitar: () => setF(() => ({ hasta: "" })) });
  if (f.tecnicoId) {
    const t = tecnicos.find((x) => String(x.id) === f.tecnicoId);
    chips.push({ label: `Técnico: ${t?.nombreCompleto ?? ""}`, onQuitar: () => setF(() => ({ tecnicoId: "" })) });
  }
  if (f.tipo && !f.clienteIds.length) {
    const t = catalogoProblema.find((x) => x.codigo === f.tipo);
    chips.push({ label: `Falla: ${t?.nombre ?? f.tipo}`, onQuitar: () => setF(() => ({ tipo: "" })) });
  }

  return (
    <>
      <AdminHeader kicker={kicker} title={title}>
        {accionesLote.length ? (
          <button
            onClick={() => (seleccionando ? salirDeSeleccion() : setSeleccionando(true))}
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
        {permiteCrear && puede(ref, "visitas.crear") ? (
          <>
            <Link href="/admin/visitas/papel" className="btn btn-secondary" title="Cargar informes hechos a mano en años anteriores">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 3H6v18h12V7z" />
                <path d="M14 3v4h4M9 12h6M9 16h6" />
              </svg>
              <span>Visitas en papel</span>
            </Link>
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
          conteo={`${pagina.total} ${pagina.total === 1 ? "registro" : "registros"}`}
          chips={chips}
          // Limpiar filtros no toca cuántas visitas se ven por página.
          onLimpiar={() => {
            setBusqueda("");
            ir({ ...SIN_FILTROS, limite: f.limite });
          }}
          acciones={
            <label className="flex items-center gap-2 text-[11px] tracking-[.08em] uppercase opacity-80">
              <span>Mostrar</span>
              <select
                value={f.limite}
                onChange={(e) => ir({ limite: Number(e.target.value) })}
                aria-label="Visitas por página"
                className="input w-auto min-h-9 py-1 pr-2 tabular-nums"
              >
                {LIMITES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          }
          campos={[
            {
              id: "fv-estado",
              label: "Estado de la visita",
              tipo: "multi",
              textoVacio: "Todos los estados",
              valor: "",
              valores: f.estados,
              opciones: [
                ...ESTADOS_FILTRO.map((e) => ({ v: e, t: ESTADO_VISITA_LABEL[e] })),
                ...(eliminadas !== undefined ? [{ v: ELIMINADAS, t: `Eliminadas (${eliminadas})` }] : []),
              ],
              onChange: () => {},
              // Las eliminadas se miran solas: marcarlas desmarca el resto, y al revés.
              onChangeMulti: (v) =>
                setF((p) => ({
                  estados: !v.includes(ELIMINADAS)
                    ? v
                    : p.estados.includes(ELIMINADAS)
                      ? sinEste(v, ELIMINADAS)
                      : [ELIMINADAS],
                })),
            },
            {
              id: "fv-cliente",
              label: "Cliente",
              tipo: "multi",
              textoVacio: "Todos los clientes",
              valor: "",
              valores: f.clienteIds,
              opciones: clientes.map(([id, n]) => ({ v: String(id), t: n })),
              onChange: () => {},
              // Con algún cliente elegido el tipo de falla deja de aplicar: se limpia.
              onChangeMulti: (v) => setF((p) => ({ clienteIds: v, sucursalIds: [], tipo: v.length ? "" : p.tipo })),
            },
            ...(f.clienteIds.length
              ? [
                  {
                    id: "fv-tienda",
                    label: "Sucursal",
                    tipo: "multi" as const,
                    textoVacio: "Todas las sucursales",
                    valor: "",
                    valores: f.sucursalIds,
                    opciones: tiendas.map(([id, n]) => ({ v: String(id), t: n })),
                    onChange: () => {},
                    onChangeMulti: (v: string[]) => setF(() => ({ sucursalIds: v })),
                  },
                ]
              : []),
            {
              id: "fv-region",
              label: "Zona (región)",
              tipo: "multi",
              textoVacio: "Todas las zonas",
              valor: "",
              valores: f.regiones,
              opciones: regiones.map((r) => ({ v: r, t: r })),
              onChange: () => {},
              onChangeMulti: (v) => setF(() => ({ regiones: v })),
            },
            {
              id: "fv-mall",
              label: "Mall",
              valor: f.mallId,
              opciones: [{ v: "", t: "Todos los malls" }, ...malls.map(([id, n]) => ({ v: String(id), t: n }))],
              onChange: (v) => setF(() => ({ mallId: v })),
            },
            {
              id: "fv-desde",
              label: "Desde",
              tipo: "fecha",
              valor: f.desde,
              opciones: [],
              onChange: (v) => setF(() => ({ desde: v })),
            },
            {
              id: "fv-hasta",
              label: "Hasta",
              tipo: "fecha",
              valor: f.hasta,
              opciones: [],
              onChange: (v) => setF(() => ({ hasta: v })),
            },
            {
              id: "fv-semana",
              label: "Semana (elige cualquier día)",
              tipo: "fecha",
              // La semana es de lunes a domingo: el selector queda en su lunes.
              valor: f.semana,
              opciones: [],
              onChange: (v) => setF(() => ({ semana: lunesDe(v) })),
            },
            {
              id: "fv-tecnico",
              label: "Técnico",
              valor: f.tecnicoId,
              opciones: [
                { v: "", t: "Todos los técnicos" },
                ...tecnicos.map((t) => ({ v: String(t.id), t: t.nombreCompleto })),
              ],
              onChange: (v) => setF(() => ({ tecnicoId: v })),
            },
            ...(f.clienteIds.length
              ? []
              : [
            {
              id: "fv-tipo",
              label: "Tipo de falla registrada",
              valor: f.tipo,
              opciones: [
                { v: "", t: "Todas las fallas" },
                ...catalogoProblema.map((t) => ({ v: t.codigo, t: t.nombre })),
              ],
              onChange: (v: string) => setF(() => ({ tipo: v })),
            },
              ]),
          ]}
        />

        {/* Anchos fijos: las columnas de texto se reparten lo que sobra y se
            cortan con "…", así el botón de ver nunca se sale de la pantalla. */}
        <div
          className={`px-4 md:px-7 overflow-x-auto transition-opacity ${cargando ? "opacity-50" : ""}`}
          aria-busy={cargando}
        >
          <table className="table table-fixed min-w-[980px]">
            <colgroup>
              {conCasillas ? <col style={{ width: 44 }} /> : null}
              <col style={{ width: 124 }} />
              <col style={{ width: hayMargen ? 200 : 108 }} />
              <col style={{ width: 80 }} />
              <col />
              <col />
              <col />
              <col />
              <col style={{ width: 226 }} />
              {mostrarMotivo ? <col /> : null}
              <col style={{ width: 52 }} />
            </colgroup>
            <thead>
              <tr>
                {conCasillas ? (
                  <th>
                    <Casilla
                      marcada={todasMarcadas}
                      onAlternar={alternarVisibles}
                      label={todasMarcadas ? "Desmarcar las que se ven" : "Marcar todas las que se ven"}
                    />
                  </th>
                ) : null}
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
              {visitas.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => (conCasillas ? alternar(v) : router.push(`/admin/visitas/${v.folio}`))}
                  className={`cursor-pointer hover:bg-black/5 ${conCasillas && esMarcada(v.folio) ? "bg-black/[.07]" : ""}`}
                >
                  {conCasillas ? (
                    <td>
                      <Casilla
                        marcada={esMarcada(v.folio)}
                        onAlternar={() => alternar(v)}
                        label={`Marcar ${v.folio}`}
                      />
                    </td>
                  ) : null}
                  <td className="font-semibold tabular-nums whitespace-nowrap">{v.folio}</td>
                  <td className="tabular-nums opacity-65 whitespace-nowrap">{textoFechaVisita(v)}</td>
                  <td className={`tabular-nums whitespace-nowrap ${v.horaProgramada ? "opacity-90" : "opacity-45"}`}>
                    {v.horaProgramada ?? "Sin hora"}
                  </td>
                  <td>
                    <Recorte
                      texto={
                        v.marca && v.marca.nombre !== v.cliente?.nombreFantasia
                          ? `${v.cliente?.nombreFantasia ?? ""} · ${v.marca.nombre}`
                          : v.cliente?.nombreFantasia
                      }
                    />
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
                    {/* El acta se corrigió después de cerrarla: qué parte y por qué, al pasar el mouse y en el acta. */}
                    {v.ediciones?.length ? (
                      <span
                        className="tag tag-outline ml-1.5"
                        title={`Editada · ${v.ediciones[0].secciones.join(", ")} · ${v.ediciones[0].motivo}`}
                      >
                        Editada
                      </span>
                    ) : null}
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

          {visitas.length === 0 ? (
            <div className="py-14 text-center">
              <div className="font-extrabold text-[17px] mb-1.5">Nada que mostrar</div>
              <div className="text-[13px] opacity-66">Ajusta la búsqueda o los filtros.</div>
            </div>
          ) : null}
        </div>

        {pagina.paginas > 1 ? (
          <Paginas
            pagina={pagina.pagina}
            paginas={pagina.paginas}
            ocupado={cargando}
            onIr={(n) => {
              ir({ pagina: n });
              window.scrollTo({ top: 0 });
            }}
          />
        ) : null}

        {/* La barra de las acciones: pegada abajo mientras se va marcando. */}
        {conCasillas ? (
          <div className="sticky bottom-0 z-10 mt-4 flex items-center gap-2.5 flex-wrap px-4 md:px-7 py-3 bg-[var(--color-bg)] border-t-2 border-[var(--color-divider)]">
            <div className="font-extrabold text-[13px] tabular-nums">
              {marcadas.length === 0
                ? "Marca las visitas en la tabla"
                : `${seleccionadas.length} ${seleccionadas.length === 1 ? "visita marcada" : "visitas marcadas"}`}
            </div>
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
              <button
                type="button"
                disabled={cerradasMarcadas.length === 0 || descargando}
                onClick={descargarActas}
                title={cerradasMarcadas.length === 0 ? "Solo las visitas con el acta cerrada tienen PDF" : undefined}
                className="btn btn-secondary min-h-10 px-3.5"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 4v11M7 11l5 5 5-5M4 20h16" />
                </svg>
                <span>
                  {descargando
                    ? "Descargando…"
                    : `Descargar actas${cerradasMarcadas.length ? ` (${cerradasMarcadas.length})` : ""}`}
                </span>
              </button>
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

      {lote ? (
        <VisitasLoteDialogo
          accion={lote}
          visitas={seleccionadas}
          onCerrar={() => setLote(null)}
          onHecho={(mensaje, hechas) => {
            aviso(mensaje);
            if (hechas.length === 0) return;
            // Las que ya quedaron salen de la selección; las que fallaron siguen marcadas.
            setMarcadas((prev) => prev.filter((m) => !hechas.includes(m.folio)));
            router.refresh();
          }}
        />
      ) : null}

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

/** «2026-10-26» como «26/10». */
const textoDiaMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** Anterior, «Página n de m» y siguiente, bajo la tabla. */
function Paginas({
  pagina,
  paginas,
  ocupado,
  onIr,
}: {
  pagina: number;
  paginas: number;
  ocupado: boolean;
  onIr: (pagina: number) => void;
}) {
  return (
    <nav aria-label="Páginas" className="flex items-center justify-center gap-3 px-4 md:px-7 pt-5">
      <button
        type="button"
        disabled={pagina <= 1 || ocupado}
        onClick={() => onIr(pagina - 1)}
        className="btn btn-secondary min-h-10 px-3.5"
      >
        Anterior
      </button>
      <span className="text-[11px] tracking-[.08em] uppercase opacity-62 tabular-nums">
        Página {pagina} de {paginas}
      </span>
      <button
        type="button"
        disabled={pagina >= paginas || ocupado}
        onClick={() => onIr(pagina + 1)}
        className="btn btn-secondary min-h-10 px-3.5"
      >
        Siguiente
      </button>
    </nav>
  );
}

/** La casilla de "Acciones múltiples": el mismo cuadrado de los diálogos. */
export function Casilla({ marcada, onAlternar, label }: { marcada: boolean; onAlternar: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcada}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onAlternar();
      }}
      className="w-7 h-7 grid place-items-center p-0 bg-transparent border-0 cursor-pointer text-[var(--color-text)]"
    >
      <span
        className="w-4 h-4 border-2 border-current grid place-items-center"
        style={{ background: marcada ? "var(--color-text)" : "transparent" }}
      >
        {marcada ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg)" strokeWidth="4">
            <path d="M4 12l5 5L20 6" />
          </svg>
        ) : null}
      </span>
    </button>
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
