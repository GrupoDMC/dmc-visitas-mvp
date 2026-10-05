"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import SelectBuscable from "@/components/ui/SelectBuscable";
import { Toast, useToast } from "@/components/ui/Toast";
import { crearVisitasPapelAction } from "@/app/actions/visitas-papel";
import { useReferencias } from "@/lib/ui/referencias";
import { fmtRut, mensajeRut } from "@/lib/ui/formato";
import { hoyISO } from "@/lib/ui/fecha";
import { PRIMER_ANIO_PAPEL } from "@/lib/ui/papel";
import type { InformePapel } from "@/lib/data/visitas-papel";

/** Un informe en papel mientras se transcribe. */
interface Fila {
  key: string;
  clienteId: string;
  sucursalId: string;
  fecha: string;
  motivo: string;
  tecnicoId: string;
  ayudanteId: string;
  firmante: string;
  rut: string;
  descripcion: string;
  /** Por qué no se guardó la última vez. */
  error?: string;
  /** El error fue que ya existe una visita ese día: se ofrece guardarla igual. */
  repetida?: boolean;
  aunqueRepetida?: boolean;
}

interface Grupo {
  clienteId: string;
  abierto: boolean;
}

interface Borrador {
  anio: number;
  tecnicoDef: string;
  motivoDef: string;
  grupos: Grupo[];
  filas: Fila[];
}

const CLAVE_BORRADOR = "dmc.visitas-papel.borrador";
/** De a cuántos informes se manda al servidor: el avance se ve y nada se corta. */
const TANDA = 40;

let contador = 0;
function nuevaKey(): string {
  contador += 1;
  return `${Date.now().toString(36)}-${contador}`;
}

/** Lo que le falta a una fila para poder guardarse, o null si está completa. */
function faltante(f: Fila, anio: number, hoy: string): string | null {
  if (!f.fecha) return "Falta la fecha.";
  if (!f.fecha.startsWith(`${anio}-`)) return `La fecha no es de ${anio}.`;
  if (f.fecha > hoy) return "La fecha no puede ser futura.";
  if (!f.motivo) return "Falta el motivo.";
  if (!f.tecnicoId) return "Falta el técnico.";
  if (f.ayudanteId && f.ayudanteId === f.tecnicoId) return "El ayudante no puede ser el mismo técnico.";
  if (!f.firmante.trim()) return "Falta quién firmó.";
  const errorRut = mensajeRut(f.rut);
  if (errorRut) return errorRut;
  if (!f.descripcion.trim()) return "Falta la descripción.";
  return null;
}

/** Pasa una fecha a otro año conservando día y mes (el 29 de febrero cae al 28). */
function aOtroAnio(fecha: string, anio: number): string {
  if (!fecha) return fecha;
  const [, m, d] = fecha.split("-");
  const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
  const dia = m === "02" && d === "29" && !bisiesto ? "28" : d;
  return `${anio}-${m}-${dia}`;
}

/**
 * "Visitas en papel": transcribir los informes que se hicieron a mano en años
 * anteriores, lo más rápido posible.
 *
 * Arriba se elige el año y lo que suele repetirse —técnico y motivo—; abajo va
 * un desplegable por cliente con sus sucursales. Cada sucursal agregada es un
 * informe: fecha, quién firmó, RUT y descripción. Una misma sucursal se puede
 * agregar varias veces (una por informe del año) y una fila nueva copia fecha,
 * motivo y técnico de la anterior del mismo cliente, para escribir solo lo que
 * cambia. También se puede partir por un mall: cada tienda cae en el
 * desplegable de su cliente.
 *
 * Lo escrito se guarda en el navegador mientras tanto: cerrar la pestaña no
 * pierde nada. Al guardar, lo que quedó completo entra como visita completada y
 * sale de la lista; lo incompleto se queda marcado con lo que le falta.
 */
export default function VisitasPapel() {
  const router = useRouter();
  const ref = useReferencias();
  const { toast, aviso } = useToast();
  const hoy = hoyISO();
  const anioActual = Number(hoy.slice(0, 4));

  const [anio, setAnio] = useState(anioActual - 1);
  const [tecnicoDef, setTecnicoDef] = useState("");
  const [motivoDef, setMotivoDef] = useState(ref.motivos[0]?.codigo ?? "");
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [mallSel, setMallSel] = useState("");
  const [guardando, setGuardando] = useState<{ hechos: number; total: number } | null>(null);
  const [guardados, setGuardados] = useState<{ folio: string; nombre: string }[]>([]);
  const [cargado, setCargado] = useState(false);
  const foco = useRef<string | null>(null);

  // El borrador se lee recién en el navegador: en el servidor no existe.
  useEffect(() => {
    try {
      const crudo = localStorage.getItem(CLAVE_BORRADOR);
      if (crudo) {
        const b = JSON.parse(crudo) as Borrador;
        if (b.anio) setAnio(b.anio);
        if (b.tecnicoDef !== undefined) setTecnicoDef(b.tecnicoDef);
        if (b.motivoDef) setMotivoDef(b.motivoDef);
        if (Array.isArray(b.grupos)) setGrupos(b.grupos);
        if (Array.isArray(b.filas)) setFilas(b.filas);
      }
    } catch {
      // Sin almacenamiento (ventana privada, bloqueado): se trabaja sin borrador.
    }
    setCargado(true);
  }, []);

  useEffect(() => {
    if (!cargado) return;
    try {
      const b: Borrador = { anio, tecnicoDef, motivoDef, grupos, filas };
      if (grupos.length || filas.length) localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(b));
      else localStorage.removeItem(CLAVE_BORRADOR);
    } catch {
      // Igual que arriba: el borrador es una comodidad, no un requisito.
    }
  }, [cargado, anio, tecnicoDef, motivoDef, grupos, filas]);

  // La fila recién agregada recibe el cursor en su fecha: se agrega y se escribe.
  useEffect(() => {
    if (!foco.current) return;
    document.getElementById(`pp-${foco.current}-fecha`)?.focus();
    foco.current = null;
  }, [filas]);

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
  const nombreCliente = (id: string) => ref.clientes.find((c) => String(c.id) === id)?.nombreFantasia ?? "";
  const sucursal = (id: string) => ref.sucursales.find((s) => String(s.id) === id);

  const clientesLibres = ref.clientes
    .filter((c) => !grupos.some((g) => g.clienteId === String(c.id)))
    .map((c) => ({ v: String(c.id), t: c.activo ? c.nombreFantasia : `${c.nombreFantasia} (inactivo)` }));
  const opcMalls = ref.malls.map((m) => ({ v: String(m.id), t: m.nombre }));
  const tiendasDelMall = mallSel
    ? ref.sucursales
        .filter((s) => String(s.mallId ?? "") === mallSel)
        .map((s) => ({
          v: String(s.id),
          t: `${nombreCliente(String(s.clienteId))} · ${s.nombre}${s.activo ? "" : " (inactiva)"}`,
        }))
    : [];

  const completas = filas.filter((f) => !faltante(f, anio, hoy)).length;

  function abrirGrupo(clienteId: string) {
    setGrupos((prev) =>
      prev.some((g) => g.clienteId === clienteId)
        ? prev.map((g) => (g.clienteId === clienteId ? { ...g, abierto: true } : g))
        : [...prev, { clienteId, abierto: true }]
    );
  }

  /** Agrega un informe por sucursal. Cada uno copia lo de la última fila de su cliente. */
  function agregar(...sucursalIds: string[]) {
    const nuevas: Fila[] = [];
    for (const sucursalId of sucursalIds.filter(Boolean)) {
      const s = sucursal(sucursalId);
      if (!s) continue;
      const clienteId = String(s.clienteId);
      const previa = [...filas, ...nuevas].filter((f) => f.clienteId === clienteId).at(-1);
      nuevas.push({
        key: nuevaKey(),
        clienteId,
        sucursalId,
        fecha: previa?.fecha ?? "",
        motivo: previa?.motivo || motivoDef,
        tecnicoId: previa?.tecnicoId || tecnicoDef,
        ayudanteId: previa?.ayudanteId ?? "",
        firmante: "",
        rut: "",
        descripcion: "",
      });
      abrirGrupo(clienteId);
    }
    if (!nuevas.length) return;
    foco.current = nuevas[0].key;
    setFilas((prev) => [...prev, ...nuevas]);
  }

  /** Otro informe de la misma sucursal, justo debajo: mismo técnico y motivo, sin fecha. */
  function duplicar(f: Fila) {
    const copia: Fila = {
      key: nuevaKey(),
      clienteId: f.clienteId,
      sucursalId: f.sucursalId,
      fecha: "",
      motivo: f.motivo,
      tecnicoId: f.tecnicoId,
      ayudanteId: f.ayudanteId,
      firmante: "",
      rut: "",
      descripcion: "",
    };
    foco.current = copia.key;
    setFilas((prev) => {
      const i = prev.findIndex((x) => x.key === f.key);
      return [...prev.slice(0, i + 1), copia, ...prev.slice(i + 1)];
    });
  }

  function cambiar(key: string, cambios: Partial<Fila>) {
    setFilas((prev) =>
      prev.map((f) => {
        if (f.key !== key) return f;
        if ("aunqueRepetida" in cambios) return { ...f, ...cambios };
        // Al corregir algo, el aviso de la vez anterior deja de aplicar. El de
        // «ya hay una visita ese día» solo cae si cambia la fecha.
        const nueva: Fila = { ...f, ...cambios, error: undefined };
        if ("fecha" in cambios) return { ...nueva, repetida: false, aunqueRepetida: false };
        return nueva;
      })
    );
  }

  function quitar(key: string) {
    setFilas((prev) => prev.filter((f) => f.key !== key));
  }

  function cambiarAnio(nuevo: number) {
    setAnio(nuevo);
    // Lo ya escrito se muda de año: lo normal es haber elegido mal el año, no las fechas.
    setFilas((prev) => prev.map((f) => ({ ...f, fecha: aOtroAnio(f.fecha, nuevo) })));
  }

  function descartarTodo() {
    setFilas([]);
    setGrupos([]);
  }

  async function guardar() {
    const listas = filas.filter((f) => !faltante(f, anio, hoy));
    // Las incompletas quedan marcadas con lo que les falta.
    setFilas((prev) => prev.map((f) => ({ ...f, error: faltante(f, anio, hoy) ?? f.error })));
    if (listas.length === 0) {
      aviso(filas.length ? "Ningún informe está completo todavía: revisa los marcados en rojo." : "Agrega al menos un informe.");
      return;
    }

    setGuardando({ hechos: 0, total: listas.length });
    const hechos: { key: string; folio: string }[] = [];
    const errores = new Map<string, { error: string; repetida: boolean }>();
    for (let i = 0; i < listas.length; i += TANDA) {
      const tanda = listas.slice(i, i + TANDA);
      const informes: InformePapel[] = tanda.map((f) => ({
        clienteId: Number(f.clienteId),
        sucursalId: Number(f.sucursalId),
        tecnicoId: Number(f.tecnicoId),
        tecnicoAyudanteId: f.ayudanteId ? Number(f.ayudanteId) : null,
        motivosCodigos: [f.motivo],
        fecha: f.fecha,
        firmanteNombre: f.firmante.trim(),
        firmanteRut: f.rut.trim() || null,
        descripcion: f.descripcion.trim(),
        aunqueRepetida: Boolean(f.aunqueRepetida),
      }));
      try {
        const res = await crearVisitasPapelAction({ informes });
        res.resultados.forEach((r, j) => {
          if (r.ok && r.folio) hechos.push({ key: tanda[j].key, folio: r.folio });
          else errores.set(tanda[j].key, { error: r.error ?? "No se pudo guardar.", repetida: Boolean(r.repetida) });
        });
      } catch {
        tanda.forEach((f) => errores.set(f.key, { error: "Se cortó la conexión. Vuelve a guardar.", repetida: false }));
      }
      setGuardando({ hechos: Math.min(i + TANDA, listas.length), total: listas.length });
    }
    setGuardando(null);

    const porKey = new Map(hechos.map((h) => [h.key, h.folio]));
    setGuardados((prev) => [
      ...hechos.map((h) => {
        const f = filas.find((x) => x.key === h.key)!;
        return { folio: h.folio, nombre: `${nombreCliente(f.clienteId)} · ${sucursal(f.sucursalId)?.nombre ?? ""}` };
      }),
      ...prev,
    ]);
    setFilas((prev) =>
      prev
        .filter((f) => !porKey.has(f.key))
        .map((f) => {
          const e = errores.get(f.key);
          return e ? { ...f, error: e.error, repetida: e.repetida, aunqueRepetida: false } : f;
        })
    );
    if (hechos.length) router.refresh();

    const quedan = filas.length - hechos.length;
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
          Para pasar al sistema los informes que se hicieron a mano. Cada sucursal que agregas es un informe: entra como
          visita <strong>completada</strong>, con el folio del año del informe, sin fotos, video ni firma dibujada. Una
          sucursal se puede agregar varias veces, una por cada informe. Lo que escribes se guarda en este navegador hasta
          que lo guardes en el sistema.
        </p>

        {/* Lo que se repite en todos */}
        <div className="mt-5 border border-black/[.3]">
          <div className="px-3.5 py-2.5 bg-[var(--color-surface)] border-b border-[var(--color-divider-soft)] font-extrabold text-[11px] tracking-[.11em] uppercase">
            1 · Año y valores por defecto
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3.5">
            <div className="field min-w-0">
              <label htmlFor="pp-anio">Año de los informes</label>
              <select
                id="pp-anio"
                value={anio}
                onChange={(e) => cambiarAnio(Number(e.target.value))}
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
              <label htmlFor="pp-tecnico">Técnico que hizo el trabajo</label>
              <SelectBuscable
                id="pp-tecnico"
                valor={tecnicoDef}
                opciones={opcTecnicos}
                onChange={setTecnicoDef}
                placeholder="Elige el técnico…"
                ariaLabel="Técnico por defecto"
              />
            </div>
            <div className="field min-w-0">
              <label htmlFor="pp-motivo">Motivo</label>
              <select
                id="pp-motivo"
                value={motivoDef}
                onChange={(e) => setMotivoDef(e.target.value)}
                className="input appearance-none"
              >
                {opcMotivos.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.t}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3 -mt-1.5 text-[11px] leading-[1.4] opacity-60">
              Se copian a cada sucursal que agregues; en cada informe se pueden cambiar.
            </div>
          </div>
        </div>

        {/* Elegir clientes o un mall */}
        <div className="mt-5 border border-black/[.3]">
          <div className="px-3.5 py-2.5 bg-[var(--color-surface)] border-b border-[var(--color-divider-soft)] font-extrabold text-[11px] tracking-[.11em] uppercase">
            2 · Clientes y sucursales
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3.5">
            <div className="field min-w-0">
              <label htmlFor="pp-cliente">Agregar cliente</label>
              <SelectBuscable
                id="pp-cliente"
                valor=""
                opciones={clientesLibres}
                onChange={(v) => v && abrirGrupo(v)}
                placeholder={clientesLibres.length ? "Elige y se abre su desplegable…" : "Ya están todos"}
                ariaLabel="Agregar cliente"
              />
            </div>
            <div className="field min-w-0">
              <label htmlFor="pp-mall">O partir por un mall</label>
              <SelectBuscable
                id="pp-mall"
                valor={mallSel}
                opciones={opcMalls}
                onChange={setMallSel}
                placeholder="Elige el mall…"
                ariaLabel="Mall"
              />
            </div>
            <div className="field min-w-0">
              <label htmlFor="pp-tienda">Tienda del mall</label>
              <SelectBuscable
                id="pp-tienda"
                valor=""
                opciones={tiendasDelMall}
                onChange={(v) => agregar(v)}
                placeholder={!mallSel ? "Primero elige el mall" : tiendasDelMall.length ? "Elige y se agrega…" : "Ese mall no tiene tiendas"}
                ariaLabel="Agregar tienda del mall"
              />
            </div>
            {tiendasDelMall.length > 1 ? (
              <div className="sm:col-span-3 -mt-1 flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => agregar(...tiendasDelMall.map((t) => t.v))}
                  className="btn btn-secondary min-h-9 px-3 text-[13px]"
                >
                  Agregar las {tiendasDelMall.length} tiendas del mall
                </button>
                <span className="text-[11px] opacity-60">Cada tienda cae en el desplegable de su cliente.</span>
              </div>
            ) : null}
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

        {grupos.length === 0 ? (
          <div className="mt-5 px-3.5 py-6 border border-dashed border-[var(--color-divider)] text-[13px] opacity-70">
            Todavía no hay clientes. Elige uno arriba —o un mall— y ve agregando sus sucursales.
          </div>
        ) : null}

        {grupos.map((g) => (
          <GrupoCliente
            key={g.clienteId}
            grupo={g}
            nombre={nombreCliente(g.clienteId)}
            filas={filas.filter((f) => f.clienteId === g.clienteId)}
            anio={anio}
            hoy={hoy}
            opcTecnicos={opcTecnicos}
            opcMotivos={opcMotivos}
            opcSucursales={ref.sucursales
              .filter((s) => String(s.clienteId) === g.clienteId)
              .map((s) => ({ v: String(s.id), t: s.activo ? s.nombre : `${s.nombre} (inactiva)` }))}
            nombreSucursal={(id) => sucursal(id)?.nombre ?? ""}
            onAlternar={() =>
              setGrupos((prev) => prev.map((x) => (x.clienteId === g.clienteId ? { ...x, abierto: !x.abierto } : x)))
            }
            onQuitarGrupo={() => setGrupos((prev) => prev.filter((x) => x.clienteId !== g.clienteId))}
            onAgregar={agregar}
            onCambiar={cambiar}
            onDuplicar={duplicar}
            onQuitar={quitar}
          />
        ))}
      </div>

      {/* Barra fija para guardar */}
      {filas.length || guardando ? (
        <div className="fixed bottom-0 right-0 left-0 lg:left-[248px] z-20 bg-[var(--color-bg)] border-t-2 border-[var(--color-divider)] px-4 md:px-7 py-3 flex items-center gap-3 flex-wrap">
          <div className="text-[13px] tabular-nums">
            <strong>{completas}</strong> de {filas.length} {filas.length === 1 ? "informe completo" : "informes completos"}
            {guardando ? (
              <span className="ml-2 opacity-70">
                · guardando {guardando.hechos}/{guardando.total}…
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={descartarTodo}
            disabled={Boolean(guardando)}
            className="btn btn-ghost ml-auto"
          >
            Vaciar la lista
          </button>
          <button type="button" onClick={guardar} disabled={Boolean(guardando) || completas === 0} className="btn btn-primary">
            {guardando ? "Guardando…" : `Guardar ${completas} ${completas === 1 ? "informe" : "informes"}`}
          </button>
        </div>
      ) : null}

      <Toast texto={toast} variante="panel" />
    </>
  );
}

/** El desplegable de un cliente con sus informes. */
function GrupoCliente({
  grupo,
  nombre,
  filas,
  anio,
  hoy,
  opcTecnicos,
  opcMotivos,
  opcSucursales,
  nombreSucursal,
  onAlternar,
  onQuitarGrupo,
  onAgregar,
  onCambiar,
  onDuplicar,
  onQuitar,
}: {
  grupo: Grupo;
  nombre: string;
  filas: Fila[];
  anio: number;
  hoy: string;
  opcTecnicos: { v: string; t: string }[];
  opcMotivos: { v: string; t: string }[];
  opcSucursales: { v: string; t: string }[];
  nombreSucursal: (id: string) => string;
  onAlternar: () => void;
  onQuitarGrupo: () => void;
  onAgregar: (...ids: string[]) => void;
  onCambiar: (key: string, cambios: Partial<Fila>) => void;
  onDuplicar: (f: Fila) => void;
  onQuitar: (key: string) => void;
}) {
  const incompletas = filas.filter((f) => faltante(f, anio, hoy)).length;

  return (
    <div className="mt-5 border-2 border-[var(--color-text)]">
      <div className="flex items-center gap-2 px-3.5 py-2 bg-[var(--color-surface)]">
        <button
          type="button"
          aria-expanded={grupo.abierto}
          onClick={onAlternar}
          className="flex-1 min-w-0 flex items-center gap-2.5 min-h-10 bg-transparent border-0 cursor-pointer text-[var(--color-text)] text-left"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            className="flex-none transition-transform"
            style={{ transform: `rotate(${grupo.abierto ? 0 : -90}deg)` }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span className="font-extrabold text-[16px] truncate">{nombre}</span>
          <span className="text-[11px] tracking-[.06em] uppercase opacity-66 tabular-nums flex-none">
            {filas.length} {filas.length === 1 ? "informe" : "informes"}
          </span>
          {incompletas ? <span className="tag tag-accent flex-none">{incompletas} sin completar</span> : null}
        </button>
        {filas.length === 0 ? (
          <button
            type="button"
            onClick={onQuitarGrupo}
            className="btn btn-icon w-8 h-8 flex-none border border-black/[.3]"
            aria-label={`Quitar ${nombre}`}
            title="Quitar cliente"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ) : null}
      </div>

      {grupo.abierto ? (
        <>
          {filas.map((f, i) => (
            <FilaInforme
              key={f.key}
              n={i + 1}
              fila={f}
              anio={anio}
              hoy={hoy}
              nombreSucursal={nombreSucursal(f.sucursalId)}
              opcTecnicos={opcTecnicos}
              opcMotivos={opcMotivos}
              onCambiar={onCambiar}
              onDuplicar={onDuplicar}
              onQuitar={onQuitar}
            />
          ))}
          <div className="px-3.5 py-3 border-t border-[var(--color-divider-soft)] grid grid-cols-1 sm:grid-cols-[minmax(0,420px)_auto] gap-3 items-end">
            <div className="field min-w-0">
              <label htmlFor={`pp-suc-${grupo.clienteId}`}>Agregar sucursal de {nombre}</label>
              <SelectBuscable
                id={`pp-suc-${grupo.clienteId}`}
                valor=""
                opciones={opcSucursales}
                onChange={(v) => onAgregar(v)}
                placeholder={opcSucursales.length ? "Escribe el nombre y se agrega…" : "Este cliente no tiene sucursales"}
                ariaLabel={`Agregar sucursal de ${nombre}`}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Un informe: la sucursal, cuándo, quién lo hizo, quién firmó y qué dice. */
function FilaInforme({
  n,
  fila: f,
  anio,
  hoy,
  nombreSucursal,
  opcTecnicos,
  opcMotivos,
  onCambiar,
  onDuplicar,
  onQuitar,
}: {
  n: number;
  fila: Fila;
  anio: number;
  hoy: string;
  nombreSucursal: string;
  opcTecnicos: { v: string; t: string }[];
  opcMotivos: { v: string; t: string }[];
  onCambiar: (key: string, cambios: Partial<Fila>) => void;
  onDuplicar: (f: Fila) => void;
  onQuitar: (key: string) => void;
}) {
  const id = (k: string) => `pp-${f.key}-${k}`;
  const poner = (k: keyof Fila) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onCambiar(f.key, { [k]: e.target.value });
  const maxFecha = `${anio}-12-31` < hoy ? `${anio}-12-31` : hoy;
  const errorRut = mensajeRut(f.rut);

  return (
    <div
      className="border-t border-black/[.18] px-3.5 py-3"
      style={f.error ? { background: "var(--color-accent-100)" } : undefined}
    >
      <div className="flex items-center gap-2.5">
        <span className="w-6 h-6 flex-none grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-[11px] tabular-nums">
          {n}
        </span>
        <span className="font-extrabold text-[14px] truncate">{nombreSucursal}</span>
        <div className="ml-auto flex items-center gap-1.5 flex-none">
          <button
            type="button"
            onClick={() => onDuplicar(f)}
            className="btn btn-secondary min-h-8 px-2.5 text-[12px]"
            title="Otro informe de esta misma sucursal"
          >
            + Otro informe aquí
          </button>
          <button
            type="button"
            onClick={() => onQuitar(f.key)}
            className="btn btn-icon w-8 h-8 border border-black/[.3]"
            aria-label={`Quitar el informe de ${nombreSucursal}`}
            title="Quitar"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2.5">
        <div className="field min-w-0">
          <label htmlFor={id("fecha")}>Fecha</label>
          <input
            id={id("fecha")}
            type="date"
            min={`${anio}-01-01`}
            max={maxFecha}
            value={f.fecha}
            onChange={poner("fecha")}
            className="input tabular-nums"
          />
        </div>
        <div className="field min-w-0">
          <label htmlFor={id("motivo")}>Motivo</label>
          <select id={id("motivo")} value={f.motivo} onChange={poner("motivo")} className="input appearance-none">
            {f.motivo ? null : <option value="">Elige…</option>}
            {opcMotivos.map((o) => (
              <option key={o.v} value={o.v}>
                {o.t}
              </option>
            ))}
          </select>
        </div>
        <div className="field min-w-0">
          <label htmlFor={id("tecnico")}>Técnico</label>
          <select id={id("tecnico")} value={f.tecnicoId} onChange={poner("tecnicoId")} className="input appearance-none">
            <option value="">Elige…</option>
            {opcTecnicos.map((o) => (
              <option key={o.v} value={o.v}>
                {o.t}
              </option>
            ))}
          </select>
        </div>
        <div className="field min-w-0">
          <label htmlFor={id("ayudante")}>Ayudante (opcional)</label>
          <select id={id("ayudante")} value={f.ayudanteId} onChange={poner("ayudanteId")} className="input appearance-none">
            <option value="">Sin ayudante</option>
            {opcTecnicos
              .filter((o) => o.v !== f.tecnicoId)
              .map((o) => (
                <option key={o.v} value={o.v}>
                  {o.t}
                </option>
              ))}
          </select>
        </div>
        <div className="field min-w-0">
          <label htmlFor={id("firmante")}>Firmó</label>
          <input
            id={id("firmante")}
            value={f.firmante}
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
            value={f.rut}
            onChange={(e) => onCambiar(f.key, { rut: fmtRut(e.target.value) })}
            placeholder="12.345.678-9"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="input tabular-nums"
          />
          {errorRut ? (
            <div className="text-[11px] leading-[1.4] mt-1.5 text-[var(--color-accent-800)]">{errorRut}</div>
          ) : null}
        </div>
        <div className="field min-w-0 col-span-2">
          <label htmlFor={id("descripcion")}>Descripción del informe</label>
          <textarea
            id={id("descripcion")}
            rows={2}
            value={f.descripcion}
            onChange={poner("descripcion")}
            placeholder="Lo que dice el informe: qué se revisó, qué se hizo, qué se encontró."
            className="input min-h-[42px] px-3 py-2 resize-y leading-[1.45]"
          />
        </div>
      </div>

      {f.error || f.repetida ? (
        <div className="mt-2 flex items-center gap-3 flex-wrap text-[12px] text-[var(--color-accent-800)]">
          {f.error ? <span>{f.error}</span> : null}
          {f.repetida ? (
            <label className="flex items-center gap-1.5 cursor-pointer text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={Boolean(f.aunqueRepetida)}
                onChange={(e) => onCambiar(f.key, { aunqueRepetida: e.target.checked })}
              />
              Es otro informe: guardarlo igual
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
