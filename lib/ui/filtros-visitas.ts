/**
 * Los filtros de la lista de visitas del panel. Viven en la URL
 * (/admin/visitas?estado=…&cliente=…&pagina=2): el servidor filtra y pagina, y
 * el navegador solo cambia la URL. Así un enlace o un «Atrás» devuelven la
 * misma lista.
 *
 * Este módulo no toca la base: lo usan la página (para leer la URL) y la tabla
 * (para escribirla).
 */

import type { Visita } from "@/lib/types";

/** No es un estado: es la opción que le muestra al administrador las visitas eliminadas. */
export const ELIMINADAS = "ELIMINADAS";

export const ESTADOS_FILTRO = [
  "PROGRAMADA",
  "EN_CURSO",
  "COMPLETADA",
  "PENDIENTE",
  "REAGENDADA",
  "CANCELADA",
  "CANCELADA_ADMIN",
] as const;

/** Cuántas visitas trae cada página. */
export const POR_PAGINA = 50;

export interface FiltrosVisitas {
  /** "TODAS", un estado, o ELIMINADAS. */
  estado: string;
  /** YYYY-MM-DD, o vacío. */
  desde: string;
  hasta: string;
  clienteId: string;
  /** Solo cuenta con un cliente elegido. */
  sucursalId: string;
  mallId: string;
  /** Trae también las visitas en las que va de ayudante. */
  tecnicoId: string;
  /** Tipo de falla registrada. Solo cuenta sin cliente elegido. */
  tipo: string;
  /** Texto libre: folio, cliente, sucursal, técnico o motivo. */
  q: string;
  /** Desde 1. */
  pagina: number;
}

export const SIN_FILTROS: FiltrosVisitas = {
  estado: "TODAS",
  desde: "",
  hasta: "",
  clienteId: "",
  sucursalId: "",
  mallId: "",
  tecnicoId: "",
  tipo: "",
  q: "",
  pagina: 1,
};

type Parametros = Record<string, string | string[] | undefined>;

const uno = (p: Parametros, clave: string) => {
  const v = p[clave];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
};
const fecha = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const id = (v: string) => (/^\d{1,15}$/.test(v) && Number(v) > 0 ? v : "");

/**
 * Lee los filtros de la URL. Lo que no tenga forma válida se ignora: la URL la
 * puede escribir cualquiera. `fecha` (los enlaces del panel) es un día suelto,
 * o sea un rango de ese día a ese día.
 */
export function leerFiltrosVisitas(p: Parametros, opciones: { verEliminadas: boolean }): FiltrosVisitas {
  const estadoPedido = uno(p, "estado");
  const estado =
    (ESTADOS_FILTRO as readonly string[]).includes(estadoPedido) ||
    (estadoPedido === ELIMINADAS && opciones.verEliminadas)
      ? estadoPedido
      : "TODAS";
  const dia = fecha(uno(p, "fecha"));
  const clienteId = id(uno(p, "cliente"));
  const pagina = Number(uno(p, "pagina"));
  return {
    estado,
    desde: fecha(uno(p, "desde")) || dia,
    hasta: fecha(uno(p, "hasta")) || dia,
    clienteId,
    sucursalId: clienteId ? id(uno(p, "tienda")) : "",
    mallId: id(uno(p, "mall")),
    tecnicoId: id(uno(p, "tecnico")),
    tipo: clienteId ? "" : uno(p, "tipo").slice(0, 40),
    q: uno(p, "q").slice(0, 100),
    pagina: Number.isSafeInteger(pagina) && pagina > 1 ? pagina : 1,
  };
}

/** La URL de la lista con esos filtros. Lo que está en su valor por defecto no se escribe. */
export function urlFiltrosVisitas(f: FiltrosVisitas): string {
  const p = new URLSearchParams();
  if (f.estado !== "TODAS") p.set("estado", f.estado);
  if (f.desde) p.set("desde", f.desde);
  if (f.hasta) p.set("hasta", f.hasta);
  if (f.clienteId) p.set("cliente", f.clienteId);
  if (f.clienteId && f.sucursalId) p.set("tienda", f.sucursalId);
  if (f.mallId) p.set("mall", f.mallId);
  if (f.tecnicoId) p.set("tecnico", f.tecnicoId);
  if (f.tipo && !f.clienteId) p.set("tipo", f.tipo);
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.pagina > 1) p.set("pagina", String(f.pagina));
  const texto = p.toString();
  return texto ? `/admin/visitas?${texto}` : "/admin/visitas";
}

/**
 * El texto de búsqueda como patrón de LIKE: los comodines que escriba el
 * usuario se buscan tal cual, no como comodines.
 */
export function patronBusqueda(q: string): string {
  return `%${q.trim().replace(/[[%_]/g, (c) => `[${c}]`)}%`;
}

/** Una página de la lista, tal como la arma el servidor. */
export interface PaginaVisitas {
  visitas: Visita[];
  /** Cuántas cumplen los filtros, en todas las páginas. */
  total: number;
  /** La que se trajo: si la pedida ya no existe, la última. */
  pagina: number;
  paginas: number;
}

export interface OpcionesFiltroVisitas {
  /** Los clientes, tiendas y malls que tienen visitas: [id, nombre], por nombre. */
  clientes: [number, string][];
  /** Solo las del cliente elegido. */
  tiendas: [number, string][];
  malls: [number, string][];
}
