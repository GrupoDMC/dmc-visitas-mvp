"use client";

import { useMemo, useState } from "react";
import { inicioSemana, sumarDias } from "@/lib/ui/fecha";
import type { ProblemaPanel } from "@/lib/data/problemas";

/**
 * Los gráficos del panel "Problemas".
 *
 * Todo se calcula acá, en el navegador, sobre los mismos problemas que lista la
 * página: así los gráficos y la lista nunca cuentan cosas distintas, y los
 * filtros de arriba (cliente, tipo, búsqueda) recortan las dos cosas a la vez.
 *
 * Los colores dicen siempre lo mismo: el acento es lo que sigue sin cerrar (o
 * lo que entra), el gris es lo resuelto. Cada barra lleva su número escrito y
 * el gráfico semanal tiene su tabla, para no depender del color ni del mouse.
 */

const C_ABIERTO = "var(--color-accent)";
const C_RESUELTO = "var(--color-neutral-700)";

/** Un problema con la tienda a la que pertenece. */
export interface ProblemaConTienda extends ProblemaPanel {
  sucursalId: number;
  sucursal: string;
  cliente: string;
}

/** Tramos de antigüedad de un problema sin cerrar, en días. */
export const TRAMOS = [
  { clave: "0-7", label: "Hasta 7 días", min: 0, max: 7 },
  { clave: "8-15", label: "8 a 15 días", min: 8, max: 15 },
  { clave: "16-30", label: "16 a 30 días", min: 16, max: 30 },
  { clave: "31-60", label: "31 a 60 días", min: 31, max: 60 },
  { clave: "60+", label: "Más de 60 días", min: 61, max: Number.POSITIVE_INFINITY },
] as const;

export function enTramo(dias: number, clave: string): boolean {
  const tramo = TRAMOS.find((t) => t.clave === clave);
  return !tramo || (dias >= tramo.min && dias <= tramo.max);
}

/** Cuántas semanas muestra el gráfico semanal, como mínimo y como máximo. */
const SEMANAS_MIN = 8;
const SEMANAS_MAX = 12;
/** Cuántas filas muestran los rankings antes de juntar el resto. */
const FILAS_TIPO = 8;
const FILAS_TIENDA = 6;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaCorto = (fecha: string) => `${Number(fecha.slice(8, 10))} ${MESES[Number(fecha.slice(5, 7)) - 1]}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

/** Tope del eje y sus marcas: números redondos, nunca más de cinco líneas. */
function escala(max: number): { tope: number; marcas: number[] } {
  const paso = max <= 4 ? 1 : max <= 10 ? 2 : max <= 20 ? 5 : Math.ceil(max / 4 / 5) * 5;
  const tope = Math.max(paso, Math.ceil(max / paso) * paso);
  const marcas: number[] = [];
  for (let m = 0; m <= tope; m += paso) marcas.push(m);
  return { tope, marcas };
}

export default function ProblemasAnalisis({
  problemas,
  hoy,
  alcance,
  nombreTipo,
  nombreEstado,
  onTipo,
  onTramo,
  onTienda,
  onSinAgenda,
}: {
  /** Los problemas sobre los que se calcula: ya recortados por cliente, tipo y búsqueda. */
  problemas: ProblemaConTienda[];
  hoy: string;
  /** Qué recorte está puesto, en palabras ("todos los clientes", "Cliente: X"…). */
  alcance: string;
  nombreTipo: (codigo: string) => string;
  nombreEstado: (codigo: string) => string;
  onTipo: (codigo: string) => void;
  onTramo: (clave: string) => void;
  onTienda: (sucursalId: number) => void;
  onSinAgenda: () => void;
}) {
  const d = useMemo(() => {
    const sinCerrar = problemas.filter((p) => p.estado !== "RESUELTO");
    const resueltos = problemas.filter((p) => p.estado === "RESUELTO" && p.resueltoEn);

    // ── Últimos 30 días contra los 30 anteriores ──
    const hace30 = sumarDias(hoy, -29);
    const hace60 = sumarDias(hoy, -59);
    const enVentana = (fecha: string | null, desde: string, hasta: string) =>
      Boolean(fecha) && fecha!.slice(0, 10) >= desde && fecha!.slice(0, 10) <= hasta;
    const levantados30 = problemas.filter((p) => enVentana(p.creadoEn, hace30, hoy)).length;
    const levantadosAntes = problemas.filter((p) => enVentana(p.creadoEn, hace60, sumarDias(hace30, -1))).length;
    const resueltos30 = resueltos.filter((p) => enVentana(p.resueltoEn, hace30, hoy)).length;
    const resueltosAntes = resueltos.filter((p) => enVentana(p.resueltoEn, hace60, sumarDias(hace30, -1))).length;

    const promedio = resueltos.length
      ? Math.round((resueltos.reduce((acc, p) => acc + p.dias, 0) / resueltos.length) * 10) / 10
      : null;
    const masAntiguo = sinCerrar.reduce<ProblemaConTienda | null>((m, p) => (!m || p.dias > m.dias ? p : m), null);

    // ── Semanas ──
    const estaSemana = inicioSemana(hoy);
    const primera = problemas.reduce((m, p) => (p.creadoEn.slice(0, 10) < m ? p.creadoEn.slice(0, 10) : m), hoy);
    const desdeLaPrimera = Math.floor(diasEntre(inicioSemana(primera), estaSemana) / 7) + 1;
    const nSemanas = Math.min(SEMANAS_MAX, Math.max(SEMANAS_MIN, desdeLaPrimera));
    const semanas = Array.from({ length: nSemanas }, (_, i) => {
      const inicio = sumarDias(estaSemana, -7 * (nSemanas - 1 - i));
      const fin = sumarDias(inicio, 6);
      return {
        inicio,
        fin,
        levantados: problemas.filter((p) => enVentana(p.creadoEn, inicio, fin)).length,
        resueltos: resueltos.filter((p) => enVentana(p.resueltoEn, inicio, fin)).length,
      };
    });

    // ── Antigüedad de lo que sigue sin cerrar ──
    const tramos = TRAMOS.map((t) => ({
      ...t,
      n: sinCerrar.filter((p) => p.dias >= t.min && p.dias <= t.max).length,
    }));

    // ── Por tipo de falla ──
    const porTipo = new Map<string, { codigo: string; abiertos: number; resueltos: number }>();
    for (const p of problemas) {
      const fila = porTipo.get(p.tipoCodigo) ?? { codigo: p.tipoCodigo, abiertos: 0, resueltos: 0 };
      if (p.estado === "RESUELTO") fila.resueltos += 1;
      else fila.abiertos += 1;
      porTipo.set(p.tipoCodigo, fila);
    }
    const tipos = [...porTipo.values()].sort(
      (a, b) => b.abiertos - a.abiertos || b.abiertos + b.resueltos - (a.abiertos + a.resueltos)
    );

    // ── Por tienda ──
    const porTienda = new Map<
      number,
      { sucursalId: number; nombre: string; cliente: string; abiertos: number; resueltos: number; masViejo: number }
    >();
    for (const p of problemas) {
      const fila = porTienda.get(p.sucursalId) ?? {
        sucursalId: p.sucursalId,
        nombre: p.sucursal,
        cliente: p.cliente,
        abiertos: 0,
        resueltos: 0,
        masViejo: 0,
      };
      if (p.estado === "RESUELTO") fila.resueltos += 1;
      else {
        fila.abiertos += 1;
        fila.masViejo = Math.max(fila.masViejo, p.dias);
      }
      porTienda.set(p.sucursalId, fila);
    }
    const tiendas = [...porTienda.values()]
      .filter((t) => t.abiertos > 0)
      .sort((a, b) => b.abiertos - a.abiertos || b.masViejo - a.masViejo);

    return {
      sinCerrar,
      sinAgenda: sinCerrar.filter((p) => !p.agenda).length,
      nResueltos: resueltos.length,
      levantados30,
      levantadosAntes,
      resueltos30,
      resueltosAntes,
      promedio,
      masAntiguo,
      semanas,
      tramos,
      tipos,
      tiendas,
    };
  }, [problemas, hoy]);

  if (problemas.length === 0) {
    return (
      <div className="px-4 md:px-7 py-8 border-b-2 border-[var(--color-divider)] text-[13px] opacity-66">
        No hay problemas que graficar con este recorte ({alcance}).
      </div>
    );
  }

  // Cuántos hay en cada estado sin cerrar, con el nombre que tenga en el checklist.
  const porEstado = new Map<string, number>();
  for (const p of d.sinCerrar) porEstado.set(p.estado, (porEstado.get(p.estado) ?? 0) + 1);
  const desglose = [...porEstado.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([codigo, n]) => `${nombreEstado(codigo)}: ${n}`)
    .join(" · ");

  const delta = (ahora: number, antes: number) => {
    const dif = ahora - antes;
    if (dif === 0) return "igual que los 30 días anteriores";
    return `${dif > 0 ? "+" : "−"}${Math.abs(dif)} vs. los 30 días anteriores (${antes})`;
  };

  return (
    <div className="border-b-2 border-[var(--color-divider)]">
      {/* ── Números de cabecera ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 border-b border-black/[.2]">
        <Cifra
          label="Sin cerrar"
          valor={d.sinCerrar.length}
          color={C_ABIERTO}
          sub={desglose || "No queda nada sin cerrar"}
        />
        <Cifra label="Levantados · 30 días" valor={d.levantados30} sub={delta(d.levantados30, d.levantadosAntes)} />
        <Cifra label="Resueltos · 30 días" valor={d.resueltos30} sub={delta(d.resueltos30, d.resueltosAntes)} />
        <Cifra
          label="Tiempo medio de resolución"
          valor={d.promedio === null ? "—" : String(d.promedio).replace(".", ",")}
          unidad={d.promedio === null ? undefined : d.promedio === 1 ? "día" : "días"}
          sub={
            d.promedio === null
              ? "Todavía no se ha resuelto ninguno"
              : `Sobre ${plural(d.nResueltos, "problema resuelto", "problemas resueltos")}`
          }
        />
        <Cifra
          label="El más antiguo sin cerrar"
          valor={d.masAntiguo ? d.masAntiguo.dias : "—"}
          unidad={d.masAntiguo ? (d.masAntiguo.dias === 1 ? "día" : "días") : undefined}
          sub={d.masAntiguo ? `${d.masAntiguo.sucursal} · ${nombreTipo(d.masAntiguo.tipoCodigo)}` : "No queda nada sin cerrar"}
          onClick={d.masAntiguo ? () => onTienda(d.masAntiguo!.sucursalId) : undefined}
          accion="Ver la tienda"
        />
        <Cifra
          label="Sin visita agendada"
          valor={d.sinAgenda}
          sub={`De ${plural(d.sinCerrar.length, "problema sin cerrar", "problemas sin cerrar")}`}
          onClick={d.sinAgenda > 0 ? onSinAgenda : undefined}
          accion="Ver cuáles"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2">
        <Semanal semanas={d.semanas} />

        {/* ── Antigüedad ── */}
        <Tarjeta
          titulo="Sin cerrar por antigüedad"
          derecha={plural(d.sinCerrar.length, "problema", "problemas")}
          bajada="Días desde que el técnico lo levantó. Haz clic en un tramo para ver esos problemas."
          bordeDerecho={false}
        >
          {d.sinCerrar.length === 0 ? (
            <Vacio>No queda ningún problema sin cerrar.</Vacio>
          ) : (
            <Barras
              max={Math.max(...d.tramos.map((t) => t.n))}
              filas={d.tramos.map((t) => ({
                clave: t.clave,
                nombre: t.label,
                abiertos: t.n,
                resueltos: 0,
                detalle: plural(t.n, "problema", "problemas"),
                onClick: t.n > 0 ? () => onTramo(t.clave) : undefined,
              }))}
            />
          )}
        </Tarjeta>

        {/* ── Por tipo ── */}
        <Tarjeta
          titulo="Por tipo de falla"
          derecha={plural(d.tipos.length, "tipo", "tipos")}
          bajada="Todo lo levantado de cada tipo. Haz clic en uno para filtrar la lista."
          leyenda
        >
          <Barras
            max={Math.max(...d.tipos.map((t) => t.abiertos + t.resueltos))}
            filas={d.tipos.slice(0, FILAS_TIPO).map((t) => ({
              clave: t.codigo,
              nombre: nombreTipo(t.codigo),
              abiertos: t.abiertos,
              resueltos: t.resueltos,
              detalle: `${t.abiertos} sin cerrar · ${t.abiertos + t.resueltos} en total`,
              onClick: () => onTipo(t.codigo),
            }))}
          />
          {d.tipos.length > FILAS_TIPO ? (
            <div className="text-xs opacity-62 mt-2.5">
              Y {plural(d.tipos.length - FILAS_TIPO, "tipo más", "tipos más")}, con{" "}
              {d.tipos.slice(FILAS_TIPO).reduce((acc, t) => acc + t.abiertos, 0)} sin cerrar entre todos: están en el
              filtro «Tipo de falla».
            </div>
          ) : null}
        </Tarjeta>

        {/* ── Por tienda ── */}
        <Tarjeta
          titulo="Tiendas con más problemas sin cerrar"
          derecha={plural(d.tiendas.length, "tienda", "tiendas")}
          bajada="Haz clic en una tienda para ir a sus problemas y a su historial."
          leyenda
          bordeDerecho={false}
        >
          {d.tiendas.length === 0 ? (
            <Vacio>Ninguna tienda tiene problemas sin cerrar.</Vacio>
          ) : (
            <>
              <Barras
                max={Math.max(...d.tiendas.slice(0, FILAS_TIENDA).map((t) => t.abiertos + t.resueltos))}
                filas={d.tiendas.slice(0, FILAS_TIENDA).map((t) => ({
                  clave: String(t.sucursalId),
                  nombre: t.nombre,
                  sub: t.cliente,
                  abiertos: t.abiertos,
                  resueltos: t.resueltos,
                  detalle: `${t.abiertos} sin cerrar · el más antiguo, ${plural(t.masViejo, "día", "días")}`,
                  onClick: () => onTienda(t.sucursalId),
                }))}
              />
              {d.tiendas.length > FILAS_TIENDA ? (
                <div className="text-xs opacity-62 mt-2.5">
                  Y {plural(d.tiendas.length - FILAS_TIENDA, "tienda más", "tiendas más")} con problemas sin cerrar,
                  abajo en la lista.
                </div>
              ) : null}
            </>
          )}
        </Tarjeta>
      </div>

      <div className="px-4 md:px-7 py-2.5 border-t border-black/[.12] text-[11px] tracking-[.06em] uppercase opacity-60">
        Gráficos sobre {plural(problemas.length, "problema", "problemas")} · {alcance}
      </div>
    </div>
  );
}

/** Un número de cabecera. Con `onClick`, además lleva a lo que cuenta. */
function Cifra({
  label,
  valor,
  unidad,
  sub,
  color = "var(--color-text)",
  onClick,
  accion,
}: {
  label: string;
  valor: number | string;
  unidad?: string;
  sub: string;
  color?: string;
  onClick?: () => void;
  accion?: string;
}) {
  const cuerpo = (
    <>
      <div className="text-[10px] tracking-[.12em] uppercase opacity-66">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-2.5">
        <div className="font-extrabold text-[34px] leading-none tracking-[-.03em]" style={{ color }}>
          {valor}
        </div>
        {unidad ? <div className="text-xs opacity-62">{unidad}</div> : null}
      </div>
      <div className="text-xs opacity-66 mt-2 leading-[1.4]">{sub}</div>
      {onClick && accion ? (
        <div className="flex items-center gap-1.5 mt-2 text-[10px] tracking-[.1em] uppercase text-[var(--color-accent-active)]">
          <span>{accion}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </div>
      ) : null}
    </>
  );
  const clase = "block w-full text-left px-4 md:px-5 pt-4 pb-4 border-r border-b xl:border-b-0 border-black/[.2] min-w-0";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${clase} bg-transparent cursor-pointer text-[var(--color-text)] hover:bg-black/5`}>
      {cuerpo}
    </button>
  ) : (
    <div className={clase}>{cuerpo}</div>
  );
}

function Tarjeta({
  titulo,
  derecha,
  bajada,
  leyenda = false,
  bordeDerecho = true,
  children,
}: {
  titulo: string;
  derecha?: string;
  bajada?: string;
  /** Muestra la leyenda sin cerrar / resueltos. */
  leyenda?: boolean;
  bordeDerecho?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`p-4 md:p-6 border-b border-black/[.12] min-w-0 ${bordeDerecho ? "lg:border-r" : ""}`}>
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <h2 className="font-extrabold text-[17px] m-0">{titulo}</h2>
        {derecha ? <span className="ml-auto text-[11px] tracking-[.08em] uppercase opacity-60">{derecha}</span> : null}
      </div>
      {bajada ? <p className="mt-1.5 mb-0 text-xs opacity-62">{bajada}</p> : null}
      {leyenda ? (
        <div className="flex gap-4 mt-3">
          <Leyenda color={C_ABIERTO} texto="Sin cerrar" />
          <Leyenda color={C_RESUELTO} texto="Resueltos" />
        </div>
      ) : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="w-2.5 h-2.5 flex-none" style={{ background: color }} aria-hidden="true" />
      <span>{texto}</span>
    </span>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <div className="py-5 text-[13px] opacity-66">{children}</div>;
}

interface FilaBarra {
  clave: string;
  nombre: string;
  sub?: string;
  abiertos: number;
  resueltos: number;
  /** El número escrito a la derecha: la barra nunca es la única forma de leerlo. */
  detalle: string;
  onClick?: () => void;
}

/**
 * Barras horizontales: lo que sigue sin cerrar en el color de acento y, pegado
 * a continuación, lo resuelto en gris. Todas comparten la misma escala.
 */
function Barras({ filas, max }: { filas: FilaBarra[]; max: number }) {
  const tope = Math.max(1, max);
  return (
    <div>
      {filas.map((f) => {
        const cuerpo = (
          <>
            <div className="flex items-baseline gap-2.5">
              <span className="text-[13px] min-w-0 truncate">
                {f.nombre}
                {f.sub ? <span className="opacity-55"> · {f.sub}</span> : null}
              </span>
              <span className="ml-auto flex-none text-xs tabular-nums opacity-75">{f.detalle}</span>
            </div>
            <div className="flex gap-[2px] h-2 mt-1.5 bg-[var(--color-neutral-300)]">
              {f.abiertos > 0 ? (
                <div style={{ width: `${(100 * f.abiertos) / tope}%`, background: C_ABIERTO }} />
              ) : null}
              {f.resueltos > 0 ? (
                <div style={{ width: `${(100 * f.resueltos) / tope}%`, background: C_RESUELTO }} />
              ) : null}
            </div>
          </>
        );
        return f.onClick ? (
          <button
            key={f.clave}
            type="button"
            onClick={f.onClick}
            className="block w-full text-left py-2.5 px-0 bg-transparent border-0 border-b border-black/[.1] cursor-pointer text-[var(--color-text)] hover:bg-black/5"
          >
            {cuerpo}
          </button>
        ) : (
          <div key={f.clave} className="py-2.5 border-b border-black/[.1]" style={{ opacity: f.abiertos + f.resueltos ? 1 : 0.5 }}>
            {cuerpo}
          </div>
        );
      })}
    </div>
  );
}

interface Semana {
  inicio: string;
  fin: string;
  levantados: number;
  resueltos: number;
}

/**
 * "Levantados y resueltos por semana": dos columnas por semana sobre el mismo
 * eje. Si las de acento le ganan a las grises, la lista de pendientes crece.
 * Al pasar el mouse (o con el teclado) se lee la semana; la tabla de abajo
 * trae los mismos números.
 */
function Semanal({ semanas }: { semanas: Semana[] }) {
  const [activa, setActiva] = useState<number | null>(null);
  const { tope, marcas } = escala(Math.max(1, ...semanas.flatMap((s) => [s.levantados, s.resueltos])));
  const levantados = semanas.reduce((acc, s) => acc + s.levantados, 0);
  const resueltos = semanas.reduce((acc, s) => acc + s.resueltos, 0);
  const saldo = levantados - resueltos;
  const sem = activa === null ? null : semanas[activa];

  return (
    <div className="p-4 md:p-6 lg:border-r border-b border-black/[.12] min-w-0">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <h2 className="font-extrabold text-[17px] m-0">Levantados y resueltos por semana</h2>
        <span className="ml-auto text-[11px] tracking-[.08em] uppercase opacity-60">
          Últimas {semanas.length} semanas
        </span>
      </div>
      <p className="mt-1.5 mb-0 text-xs opacity-62">
        {levantados === 0 && resueltos === 0
          ? "Sin movimiento en estas semanas."
          : `Se levantaron ${levantados} y se resolvieron ${resueltos}: ${
              saldo === 0
                ? "lo que queda sin cerrar no cambió."
                : saldo > 0
                  ? `quedaron ${saldo} más sin cerrar.`
                  : `quedaron ${-saldo} menos sin cerrar.`
            }`}
      </p>
      <div className="flex gap-4 mt-3">
        <Leyenda color={C_ABIERTO} texto="Levantados" />
        <Leyenda color={C_RESUELTO} texto="Resueltos" />
      </div>

      {/* Lo que se lee al pasar por una semana: mismo lugar siempre, sin saltos. */}
      <div
        className="mt-3 px-3 py-2 text-xs min-h-[34px] border-l-[3px] tabular-nums"
        style={{
          background: sem ? "var(--color-accent-200)" : "var(--color-surface)",
          borderColor: sem ? "var(--color-accent)" : "var(--color-divider)",
        }}
        aria-live="polite"
      >
        {sem
          ? `Semana del ${diaCorto(sem.inicio)} al ${diaCorto(sem.fin)} · ${sem.levantados} levantados · ${sem.resueltos} resueltos`
          : "Pasa el mouse por una semana para ver su detalle."}
      </div>

      <div className="flex mt-4">
        {/* Eje: las mismas marcas que las líneas del fondo. */}
        <div className="relative w-6 flex-none h-[150px]" aria-hidden="true">
          {marcas.map((m) => (
            <span
              key={m}
              className="absolute right-1.5 text-[10px] leading-none opacity-55 tabular-nums translate-y-1/2"
              style={{ bottom: `${(100 * m) / tope}%` }}
            >
              {m}
            </span>
          ))}
        </div>
        <div className="relative flex-1 min-w-0 h-[150px] border-b-2 border-[var(--color-divider)]">
          {marcas
            .filter((m) => m > 0)
            .map((m) => (
              <div
                key={m}
                className="absolute left-0 right-0 border-t border-black/[.1]"
                style={{ bottom: `${(100 * m) / tope}%` }}
                aria-hidden="true"
              />
            ))}
          <div className="absolute inset-0 flex items-stretch">
            {semanas.map((s, i) => (
              <button
                key={s.inicio}
                type="button"
                onMouseEnter={() => setActiva(i)}
                onMouseLeave={() => setActiva(null)}
                onFocus={() => setActiva(i)}
                onBlur={() => setActiva(null)}
                aria-label={`Semana del ${diaCorto(s.inicio)}: ${s.levantados} levantados, ${s.resueltos} resueltos`}
                className="flex-1 min-w-0 flex items-end justify-center gap-[2px] px-[3px] py-0 border-0 cursor-default"
                style={{ background: activa === i ? "rgba(32,30,29,.07)" : "transparent" }}
              >
                <span
                  className="flex-1 max-w-[16px] block"
                  style={{ height: `${(100 * s.levantados) / tope}%`, background: C_ABIERTO }}
                />
                <span
                  className="flex-1 max-w-[16px] block"
                  style={{ height: `${(100 * s.resueltos) / tope}%`, background: C_RESUELTO }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex pl-6 mt-1.5">
        {semanas.map((s, i) => (
          <div
            key={s.inicio}
            // En pantallas angostas va una fecha sí y una no, para que no se pisen.
            className={`flex-1 min-w-0 text-center text-[10px] whitespace-nowrap ${
              (semanas.length - 1 - i) % 2 ? "max-md:invisible" : ""
            }`}
            style={{ opacity: activa === i ? 1 : 0.55, fontWeight: activa === i ? 800 : 400 }}
          >
            {diaCorto(s.inicio)}
          </div>
        ))}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs underline underline-offset-[3px] text-[var(--color-accent-active)]">
          Ver como tabla
        </summary>
        <table className="table mt-2">
          <thead>
            <tr>
              <th>Semana del</th>
              <th className="text-right">Levantados</th>
              <th className="text-right">Resueltos</th>
            </tr>
          </thead>
          <tbody>
            {semanas.map((s) => (
              <tr key={s.inicio}>
                <td className="tabular-nums">
                  {diaCorto(s.inicio)} – {diaCorto(s.fin)}
                </td>
                <td className="text-right tabular-nums">{s.levantados}</td>
                <td className="text-right tabular-nums">{s.resueltos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
