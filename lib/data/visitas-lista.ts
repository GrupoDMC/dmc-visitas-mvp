import "server-only";
import { consulta, consultaCon, num, sql, F_FECHA, F_HORA, F_TS, type Parametro } from "@/lib/data/sql";
import { getVisitasPorIds } from "@/lib/data/visitas";
import { cancelarVisitasVencidas } from "@/lib/data/vencimiento";
import {
  ELIMINADAS,
  patronBusqueda,
  rangoSemana,
  type FiltrosVisitas,
  type OpcionesFiltroVisitas,
  type PaginaVisitas,
} from "@/lib/ui/filtros-visitas";
import { ESTADO_PROBLEMA_CIERRE } from "@/lib/ui/estado";
import { REGIONES } from "@/lib/ui/regiones";
import type { FilaFicha } from "@/lib/types";

// Listas de visitas del panel: la tabla de Visitas, filtrada y paginada en el
// servidor, y las fichas de cliente, tienda y mall.
//
// La tabla va en dos pasos: primero los ids de la página (una consulta liviana
// sobre dmc.visita con OFFSET/FETCH) y después esas visitas completas, con sus
// hijas. Así las fotos, firmas y trabajos que se leen son solo los de la página.

/** Comparación sin mayúsculas ni tildes, como la búsqueda del navegador. */
const CI_AI = "COLLATE Latin1_General_CI_AI";

const ORDEN = "v.fecha_programada DESC, v.hora_programada, v.id DESC";

interface Condiciones {
  where: string;
  params: Parametro[];
  /** La búsqueda de texto necesita los nombres: solo entonces van los JOIN. */
  conNombres: boolean;
}

/** `columna IN (@pref0, @pref1, …)` con un parámetro por valor. */
function enLista(columna: string, pref: string, tipo: Parametro[1], valores: (string | number)[], params: Parametro[]) {
  const nombres = valores.map((v, i) => {
    params.push([`${pref}${i}`, tipo, v]);
    return `@${pref}${i}`;
  });
  return `${columna} IN (${nombres.join(", ")})`;
}

function condiciones(f: FiltrosVisitas): Condiciones {
  const eliminadas = f.estados.includes(ELIMINADAS);
  const partes = [`v.activo = ${eliminadas ? 0 : 1}`];
  const params: Parametro[] = [];

  if (!eliminadas && f.estados.length) {
    partes.push(enLista("v.estado", "estado", sql.VarChar(20), f.estados, params));
  }
  if (f.desde) {
    partes.push("v.fecha_programada >= @desde");
    params.push(["desde", sql.Date, f.desde]);
  }
  if (f.hasta) {
    partes.push("v.fecha_programada <= @hasta");
    params.push(["hasta", sql.Date, f.hasta]);
  }
  if (f.semana) {
    const s = rangoSemana(f.semana);
    partes.push("v.fecha_programada BETWEEN @semDesde AND @semHasta");
    params.push(["semDesde", sql.Date, s.desde], ["semHasta", sql.Date, s.hasta]);
  }
  if (f.clienteIds.length) {
    partes.push(enLista("v.cliente_id", "cliente", sql.BigInt, f.clienteIds.map(Number), params));
    if (f.sucursalIds.length) {
      partes.push(enLista("v.sucursal_id", "tienda", sql.BigInt, f.sucursalIds.map(Number), params));
    }
  }
  // La región de hoy de la tienda, igual que el mall.
  if (f.regiones.length) {
    partes.push(
      `v.sucursal_id IN (SELECT rs.id FROM dmc.sucursal rs WHERE ${enLista("rs.region", "region", sql.NVarChar(80), f.regiones, params)})`
    );
  }
  // El mall de hoy de la tienda, no el que tenía el día de la visita.
  if (f.mallId) {
    partes.push("v.sucursal_id IN (SELECT ms.id FROM dmc.sucursal ms WHERE ms.mall_id = @mall)");
    params.push(["mall", sql.BigInt, Number(f.mallId)]);
  }
  // Filtrar por técnico trae también las visitas en las que va de ayudante.
  if (f.tecnicoId) {
    partes.push("(v.tecnico_id = @tecnico OR v.tecnico_ayudante_id = @tecnico)");
    params.push(["tecnico", sql.BigInt, Number(f.tecnicoId)]);
  }
  if (f.tipo && !f.clienteIds.length) {
    partes.push("EXISTS (SELECT 1 FROM dmc.problema p WHERE p.visita_id = v.id AND p.tipo_codigo = @tipo)");
    params.push(["tipo", sql.VarChar(40), f.tipo]);
  }
  const q = f.q.trim();
  if (q) {
    partes.push(`(v.folio ${CI_AI} LIKE @q
       OR c.nombre_fantasia ${CI_AI} LIKE @q
       OR s.nombre ${CI_AI} LIKE @q
       OR t.nombre_completo ${CI_AI} LIKE @q
       OR ta.nombre_completo ${CI_AI} LIKE @q
       OR EXISTS (SELECT 1 FROM dmc.catalogo_motivo cm
                   WHERE cm.codigo = v.motivo_codigo AND cm.nombre ${CI_AI} LIKE @q)
       OR EXISTS (SELECT 1 FROM dmc.visita_motivo vm
                    JOIN dmc.catalogo_motivo cm ON cm.codigo = vm.motivo_codigo
                   WHERE vm.visita_id = v.id AND vm.ambito = 'PLAN' AND cm.nombre ${CI_AI} LIKE @q))`);
    params.push(["q", sql.NVarChar(310), patronBusqueda(q)]);
  }
  return { where: partes.join("\n   AND "), params, conNombres: Boolean(q) };
}

const desde = (c: Condiciones) =>
  c.conNombres
    ? `FROM dmc.visita v
       JOIN dmc.cliente  c ON c.id = v.cliente_id
       JOIN dmc.sucursal s ON s.id = v.sucursal_id
       JOIN dmc.tecnico  t ON t.id = v.tecnico_id
       LEFT JOIN dmc.tecnico ta ON ta.id = v.tecnico_ayudante_id`
    : "FROM dmc.visita v";

/**
 * Una página de la lista de Visitas. Las eliminadas (estado ELIMINADAS) solo
 * se piden si quien mira es administrador: la página lo comprueba al leer los
 * filtros de la URL.
 */
export async function buscarVisitas(f: FiltrosVisitas): Promise<PaginaVisitas> {
  // Lo vencido pasa a CANCELADA antes de contar: si no, el conteo y la página no cuadran.
  await cancelarVisitasVencidas();
  const c = condiciones(f);
  const [cuenta] = await consultaCon<{ n: number }>(`SELECT COUNT(*) AS n ${desde(c)} WHERE ${c.where}`, c.params);
  const total = num(cuenta?.n ?? 0);
  const paginas = Math.max(1, Math.ceil(total / f.limite));
  const pagina = Math.min(f.pagina, paginas);
  if (total === 0) return { visitas: [], total, pagina, paginas };

  const ids = await consultaCon<{ id: number }>(
    `SELECT v.id ${desde(c)} WHERE ${c.where}
      ORDER BY ${ORDEN}
     OFFSET @salto ROWS FETCH NEXT @cuantas ROWS ONLY`,
    [...c.params, ["salto", sql.Int, (pagina - 1) * f.limite], ["cuantas", sql.Int, f.limite]]
  );
  const visitas = await getVisitasPorIds(
    ids.map((x) => num(x.id)),
    { eliminadas: f.estados.includes(ELIMINADAS) }
  );
  return { visitas, total, pagina, paginas };
}

const porNombre = (filas: { id: number; nombre: string }[]): [number, string][] =>
  filas.map((x): [number, string] => [num(x.id), x.nombre]).sort((a, b) => a[1].localeCompare(b[1], "es"));

/** Lo que se ofrece en los selectores de la barra de filtros. */
export async function opcionesFiltroVisitas(clienteIds: string[]): Promise<OpcionesFiltroVisitas> {
  const paramsTiendas: Parametro[] = [];
  const [clientes, tiendas, malls, regiones] = await Promise.all([
    consulta<{ id: number; nombre: string }>(
      `SELECT c.id, c.nombre_fantasia AS nombre FROM dmc.cliente c
        WHERE EXISTS (SELECT 1 FROM dmc.visita v WHERE v.cliente_id = c.id AND v.activo = 1)`
    ),
    clienteIds.length
      ? consultaCon<{ id: number; nombre: string }>(
          `SELECT s.id, s.nombre FROM dmc.sucursal s
            WHERE EXISTS (SELECT 1 FROM dmc.visita v
                           WHERE v.sucursal_id = s.id AND v.activo = 1
                             AND ${enLista("v.cliente_id", "cliente", sql.BigInt, clienteIds.map(Number), paramsTiendas)})`,
          paramsTiendas
        )
      : Promise.resolve([]),
    consulta<{ id: number; nombre: string }>(
      `SELECT m.id, m.nombre FROM dmc.mall m
        WHERE EXISTS (SELECT 1 FROM dmc.sucursal s JOIN dmc.visita v ON v.sucursal_id = s.id
                       WHERE s.mall_id = m.id AND v.activo = 1)`
    ),
    consulta<{ region: string }>(
      `SELECT DISTINCT s.region FROM dmc.sucursal s
        WHERE s.region <> N'' AND EXISTS (SELECT 1 FROM dmc.visita v WHERE v.sucursal_id = s.id AND v.activo = 1)`
    ),
  ]);
  // De norte a sur, como las lista REGIONES; lo que no esté ahí, al final.
  const lugar = (r: string) => (REGIONES.includes(r) ? REGIONES.indexOf(r) : REGIONES.length);
  return {
    clientes: porNombre(clientes),
    tiendas: porNombre(tiendas),
    malls: porNombre(malls),
    regiones: regiones
      .map((x) => x.region)
      .sort((a, b) => lugar(a) - lugar(b) || a.localeCompare(b, "es")),
  };
}

/** Cuántas visitas eliminadas hay. Solo para el administrador. */
export async function contarVisitasEliminadas(): Promise<number> {
  const [fila] = await consulta<{ n: number }>(`SELECT COUNT(*) AS n FROM dmc.visita WHERE activo = 0`);
  return num(fila?.n ?? 0);
}

// ── Fichas de cliente, tienda y mall ────────────────────────────────────────

interface FilaFichaCruda {
  id: number;
  folio: string;
  fecha: string;
  fecha_hasta: string | null;
  hora: string | null;
  estado: FilaFicha["estado"];
  motivo_codigo: string;
  motivo_nombre: string | null;
  tecnico: string | null;
  ayudante: string | null;
  sucursal_id: number;
  tienda: string;
  cliente: string;
  mall: string | null;
  hora_inicio: string | null;
  hora_termino: string | null;
  problemas: number;
  abiertos: number;
}

const aMs = (ts: string) => Date.parse(ts.includes("T") ? ts : ts.replace(" ", "T"));

/**
 * Lo que la ficha de un cliente, una tienda o un mall muestra de cada visita:
 * una fila por visita, sin fotos, firmas ni trabajos. El mall es el de hoy de
 * la tienda.
 */
export async function getFilasFicha(de: { clienteId: number } | { sucursalId: number } | { mallId: number }): Promise<FilaFicha[]> {
  await cancelarVisitasVencidas();
  const [donde, param]: [string, Parametro] =
    "clienteId" in de
      ? ["v.cliente_id = @id", ["id", sql.BigInt, de.clienteId]]
      : "sucursalId" in de
        ? ["v.sucursal_id = @id", ["id", sql.BigInt, de.sucursalId]]
        : ["s.mall_id = @id", ["id", sql.BigInt, de.mallId]];

  const [filas, motivos] = await Promise.all([
    consultaCon<FilaFichaCruda>(
      `SELECT v.id, v.folio, ${F_FECHA("v.fecha_programada")} AS fecha, ${F_FECHA("v.fecha_hasta")} AS fecha_hasta,
              ${F_HORA("v.hora_programada")} AS hora, v.estado, v.motivo_codigo, cm.nombre AS motivo_nombre,
              t.nombre_completo AS tecnico, ta.nombre_completo AS ayudante,
              v.sucursal_id, s.nombre AS tienda, c.nombre_fantasia AS cliente, m.nombre AS mall,
              ${F_TS("e.hora_inicio")} AS hora_inicio, ${F_TS("e.hora_termino")} AS hora_termino,
              (SELECT COUNT(*) FROM dmc.problema p WHERE p.visita_id = v.id) AS problemas,
              (SELECT COUNT(*) FROM dmc.problema p WHERE p.visita_id = v.id AND p.estado <> @cierre) AS abiertos
         FROM dmc.visita v
         JOIN dmc.cliente  c ON c.id = v.cliente_id
         JOIN dmc.sucursal s ON s.id = v.sucursal_id
         LEFT JOIN dmc.mall m ON m.id = s.mall_id
         JOIN dmc.tecnico  t ON t.id = v.tecnico_id
         LEFT JOIN dmc.tecnico ta ON ta.id = v.tecnico_ayudante_id
         LEFT JOIN dmc.visita_ejecucion e ON e.visita_id = v.id
         LEFT JOIN dmc.catalogo_motivo cm ON cm.codigo = v.motivo_codigo
        WHERE v.activo = 1 AND ${donde}
        ORDER BY ${ORDEN}`,
      [param, ["cierre", sql.VarChar(10), ESTADO_PROBLEMA_CIERRE]]
    ),
    // Los motivos agendados de esas mismas visitas, en su orden.
    consultaCon<{ visita_id: number; motivo_codigo: string; nombre: string | null }>(
      `SELECT vm.visita_id, vm.motivo_codigo, cm.nombre
         FROM dmc.visita_motivo vm
         JOIN dmc.visita v   ON v.id = vm.visita_id
         JOIN dmc.sucursal s ON s.id = v.sucursal_id
         LEFT JOIN dmc.catalogo_motivo cm ON cm.codigo = vm.motivo_codigo
        WHERE vm.ambito = 'PLAN' AND v.activo = 1 AND ${donde}
        ORDER BY vm.orden, vm.id`,
      [param]
    ),
  ]);

  const motivosPorVisita = new Map<number, { codigo: string; nombre: string | null }[]>();
  for (const m of motivos) {
    const lista = motivosPorVisita.get(num(m.visita_id)) ?? [];
    lista.push({ codigo: m.motivo_codigo, nombre: m.nombre });
    motivosPorVisita.set(num(m.visita_id), lista);
  }

  return filas.map((v) => {
    const id = num(v.id);
    // Igual que la visita completa: el principal encabeza siempre la lista.
    const suyos = motivosPorVisita.get(id) ?? [];
    const codigos = suyos.map((m) => m.codigo);
    if (!codigos.includes(v.motivo_codigo)) codigos.unshift(v.motivo_codigo);
    const lista = codigos
      .map(
        (c) =>
          suyos.find((m) => m.codigo === c)?.nombre ?? (c === v.motivo_codigo ? (v.motivo_nombre ?? c) : c)
      )
      .filter(Boolean);
    const ini = v.hora_inicio ? aMs(v.hora_inicio) : NaN;
    const fin = v.hora_termino ? aMs(v.hora_termino) : NaN;
    const minutos = Number.isFinite(ini) && Number.isFinite(fin) && fin > ini ? Math.round((fin - ini) / 60000) : null;
    return {
      id,
      folio: v.folio,
      fecha: v.fecha,
      fechaHasta: v.fecha_hasta,
      hora: v.hora,
      estado: v.estado,
      motivos: lista.length ? lista.join(" · ") : (v.motivo_nombre ?? v.motivo_codigo),
      motivosLista: lista.length ? lista : [v.motivo_nombre ?? v.motivo_codigo],
      tecnico: v.tecnico ?? "—",
      ayudante: v.ayudante,
      tiendaId: num(v.sucursal_id),
      tienda: v.tienda ?? "—",
      cliente: v.cliente ?? "—",
      mall: v.mall,
      problemas: num(v.problemas),
      problemasAbiertos: num(v.abiertos),
      // Más de 12 horas es un acta que quedó abierta de un día para otro: no es tiempo en sitio.
      minutos: minutos !== null && minutos <= 720 ? minutos : null,
    };
  });
}
