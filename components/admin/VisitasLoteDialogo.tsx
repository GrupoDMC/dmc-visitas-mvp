"use client";

import { useMemo, useState } from "react";
import Tag from "@/components/Tag";
import Dialogo, { CasillasMultiples, leerChecks, type CampoDef, type FormValores } from "@/components/admin/Dialogo";
import SelectBuscable from "@/components/ui/SelectBuscable";
import { opciones } from "@/components/admin/VisitaDialogos";
import {
  cancelarVisitasAdminAction,
  eliminarVisitasAction,
  modificarVisitasAction,
  type ResultadoLote,
} from "@/app/actions/admin";
import { ESTADO_VISITA_LABEL, ESTADO_VISITA_TAG, textoMotivos } from "@/lib/ui/estado";
import { textoFechaVisita } from "@/lib/ui/fecha";
import { useReferencias } from "@/lib/ui/referencias";
import type { CambiosVisita } from "@/lib/data/visitas-lote";
import type { Visita } from "@/lib/types";

export type AccionLote = "modificar" | "cancelar" | "eliminar";

/** Lo que es solo de una visita del lote. Vacío = usa lo de arriba. */
interface Propio {
  abierto: boolean;
  tecnicoId: string;
  ayudanteId: string;
  fecha: string;
  hora: string;
  motivoCodigo: string;
  trabajo: string;
  acceso: string;
  /** Por qué se cierra, en «Cancelar por admin». */
  motivo: string;
  /** Por qué no se pudo aplicar en el último intento. */
  error?: string;
}

interface Fila {
  visita: Visita;
  propio: Propio;
}

const PROPIOS = ["tecnicoId", "ayudanteId", "fecha", "hora", "motivoCodigo", "trabajo", "acceso", "motivo"] as const;
type CampoPropio = (typeof PROPIOS)[number];

const SIN_PROPIO: Propio = {
  abierto: false,
  tecnicoId: "",
  ayudanteId: "",
  fecha: "",
  hora: "",
  motivoCodigo: "",
  trabajo: "",
  acceso: "",
  motivo: "",
};

/** En el selector del ayudante: dejarla sin ayudante, que no es lo mismo que no cambiar. */
const VA_SOLO = "0";
/** Cuántas visitas van en cada llamada al servidor. */
const TANDA = 20;

const tienePropio = (p: Propio) => PROPIOS.some((k) => p[k].trim() !== "");
const nVisitas = (n: number) => `${n} ${n === 1 ? "visita" : "visitas"}`;

/**
 * "Acciones para múltiples visitas": lo mismo que se hace en el acta de una
 * visita, sobre todas las marcadas en la tabla.
 *
 * Funciona como "Visitas masivas": arriba va lo que es igual para todas y abajo
 * la lista. Cada visita se puede desplegar para darle un valor distinto, que le
 * gana a lo de arriba solo en ella, o quitar del lote. Al editar, lo que queda
 * vacío no cambia: cada visita conserva lo suyo.
 *
 * Si alguna no se puede, las demás quedan hechas y esa se queda en la lista
 * con su explicación.
 */
export default function VisitasLoteDialogo({
  accion,
  visitas,
  onCerrar,
  onHecho,
}: {
  accion: AccionLote;
  visitas: Visita[];
  onCerrar: () => void;
  /** `hechas` son los folios en los que sí quedó aplicado, aunque haya fallado alguna. */
  onHecho: (mensaje: string, hechas: string[]) => void;
}) {
  const ref = useReferencias();
  const opc = useMemo(() => opciones(ref), [ref]);
  const [filas, setFilas] = useState<Fila[]>(() => visitas.map((visita) => ({ visita, propio: SIN_PROPIO })));
  const [form, setForm] = useState<FormValores>({
    tecnicoId: "",
    ayudanteId: "",
    fecha: "",
    hora: "",
    motivoCodigo: "",
    trabajo: "",
    acceso: "",
    motivo: "",
    confirmacion: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [avance, setAvance] = useState(0);

  const n = filas.length;
  const fraseEliminar = `ELIMINAR ${n}`;
  const opcAyudante = (tecnicoId: string) => [
    { v: VA_SOLO, t: "Sin ayudante · va solo" },
    ...opc.tecnicos.filter((t) => t.v !== tecnicoId),
  ];

  const campos: CampoDef[] =
    accion === "modificar"
      ? [
          {
            k: "tecnicoId",
            label: "Técnico asignado · para todas",
            tipo: "select",
            buscable: true,
            opciones: [{ v: "", t: "No cambiar" }, ...opc.tecnicos],
          },
          {
            k: "ayudanteId",
            label: "Técnico ayudante · para todas",
            tipo: "select",
            buscable: true,
            opciones: [{ v: "", t: "No cambiar" }, ...opcAyudante(String(form.tecnicoId))],
          },
          { k: "fecha", label: "Nueva fecha · para todas", tipo: "date", ayuda: "Vacía = cada visita conserva la suya." },
          { k: "hora", label: "Nueva hora · para todas", tipo: "time", ayuda: "Vacía = cada visita conserva la suya." },
          {
            k: "motivoCodigo",
            label: "Motivo de la visita · para todas",
            span: 2,
            tipo: "checks",
            opciones: opc.motivos,
            ayuda: "Sin marcar = cada visita conserva sus motivos. Si marcas, reemplazan a los que tenía.",
          },
          {
            k: "trabajo",
            label: "Qué se necesita hacer · para todas",
            span: 2,
            tipo: "area",
            plegable: true,
            ph: "Vacío = cada visita conserva su detalle.",
          },
          {
            k: "acceso",
            label: "Indicaciones de acceso · para todas",
            span: 2,
            tipo: "area",
            plegable: true,
            ph: "Vacío = cada visita conserva las suyas.",
          },
        ]
      : accion === "cancelar"
        ? [
            {
              k: "motivo",
              label: "Por qué se cierran · para todas",
              span: 2,
              tipo: "area",
              ph: "Ej: la campaña se suspendió y estas visitas quedaron agendadas sin efecto.",
              ayuda: "Queda en la bitácora de cada visita junto con tu usuario y la fecha.",
            },
          ]
        : [
            {
              k: "confirmacion",
              label: `Escribe «${fraseEliminar}» para confirmar`,
              span: 2,
              ph: fraseEliminar,
              ayuda: "Si quitas visitas de la lista, el número cambia.",
            },
          ];

  function onCampo(k: string, valor: string | boolean) {
    setForm((prev) => {
      // Si el asignado pasa a ser el que iba de ayudante, el ayudante se suelta.
      if (k === "tecnicoId" && valor !== "" && String(valor) === String(prev.ayudanteId)) {
        return { ...prev, tecnicoId: valor, ayudanteId: "" };
      }
      return { ...prev, [k]: valor };
    });
  }

  function cambiar(folio: string, cambios: Partial<Propio>) {
    setFilas((prev) => prev.map((f) => (f.visita.folio === folio ? { ...f, propio: { ...f.propio, ...cambios } } : f)));
  }

  /** Lo de la visita le gana a lo de arriba; lo vacío en los dos lados no se cambia. */
  function resolver(p: Propio): CambiosVisita | string {
    const cambios: CambiosVisita = {};
    const tecnico = p.tecnicoId || String(form.tecnicoId);
    const ayudante = p.ayudanteId || String(form.ayudanteId);
    const fecha = p.fecha || String(form.fecha);
    const hora = p.hora || String(form.hora);
    const motivos = leerChecks(p.motivoCodigo).length ? leerChecks(p.motivoCodigo) : leerChecks(form.motivoCodigo);
    const trabajo = p.trabajo.trim() || String(form.trabajo).trim();
    const acceso = p.acceso.trim() || String(form.acceso).trim();

    if (tecnico) cambios.tecnicoId = Number(tecnico);
    if (ayudante) {
      if (ayudante !== VA_SOLO && ayudante === tecnico) return "el ayudante no puede ser el mismo técnico asignado.";
      cambios.tecnicoAyudanteId = ayudante === VA_SOLO ? null : Number(ayudante);
    }
    if (fecha) cambios.fecha = fecha;
    if (hora) cambios.hora = hora;
    if (motivos.length) cambios.motivosCodigos = motivos;
    if (trabajo) cambios.trabajoSolicitado = trabajo;
    if (acceso) cambios.indicacionesAcceso = acceso;
    return Object.keys(cambios).length ? cambios : "no tiene ningún cambio. Ponle uno, arriba o dentro de ella, o quítala de la lista.";
  }

  async function guardar() {
    if (n === 0) return onHecho("No queda ninguna visita en la lista.", []);
    const folios = filas.map((f) => f.visita.folio);
    let enviar: (tanda: string[]) => Promise<ResultadoLote>;

    if (accion === "modificar") {
      const porFolio = new Map<string, CambiosVisita>();
      for (const f of filas) {
        const cambios = resolver(f.propio);
        if (typeof cambios === "string") return onHecho(`${f.visita.folio}: ${cambios}`, []);
        porFolio.set(f.visita.folio, cambios);
      }
      enviar = (tanda) => modificarVisitasAction(tanda.map((folio) => ({ folio, cambios: porFolio.get(folio)! })));
    } else if (accion === "cancelar") {
      const porFolio = new Map<string, string>();
      for (const f of filas) {
        const motivo = f.propio.motivo.trim() || String(form.motivo).trim();
        if (motivo.length < 10) {
          return onHecho(`Escribe por qué se cierran: para todas, o dentro de ${f.visita.folio}.`, []);
        }
        porFolio.set(f.visita.folio, motivo);
      }
      enviar = (tanda) => cancelarVisitasAdminAction(tanda.map((folio) => ({ folio, motivo: porFolio.get(folio)! })));
    } else {
      const confirmacion = String(form.confirmacion).trim();
      if (confirmacion.toUpperCase() !== fraseEliminar) {
        return onHecho(`La confirmación no coincide. Escribe «${fraseEliminar}» tal cual.`, []);
      }
      enviar = (tanda) => eliminarVisitasAction({ folios: tanda, total: n, confirmacion });
    }

    setGuardando(true);
    const hechas: string[] = [];
    const errores = new Map<string, string>();
    let general: string | undefined;
    for (let i = 0; i < folios.length; i += TANDA) {
      const res = await enviar(folios.slice(i, i + TANDA));
      hechas.push(...res.hechas);
      for (const x of res.fallidas) errores.set(x.folio, x.error);
      if (res.error) {
        general = res.error;
        break;
      }
      setAvance(Math.min(i + TANDA, folios.length));
    }
    setGuardando(false);
    setAvance(0);

    const hecho = accion === "modificar" ? "actualizadas" : accion === "cancelar" ? "cerradas por administración" : "eliminadas";
    if (hechas.length === folios.length) {
      onHecho(`${nVisitas(hechas.length)} ${hechas.length === 1 ? hecho.replace(/adas\b/, "ada") : hecho}`, hechas);
      onCerrar();
      return;
    }
    // Las que sí quedaron salen de la lista: reintentar solo toca las que faltan.
    setFilas((prev) =>
      prev
        .filter((f) => !hechas.includes(f.visita.folio))
        .map((f) => ({ ...f, propio: { ...f.propio, error: errores.get(f.visita.folio) } }))
    );
    setForm((prev) => ({ ...prev, confirmacion: "" }));
    const faltan = folios.length - hechas.length;
    onHecho(
      hechas.length === 0 && general
        ? general
        : `${hechas.length} ${hecho} y ${faltan} sin tocar. ${general ?? "Cada una dice por qué en la lista."}`,
      hechas
    );
  }

  const titulo =
    accion === "modificar"
      ? `Editar ${nVisitas(n)}`
      : accion === "cancelar"
        ? `Cancelar por admin ${nVisitas(n)}`
        : `Eliminar ${nVisitas(n)}`;

  return (
    <Dialogo
      kicker="Operación · acciones para múltiples visitas"
      titulo={titulo}
      cta={accion === "modificar" ? `Aplicar a ${nVisitas(n)}` : accion === "cancelar" ? `Cerrar ${nVisitas(n)}` : titulo}
      nota={
        accion === "modificar"
          ? "Lo que dejes vacío no cambia. Lo que pongas dentro de una visita reemplaza a lo de arriba solo en esa. Una visita reagendada, pendiente o cancelada a la que le pongas fecha nueva vuelve a quedar Programada. A las completadas, en curso o cerradas por admin no se les cambia la fecha, la hora ni el técnico."
          : accion === "cancelar"
            ? "Solo se cierran las que están programadas o en curso: quedan «Cancelada por admin», dejan de aparecerle al técnico y no se puede volver atrás desde el panel. Las demás se quedan en la lista con su explicación."
            : "No se borran de la base: quedan inactivas y registradas en la auditoría de eliminaciones, con tu usuario y la fecha. Pero desaparecen del panel, del celular del técnico, de los problemas y de los gráficos, y no hay forma de deshacerlo desde acá."
      }
      campos={campos}
      form={form}
      onCampo={onCampo}
      onCerrar={onCerrar}
      onGuardar={guardar}
      guardando={guardando}
    >
      <div className="mt-5 border border-black/[.3]">
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--color-surface)] border-b border-[var(--color-divider-soft)]">
          <div className="font-extrabold text-[11px] tracking-[.11em] uppercase">Visitas seleccionadas</div>
          <div className="ml-auto text-[11px] tracking-[.06em] uppercase opacity-66 tabular-nums">
            {guardando && n > TANDA ? `Aplicando… ${avance} de ${n}` : nVisitas(n)}
          </div>
        </div>

        {n === 0 ? (
          <div className="px-3.5 py-5 text-[13px] opacity-66">No queda ninguna visita en la lista.</div>
        ) : null}

        {filas.map(({ visita: v, propio: p }) => (
          <div key={v.folio} className="border-b border-black/[.18] last:border-b-0">
            <div className="flex items-center gap-2 px-3.5 py-2">
              <button
                type="button"
                aria-expanded={accion === "eliminar" ? undefined : p.abierto}
                disabled={accion === "eliminar"}
                onClick={() => cambiar(v.folio, { abierto: !p.abierto })}
                className="flex-1 min-w-0 flex items-center gap-2.5 min-h-10 bg-transparent border-0 cursor-pointer disabled:cursor-default text-[var(--color-text)] text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[14px] truncate">
                    <span className="font-semibold tabular-nums">{v.folio}</span> · {v.cliente?.nombreFantasia ?? ""} ·{" "}
                    {v.sucursal?.nombre ?? ""}
                  </span>
                  <span className="block text-[12px] opacity-66 truncate tabular-nums">
                    {textoFechaVisita(v)} · {v.horaProgramada ?? "Sin hora"} · {v.tecnico?.nombreCompleto ?? ""} ·{" "}
                    {textoMotivos(v)}
                  </span>
                </span>
                <span className="ml-auto flex-none flex items-center gap-1.5">
                  {tienePropio(p) ? <span className="tag tag-accent">Con ajuste propio</span> : null}
                  <Tag variant={ESTADO_VISITA_TAG[v.estado]}>{ESTADO_VISITA_LABEL[v.estado]}</Tag>
                </span>
                {accion !== "eliminar" ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    className="flex-none transition-transform"
                    style={{ transform: `rotate(${p.abierto ? 180 : 0}deg)` }}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setFilas((prev) => prev.filter((x) => x.visita.folio !== v.folio))}
                className="btn btn-icon w-8 h-8 flex-none border border-black/[.3]"
                aria-label={`Quitar ${v.folio} de la lista`}
                title="Quitar de la lista"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {p.error ? (
              <div className="px-3.5 pb-2.5 text-[12px] leading-[1.4] text-[var(--color-accent-800)]">
                No se aplicó: {p.error}
              </div>
            ) : null}

            {p.abierto && accion === "cancelar" ? (
              <div className="grid grid-cols-1 gap-4 px-3.5 pt-1.5 pb-4 bg-[var(--color-surface-3)]">
                <CampoFila
                  folio={v.folio}
                  k="motivo"
                  valor={p.motivo}
                  label="Por qué se cierra · solo esta visita"
                  ph="Vacío = se usa lo escrito para todas."
                  tipo="area"
                  onCambiar={cambiar}
                />
              </div>
            ) : null}

            {p.abierto && accion === "modificar" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-3.5 pt-1.5 pb-4 bg-[var(--color-surface-3)]">
                <div className="field min-w-0">
                  <label htmlFor={`vl-${v.folio}-tecnico`}>Técnico asignado · solo esta</label>
                  <SelectBuscable
                    id={`vl-${v.folio}-tecnico`}
                    valor={p.tecnicoId}
                    opciones={[{ v: "", t: "Igual que todas" }, ...opc.tecnicos]}
                    onChange={(valor) => cambiar(v.folio, { tecnicoId: valor })}
                    ariaLabel={`Técnico asignado de ${v.folio}`}
                  />
                </div>
                <div className="field min-w-0">
                  <label htmlFor={`vl-${v.folio}-ayudante`}>Técnico ayudante · solo esta</label>
                  <SelectBuscable
                    id={`vl-${v.folio}-ayudante`}
                    valor={p.ayudanteId}
                    opciones={[
                      { v: "", t: "Igual que todas" },
                      ...opcAyudante(p.tecnicoId || String(form.tecnicoId) || String(v.tecnicoId)),
                    ]}
                    onChange={(valor) => cambiar(v.folio, { ayudanteId: valor })}
                    ariaLabel={`Técnico ayudante de ${v.folio}`}
                  />
                </div>
                <CampoFila folio={v.folio} k="fecha" valor={p.fecha} label="Nueva fecha · solo esta" tipo="date" onCambiar={cambiar} />
                <CampoFila folio={v.folio} k="hora" valor={p.hora} label="Nueva hora · solo esta" tipo="time" onCambiar={cambiar} />
                <div className="field min-w-0 sm:col-span-2">
                  <label>Motivo de la visita · solo esta</label>
                  <CasillasMultiples
                    valor={p.motivoCodigo}
                    opciones={opc.motivos}
                    onCambiar={(valor) => cambiar(v.folio, { motivoCodigo: valor })}
                  />
                  <div className="text-[11px] leading-[1.4] opacity-66 mt-1.5">Sin marcar = se usa lo de arriba.</div>
                </div>
                <CampoFila
                  folio={v.folio}
                  k="trabajo"
                  valor={p.trabajo}
                  label="Qué se necesita hacer · solo esta"
                  ph={v.trabajoSolicitado}
                  tipo="area"
                  onCambiar={cambiar}
                />
                <CampoFila
                  folio={v.folio}
                  k="acceso"
                  valor={p.acceso}
                  label="Indicaciones de acceso · solo esta"
                  ph={v.indicacionesAcceso ?? "Vacío = se usa lo de arriba, si hay."}
                  tipo="area"
                  onCambiar={cambiar}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Dialogo>
  );
}

/** Un campo propio de la visita; las áreas ocupan la fila completa. */
function CampoFila({
  folio,
  k,
  valor,
  label,
  ph,
  tipo,
  onCambiar,
}: {
  folio: string;
  k: CampoPropio;
  valor: string;
  label: string;
  ph?: string;
  tipo: "date" | "time" | "area";
  onCambiar: (folio: string, cambios: Partial<Propio>) => void;
}) {
  const id = `vl-${folio}-${k}`;
  return (
    <div className={`field min-w-0 ${tipo === "area" ? "sm:col-span-2" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {tipo === "area" ? (
        <textarea
          id={id}
          rows={2}
          value={valor}
          onChange={(e) => onCambiar(folio, { [k]: e.target.value })}
          placeholder={ph}
          autoComplete="off"
          className="input min-h-[64px] px-3.5 py-3 resize-y leading-[1.5]"
        />
      ) : (
        <input
          id={id}
          type={tipo}
          value={valor}
          onChange={(e) => onCambiar(folio, { [k]: e.target.value })}
          className="input"
        />
      )}
    </div>
  );
}
