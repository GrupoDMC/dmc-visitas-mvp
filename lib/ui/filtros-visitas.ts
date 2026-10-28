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

/** Cuántas visitas se pueden mostrar por página, a elección del usuario. */
export const LIMITES = [10, 15, 25, 50] as const;
export const POR_PAGINA = 50;

/** Tope de opciones marcadas por filtro: la URL la escribe cualquiera. */
const MAX_VARIOS = 50;

export interface FiltrosVisitas {
  /** Vacío es «todos». Cada uno es un estado, o ELIMINADAS (que va sola). */
  estados: string[];
  /** YYYY-MM-DD, o vacío. */
  desde: string;
  hasta: string;
  /** El lunes (YYYY-MM-DD) de la semana elegida, o vacío. */
  semana: string;
  clienteIds: string[];
  /** Solo cuentan con algún cliente elegido. */
  sucursalIds: string[];
  /** Regiones de la tienda de la visita (hoy), tal como se guardan. */
  regiones: string[];
  mallId: string;
  /** Trae también las visitas en las que va de ayudante. */
  tecnicoId: string;
  /** Tipo de falla registrada. Solo cuenta sin cliente elegido. */
  tipo: string;
  /** Texto libre: folio, cliente, sucursal, técnico o motivo. */
  q: string;
  /** Visitas por página: una de LIMITES. */
  limite: number;
  /** Desde 1. */
  pagina: number;
}

export const SIN_FILTROS: FiltrosVisitas = {
  estados: [],
  desde: "",
  hasta: "",
  semana: "",
  clienteIds: [],
  sucursalIds: [],
  regiones: [],
  mallId: "",
  tecnicoId: "",
  tipo: "",
  q: "",
  limite: POR_PAGINA,
  pagina: 1,
};

type Parametros = Record<string, string | string[] | undefined>;

const uno = (p: Parametros, clave: string) => {
  const v = p[clave];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
};
/** Todos los valores de un parámetro repetido (?cliente=1&cliente=2), sin repetir. */
const varios = (p: Parametros, clave: string) => {
  const v = p[clave];
  const lista = (Array.isArray(v) ? v : [v]).map((x) => x?.trim() ?? "").filter(Boolean);
  return [...new Set(lista)].slice(0, MAX_VARIOS);
};
const fecha = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : "");
const id = (v: string) => (/^\d{1,15}$/.test(v) && Number(v) > 0 ? v : "");

const DIA_MS = 86_400_000;
const isoDia = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** El lunes de la semana (lunes a domingo) que contiene ese día; vacío si no es una fecha. */
export function lunesDe(dia: string): string {
  if (!fecha(dia)) return "";
  const ms = Date.parse(dia);
  const desdeLunes = (new Date(ms).getUTCDay() + 6) % 7;
  return isoDia(ms - desdeLunes * DIA_MS);
}

/** De lunes a domingo de la semana que arranca ese lunes. */
export function rangoSemana(lunes: string): { desde: string; hasta: string } {
  return { desde: lunes, hasta: isoDia(Date.parse(lunes) + 6 * DIA_MS) };
}

/**
 * Lee los filtros de la URL. Lo que no tenga forma válida se ignora: la URL la
 * puede escribir cualquiera. `fecha` (los enlaces del panel) es un día suelto,
 * o sea un rango de ese día a ese día.
 */
export function leerFiltrosVisitas(p: Parametros, opciones: { verEliminadas: boolean }): FiltrosVisitas {
  const pedidos = varios(p, "estado");
  // Las eliminadas no se mezclan con los estados: se miran solas.
  const estados =
    pedidos.includes(ELIMINADAS) && opciones.verEliminadas
      ? [ELIMINADAS]
      : pedidos.filter((e) => (ESTADOS_FILTRO as readonly string[]).includes(e));
  const dia = fecha(uno(p, "fecha"));
  const clienteIds = varios(p, "cliente").map(id).filter(Boolean);
  const pagina = Number(uno(p, "pagina"));
  const limite = Number(uno(p, "limite"));
  return {
    estados,
    desde: fecha(uno(p, "desde")) || dia,
    hasta: fecha(uno(p, "hasta")) || dia,
    semana: lunesDe(uno(p, "semana")),
    clienteIds,
    sucursalIds: clienteIds.length ? varios(p, "tienda").map(id).filter(Boolean) : [],
    regiones: varios(p, "region").map((r) => r.slice(0, 80)),
    mallId: id(uno(p, "mall")),
    tecnicoId: id(uno(p, "tecnico")),
    tipo: clienteIds.length ? "" : uno(p, "tipo").slice(0, 40),
    q: uno(p, "q").slice(0, 100),
    limite: (LIMITES as readonly number[]).includes(limite) ? limite : POR_PAGINA,
    pagina: Number.isSafeInteger(pagina) && pagina > 1 ? pagina : 1,
  };
}

/** La URL de la lista con esos filtros. Lo que está en su valor por defecto no se escribe. */
export function urlFiltrosVisitas(f: FiltrosVisitas): string {
  const p = new URLSearchParams();
  f.estados.forEach((e) => p.append("estado", e));
  if (f.desde) p.set("desde", f.desde);
  if (f.hasta) p.set("hasta", f.hasta);
  if (f.semana) p.set("semana", f.semana);
  f.clienteIds.forEach((c) => p.append("cliente", c));
  if (f.clienteIds.length) f.sucursalIds.forEach((s) => p.append("tienda", s));
  f.regiones.forEach((r) => p.append("region", r));
  if (f.mallId) p.set("mall", f.mallId);
  if (f.tecnicoId) p.set("tecnico", f.tecnicoId);
  if (f.tipo && !f.clienteIds.length) p.set("tipo", f.tipo);
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.limite !== POR_PAGINA) p.set("limite", String(f.limite));
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
  /** Las regiones de las tiendas que tienen visitas, de norte a sur. */
  regiones: string[];
}
