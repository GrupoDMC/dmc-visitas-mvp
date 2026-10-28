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
import { REGIONES } from "@/lib/ui/regiones";

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
  /**
   * La cadena región → mall → cliente → marca → sucursal: cada uno se ofrece
   * acotado a lo elegido arriba (ver acotarFiltros).
   */
  /** Regiones de la tienda de la visita (hoy), tal como se guardan. */
  regiones: string[];
  mallId: string;
  clienteIds: string[];
  /** Marcas de la tienda (hoy). Solo cuentan con algún cliente elegido. */
  marcaIds: string[];
  /** Solo cuentan con algún cliente elegido. */
  sucursalIds: string[];
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
  regiones: [],
  mallId: "",
  clienteIds: [],
  marcaIds: [],
  sucursalIds: [],
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
    regiones: varios(p, "region").map((r) => r.slice(0, 80)),
    mallId: id(uno(p, "mall")),
    clienteIds,
    marcaIds: clienteIds.length ? varios(p, "marca").map(id).filter(Boolean) : [],
    sucursalIds: clienteIds.length ? varios(p, "tienda").map(id).filter(Boolean) : [],
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
  f.regiones.forEach((r) => p.append("region", r));
  if (f.mallId) p.set("mall", f.mallId);
  f.clienteIds.forEach((c) => p.append("cliente", c));
  if (f.clienteIds.length) {
    f.marcaIds.forEach((m) => p.append("marca", m));
    f.sucursalIds.forEach((s) => p.append("tienda", s));
  }
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
  /** Las regiones de las tiendas que tienen visitas, de norte a sur. */
  regiones: string[];
  /** Los malls, clientes, marcas y tiendas que tienen visitas, acotados a lo elegido arriba: [id, nombre], por nombre. */
  malls: [number, string][];
  clientes: [number, string][];
  /** Solo las de los clientes elegidos. */
  marcas: [number, string][];
  /** Solo las de los clientes (y marcas) elegidos. */
  tiendas: [number, string][];
}

/** Una tienda con visitas, con lo que la ubica en la cadena de filtros (todo como está hoy). */
export interface LugarConVisitas {
  region: string;
  mallId: number | null;
  mall: string | null;
  clienteId: number;
  cliente: string;
  marcaId: number;
  marca: string;
  sucursalId: number;
  sucursal: string;
}

/** [id, nombre] sin repetir, por nombre. */
function distintos(lista: LugarConVisitas[], par: (l: LugarConVisitas) => [number | null, string | null]): [number, string][] {
  const vistos = new Map<number, string>();
  for (const l of lista) {
    const [i, nombre] = par(l);
    if (i !== null && nombre !== null) vistos.set(i, nombre);
  }
  return [...vistos].sort((a, b) => a[1].localeCompare(b[1], "es"));
}

/**
 * Los filtros en cascada: región → mall → cliente → marca → sucursal. Cada
 * selector ofrece solo lo que existe dentro de lo elegido arriba, y lo elegido
 * abajo que ya no cabe (porque cambió un filtro de arriba) se descarta. La
 * región, primera de la cadena, no se acota.
 */
export function acotarFiltros(
  lugares: LugarConVisitas[],
  f: FiltrosVisitas
): { opciones: OpcionesFiltroVisitas; filtros: FiltrosVisitas } {
  // De norte a sur, como las lista REGIONES; lo que no esté ahí, al final.
  const lugar = (r: string) => (REGIONES.includes(r) ? REGIONES.indexOf(r) : REGIONES.length);
  const regiones = [...new Set(lugares.map((l) => l.region).filter(Boolean))].sort(
    (a, b) => lugar(a) - lugar(b) || a.localeCompare(b, "es")
  );
  const quedan = (elegidos: string[], opciones: [number, string][]) =>
    elegidos.filter((e) => opciones.some(([i]) => String(i) === e));

  const enRegion = f.regiones.length ? lugares.filter((l) => f.regiones.includes(l.region)) : lugares;
  const malls = distintos(enRegion, (l) => [l.mallId, l.mall]);
  const mallId = quedan(f.mallId ? [f.mallId] : [], malls)[0] ?? "";

  const enMall = mallId ? enRegion.filter((l) => String(l.mallId) === mallId) : enRegion;
  const clientes = distintos(enMall, (l) => [l.clienteId, l.cliente]);
  const clienteIds = quedan(f.clienteIds, clientes);

  const deClientes = clienteIds.length ? enMall.filter((l) => clienteIds.includes(String(l.clienteId))) : [];
  const marcas = distintos(deClientes, (l) => [l.marcaId, l.marca]);
  const marcaIds = quedan(f.marcaIds, marcas);

  const deMarcas = marcaIds.length ? deClientes.filter((l) => marcaIds.includes(String(l.marcaId))) : deClientes;
  const tiendas = distintos(deMarcas, (l) => [l.sucursalId, l.sucursal]);
  const sucursalIds = quedan(f.sucursalIds, tiendas);

  return {
    opciones: { regiones, malls, clientes, marcas, tiendas },
    filtros: {
      ...f,
      mallId,
      clienteIds,
      marcaIds,
      sucursalIds,
      // Con algún cliente el tipo de falla deja de aplicar, también si llegó por la URL.
      tipo: clienteIds.length ? "" : f.tipo,
    },
  };
}
