"use client";

import { useState } from "react";
import Dialogo, { type CampoDef, type FormValores } from "@/components/admin/Dialogo";
import { clientes, sucursales, tecnicos } from "@/lib/mock/maestros";
import { catalogoMotivo } from "@/lib/mock/catalogos";
import { crearVisitaAction, editarVisitaAction, reprogramarVisitaAction } from "@/app/actions/admin";
import type { Visita } from "@/lib/types";

const OPC_CLIENTES = clientes.map((c) => ({ v: String(c.id), t: c.nombreFantasia }));
const OPC_TECNICOS = tecnicos.filter((t) => t.activo).map((t) => ({ v: String(t.id), t: t.nombreCompleto }));
const OPC_MOTIVOS = catalogoMotivo.map((m) => ({ v: m.codigo, t: m.nombre }));

function sucursalesDe(clienteId: string) {
  const lista = sucursales.filter((s) => String(s.clienteId) === clienteId);
  return lista.length
    ? lista.map((s) => ({ v: String(s.id), t: s.nombre }))
    : [{ v: "", t: "Sin sucursales registradas" }];
}

/** Origen cuando la visita nace desde un problema de la vista "Problemas". */
export interface OrigenProblema {
  problemaId: number;
  folio: string;
  clienteId: number;
  sucursalId: number;
  tipoCodigo: string;
  tipoNombre: string;
  descripcion: string | null;
  solucion: string | null;
}

const MOTIVO_POR_FALLA: Record<string, string> = {
  DESCALIBRACION: "CALIBRACION",
  ANTENA_NO_DETECTA: "REVISION",
  FALSA_ALARMA: "REVISION",
  PLACAS_DANADAS: "REVISION",
  CABLE_DANADO: "REVISION",
  SIN_ENERGIA: "REVISION",
  CONTADOR_FALLA: "REVISION",
};

function valoresIniciales(visita?: Visita, origen?: OrigenProblema): FormValores {
  if (visita) {
    return {
      clienteId: String(visita.clienteId),
      sucursalId: String(visita.sucursalId),
      tecnicoId: String(visita.tecnicoId),
      motivoCodigo: visita.motivoCodigo,
      fecha: visita.fechaProgramada,
      hora: visita.horaProgramada ?? "",
      responsable: visita.responsableNombre ?? "",
      respTelefono: visita.responsableTelefono ?? "",
      trabajo: visita.trabajoSolicitado,
      acceso: visita.indicacionesAcceso ?? "",
    };
  }
  if (origen) {
    const trabajo =
      `Resolver «${origen.tipoNombre}» levantado en ${origen.folio}. ${origen.descripcion ?? ""}` +
      (origen.solucion ? ` Indicación del técnico: ${origen.solucion}` : "");
    return {
      clienteId: String(origen.clienteId),
      sucursalId: String(origen.sucursalId),
      tecnicoId: OPC_TECNICOS[0]?.v ?? "",
      motivoCodigo: MOTIVO_POR_FALLA[origen.tipoCodigo] ?? "REVISION",
      fecha: "",
      hora: "",
      responsable: "",
      respTelefono: "",
      trabajo: trabajo.trim(),
      acceso: "",
    };
  }
  const clienteId = OPC_CLIENTES[0]?.v ?? "";
  return {
    clienteId,
    sucursalId: sucursalesDe(clienteId)[0]?.v ?? "",
    tecnicoId: OPC_TECNICOS[0]?.v ?? "",
    motivoCodigo: OPC_MOTIVOS[0]?.v ?? "",
    fecha: "",
    hora: "",
    responsable: "",
    respTelefono: "",
    trabajo: "",
    acceso: "",
  };
}

/**
 * "Nueva visita", "Corregir visita" y "Agendar visita" del mockup: el mismo
 * formulario, cambian el encabezado, la nota y qué se hace al guardar.
 */
export default function VisitaDialogo({
  visita,
  origen,
  onCerrar,
  onHecho,
}: {
  /** Presente cuando se está corrigiendo una visita ya creada. */
  visita?: Visita;
  origen?: OrigenProblema;
  onCerrar: () => void;
  onHecho: (mensaje: string, folio?: string) => void;
}) {
  const [form, setForm] = useState<FormValores>(() => valoresIniciales(visita, origen));
  const [guardando, setGuardando] = useState(false);

  const esInstalacion = form.motivoCodigo === "INSTALACION";

  const campos: CampoDef[] = [
    { k: "clienteId", label: "Cliente", tipo: "select", opciones: OPC_CLIENTES },
    { k: "sucursalId", label: "Sucursal", tipo: "select", opciones: sucursalesDe(String(form.clienteId)) },
    { k: "tecnicoId", label: "Técnico asignado", tipo: "select", opciones: OPC_TECNICOS },
    { k: "motivoCodigo", label: "Motivo de la visita", tipo: "select", opciones: OPC_MOTIVOS },
    { k: "fecha", label: "Fecha programada", tipo: "date" },
    {
      k: "hora",
      label: esInstalacion ? "Hora de la instalación (obligatoria)" : "Hora de llegada (opcional)",
      tipo: "time",
      ayuda: esInstalacion
        ? "En instalación la hora es obligatoria: la tienda tiene que dejar el acceso libre."
        : "Si la dejas vacía, el técnico la realiza en cualquier momento del día.",
    },
    { k: "responsable", label: "Responsable de tienda", ph: "Nombre de quien recibe" },
    { k: "respTelefono", label: "Teléfono del responsable", tipo: "tel", ph: "+56 9 8123 4455" },
    {
      k: "trabajo",
      label: "Qué se necesita hacer",
      span: 2,
      tipo: "area",
      ph: "Ej: calibrar las 3 antenas EAS del pórtico principal; falsa alarma cada 10 min desde el lunes.",
    },
    {
      k: "acceso",
      label: "Indicaciones de acceso (opcional)",
      span: 2,
      tipo: "area",
      ph: "Ej: entrar por acceso de proveedores, estacionamiento -2, pedir credencial en control.",
    },
  ];

  function onCampo(k: string, valor: string | boolean) {
    setForm((prev) => {
      if (k === "clienteId") {
        const primera = sucursalesDe(String(valor))[0]?.v ?? "";
        return { ...prev, clienteId: valor, sucursalId: primera };
      }
      return { ...prev, [k]: valor };
    });
  }

  async function guardar() {
    setGuardando(true);
    const datos = {
      clienteId: Number(form.clienteId),
      sucursalId: Number(form.sucursalId),
      tecnicoId: Number(form.tecnicoId),
      motivoCodigo: String(form.motivoCodigo),
      fechaProgramada: String(form.fecha),
      horaProgramada: String(form.hora) || null,
      trabajoSolicitado: String(form.trabajo),
      indicacionesAcceso: String(form.acceso) || null,
      responsableNombre: String(form.responsable) || null,
      responsableTelefono: String(form.respTelefono) || null,
      problemaOrigenId: origen?.problemaId ?? null,
    };

    const res = visita ? await editarVisitaAction(visita.folio, datos) : await crearVisitaAction(datos);
    setGuardando(false);

    if (!res.ok) {
      onHecho(res.error ?? "No se pudo guardar.");
      return;
    }
    const tecnico = tecnicos.find((t) => String(t.id) === String(form.tecnicoId))?.nombreCompleto ?? "";
    onHecho(
      visita
        ? "Cambios guardados · el técnico los ve en la próxima sincronización"
        : origen
          ? `Visita agendada · ${tecnico} · ${form.fecha || "sin fecha"}`
          : `Visita ${res.folio} programada · ${tecnico}`,
      res.folio
    );
    onCerrar();
  }

  return (
    <Dialogo
      kicker={
        visita
          ? "Operación · corregir visita"
          : origen
            ? `Operación · agendar por problema ${origen.folio}`
            : "Operación · visita"
      }
      titulo={
        visita ? `Editar visita ${visita.folio}` : origen ? "Agendar visita para resolver" : "Nueva visita"
      }
      cta={visita ? "Guardar cambios" : origen ? "Agendar y asignar" : "Programar visita"}
      nota={
        visita
          ? "El técnico recibe la corrección en su celular en la próxima sincronización, antes de llegar a la tienda."
          : origen
            ? `La visita nace del problema de ${origen.folio}: el técnico ve el detalle en su celular y el problema queda a la espera de esta visita.`
            : "El folio se genera solo y la visita nace Programada. La hora es opcional, salvo en instalación."
      }
      campos={campos}
      form={form}
      onCampo={onCampo}
      onCerrar={onCerrar}
      onGuardar={guardar}
      guardando={guardando}
    />
  );
}

/** "Cambiar fecha y técnico" — reagendadas, pendientes y canceladas. */
export function ReprogramarDialogo({
  visita,
  onCerrar,
  onHecho,
}: {
  visita: Visita;
  onCerrar: () => void;
  onHecho: (mensaje: string) => void;
}) {
  const [form, setForm] = useState<FormValores>({
    tecnicoId: String(visita.tecnicoId),
    fecha: visita.fechaProgramada,
    hora: visita.horaProgramada ?? "",
  });
  const [guardando, setGuardando] = useState(false);

  const esInstalacion = visita.motivoCodigo === "INSTALACION";

  const campos: CampoDef[] = [
    { k: "tecnicoId", label: "Técnico que asistirá", tipo: "select", opciones: OPC_TECNICOS },
    { k: "fecha", label: "Nueva fecha", tipo: "date" },
    {
      k: "hora",
      label: esInstalacion ? "Hora de la instalación (obligatoria)" : "Hora de llegada (opcional)",
      tipo: "time",
      ayuda: esInstalacion
        ? "En instalación la hora es obligatoria."
        : "Si la dejas vacía, el técnico la realiza en cualquier momento del día.",
    },
  ];

  async function guardar() {
    setGuardando(true);
    const res = await reprogramarVisitaAction({
      folio: visita.folio,
      tecnicoId: Number(form.tecnicoId),
      fecha: String(form.fecha),
      hora: String(form.hora) || null,
      motivoCodigo: visita.motivoCodigo,
    });
    setGuardando(false);

    if (!res.ok) {
      onHecho(res.error ?? "No se pudo reprogramar.");
      return;
    }
    const tecnico = tecnicos.find((t) => String(t.id) === String(form.tecnicoId))?.nombreCompleto ?? "";
    onHecho(`Reprogramada para el ${form.fecha} · ${tecnico}`);
    onCerrar();
  }

  return (
    <Dialogo
      kicker="Operación · reprogramar"
      titulo={`Reprogramar ${visita.folio}`}
      cta="Reprogramar visita"
      nota="La visita vuelve a estado PROGRAMADA con la nueva fecha y le aparece al técnico asignado en su celular."
      campos={campos}
      form={form}
      onCampo={(k, v) => setForm((prev) => ({ ...prev, [k]: v }))}
      onCerrar={onCerrar}
      onGuardar={guardar}
      guardando={guardando}
    />
  );
}
