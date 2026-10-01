"use client";

import { useMemo, useState } from "react";
import Dialogo, { escribirChecks, leerChecks, type CampoDef, type FormValores } from "@/components/admin/Dialogo";
import SelectBuscable from "@/components/ui/SelectBuscable";
import { camposFecha, errorMargen, fechaHastaDe, opciones } from "@/components/admin/VisitaDialogos";
import { useReferencias } from "@/lib/ui/referencias";
import { crearVisitasMasivasAction } from "@/app/actions/admin";
import { fmtRut, fmtTel, mensajeRut } from "@/lib/ui/formato";
import { hoyISO } from "@/lib/ui/fecha";
import { algunoPideHora } from "@/lib/ui/motivos";
import type { DatosVisita } from "@/lib/data/visitas";

/** Un local de la ruta, con lo que es solo suyo. Vacío = usa lo masivo. */
interface LocalRuta {
  sucursalId: string;
  clienteId: string;
  abierto: boolean;
  responsable: string;
  respRut: string;
  respTelefono: string;
  hora: string;
  trabajo: string;
  acceso: string;
}

const PROPIOS = ["responsable", "respRut", "respTelefono", "hora", "trabajo", "acceso"] as const;
type CampoPropio = (typeof PROPIOS)[number];

/** El campo pone "+56 9 " al enfocarlo: eso solo no es un teléfono. */
function telefono(l: LocalRuta): string {
  const t = l.respTelefono.trim();
  return t === "+56 9" ? "" : t;
}

function tienePropio(l: LocalRuta): boolean {
  return PROPIOS.some((k) => (k === "respTelefono" ? telefono(l) : l[k].trim()) !== "");
}

/**
 * "Visitas masivas": la ruta de un técnico en un solo diálogo.
 *
 * Arriba va lo que es igual para todos —técnico, fecha, motivo y qué se va a
 * hacer— y abajo los locales. Cada local se puede desplegar para ponerle su
 * contacto, su hora o un detalle distinto: lo escrito en el local le gana a lo
 * masivo, y lo que queda vacío toma lo de arriba. Sale una visita por local.
 */
export default function VisitasMasivasDialogo({
  onCerrar,
  onHecho,
}: {
  onCerrar: () => void;
  /** `creadas` indica cuántas visitas quedaron en la base, aunque haya fallado alguna. */
  onHecho: (mensaje: string, creadas: number) => void;
}) {
  const ref = useReferencias();
  const opc = useMemo(() => opciones(ref), [ref]);
  const [form, setForm] = useState<FormValores>(() => ({
    tecnicoId: opc.tecnicos[0]?.v ?? "",
    ayudanteId: "",
    motivoCodigo: escribirChecks([opc.motivos[0]?.v ?? ""]),
    fecha: hoyISO(),
    margen: false,
    fechaHasta: "",
    trabajo: "",
    acceso: "",
  }));
  const [clienteSel, setClienteSel] = useState(opc.clientes[0]?.v ?? "");
  const [locales, setLocales] = useState<LocalRuta[]>([]);
  const [guardando, setGuardando] = useState(false);

  const motivosMarcados = leerChecks(form.motivoCodigo);
  const esInstalacion = algunoPideHora(motivosMarcados, ref.motivos);
  const opcAyudante = [
    { v: "", t: "Sin ayudante · va solo" },
    ...opc.tecnicos.filter((t) => t.v !== String(form.tecnicoId)),
  ];

  // Solo las sucursales del cliente elegido que todavía no están en la ruta.
  const sucursalesLibres = ref.sucursales
    .filter(
      (s) => s.activo && String(s.clienteId) === clienteSel && !locales.some((l) => l.sucursalId === String(s.id))
    )
    .map((s) => ({ v: String(s.id), t: s.nombre }));

  const campos: CampoDef[] = [
    { k: "tecnicoId", label: "Técnico asignado", tipo: "select", buscable: true, opciones: opc.tecnicos },
    {
      k: "ayudanteId",
      label: "Técnico ayudante (opcional)",
      tipo: "select",
      buscable: true,
      opciones: opcAyudante,
    },
    {
      k: "motivoCodigo",
      label: "Motivo de la visita · para todos",
      span: 2,
      tipo: "checks",
      opciones: opc.motivos,
      ayuda: "Marca todos los que correspondan. El primero es el que encabeza la ficha del técnico.",
    },
    // Sin margen la fecha ocupa la fila entera; con margen, «desde» y «hasta» la comparten.
    ...camposFecha(
      form,
      esInstalacion
        ? "En instalación la hora es obligatoria: ponla en cada local."
        : "La hora es opcional y va en cada local, si hace falta."
    ).map((c): CampoDef => (form.margen === true ? c : { ...c, span: 2 })),
    {
      k: "trabajo",
      label: "Qué se necesita hacer · para todos",
      span: 2,
      tipo: "area",
      ph: "Ej: mantención preventiva de las antenas EAS y revisión del contador de personas.",
      ayuda: "Se copia a cada local, salvo a los que tengan su propio detalle.",
    },
    {
      k: "acceso",
      label: "Indicaciones de acceso · para todos (opcional)",
      span: 2,
      tipo: "area",
      plegable: true,
      ph: "Ej: presentarse con credencial y ropa corporativa.",
    },
  ];

  function onCampo(k: string, valor: string | boolean) {
    setForm((prev) => {
      // Si el asignado pasa a ser el que iba de ayudante, el ayudante se suelta.
      if (k === "tecnicoId" && String(valor) === String(prev.ayudanteId)) {
        return { ...prev, tecnicoId: valor, ayudanteId: "" };
      }
      return { ...prev, [k]: valor };
    });
  }

  function agregar(sucursalId: string) {
    if (!sucursalId) return;
    setLocales((prev) => [
      ...prev,
      {
        sucursalId,
        clienteId: clienteSel,
        abierto: false,
        responsable: "",
        respRut: "",
        respTelefono: "",
        hora: "",
        trabajo: "",
        acceso: "",
      },
    ]);
  }

  function cambiar(sucursalId: string, cambios: Partial<LocalRuta>) {
    setLocales((prev) => prev.map((l) => (l.sucursalId === sucursalId ? { ...l, ...cambios } : l)));
  }

  function nombreLocal(l: LocalRuta): string {
    const cliente = ref.clientes.find((c) => String(c.id) === l.clienteId)?.nombreFantasia ?? "";
    const sucursal = ref.sucursales.find((s) => String(s.id) === l.sucursalId)?.nombre ?? "";
    return `${cliente} · ${sucursal}`;
  }

  async function guardar() {
    if (motivosMarcados.length === 0) return onHecho("Marca al menos un motivo de la visita.", 0);
    if (locales.length === 0) return onHecho("Agrega al menos un local a la ruta.", 0);
    const malMargen = errorMargen(form);
    if (malMargen) return onHecho(malMargen, 0);
    for (const l of locales) {
      const errorRut = mensajeRut(l.respRut);
      if (errorRut) return onHecho(`${nombreLocal(l)}: ${errorRut}`, 0);
      if (!l.trabajo.trim() && !String(form.trabajo).trim()) {
        return onHecho(`Escribe qué se necesita hacer: para todos, o en ${nombreLocal(l)}.`, 0);
      }
      if (esInstalacion && !l.hora) {
        return onHecho(`En instalación la hora es obligatoria: falta en ${nombreLocal(l)}.`, 0);
      }
    }

    // Lo del local le gana a lo masivo; lo vacío toma lo de arriba.
    const visitas: DatosVisita[] = locales.map((l) => ({
      clienteId: Number(l.clienteId),
      sucursalId: Number(l.sucursalId),
      tecnicoId: Number(form.tecnicoId),
      tecnicoAyudanteId: form.ayudanteId ? Number(form.ayudanteId) : null,
      motivoCodigo: motivosMarcados[0],
      motivosCodigos: motivosMarcados,
      fechaProgramada: String(form.fecha),
      fechaHasta: fechaHastaDe(form),
      horaProgramada: l.hora || null,
      trabajoSolicitado: l.trabajo.trim() || String(form.trabajo).trim(),
      indicacionesAcceso: l.acceso.trim() || String(form.acceso).trim() || null,
      responsableNombre: l.responsable.trim() || null,
      responsableRut: l.respRut || null,
      responsableTelefono: telefono(l) || null,
    }));

    setGuardando(true);
    const res = await crearVisitasMasivasAction(visitas);
    setGuardando(false);

    const n = res.folios.length;
    if (!res.ok) {
      // Las que sí se crearon salen de la lista: reintentar no las duplica.
      setLocales((prev) => prev.filter((l) => res.fallidas.includes(Number(l.sucursalId))));
      onHecho(
        n > 0
          ? `Se crearon ${n} visitas y ${res.fallidas.length} quedaron sin crear. ${res.error ?? ""}`
          : res.error ?? "No se pudo guardar.",
        n
      );
      return;
    }
    const tecnico = ref.tecnicos.find((t) => String(t.id) === String(form.tecnicoId))?.nombreCompleto ?? "";
    onHecho(`${n} ${n === 1 ? "visita programada" : "visitas programadas"} · ${tecnico} · ${form.fecha}`, n);
    onCerrar();
  }

  return (
    <Dialogo
      kicker="Operación · ruta de visitas"
      titulo="Visitas masivas"
      cta={locales.length > 1 ? `Programar ${locales.length} visitas` : "Programar visitas"}
      nota="Sale una visita por local, cada una con su folio y en estado Programada. Lo que escribas dentro de un local reemplaza a lo masivo solo en ese local."
      campos={campos}
      form={form}
      onCampo={onCampo}
      onCerrar={onCerrar}
      onGuardar={guardar}
      guardando={guardando}
    >
      <div className="mt-5 border border-black/[.3]">
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--color-surface)] border-b border-[var(--color-divider-soft)]">
          <div className="font-extrabold text-[11px] tracking-[.11em] uppercase">Locales de la ruta</div>
          <div className="ml-auto text-[11px] tracking-[.06em] uppercase opacity-66 tabular-nums">
            {locales.length} {locales.length === 1 ? "local" : "locales"}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 px-3.5 py-3.5 border-b border-[var(--color-divider-soft)]">
          <div className="field min-w-0">
            <label htmlFor="vm-cliente">Cliente</label>
            <SelectBuscable
              id="vm-cliente"
              valor={clienteSel}
              opciones={opc.clientes}
              onChange={setClienteSel}
              ariaLabel="Cliente"
            />
          </div>
          <div className="field min-w-0">
            <label htmlFor="vm-sucursal">Agregar sucursal</label>
            <SelectBuscable
              id="vm-sucursal"
              valor=""
              opciones={sucursalesLibres}
              onChange={agregar}
              placeholder={sucursalesLibres.length ? "Elige y se agrega a la ruta…" : "No quedan sucursales por agregar"}
              ariaLabel="Agregar sucursal"
            />
          </div>
        </div>

        {locales.length === 0 ? (
          <div className="px-3.5 py-5 text-[13px] opacity-66">
            Todavía no hay locales. Elige el cliente y ve agregando las sucursales que va a visitar el técnico.
          </div>
        ) : null}

        {locales.map((l, i) => (
          <div key={l.sucursalId} className="border-b border-black/[.18] last:border-b-0">
            <div className="flex items-center gap-2 px-3.5 py-2">
              <button
                type="button"
                aria-expanded={l.abierto}
                onClick={() => cambiar(l.sucursalId, { abierto: !l.abierto })}
                className="flex-1 min-w-0 flex items-center gap-2.5 min-h-9 bg-transparent border-0 cursor-pointer text-[var(--color-text)] text-left"
              >
                <span className="w-6 h-6 flex-none grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-[11px] tabular-nums">
                  {i + 1}
                </span>
                <span className="text-[14px] truncate">{nombreLocal(l)}</span>
                {tienePropio(l) ? <span className="tag tag-accent flex-none">Con detalle propio</span> : null}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  className="ml-auto flex-none transition-transform"
                  style={{ transform: `rotate(${l.abierto ? 180 : 0}deg)` }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setLocales((prev) => prev.filter((x) => x.sucursalId !== l.sucursalId))}
                className="btn btn-icon w-8 h-8 flex-none border border-black/[.3]"
                aria-label={`Quitar ${nombreLocal(l)} de la ruta`}
                title="Quitar de la ruta"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {l.abierto ? (
              <div className="grid grid-cols-2 gap-4 px-3.5 pt-1.5 pb-4 bg-[var(--color-surface-3)]">
                <CampoLocal
                  local={l}
                  k="responsable"
                  label="Responsable de tienda"
                  ph="Nombre de quien recibe"
                  onCambiar={cambiar}
                />
                <CampoLocal
                  local={l}
                  k="hora"
                  label={esInstalacion ? "Hora de la instalación (obligatoria)" : "Hora de llegada (opcional)"}
                  tipo="time"
                  onCambiar={cambiar}
                />
                <CampoLocal
                  local={l}
                  k="respRut"
                  label="RUT del responsable"
                  ph="12.345.678-9"
                  tipo="rut"
                  onCambiar={cambiar}
                />
                <CampoLocal
                  local={l}
                  k="respTelefono"
                  label="Teléfono del responsable"
                  ph="+56 9 8123 4455"
                  tipo="tel"
                  onCambiar={cambiar}
                />
                <CampoLocal
                  local={l}
                  k="trabajo"
                  label="Qué se necesita hacer · solo en este local"
                  ph="Vacío = se usa lo escrito para todos."
                  tipo="area"
                  onCambiar={cambiar}
                />
                <CampoLocal
                  local={l}
                  k="acceso"
                  label="Indicaciones de acceso · solo en este local"
                  ph="Vacío = se usan las de todos, si hay."
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

/** Un campo propio del local; las áreas ocupan la fila completa. */
function CampoLocal({
  local,
  k,
  label,
  ph,
  tipo = "text",
  onCambiar,
}: {
  local: LocalRuta;
  k: CampoPropio;
  label: string;
  ph?: string;
  tipo?: "text" | "time" | "rut" | "tel" | "area";
  onCambiar: (sucursalId: string, cambios: Partial<LocalRuta>) => void;
}) {
  const id = `vm-${local.sucursalId}-${k}`;
  const valor = local[k];
  const poner = (v: string) => onCambiar(local.sucursalId, { [k]: v });

  return (
    <div className="field min-w-0" style={{ gridColumn: `span ${tipo === "area" ? 2 : 1}` }}>
      <label htmlFor={id}>{label}</label>
      {tipo === "area" ? (
        <textarea
          id={id}
          rows={2}
          value={valor}
          onChange={(e) => poner(e.target.value)}
          placeholder={ph}
          autoComplete="off"
          className="input min-h-[64px] px-3.5 py-3 resize-y leading-[1.5]"
        />
      ) : (
        <input
          id={id}
          type={tipo === "time" ? "time" : "text"}
          inputMode={tipo === "tel" ? "tel" : undefined}
          autoCapitalize={tipo === "rut" ? "characters" : undefined}
          value={valor}
          onChange={(e) =>
            poner(tipo === "rut" ? fmtRut(e.target.value) : tipo === "tel" ? fmtTel(e.target.value) : e.target.value)
          }
          onFocus={() => {
            if (tipo === "tel" && !valor) poner("+56 9 ");
          }}
          placeholder={ph}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className={`input ${tipo === "rut" || tipo === "tel" ? "tabular-nums" : ""}`}
        />
      )}
      {tipo === "rut" && mensajeRut(valor) ? (
        <div className="text-[11px] leading-[1.4] mt-1.5 text-[var(--color-accent-800)]">{mensajeRut(valor)}</div>
      ) : null}
    </div>
  );
}
