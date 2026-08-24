"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import Confirmar, { type ConfirmarCfg } from "@/components/admin/Confirmar";
import { Toast, useToast } from "@/components/ui/Toast";
import {
  actualizarTipoProblemaAction,
  actualizarTrabajoAction,
  crearMotivoAction,
  crearOpcionProblemaAction,
  crearSubtrabajoAction,
  crearTipoProblemaAction,
  crearTrabajoAction,
  eliminarMotivoAction,
  eliminarOpcionProblemaAction,
  eliminarSubtrabajoAction,
  eliminarTipoProblemaAction,
  eliminarTrabajoAction,
  renombrarMotivoAction,
  renombrarOpcionProblemaAction,
  renombrarSubtrabajoAction,
  restaurarCatalogoAction,
} from "@/app/actions/admin";
import type { CatalogoMotivo, CatalogoProblema, CatalogoTrabajo } from "@/lib/types";

/**
 * Editor de las tres listas. Cada cambio se escribe en SQL Server: el estado
 * local existe solo para que el input responda mientras se teclea. Los nombres
 * se graban al salir del campo (blur), no en cada tecla, para no lanzar una
 * consulta por letra.
 */
export default function ChecklistEditor({
  motivosIniciales,
  tiposIniciales,
  trabajosIniciales,
}: {
  motivosIniciales: CatalogoMotivo[];
  tiposIniciales: CatalogoProblema[];
  trabajosIniciales: CatalogoTrabajo[];
}) {
  const router = useRouter();
  const { toast, aviso } = useToast();
  const [motivos, setMotivos] = useState(motivosIniciales);
  const [tipos, setTipos] = useState(tiposIniciales);
  const [trabajos, setTrabajos] = useState(trabajosIniciales);
  const [abiertoTipo, setAbiertoTipo] = useState<number | null>(null);
  const [abiertoTrabajo, setAbiertoTrabajo] = useState<number | null>(null);
  const [confirmar, setConfirmar] = useState<ConfirmarCfg | null>(null);

  // Tras un router.refresh() llegan las listas recién consultadas: el estado
  // local se resincroniza con lo que quedó realmente en la base.
  useEffect(() => setMotivos(motivosIniciales), [motivosIniciales]);
  useEffect(() => setTipos(tiposIniciales), [tiposIniciales]);
  useEffect(() => setTrabajos(trabajosIniciales), [trabajosIniciales]);

  /**
   * Texto con el que quedó cada campo en la base.
   *
   * Hay que compararlo contra esto y NO contra el estado local: al teclear,
   * onChange ya actualizó el estado, así que para cuando salta el blur el valor
   * "anterior" es idéntico al nuevo y ningún cambio se detectaría jamás.
   */
  const guardado = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const m = guardado.current;
    for (const x of motivosIniciales) m.set(`motivo:${x.id}`, x.nombre);
    for (const t of tiposIniciales) {
      m.set(`tipo:${t.id}`, t.nombre);
      m.set(`tipo-grupo:${t.id}`, t.grupoLabel ?? "");
      for (const o of t.opciones) m.set(`opcion:${o.id}`, o.etiqueta);
    }
    for (const t of trabajosIniciales) {
      m.set(`trabajo:${t.id}`, t.nombre);
      m.set(`trabajo-grupo:${t.id}`, t.grupoLabel ?? "");
      for (const s of t.subtrabajos) m.set(`subtrabajo:${s.id}`, s.etiqueta);
    }
  }, [motivosIniciales, tiposIniciales, trabajosIniciales]);

  /** Corre la acción; si falla, avisa y devuelve la lista al estado del servidor. */
  async function persistir(
    accion: () => Promise<{ ok: boolean; error?: string }>,
    opciones: { refrescar?: boolean; exito?: string } = {}
  ): Promise<boolean> {
    const res = await accion();
    if (!res.ok) {
      aviso(res.error ?? "No se pudo guardar el cambio");
      router.refresh();
      return false;
    }
    if (opciones.exito) aviso(opciones.exito);
    if (opciones.refrescar !== false) router.refresh();
    return true;
  }

  /**
   * Guarda un campo de texto al salir de él, solo si de verdad cambió respecto
   * de lo que hay en la base.
   */
  function guardarTexto(
    clave: string,
    valor: string,
    accion: (v: string) => Promise<{ ok: boolean; error?: string }>,
    opciones: { permitirVacio?: boolean } = {}
  ) {
    const limpio = valor.trim();
    if (!limpio && !opciones.permitirVacio) return;
    if (guardado.current.get(clave) === limpio) return;
    void (async () => {
      if (await persistir(() => accion(limpio), { refrescar: false })) {
        guardado.current.set(clave, limpio);
      }
    })();
  }

  async function agregarMotivo() {
    const res = await crearMotivoAction("Nuevo motivo");
    if (!res.ok || !res.fila) return aviso(res.error ?? "No se pudo agregar el motivo");
    guardado.current.set(`motivo:${res.fila.id}`, res.fila.nombre);
    setMotivos((prev) => [...prev, res.fila!]);
    aviso("Motivo agregado · cámbiale el nombre");
  }

  async function agregarTipo() {
    const res = await crearTipoProblemaAction("Nuevo tipo de problema");
    if (!res.ok || !res.fila) return aviso(res.error ?? "No se pudo agregar el tipo");
    guardado.current.set(`tipo:${res.fila.id}`, res.fila.nombre);
    guardado.current.set(`tipo-grupo:${res.fila.id}`, "");
    setTipos((prev) => [res.fila!, ...prev]);
    setAbiertoTipo(res.fila.id);
    aviso("Tipo agregado · cámbiale el nombre y sus subdetalles");
  }

  async function agregarTrabajo() {
    const res = await crearTrabajoAction("Nuevo trabajo");
    if (!res.ok || !res.fila) return aviso(res.error ?? "No se pudo agregar el trabajo");
    guardado.current.set(`trabajo:${res.fila.id}`, res.fila.nombre);
    guardado.current.set(`trabajo-grupo:${res.fila.id}`, "");
    setTrabajos((prev) => [res.fila!, ...prev]);
    setAbiertoTrabajo(res.fila.id);
    aviso("Trabajo agregado · cámbiale el nombre y sus subtrabajos");
  }

  function restaurar() {
    setConfirmar({
      titulo: "¿Restaurar el catálogo por defecto?",
      texto:
        "Vuelven los motivos, tipos de problema y trabajos de fábrica, con sus subdetalles. " +
        "Lo que hayas agregado por tu cuenta se mantiene; lo de fábrica que hayas renombrado o quitado vuelve a su nombre original.",
      cta: "Restaurar catálogo",
      accion: async () => {
        await persistir(() => restaurarCatalogoAction(), {
          exito: "Checklists restaurados al catálogo por defecto",
        });
        setAbiertoTipo(null);
        setAbiertoTrabajo(null);
      },
    });
  }

  return (
    <>
      <AdminHeader kicker="Maestros · listas que ve el técnico en terreno" title="Checklist" />

      <div className="px-7 pt-6 pb-12 animate-fade-in max-w-[1000px]">
        <p className="mb-6.5 text-[13px] leading-[1.65] opacity-72 max-w-[74ch]">
          Acá vive todo lo que el técnico elige desde listas en su celular. Cada bloque es una lista distinta.
        </p>

        {/* Lista 1 · Motivos */}
        <Bloque
          numero="Lista 1"
          titulo="Motivo de la visita"
          bajada="Lo que el técnico elige al abrir la ficha. Sin subdetalles."
          cta="Nuevo motivo"
          onAgregar={agregarMotivo}
        >
          <div className="flex flex-col gap-2 max-w-[620px]">
            {motivos.map((m, i) => (
              <div key={m.id} className="flex items-center gap-2.5">
                <Numero n={i + 1} />
                <input
                  value={m.nombre}
                  onChange={(e) =>
                    setMotivos((prev) => prev.map((x) => (x.id === m.id ? { ...x, nombre: e.target.value } : x)))
                  }
                  onBlur={(e) =>
                    guardarTexto(`motivo:${m.id}`, e.target.value, (v) => renombrarMotivoAction(m.id, v))
                  }
                  placeholder="Ej: Calibración de las antenas"
                  className="input flex-1 min-w-0 bg-[var(--color-surface-3)]"
                  aria-label="Nombre del motivo"
                />
                <button
                  onClick={() =>
                    setConfirmar({
                      titulo: "¿Eliminar este motivo?",
                      texto: `«${m.nombre}» dejará de aparecer en el celular del técnico. Las visitas ya registradas con este motivo no se modifican.`,
                      cta: "Eliminar motivo",
                      accion: async () => {
                        setMotivos((prev) => prev.filter((x) => x.id !== m.id));
                        await persistir(() => eliminarMotivoAction(m.id), {
                          exito: `«${m.nombre}» ya no aparece como motivo`,
                        });
                      },
                    })
                  }
                  className="btn btn-icon w-10 h-10 flex-none border border-black/[.3]"
                  aria-label="Eliminar motivo"
                >
                  <IconoBasura />
                </button>
              </div>
            ))}
            {motivos.length === 0 ? (
              <Vacio>Sin motivos: el técnico no podría clasificar la visita.</Vacio>
            ) : null}
          </div>
        </Bloque>

        {/* Lista 2 · Tipos de problema */}
        <Bloque
          numero="Lista 2"
          titulo="Tipos de problema"
          bajada="Lo que el técnico elige al levantar un problema. Despliega un tipo para editar sus subdetalles; sin subdetalles, el técnico escribe con sus palabras qué encontró."
          cta="Nuevo tipo"
          onAgregar={agregarTipo}
        >
          {tipos.map((t, i) => (
            <Desplegable
              key={t.id}
              n={i + 1}
              nombre={t.nombre}
              phNombre="Ej: Antena no detecta etiquetas"
              abierto={abiertoTipo === t.id}
              resumen={
                t.opciones.length
                  ? `${t.opciones.length} ${t.opciones.length === 1 ? "subdetalle" : "subdetalles"}`
                  : "Sin subdetalle · el técnico escribe qué encontró"
              }
              labelToggle={abiertoTipo === t.id ? "Ocultar subdetalles" : "Ver subdetalles"}
              onToggle={() => setAbiertoTipo(abiertoTipo === t.id ? null : t.id)}
              onNombre={(v) => setTipos((prev) => prev.map((x) => (x.id === t.id ? { ...x, nombre: v } : x)))}
              onNombreCommit={(v) =>
                guardarTexto(`tipo:${t.id}`, v, (nombre) => actualizarTipoProblemaAction(t.id, { nombre }))
              }
              onEliminar={() =>
                setConfirmar({
                  titulo: "¿Eliminar este tipo de problema?",
                  texto: `«${t.nombre}» y sus ${t.opciones.length} subdetalles dejarán de aparecer en el celular del técnico. Los problemas ya levantados con este tipo no se modifican.`,
                  cta: "Eliminar tipo",
                  accion: async () => {
                    setTipos((prev) => prev.filter((x) => x.id !== t.id));
                    await persistir(() => eliminarTipoProblemaAction(t.id), {
                      exito: `«${t.nombre}» ya no aparece en el celular`,
                    });
                  },
                })
              }
              ariaEliminar="Eliminar tipo de problema"
              tituloSub="Título del subdetalle"
              phSub="Ej: Cable dañado"
              valorSub={t.grupoLabel ?? ""}
              onSub={(v) => setTipos((prev) => prev.map((x) => (x.id === t.id ? { ...x, grupoLabel: v } : x)))}
              onSubCommit={(v) =>
                guardarTexto(
                  `tipo-grupo:${t.id}`,
                  v,
                  (grupoLabel) => actualizarTipoProblemaAction(t.id, { grupoLabel: grupoLabel || null }),
                  { permitirVacio: true }
                )
              }
              opciones={t.opciones.map((o) => ({ id: o.id, etiqueta: o.etiqueta }))}
              vacioSub="Sin subdetalles: en el celular este tipo pide directamente una descripción escrita."
              ariaOpcion="Subdetalle"
              phNueva="Ej: Cable de slave a master"
              onCambiarOpcion={(oid, v) =>
                setTipos((prev) =>
                  prev.map((x) =>
                    x.id === t.id
                      ? { ...x, opciones: x.opciones.map((op) => (op.id === oid ? { ...op, etiqueta: v } : op)) }
                      : x
                  )
                )
              }
              onCommitOpcion={(oid, v) =>
                guardarTexto(`opcion:${oid}`, v, (etiqueta) => renombrarOpcionProblemaAction(oid, etiqueta))
              }
              onQuitarOpcion={(oid, etiqueta) =>
                setConfirmar({
                  titulo: "¿Quitar este subdetalle?",
                  texto: `«${etiqueta}» dejará de aparecer dentro de «${t.nombre}».`,
                  cta: "Quitar subdetalle",
                  accion: async () => {
                    setTipos((prev) =>
                      prev.map((x) => (x.id === t.id ? { ...x, opciones: x.opciones.filter((op) => op.id !== oid) } : x))
                    );
                    await persistir(() => eliminarOpcionProblemaAction(oid));
                  },
                })
              }
              onAgregarOpcion={(v) => {
                if (!v.trim()) return aviso("Escribe el subdetalle antes de agregarlo");
                if (t.opciones.some((o) => o.etiqueta.toLowerCase() === v.trim().toLowerCase())) {
                  return aviso("Ese subdetalle ya está en la lista");
                }
                void (async () => {
                  const res = await crearOpcionProblemaAction(t.id, v.trim());
                  if (!res.ok || !res.fila) return aviso(res.error ?? "No se pudo agregar el subdetalle");
                  // El técnico necesita un título para el grupo: si no lo pusieron,
                  // se deja uno genérico al aparecer el primer subdetalle.
                  if (!t.grupoLabel) await actualizarTipoProblemaAction(t.id, { grupoLabel: "Detalle" });
                  router.refresh();
                })();
                return true;
              }}
            />
          ))}
          {tipos.length === 0 ? (
            <Vacio grande>
              No hay tipos de problema. El técnico no podrá clasificar lo que encuentre hasta que agregues al menos uno.
            </Vacio>
          ) : null}
        </Bloque>

        {/* Lista 3 · Trabajos realizados */}
        <Bloque
          numero="Lista 3"
          titulo="Trabajos realizados"
          bajada="Lo que el técnico agrega en «Agregar trabajo realizado». Despliega un trabajo para editar sus subtrabajos; sin subtrabajos, el técnico solo escribe un detalle."
          cta="Nuevo trabajo"
          onAgregar={agregarTrabajo}
        >
          {trabajos.map((t, i) => (
            <Desplegable
              key={t.id}
              n={i + 1}
              nombre={t.nombre}
              phNombre="Ej: Calibración de antenas"
              abierto={abiertoTrabajo === t.id}
              resumen={
                t.subtrabajos.length
                  ? `${t.subtrabajos.length} ${t.subtrabajos.length === 1 ? "subtrabajo" : "subtrabajos"}`
                  : "Sin subtrabajo · solo detalle escrito"
              }
              labelToggle={abiertoTrabajo === t.id ? "Ocultar subtrabajos" : "Ver subtrabajos"}
              onToggle={() => setAbiertoTrabajo(abiertoTrabajo === t.id ? null : t.id)}
              onNombre={(v) => setTrabajos((prev) => prev.map((x) => (x.id === t.id ? { ...x, nombre: v } : x)))}
              onNombreCommit={(v) =>
                guardarTexto(`trabajo:${t.id}`, v, (nombre) => actualizarTrabajoAction(t.id, { nombre }))
              }
              onEliminar={() =>
                setConfirmar({
                  titulo: "¿Eliminar este trabajo?",
                  texto: `«${t.nombre}» y sus ${t.subtrabajos.length} subtrabajos dejarán de aparecer en el celular del técnico. Las actas ya firmadas no se modifican.`,
                  cta: "Eliminar trabajo",
                  accion: async () => {
                    setTrabajos((prev) => prev.filter((x) => x.id !== t.id));
                    await persistir(() => eliminarTrabajoAction(t.id), {
                      exito: `«${t.nombre}» ya no aparece en el celular`,
                    });
                  },
                })
              }
              ariaEliminar="Eliminar trabajo"
              tituloSub="Título del subtrabajo"
              phSub="Ej: Repuesto cambiado"
              valorSub={t.grupoLabel ?? ""}
              onSub={(v) => setTrabajos((prev) => prev.map((x) => (x.id === t.id ? { ...x, grupoLabel: v } : x)))}
              onSubCommit={(v) =>
                guardarTexto(
                  `trabajo-grupo:${t.id}`,
                  v,
                  (grupoLabel) => actualizarTrabajoAction(t.id, { grupoLabel: grupoLabel || null }),
                  { permitirVacio: true }
                )
              }
              opciones={t.subtrabajos.map((o) => ({ id: o.id, etiqueta: o.etiqueta }))}
              vacioSub="Sin subtrabajos: en el celular este trabajo se agrega directo, con detalle escrito opcional."
              ariaOpcion="Subtrabajo"
              phNueva="Ej: Tarjeta electrónica"
              onCambiarOpcion={(oid, v) =>
                setTrabajos((prev) =>
                  prev.map((x) =>
                    x.id === t.id
                      ? { ...x, subtrabajos: x.subtrabajos.map((s) => (s.id === oid ? { ...s, etiqueta: v } : s)) }
                      : x
                  )
                )
              }
              onCommitOpcion={(oid, v) =>
                guardarTexto(`subtrabajo:${oid}`, v, (etiqueta) => renombrarSubtrabajoAction(oid, etiqueta))
              }
              onQuitarOpcion={(oid, etiqueta) =>
                setConfirmar({
                  titulo: "¿Quitar este subtrabajo?",
                  texto: `«${etiqueta}» dejará de aparecer dentro de «${t.nombre}».`,
                  cta: "Quitar subtrabajo",
                  accion: async () => {
                    setTrabajos((prev) =>
                      prev.map((x) =>
                        x.id === t.id ? { ...x, subtrabajos: x.subtrabajos.filter((s) => s.id !== oid) } : x
                      )
                    );
                    await persistir(() => eliminarSubtrabajoAction(oid));
                  },
                })
              }
              onAgregarOpcion={(v) => {
                if (!v.trim()) return aviso("Escribe el subtrabajo antes de agregarlo");
                if (t.subtrabajos.some((o) => o.etiqueta.toLowerCase() === v.trim().toLowerCase())) {
                  return aviso("Ese subtrabajo ya está en la lista");
                }
                void (async () => {
                  const res = await crearSubtrabajoAction(t.id, v.trim());
                  if (!res.ok || !res.fila) return aviso(res.error ?? "No se pudo agregar el subtrabajo");
                  if (!t.grupoLabel) await actualizarTrabajoAction(t.id, { grupoLabel: "Subtrabajo" });
                  router.refresh();
                })();
                return true;
              }}
            />
          ))}
          {trabajos.length === 0 ? (
            <Vacio grande>
              No hay trabajos. El técnico no podrá registrar qué hizo en la tienda hasta que agregues al menos uno.
            </Vacio>
          ) : null}
        </Bloque>

        <div className="flex items-center gap-3.5 mt-5.5 pt-4.5 border-t border-[var(--color-divider-soft)] flex-wrap">
          <button className="btn btn-secondary border border-black/[.3]" onClick={restaurar}>
            Restaurar catálogo por defecto
          </button>
          <span className="text-xs opacity-62">
            Los cambios se guardan solos y viajan al celular del técnico en la próxima sincronización.
          </span>
        </div>
      </div>

      {confirmar ? <Confirmar cfg={confirmar} onCerrar={() => setConfirmar(null)} /> : null}
      <Toast texto={toast} variante="panel" />
    </>
  );
}

function Bloque({
  numero,
  titulo,
  bajada,
  cta,
  onAgregar,
  children,
}: {
  numero: string;
  titulo: string;
  bajada: string;
  cta: string;
  onAgregar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t-2 border-[var(--color-divider)] pt-4 mb-11">
      <div className="flex items-end gap-3.5 flex-wrap mb-4">
        <div className="min-w-0">
          <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">{numero}</div>
          <h2 className="font-extrabold text-[21px] leading-[1.15] tracking-[-.02em] mt-1.5 mb-1">{titulo}</h2>
          <p className="m-0 text-[13px] opacity-68 max-w-[64ch]">{bajada}</p>
        </div>
        <button className="btn btn-secondary ml-auto min-h-10 px-3.5 text-[13px]" onClick={onAgregar}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>{cta}</span>
        </button>
      </div>
      {children}
    </div>
  );
}

/** Fila de un tipo/trabajo con sus subdetalles escondidos tras "Ver…". */
function Desplegable({
  n,
  nombre,
  phNombre,
  abierto,
  resumen,
  labelToggle,
  onToggle,
  onNombre,
  onNombreCommit,
  onEliminar,
  ariaEliminar,
  tituloSub,
  phSub,
  valorSub,
  onSub,
  onSubCommit,
  opciones,
  vacioSub,
  ariaOpcion,
  phNueva,
  onCambiarOpcion,
  onCommitOpcion,
  onQuitarOpcion,
  onAgregarOpcion,
}: {
  n: number;
  nombre: string;
  phNombre: string;
  abierto: boolean;
  resumen: string;
  labelToggle: string;
  onToggle: () => void;
  onNombre: (v: string) => void;
  /** Se dispara al salir del campo: es cuando se escribe en la base. */
  onNombreCommit: (v: string) => void;
  onEliminar: () => void;
  ariaEliminar: string;
  tituloSub: string;
  phSub: string;
  valorSub: string;
  onSub: (v: string) => void;
  onSubCommit: (v: string) => void;
  opciones: { id: number; etiqueta: string }[];
  vacioSub: string;
  ariaOpcion: string;
  phNueva: string;
  onCambiarOpcion: (id: number, v: string) => void;
  onCommitOpcion: (id: number, v: string) => void;
  onQuitarOpcion: (id: number, etiqueta: string) => void;
  onAgregarOpcion: (v: string) => unknown;
}) {
  const [nueva, setNueva] = useState("");

  return (
    <div className="border border-black/[.35] mb-2.5 bg-[var(--color-surface-3)]">
      <div
        className="flex items-center gap-2.5 flex-wrap px-3 py-2.5"
        style={{ background: abierto ? "#e3e1e0" : "var(--color-surface)" }}
      >
        <Numero n={n} />
        <input
          value={nombre}
          onChange={(e) => onNombre(e.target.value)}
          onBlur={(e) => onNombreCommit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder={phNombre}
          className="input flex-1 min-w-[200px] min-h-10 font-extrabold text-[15px] bg-[var(--color-bg)]"
          aria-label={phNombre}
        />
        <span className="text-[11px] leading-[1.2] tracking-[.06em] uppercase opacity-62">{resumen}</span>
        <button
          onClick={onToggle}
          aria-label={labelToggle}
          className="min-h-[34px] flex items-center gap-2 px-2.5 flex-none bg-transparent border border-black/[.3] cursor-pointer text-[var(--color-text)] text-[11px] leading-none tracking-[.07em] uppercase hover:bg-black/[.07]"
        >
          <span>{labelToggle}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            className="transition-transform duration-150"
            style={{ transform: `rotate(${abierto ? 180 : 0}deg)` }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <button
          onClick={onEliminar}
          className="btn btn-icon w-8.5 h-8.5 flex-none border border-black/[.3]"
          aria-label={ariaEliminar}
        >
          <IconoBasura />
        </button>
      </div>

      {abierto ? (
        <div className="px-3.5 pt-3.5 pb-4 border-t border-black/[.25]">
          <label className="block text-[10px] tracking-[.11em] uppercase opacity-62 mb-1.5">{tituloSub}</label>
          <input
            value={valorSub}
            onChange={(e) => onSub(e.target.value)}
            onBlur={(e) => onSubCommit(e.target.value)}
            placeholder={phSub}
            className="input max-w-[420px] min-h-10 bg-[var(--color-bg)]"
          />

          <div className="flex flex-col gap-2 mt-4 max-w-[520px]">
            {opciones.map((o) => (
              <div key={o.id} className="flex gap-2">
                <input
                  value={o.etiqueta}
                  onChange={(e) => onCambiarOpcion(o.id, e.target.value)}
                  onBlur={(e) => onCommitOpcion(o.id, e.target.value)}
                  placeholder={phNueva}
                  className="input flex-1 min-w-0 min-h-10 bg-[var(--color-bg)]"
                  aria-label={ariaOpcion}
                />
                <button
                  onClick={() => onQuitarOpcion(o.id, o.etiqueta)}
                  className="btn btn-icon w-10 h-10 flex-none border border-black/[.3]"
                  aria-label={`Quitar ${ariaOpcion.toLowerCase()}`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            ))}
            {opciones.length === 0 ? (
              <div className="px-3.5 py-2.5 border border-dashed border-black/[.35] text-[13px] opacity-68">
                {vacioSub}
              </div>
            ) : null}
          </div>

          <div className="flex gap-2 mt-3 max-w-[520px]">
            <input
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (onAgregarOpcion(nueva) === true) setNueva("");
              }}
              placeholder={phNueva}
              className="input flex-1 min-w-0 bg-[var(--color-bg)]"
              aria-label={`Nuevo ${ariaOpcion.toLowerCase()}`}
            />
            <button
              onClick={() => {
                if (onAgregarOpcion(nueva) === true) setNueva("");
              }}
              className="btn btn-secondary shrink-0"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Agregar</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Numero({ n }: { n: number }) {
  return (
    <span className="w-6.5 h-6.5 flex-none grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs tabular-nums">
      {n}
    </span>
  );
}

function Vacio({ children, grande }: { children: React.ReactNode; grande?: boolean }) {
  return (
    <div
      className={`border border-dashed border-black/[.4] opacity-70 ${grande ? "p-6.5 text-sm" : "p-3.5 text-[13px]"}`}
    >
      {children}
    </div>
  );
}

function IconoBasura() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </svg>
  );
}
