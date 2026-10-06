"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import Dialogo from "@/components/admin/Dialogo";
import SelectBuscable from "@/components/ui/SelectBuscable";
import { Toast, useToast } from "@/components/ui/Toast";
import { crearVisitasPapelAction } from "@/app/actions/visitas-papel";
import { trabajoVaConMotivo, useReferencias } from "@/lib/ui/referencias";
import { trabajosDelMotivo } from "@/lib/ui/motivos";
import { fmtRut, mensajeRut } from "@/lib/ui/formato";
import { hoyISO } from "@/lib/ui/fecha";
import { PRIMER_ANIO_PAPEL } from "@/lib/ui/papel";
import type { InformePapel } from "@/lib/data/visitas-papel";
import type { CatalogoTrabajo } from "@/lib/types";

/** Un técnico de la carga: todo lo que hay adentro lo hizo él. */
interface Bloque {
  tecnicoId: string;
  abierto: boolean;
}

/** Un cliente dentro del recuadro de un técnico, con su filtro de mall. */
interface Grupo {
  key: string;
  tecnicoId: string;
  clienteId: string;
  abierto: boolean;
  /** "" = todas las sucursales del cliente; si no, solo las de ese mall. */
  mallId: string;
}

/** Una sucursal del cliente, con sus informes adentro. */
interface Tienda {
  key: string;
  grupoKey: string;
  sucursalId: string;
  abierto: boolean;
}

/** Un informe en papel mientras se transcribe. El año va arriba y el técnico en su recuadro. */
interface Informe {
  key: string;
  tiendaKey: string;
  /** "01".."12" */
  mes: string;
  /** "01".."31" */
  dia: string;
  motivo: string;
  /** Los trabajos del checklist que se marcaron bajo el motivo, con sus subtrabajos. */
  trabajos: TrabajoPapel[];
  firmante: string;
  rut: string;
  descripcion: string;
  /** Por qué no se guardó la última vez. */
  error?: string;
  /** Ya hay una visita de esa tienda ese día: se ofrece guardarlo igual. */
  repetida?: boolean;
  aunqueRepetida?: boolean;
}

interface TrabajoPapel {
  codigo: string;
  subs: { etiqueta: string; cantidad: number }[];
}

interface Borrador {
  anio: number;
  bloques: Bloque[];
  grupos: Grupo[];
  tiendas: Tienda[];
  informes: Informe[];
}

const CLAVE_BORRADOR = "dmc.visitas-papel.borrador.v4";
/** De a cuántos informes se manda al servidor: el avance se ve y nada se corta. */
const TANDA = 40;

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

let contador = 0;
function nuevaKey(): string {
  contador += 1;
  return `${Date.now().toString(36)}-${contador}`;
}

const dos = (n: number) => String(n).padStart(2, "0");

function diasDelMes(anio: number, mes: string): number {
  return mes ? new Date(anio, Number(mes), 0).getDate() : 31;
}

/** La fecha completa del informe, o "" si falta el mes o el día. */
function fechaDe(inf: Informe, anio: number): string {
  return inf.mes && inf.dia ? `${anio}-${inf.mes}-${inf.dia}` : "";
}

/**
 * Lo que le falta al informe para poder guardarse, o null si está completo.
 * El RUT no cuenta: uno mal escrito en el papel se guarda igual, con aviso.
 */
function faltante(inf: Informe, anio: number, hoy: string): string | null {
  if (!inf.mes) return "Falta el mes.";
  if (!inf.dia) return "Falta el día.";
  if (Number(inf.dia) > diasDelMes(anio, inf.mes)) return `${MESES[Number(inf.mes) - 1]} de ${anio} no tiene día ${Number(inf.dia)}.`;
  if (fechaDe(inf, anio) > hoy) return "La fecha no puede ser futura.";
  if (!inf.motivo) return "Falta el motivo.";
  if (!inf.firmante.trim()) return "Falta quién firmó.";
  if (!inf.descripcion.trim()) return "Falta la descripción.";
  return null;
}

/**
 * "Visitas en papel": transcribir los informes que se hicieron a mano en años
 * anteriores, lo más rápido posible.
 *
 * Arriba va el año. Después se agregan técnicos, cada uno en su recuadro, y
 * dentro de cada técnico sus clientes; en cada cliente se filtra por mall si
 * hace falta y se van agregando sus tiendas. Cada tienda lleva sus informes
 * —uno o varios en el año— y cada informe pide solo lo suyo: mes, día, motivo,
 * quién firmó y la descripción. Un informe nuevo copia el mes y el motivo del
 * anterior del mismo cliente, para escribir solo lo que cambia.
 *
 * Lo escrito se guarda en el navegador mientras tanto: cerrar la pestaña no
 * pierde nada. Al guardar, lo completo entra como visita completada y sale de
 * la lista; lo incompleto se queda marcado con lo que le falta.
 */
export default function VisitasPapel() {
  const router = useRouter();
  const ref = useReferencias();
  const { toast, aviso } = useToast();
  const hoy = hoyISO();
  const anioActual = Number(hoy.slice(0, 4));

  const [anio, setAnio] = useState(anioActual - 1);
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [informes, setInformes] = useState<Informe[]>([]);
  const [guardando, setGuardando] = useState<{ hechos: number; total: number } | null>(null);
  const [guardados, setGuardados] = useState<{ folio: string; nombre: string }[]>([]);
  const [cargado, setCargado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const foco = useRef<string | null>(null);

  // El borrador se lee recién en el navegador: en el servidor no existe.
  useEffect(() => {
    try {
      const crudo = localStorage.getItem(CLAVE_BORRADOR);
      if (crudo) {
        const b = JSON.parse(crudo) as Borrador;
        if (b.anio) setAnio(b.anio);
        if (Array.isArray(b.bloques)) setBloques(b.bloques);
        if (Array.isArray(b.grupos)) setGrupos(b.grupos);
        if (Array.isArray(b.tiendas)) setTiendas(b.tiendas);
        if (Array.isArray(b.informes)) setInformes(b.informes);
      }
    } catch {
      // Sin almacenamiento (ventana privada, bloqueado): se trabaja sin borrador.
    }
    setCargado(true);
  }, []);

  useEffect(() => {
    if (!cargado) return;
    try {
      const b: Borrador = { anio, bloques, grupos, tiendas, informes };
      if (bloques.length) localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(b));
      else localStorage.removeItem(CLAVE_BORRADOR);
    } catch {
      // Igual que arriba: el borrador es una comodidad, no un requisito.
    }
  }, [cargado, anio, bloques, grupos, tiendas, informes]);

  // El informe recién agregado recibe el cursor: se agrega y se escribe.
  useEffect(() => {
    if (!foco.current) return;
    document.getElementById(foco.current)?.focus();
    foco.current = null;
  }, [informes]);

  // Los informes son de años pasados: también se ofrecen los técnicos, clientes
  // y sucursales que hoy están inactivos, marcados como tales.
  const opcTecnicos = useMemo(
    () =>
      [...ref.tecnicos]
        .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombreCompleto.localeCompare(b.nombreCompleto))
        .map((t) => ({ v: String(t.id), t: t.activo ? t.nombreCompleto : `${t.nombreCompleto} (inactivo)` })),
    [ref.tecnicos]
  );
  const opcMotivos = useMemo(() => ref.motivos.map((m) => ({ v: m.codigo, t: m.nombre })), [ref.motivos]);
  const catalogoTrabajos = useMemo(() => ref.trabajos.filter((t) => t.activo), [ref.trabajos]);
  const nombreCliente = (id: string) => ref.clientes.find((c) => String(c.id) === id)?.nombreFantasia ?? "";
  const nombreTecnico = (id: string) => ref.tecnicos.find((t) => String(t.id) === id)?.nombreCompleto ?? "";
  const sucursal = (id: string) => ref.sucursales.find((s) => String(s.id) === id);

  const tecnicosLibres = opcTecnicos.filter((o) => !bloques.some((b) => b.tecnicoId === o.v));
  const completos = informes.filter((i) => !faltante(i, anio, hoy)).length;

  // Los informes de cada nivel, para los contadores de las cabeceras.
  const grupoDeTienda = new Map(tiendas.map((t) => [t.key, t.grupoKey]));
  const tecnicoDeGrupo = new Map(grupos.map((g) => [g.key, g.tecnicoId]));
  const informesDe = (filtro: { tecnicoId?: string; grupoKey?: string }) =>
    informes.filter((i) => {
      const grupoKey = grupoDeTienda.get(i.tiendaKey);
      if (filtro.grupoKey) return grupoKey === filtro.grupoKey;
      return grupoKey !== undefined && tecnicoDeGrupo.get(grupoKey) === filtro.tecnicoId;
    });

  function agregarTecnico(tecnicoId: string) {
    if (!tecnicoId) return;
    setBloques((prev) =>
      prev.some((b) => b.tecnicoId === tecnicoId)
        ? prev.map((b) => (b.tecnicoId === tecnicoId ? { ...b, abierto: true } : b))
        : [...prev, { tecnicoId, abierto: true }]
    );
  }

  function cambiarBloque(tecnicoId: string, cambios: Partial<Bloque>) {
    setBloques((prev) => prev.map((b) => (b.tecnicoId === tecnicoId ? { ...b, ...cambios } : b)));
  }

  /** Quita un conjunto de grupos con sus tiendas e informes. */
  function quitarGrupos(keys: Set<string>) {
    const tiendasFuera = new Set(tiendas.filter((t) => keys.has(t.grupoKey)).map((t) => t.key));
    setInformes((prev) => prev.filter((i) => !tiendasFuera.has(i.tiendaKey)));
    setTiendas((prev) => prev.filter((t) => !keys.has(t.grupoKey)));
    setGrupos((prev) => prev.filter((g) => !keys.has(g.key)));
  }

  function quitarBloque(tecnicoId: string) {
    quitarGrupos(new Set(grupos.filter((g) => g.tecnicoId === tecnicoId).map((g) => g.key)));
    setBloques((prev) => prev.filter((b) => b.tecnicoId !== tecnicoId));
  }

  function agregarCliente(tecnicoId: string, clienteId: string) {
    if (!clienteId) return;
    setGrupos((prev) =>
      prev.some((g) => g.tecnicoId === tecnicoId && g.clienteId === clienteId)
        ? prev.map((g) => (g.tecnicoId === tecnicoId && g.clienteId === clienteId ? { ...g, abierto: true } : g))
        : [...prev, { key: nuevaKey(), tecnicoId, clienteId, abierto: true, mallId: "" }]
    );
  }

  function cambiarGrupo(key: string, cambios: Partial<Grupo>) {
    setGrupos((prev) => prev.map((g) => (g.key === key ? { ...g, ...cambios } : g)));
  }

  /** Un informe nuevo: copia el mes y el motivo del último de la tienda o, si no hay, del cliente. */
  function informeNuevo(tienda: Tienda, previos: Informe[]): Informe {
    const delGrupo = new Set(tiendas.filter((t) => t.grupoKey === tienda.grupoKey).map((t) => t.key));
    delGrupo.add(tienda.key);
    const previo =
      previos.filter((i) => i.tiendaKey === tienda.key).at(-1) ??
      previos.filter((i) => delGrupo.has(i.tiendaKey)).at(-1);
    return {
      key: nuevaKey(),
      tiendaKey: tienda.key,
      mes: previo?.mes ?? "",
      dia: "",
      motivo: previo?.motivo ?? "",
      trabajos: [],
      firmante: "",
      rut: "",
      descripcion: "",
    };
  }

  /** Agrega tiendas al cliente; cada una nace con un informe listo para llenar. */
  function agregarTiendas(grupoKey: string, sucursalIds: string[]) {
    const nuevas: Tienda[] = sucursalIds
      .filter((id) => id && !tiendas.some((t) => t.grupoKey === grupoKey && t.sucursalId === id))
      .map((sucursalId) => ({ key: nuevaKey(), grupoKey, sucursalId, abierto: true }));
    if (!nuevas.length) return;
    const nuevos: Informe[] = [];
    for (const t of nuevas) nuevos.push(informeNuevo(t, [...informes, ...nuevos]));
    const primero = nuevos[0];
    foco.current = `pp-${primero.key}-${primero.mes ? "dia" : "mes"}`;
    setTiendas((prev) => [...prev, ...nuevas]);
    setInformes((prev) => [...prev, ...nuevos]);
  }

  function agregarInforme(tienda: Tienda) {
    const nuevo = informeNuevo(tienda, informes);
    foco.current = `pp-${nuevo.key}-${nuevo.mes ? "dia" : "mes"}`;
    setTiendas((prev) => prev.map((t) => (t.key === tienda.key ? { ...t, abierto: true } : t)));
    setInformes((prev) => {
      // Va justo después del último informe de esa tienda.
      const ultimo = prev.map((i) => i.tiendaKey).lastIndexOf(tienda.key);
      return ultimo < 0 ? [...prev, nuevo] : [...prev.slice(0, ultimo + 1), nuevo, ...prev.slice(ultimo + 1)];
    });
  }

  function cambiarTienda(key: string, cambios: Partial<Tienda>) {
    setTiendas((prev) => prev.map((t) => (t.key === key ? { ...t, ...cambios } : t)));
  }

  function quitarTienda(key: string) {
    setInformes((prev) => prev.filter((i) => i.tiendaKey !== key));
    setTiendas((prev) => prev.filter((t) => t.key !== key));
  }

  function cambiarInforme(key: string, cambios: Partial<Informe>) {
    setInformes((prev) =>
      prev.map((i) => {
        if (i.key !== key) return i;
        if ("aunqueRepetida" in cambios) return { ...i, ...cambios };
        // Al corregir algo, el aviso de la vez anterior deja de aplicar. El de
        // «ya hay una visita ese día» solo cae si cambia la fecha.
        const nuevo: Informe = { ...i, ...cambios, error: undefined };
        if ("mes" in cambios || "dia" in cambios) return { ...nuevo, repetida: false, aunqueRepetida: false };
        return nuevo;
      })
    );
  }

  function quitarInforme(key: string) {
    setInformes((prev) => prev.filter((i) => i.key !== key));
  }

  function vaciar() {
    setInformes([]);
    setTiendas([]);
    setGrupos([]);
    setBloques([]);
  }

  /** El botón de la barra: marca lo incompleto y, si hay algo listo, pide confirmar. */
  function pedirConfirmacion() {
    // Los incompletos quedan marcados con lo que les falta.
    setInformes((prev) => prev.map((i) => ({ ...i, error: faltante(i, anio, hoy) ?? i.error })));
    if (completos === 0) {
      aviso(informes.length ? "Ningún informe está completo todavía: revisa los marcados en rojo." : "Agrega al menos un informe.");
      return;
    }
    setConfirmando(true);
  }

  async function guardar() {
    setConfirmando(false);
    const listos = informes.filter((i) => !faltante(i, anio, hoy));
    if (listos.length === 0) return;

    const tiendaDe = new Map(tiendas.map((t) => [t.key, t]));
    const grupoDe = new Map(grupos.map((g) => [g.key, g]));
    const bloqueDe = new Map(bloques.map((b) => [b.tecnicoId, b]));
    const contexto = (inf: Informe) => {
      const t = tiendaDe.get(inf.tiendaKey)!;
      const g = grupoDe.get(t.grupoKey)!;
      return { t, g, b: bloqueDe.get(g.tecnicoId)! };
    };

    setGuardando({ hechos: 0, total: listos.length });
    const hechos: { key: string; folio: string; nombre: string }[] = [];
    const errores = new Map<string, { error: string; repetida: boolean }>();
    for (let i = 0; i < listos.length; i += TANDA) {
      const tanda = listos.slice(i, i + TANDA);
      const lote: InformePapel[] = tanda.map((inf) => {
        const { t, g, b } = contexto(inf);
        return {
          clienteId: Number(g.clienteId),
          sucursalId: Number(t.sucursalId),
          tecnicoId: Number(b.tecnicoId),
          tecnicoAyudanteId: null,
          motivosCodigos: [inf.motivo],
          trabajos: (inf.trabajos ?? []).map((t) => ({
            codigo: t.codigo,
            motivoCodigo: inf.motivo,
            detalle: null,
            subtrabajos: t.subs,
          })),
          fecha: fechaDe(inf, anio),
          firmanteNombre: inf.firmante.trim(),
          firmanteRut: inf.rut.trim() || null,
          descripcion: inf.descripcion.trim(),
          aunqueRepetida: Boolean(inf.aunqueRepetida),
        };
      });
      try {
        const res = await crearVisitasPapelAction({ informes: lote });
        res.resultados.forEach((r, j) => {
          const inf = tanda[j];
          if (r.ok && r.folio) {
            const { t, g } = contexto(inf);
            hechos.push({
              key: inf.key,
              folio: r.folio,
              nombre: `${nombreTecnico(g.tecnicoId)} · ${nombreCliente(g.clienteId)} · ${sucursal(t.sucursalId)?.nombre ?? ""} · ${fechaDe(inf, anio)}`,
            });
          } else {
            errores.set(inf.key, { error: r.error ?? "No se pudo guardar.", repetida: Boolean(r.repetida) });
          }
        });
      } catch {
        tanda.forEach((inf) => errores.set(inf.key, { error: "Se cortó la conexión. Vuelve a guardar.", repetida: false }));
      }
      setGuardando({ hechos: Math.min(i + TANDA, listos.length), total: listos.length });
    }
    setGuardando(null);

    const guardadosKeys = new Set(hechos.map((h) => h.key));
    setGuardados((prev) => [...hechos.map(({ folio, nombre }) => ({ folio, nombre })), ...prev]);
    const restantes = informes
      .filter((i) => !guardadosKeys.has(i.key))
      .map((i) => {
        const e = errores.get(i.key);
        return e ? { ...i, error: e.error, repetida: e.repetida, aunqueRepetida: false } : i;
      });
    setInformes(restantes);
    // Las tiendas que quedaron sin informes salen; el técnico y el cliente se quedan, por si sigue.
    const conInformes = new Set(restantes.map((i) => i.tiendaKey));
    setTiendas((prev) => prev.filter((t) => conInformes.has(t.key)));
    if (hechos.length) router.refresh();

    const quedan = restantes.length;
    aviso(
      hechos.length
        ? `${hechos.length} ${hechos.length === 1 ? "informe guardado" : "informes guardados"}${quedan ? ` · ${quedan} por revisar` : ""}`
        : "No se guardó ninguno: revisa los marcados en rojo."
    );
  }

  const anios = Array.from({ length: anioActual - PRIMER_ANIO_PAPEL + 1 }, (_, i) => anioActual - i);

  return (
    <>
      <AdminHeader kicker="Operación · visitas" title="Visitas en papel">
        <Link href="/admin/visitas" className="btn btn-secondary">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          <span>Volver a visitas</span>
        </Link>
      </AdminHeader>

      <div className="px-4 md:px-7 py-5 pb-32 max-w-[1200px]">
        <p className="text-[13px] leading-[1.55] opacity-75 max-w-[760px]">
          Para pasar al sistema los informes que se hicieron a mano. Cada informe entra como visita{" "}
          <strong>completada</strong>, con el folio del año del informe, sin fotos, video ni firma dibujada. Lo que
          escribes se guarda en este navegador hasta que lo guardes en el sistema.
        </p>

        <div className="mt-5 border border-black/[.3]">
          <div className="grid grid-cols-1 sm:grid-cols-[200px_minmax(0,360px)] gap-4 p-3.5">
            <div className="field min-w-0">
              <label htmlFor="pp-anio">Año</label>
              <select
                id="pp-anio"
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
                className="input appearance-none tabular-nums"
              >
                {anios.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="field min-w-0">
              <label htmlFor="pp-tecnico">Agregar técnico</label>
              <SelectBuscable
                id="pp-tecnico"
                valor=""
                opciones={tecnicosLibres}
                onChange={agregarTecnico}
                placeholder={tecnicosLibres.length ? "Elige el técnico…" : "Ya están todos"}
                ariaLabel="Agregar técnico"
              />
            </div>
          </div>
        </div>

        {guardados.length ? (
          <details className="mt-5 border border-[var(--color-divider-soft)] bg-[var(--color-surface)]">
            <summary className="px-3.5 py-2.5 cursor-pointer text-[13px]">
              <strong>{guardados.length}</strong> {guardados.length === 1 ? "informe guardado" : "informes guardados"} en
              esta sesión
            </summary>
            <ul className="px-3.5 pb-3 m-0 list-none grid gap-1 text-[13px] max-h-60 overflow-y-auto">
              {guardados.map((g) => (
                <li key={g.folio} className="flex gap-2">
                  <Link href={`/admin/visitas/${encodeURIComponent(g.folio)}`} className="font-extrabold tabular-nums underline">
                    {g.folio}
                  </Link>
                  <span className="opacity-75 truncate">{g.nombre}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {bloques.length === 0 ? (
          <div className="mt-5 px-3.5 py-6 border border-dashed border-[var(--color-divider)] text-[13px] opacity-70">
            Elige el año y agrega un técnico: dentro de su recuadro van sus clientes, sus tiendas y los informes.
          </div>
        ) : null}

        {bloques.map((b) => {
          const gruposDelTecnico = grupos.filter((g) => g.tecnicoId === b.tecnicoId);
          const clientesLibres = ref.clientes
            .filter((c) => !gruposDelTecnico.some((g) => g.clienteId === String(c.id)))
            .map((c) => ({ v: String(c.id), t: c.activo ? c.nombreFantasia : `${c.nombreFantasia} (inactivo)` }));
          const delTecnico = informesDe({ tecnicoId: b.tecnicoId });
          const incompletosTecnico = delTecnico.filter((i) => faltante(i, anio, hoy)).length;
          const nombreTec = nombreTecnico(b.tecnicoId);

          return (
            <section key={b.tecnicoId} className="mt-6 border-2 border-[var(--color-text)]">
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[var(--color-text)] text-[var(--color-bg)]">
                <button
                  type="button"
                  aria-expanded={b.abierto}
                  onClick={() => cambiarBloque(b.tecnicoId, { abierto: !b.abierto })}
                  className="flex-1 min-w-0 flex items-center gap-2.5 min-h-10 bg-transparent border-0 cursor-pointer text-inherit text-left"
                >
                  <Flecha abierto={b.abierto} />
                  <span className="text-[10px] tracking-[.14em] uppercase opacity-70 flex-none">Técnico</span>
                  <span className="font-extrabold text-[17px] truncate">{nombreTec}</span>
                  <span className="text-[11px] tracking-[.06em] uppercase opacity-70 tabular-nums flex-none">
                    {gruposDelTecnico.length} {gruposDelTecnico.length === 1 ? "cliente" : "clientes"} · {delTecnico.length}{" "}
                    {delTecnico.length === 1 ? "informe" : "informes"}
                  </span>
                  {incompletosTecnico ? <span className="tag tag-accent flex-none">{incompletosTecnico} sin completar</span> : null}
                </button>
                <button
                  type="button"
                  onClick={() => quitarBloque(b.tecnicoId)}
                  className="btn btn-icon w-8 h-8 flex-none border border-current text-inherit"
                  aria-label={`Quitar a ${nombreTec} y sus informes`}
                  title={`Quitar a ${nombreTec} y sus informes`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              {b.abierto ? (
                <div className="p-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="field min-w-0">
                      <label htmlFor={`pp-cli-${b.tecnicoId}`}>Agregar cliente</label>
                      <SelectBuscable
                        id={`pp-cli-${b.tecnicoId}`}
                        valor=""
                        opciones={clientesLibres}
                        onChange={(v) => agregarCliente(b.tecnicoId, v)}
                        placeholder={clientesLibres.length ? "Elige el cliente…" : "Ya están todos"}
                        ariaLabel={`Agregar cliente a ${nombreTec}`}
                      />
                    </div>
                  </div>

                  {gruposDelTecnico.length === 0 ? (
                    <div className="mt-3.5 px-3.5 py-4 border border-dashed border-[var(--color-divider)] text-[13px] opacity-70">
                      Agrega un cliente de {nombreTec} para empezar con sus tiendas.
                    </div>
                  ) : null}

                  {gruposDelTecnico.map((g) => {
                    const tiendasDelGrupo = tiendas.filter((t) => t.grupoKey === g.key);
                    const libres = ref.sucursales
                      .filter(
                        (s) =>
                          String(s.clienteId) === g.clienteId &&
                          (!g.mallId || String(s.mallId ?? "") === g.mallId) &&
                          !tiendasDelGrupo.some((t) => t.sucursalId === String(s.id))
                      )
                      .map((s) => ({ v: String(s.id), t: s.activo ? s.nombre : `${s.nombre} (inactiva)` }));
                    // Solo los malls donde el cliente tiene tiendas.
                    const mallsDelCliente = ref.malls
                      .filter((m) => ref.sucursales.some((s) => String(s.clienteId) === g.clienteId && s.mallId === m.id))
                      .map((m) => ({ v: String(m.id), t: m.nombre }));
                    const delGrupo = informesDe({ grupoKey: g.key });
                    const incompletos = delGrupo.filter((i) => faltante(i, anio, hoy)).length;
                    const nombre = nombreCliente(g.clienteId);

                    return (
                      <div key={g.key} className="mt-3.5 border-2 border-black/[.45]">
                        <div className="flex items-center gap-2 px-3.5 py-2 bg-[var(--color-surface)]">
                          <button
                            type="button"
                            aria-expanded={g.abierto}
                            onClick={() => cambiarGrupo(g.key, { abierto: !g.abierto })}
                            className="flex-1 min-w-0 flex items-center gap-2.5 min-h-10 bg-transparent border-0 cursor-pointer text-[var(--color-text)] text-left"
                          >
                            <Flecha abierto={g.abierto} />
                            <span className="font-extrabold text-[16px] truncate">{nombre}</span>
                            <span className="text-[11px] tracking-[.06em] uppercase opacity-66 tabular-nums flex-none">
                              {tiendasDelGrupo.length} {tiendasDelGrupo.length === 1 ? "tienda" : "tiendas"} · {delGrupo.length}{" "}
                              {delGrupo.length === 1 ? "informe" : "informes"}
                            </span>
                            {incompletos ? <span className="tag tag-accent flex-none">{incompletos} sin completar</span> : null}
                          </button>
                          <BotonQuitar
                            label={`Quitar ${nombre}${delGrupo.length ? " y sus informes" : ""}`}
                            onClick={() => quitarGrupos(new Set([g.key]))}
                          />
                        </div>

                        {g.abierto ? (
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-3.5 py-3 border-t border-[var(--color-divider-soft)]">
                              <div className="field min-w-0">
                                <label htmlFor={`pp-mall-${g.key}`}>Mall (opcional)</label>
                                <SelectBuscable
                                  id={`pp-mall-${g.key}`}
                                  valor={g.mallId}
                                  opciones={[{ v: "", t: "Todas las tiendas del cliente" }, ...mallsDelCliente]}
                                  onChange={(v) => cambiarGrupo(g.key, { mallId: v })}
                                  placeholder="Todas las tiendas del cliente"
                                  ariaLabel="Filtrar por mall"
                                />
                              </div>
                              <div className="field min-w-0">
                                <label htmlFor={`pp-tienda-${g.key}`}>Agregar tienda</label>
                                <SelectBuscable
                                  id={`pp-tienda-${g.key}`}
                                  valor=""
                                  opciones={libres}
                                  onChange={(v) => agregarTiendas(g.key, [v])}
                                  placeholder={libres.length ? "Escribe el nombre y se agrega…" : "No quedan tiendas por agregar"}
                                  ariaLabel="Agregar tienda"
                                />
                              </div>
                              {g.mallId && libres.length > 1 ? (
                                <div className="sm:col-span-2 -mt-1">
                                  <button
                                    type="button"
                                    onClick={() => agregarTiendas(g.key, libres.map((s) => s.v))}
                                    className="btn btn-secondary min-h-9 px-3 text-[13px]"
                                  >
                                    Agregar las {libres.length} tiendas del mall
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            {tiendasDelGrupo.map((t) => (
                              <BloqueTienda
                                key={t.key}
                                tienda={t}
                                nombre={sucursal(t.sucursalId)?.nombre ?? ""}
                                informes={informes.filter((i) => i.tiendaKey === t.key)}
                                anio={anio}
                                hoy={hoy}
                                opcMotivos={opcMotivos}
                                catalogoTrabajos={catalogoTrabajos}
                                onAlternar={() => cambiarTienda(t.key, { abierto: !t.abierto })}
                                onQuitar={() => quitarTienda(t.key)}
                                onAgregarInforme={() => agregarInforme(t)}
                                onCambiarInforme={cambiarInforme}
                                onQuitarInforme={quitarInforme}
                              />
                            ))}
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {/* Barra fija para guardar */}
      {informes.length || guardando ? (
        <div className="fixed bottom-0 right-0 left-0 lg:left-[248px] z-20 bg-[var(--color-bg)] border-t-2 border-[var(--color-divider)] px-4 md:px-7 py-3 flex items-center gap-3 flex-wrap">
          <div className="text-[13px] tabular-nums">
            <strong>{completos}</strong> de {informes.length} {informes.length === 1 ? "informe completo" : "informes completos"}
            {" · "}
            {anio}
            {bloques.length > 1 ? ` · ${bloques.length} técnicos` : ""}
            {guardando ? (
              <span className="ml-2 opacity-70">
                · guardando {guardando.hechos}/{guardando.total}…
              </span>
            ) : null}
          </div>
          <button type="button" onClick={vaciar} disabled={Boolean(guardando)} className="btn btn-ghost ml-auto">
            Vaciar la lista
          </button>
          <button
            type="button"
            onClick={pedirConfirmacion}
            disabled={Boolean(guardando) || completos === 0}
            className="btn btn-primary"
          >
            {guardando ? "Guardando…" : `Guardar ${completos} ${completos === 1 ? "informe" : "informes"}`}
          </button>
        </div>
      ) : null}

      {confirmando ? (
        <Dialogo
          kicker="Visitas en papel · confirmar"
          titulo={`¿Guardar ${completos} ${completos === 1 ? "informe" : "informes"} de ${anio}?`}
          cta={`Sí, guardar ${completos}`}
          nota="Cada informe entra como visita completada, con su folio. Después se corrige desde «Editar acta»."
          campos={[]}
          form={{}}
          onCampo={() => {}}
          onCerrar={() => setConfirmando(false)}
          onGuardar={guardar}
        >
          <ul className="m-0 p-0 list-none grid gap-1.5 text-[14px]">
            {bloques.map((b) => {
              const del = informesDe({ tecnicoId: b.tecnicoId });
              const listos = del.filter((i) => !faltante(i, anio, hoy)).length;
              if (!del.length) return null;
              return (
                <li key={b.tecnicoId} className="flex gap-3 border-b border-[var(--color-divider-soft)] pb-1.5">
                  <span className="font-extrabold truncate">{nombreTecnico(b.tecnicoId)}</span>
                  <span className="ml-auto tabular-nums flex-none">
                    {listos} {listos === 1 ? "informe" : "informes"}
                  </span>
                </li>
              );
            })}
          </ul>
          {informes.length > completos ? (
            <p className="mt-3.5 mb-0 text-[13px] text-[var(--color-accent-800)]">
              {informes.length - completos} {informes.length - completos === 1 ? "informe incompleto queda" : "informes incompletos quedan"}{" "}
              en la lista sin guardarse.
            </p>
          ) : null}
        </Dialogo>
      ) : null}

      <Toast texto={toast} variante="panel" />
    </>
  );
}

function Flecha({ abierto }: { abierto: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      className="flex-none transition-transform"
      style={{ transform: `rotate(${abierto ? 0 : -90}deg)` }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function BotonQuitar({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-icon w-8 h-8 flex-none border border-black/[.3]"
      aria-label={label}
      title={label}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

/** Una tienda del cliente con sus informes del año. */
function BloqueTienda({
  tienda,
  nombre,
  informes,
  anio,
  hoy,
  opcMotivos,
  catalogoTrabajos,
  onAlternar,
  onQuitar,
  onAgregarInforme,
  onCambiarInforme,
  onQuitarInforme,
}: {
  tienda: Tienda;
  nombre: string;
  informes: Informe[];
  anio: number;
  hoy: string;
  opcMotivos: { v: string; t: string }[];
  catalogoTrabajos: CatalogoTrabajo[];
  onAlternar: () => void;
  onQuitar: () => void;
  onAgregarInforme: () => void;
  onCambiarInforme: (key: string, cambios: Partial<Informe>) => void;
  onQuitarInforme: (key: string) => void;
}) {
  const incompletos = informes.filter((i) => faltante(i, anio, hoy)).length;

  return (
    <div className="border-t border-black/[.3] ml-3.5 sm:ml-6 border-l-2 border-l-[var(--color-divider)]">
      <div className="flex items-center gap-2 px-3.5 py-2">
        <button
          type="button"
          aria-expanded={tienda.abierto}
          onClick={onAlternar}
          className="flex-1 min-w-0 flex items-center gap-2.5 min-h-9 bg-transparent border-0 cursor-pointer text-[var(--color-text)] text-left"
        >
          <Flecha abierto={tienda.abierto} />
          <span className="font-extrabold text-[14px] truncate">{nombre}</span>
          <span className="text-[11px] tracking-[.06em] uppercase opacity-66 tabular-nums flex-none">
            {informes.length} {informes.length === 1 ? "informe" : "informes"}
          </span>
          {incompletos ? <span className="tag tag-accent flex-none">{incompletos} sin completar</span> : null}
        </button>
        <BotonQuitar label={`Quitar ${nombre} y sus informes`} onClick={onQuitar} />
      </div>

      {tienda.abierto ? (
        <div className="px-3.5 pb-3">
          {informes.map((inf, i) => (
            <FilaInforme
              key={inf.key}
              n={i + 1}
              informe={inf}
              anio={anio}
              hoy={hoy}
              opcMotivos={opcMotivos}
              catalogoTrabajos={catalogoTrabajos}
              onCambiar={onCambiarInforme}
              onQuitar={onQuitarInforme}
            />
          ))}
          <button type="button" onClick={onAgregarInforme} className="btn btn-secondary min-h-9 px-3 text-[13px] mt-2.5">
            + Agregar informe en {nombre}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Un informe: cuándo, por qué, quién firmó y qué dice. */
function FilaInforme({
  n,
  informe: inf,
  anio,
  hoy,
  opcMotivos,
  catalogoTrabajos,
  onCambiar,
  onQuitar,
}: {
  n: number;
  informe: Informe;
  anio: number;
  hoy: string;
  opcMotivos: { v: string; t: string }[];
  catalogoTrabajos: CatalogoTrabajo[];
  onCambiar: (key: string, cambios: Partial<Informe>) => void;
  onQuitar: (key: string) => void;
}) {
  const id = (k: string) => `pp-${inf.key}-${k}`;
  const poner = (k: keyof Informe) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onCambiar(inf.key, { [k]: e.target.value });
  const errorRut = mensajeRut(inf.rut);
  const hoyAnio = Number(hoy.slice(0, 4));
  const hoyMes = Number(hoy.slice(5, 7));
  // En el año en curso no se ofrecen meses que todavía no llegan.
  const meses = MESES.map((m, i) => ({ v: dos(i + 1), t: m })).filter((_, i) => anio < hoyAnio || i + 1 <= hoyMes);
  const dias = Array.from({ length: diasDelMes(anio, inf.mes) }, (_, i) => dos(i + 1));

  return (
    <div
      className="mt-2.5 border border-black/[.2] p-3"
      style={inf.error ? { background: "var(--color-accent-100)" } : { background: "var(--color-surface-3)" }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <span className="w-6 h-6 mb-2.5 flex-none grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-[11px] tabular-nums">
          {n}
        </span>
        <div className="field w-[150px]">
          <label htmlFor={id("mes")}>Mes</label>
          <select id={id("mes")} value={inf.mes} onChange={poner("mes")} className="input appearance-none">
            <option value="">Mes…</option>
            {meses.map((m) => (
              <option key={m.v} value={m.v}>
                {m.t}
              </option>
            ))}
          </select>
        </div>
        <div className="field w-[90px]">
          <label htmlFor={id("dia")}>Día</label>
          <select id={id("dia")} value={inf.dia} onChange={poner("dia")} className="input appearance-none tabular-nums">
            <option value="">Día…</option>
            {dias.map((d) => (
              <option key={d} value={d}>
                {Number(d)}
              </option>
            ))}
          </select>
        </div>
        <div className="field flex-1 min-w-[200px]">
          <label htmlFor={id("motivo")}>Motivo</label>
          <SelectBuscable
            id={id("motivo")}
            valor={inf.motivo}
            opciones={opcMotivos}
            onChange={(v) =>
              // Los trabajos que no van con el motivo nuevo se sueltan.
              onCambiar(inf.key, {
                motivo: v,
                trabajos: (inf.trabajos ?? []).filter((t) => {
                  const c = catalogoTrabajos.find((x) => x.codigo === t.codigo);
                  return c ? trabajoVaConMotivo(c, v) : false;
                }),
              })
            }
            placeholder="Escribe para buscar el motivo…"
            ariaLabel="Motivo"
          />
        </div>
        <div className="mb-1 ml-auto">
          <BotonQuitar label={`Quitar el informe ${n}`} onClick={() => onQuitar(inf.key)} />
        </div>
      </div>

      {inf.motivo ? (
        <TrabajosDelInforme
          motivo={inf.motivo}
          trabajos={inf.trabajos ?? []}
          catalogo={catalogoTrabajos}
          onCambiar={(trabajos) => onCambiar(inf.key, { trabajos })}
        />
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_170px_minmax(0,2fr)] gap-3 mt-3 sm:pl-9">
        <div className="field min-w-0">
          <label htmlFor={id("firmante")}>Firmó</label>
          <input
            id={id("firmante")}
            value={inf.firmante}
            onChange={poner("firmante")}
            placeholder="Nombre de quien firmó"
            autoComplete="off"
            className="input"
          />
        </div>
        <div className="field min-w-0">
          <label htmlFor={id("rut")}>RUT (opcional)</label>
          <input
            id={id("rut")}
            value={inf.rut}
            onChange={(e) => onCambiar(inf.key, { rut: fmtRut(e.target.value) })}
            placeholder="12.345.678-9"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="input tabular-nums"
          />
          {errorRut ? (
            <div className="text-[11px] leading-[1.4] mt-1.5 text-[var(--color-accent-800)]">
              {errorRut} Se guarda igual, tal como está en el papel.
            </div>
          ) : null}
        </div>
        <div className="field min-w-0 sm:col-span-2 lg:col-span-1">
          <label htmlFor={id("descripcion")}>Descripción / detalle</label>
          <textarea
            id={id("descripcion")}
            rows={2}
            value={inf.descripcion}
            onChange={poner("descripcion")}
            placeholder="Lo que dice el informe: el detalle de lo que se hizo o se encontró."
            className="input min-h-[42px] px-3 py-2 resize-y leading-[1.45]"
          />
        </div>
      </div>

      {inf.error || inf.repetida ? (
        <div className="mt-2 sm:pl-9 flex items-center gap-3 flex-wrap text-[12px] text-[var(--color-accent-800)]">
          {inf.error ? <span>{inf.error}</span> : null}
          {inf.repetida ? (
            <label className="flex items-center gap-1.5 cursor-pointer text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={Boolean(inf.aunqueRepetida)}
                onChange={(e) => onCambiar(inf.key, { aunqueRepetida: e.target.checked })}
              />
              Es otro informe: guardarlo igual
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Los trabajos del checklist que van con el motivo, como en el acta del
 * celular: se marca el trabajo y se despliegan sus subtrabajos para marcar lo
 * que se hizo, con cantidad donde el checklist la pide. Es opcional: la
 * descripción sigue estando para el detalle.
 */
function TrabajosDelInforme({
  motivo,
  trabajos,
  catalogo,
  onCambiar,
}: {
  motivo: string;
  trabajos: TrabajoPapel[];
  catalogo: CatalogoTrabajo[];
  onCambiar: (trabajos: TrabajoPapel[]) => void;
}) {
  const delMotivo = trabajosDelMotivo(catalogo, motivo);
  if (delMotivo.length === 0) return null;

  const marcado = (codigo: string) => trabajos.find((t) => t.codigo === codigo);
  const alternarTrabajo = (codigo: string) =>
    onCambiar(marcado(codigo) ? trabajos.filter((t) => t.codigo !== codigo) : [...trabajos, { codigo, subs: [] }]);
  const cambiarSubs = (codigo: string, subs: TrabajoPapel["subs"]) =>
    onCambiar(trabajos.map((t) => (t.codigo === codigo ? { ...t, subs } : t)));

  return (
    <div className="mt-3 sm:pl-9">
      <div className="text-[11px] tracking-[.09em] uppercase opacity-62 mb-1.5">Trabajos realizados (opcional)</div>
      <div className="flex flex-wrap gap-1.5">
        {delMotivo.map((t) => (
          <Chip key={t.codigo} activo={Boolean(marcado(t.codigo))} fuerte onClick={() => alternarTrabajo(t.codigo)}>
            {t.nombre}
          </Chip>
        ))}
      </div>

      {delMotivo
        .filter((t) => marcado(t.codigo) && t.subtrabajos.some((x) => x.activo))
        .map((t) => {
          const subs = marcado(t.codigo)!.subs;
          return (
            <div key={t.codigo} className="mt-2.5 pl-3 border-l-2 border-[var(--color-accent)]">
              <div className="text-[11px] tracking-[.06em] uppercase mb-1.5">
                <span className="font-extrabold">{t.nombre}</span>
                <span className="opacity-62"> · {t.grupoLabel ?? "Subtrabajos"}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {t.subtrabajos
                  .filter((x) => x.activo)
                  .map((x) => {
                    const sub = subs.find((y) => y.etiqueta === x.etiqueta);
                    return (
                      <div key={x.id} className="flex items-stretch">
                        <Chip
                          activo={Boolean(sub)}
                          onClick={() =>
                            cambiarSubs(
                              t.codigo,
                              sub
                                ? subs.filter((y) => y.etiqueta !== x.etiqueta)
                                : [...subs, { etiqueta: x.etiqueta, cantidad: 1 }]
                            )
                          }
                        >
                          {x.etiqueta}
                        </Chip>
                        {sub && x.permiteCantidad ? (
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={sub.cantidad}
                            aria-label={`Cantidad de ${x.etiqueta}`}
                            onChange={(e) =>
                              cambiarSubs(
                                t.codigo,
                                subs.map((y) =>
                                  y.etiqueta === x.etiqueta
                                    ? { ...y, cantidad: Math.min(99, Math.max(1, Number(e.target.value) || 1)) }
                                    : y
                                )
                              )
                            }
                            className="w-14 -ml-px px-2 border border-[var(--color-accent)] bg-[var(--color-surface)] text-[13px] tabular-nums text-center"
                          />
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            </div>
          );
        })}
    </div>
  );
}

function Chip({
  activo,
  fuerte = false,
  onClick,
  children,
}: {
  activo: boolean;
  /** Los trabajos van en negro al marcarse; los subtrabajos, en el acento. */
  fuerte?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={activo}
      onClick={onClick}
      className="min-h-8 px-2.5 flex items-center gap-1.5 text-[13px] leading-[1.2] cursor-pointer text-left"
      style={{
        background: activo ? (fuerte ? "var(--color-text)" : "var(--color-accent-100)") : "var(--color-surface)",
        color: activo && fuerte ? "var(--color-bg)" : "var(--color-text)",
        border: `1px solid ${activo ? (fuerte ? "var(--color-text)" : "var(--color-accent)") : "rgba(32,30,29,.35)"}`,
        fontWeight: activo ? 800 : 400,
      }}
    >
      {activo ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4">
          <path d="M4 12l5 5L20 6" />
        </svg>
      ) : null}
      {children}
    </button>
  );
}
