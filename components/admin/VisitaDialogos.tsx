"use client";

import { useMemo, useState } from "react";
import Dialogo, {
  escribirChecks,
  leerChecks,
  type CampoDef,
  type FormValores,
} from "@/components/admin/Dialogo";
import { useReferencias, type Referencias } from "@/lib/ui/referencias";
import {
  cancelarVisitaAdminAction,
  crearVisitaAction,
  editarVisitaAction,
  reprogramarVisitaAction,
} from "@/app/actions/admin";
import { ESTADO_VISITA_LABEL } from "@/lib/ui/estado";
import type { Visita } from "@/lib/types";

/** Opciones de los selectores, derivadas de los maestros que baja el layout. */
function opciones(ref: Referencias) {
  return {
    clientes: ref.clientes.filter((c) => c.activo).map((c) => ({ v: String(c.id), t: c.nombreFantasia })),
    tecnicos: ref.tecnicos.filter((t) => t.activo).map((t) => ({ v: String(t.id), t: t.nombreCompleto })),
    motivos: ref.motivos.map((m) => ({ v: m.codigo, t: m.nombre })),
    sucursalesDe: (clienteId: string) => {
      const lista = ref.sucursales.filter((s) => s.activo && String(s.clienteId) === clienteId);
      return lista.length
        ? lista.map((s) => ({ v: String(s.id), t: s.nombre }))
        : [{ v: "", t: "Sin sucursales registradas" }];
    },
  };
}

type Opciones = ReturnType<typeof opciones>;

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

function valoresIniciales(opc: Opciones, visita?: Visita, origen?: OrigenProblema): FormValores {
  if (visita) {
    return {
      clienteId: String(visita.clienteId),
      sucursalId: String(visita.sucursalId),
      tecnicoId: String(visita.tecnicoId),
      motivoCodigo: escribirChecks(
        visita.motivosCodigos?.length ? visita.motivosCodigos : [visita.motivoCodigo]
      ),
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
    const porFalla = MOTIVO_POR_FALLA[origen.tipoCodigo] ?? "REVISION";
    return {
      clienteId: String(origen.clienteId),
      sucursalId: String(origen.sucursalId),
      tecnicoId: opc.tecnicos[0]?.v ?? "",
      // Si el motivo sugerido ya no está en el checklist, se cae al primero.
      motivoCodigo: escribirChecks([
        opc.motivos.some((m) => m.v === porFalla) ? porFalla : opc.motivos[0]?.v ?? "",
      ]),
      fecha: "",
      hora: "",
      responsable: "",
      respTelefono: "",
      trabajo: trabajo.trim(),
      acceso: "",
    };
  }
  const clienteId = opc.clientes[0]?.v ?? "";
  return {
    clienteId,
    sucursalId: opc.sucursalesDe(clienteId)[0]?.v ?? "",
    tecnicoId: opc.tecnicos[0]?.v ?? "",
    motivoCodigo: escribirChecks([opc.motivos[0]?.v ?? ""]),
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
  const ref = useReferencias();
  const opc = useMemo(() => opciones(ref), [ref]);
  const [form, setForm] = useState<FormValores>(() => valoresIniciales(opc, visita, origen));
  const [guardando, setGuardando] = useState(false);

  // Una visita puede venir por varias cosas a la vez. El primero marcado es el
  // principal: es el que va a dmc.visita.motivo_codigo y el que decide si la
  // hora es obligatoria.
  const motivosMarcados = leerChecks(form.motivoCodigo);
  const esInstalacion = motivosMarcados.includes("INSTALACION");

  const campos: CampoDef[] = [
    { k: "clienteId", label: "Cliente", tipo: "select", opciones: opc.clientes },
    { k: "sucursalId", label: "Sucursal", tipo: "select", opciones: opc.sucursalesDe(String(form.clienteId)) },
    { k: "tecnicoId", label: "Técnico asignado", tipo: "select", opciones: opc.tecnicos },
    {
      k: "motivoCodigo",
      label: "Motivo de la visita",
      span: 2,
      tipo: "checks",
      opciones: opc.motivos,
      ayuda: "Marca todos los que correspondan. El primero es el que encabeza la ficha del técnico.",
    },
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
        const primera = opc.sucursalesDe(String(valor))[0]?.v ?? "";
        return { ...prev, clienteId: valor, sucursalId: primera };
      }
      return { ...prev, [k]: valor };
    });
  }

  async function guardar() {
    if (motivosMarcados.length === 0) {
      onHecho("Marca al menos un motivo de la visita.");
      return;
    }
    setGuardando(true);
    const datos = {
      clienteId: Number(form.clienteId),
      sucursalId: Number(form.sucursalId),
      tecnicoId: Number(form.tecnicoId),
      motivoCodigo: motivosMarcados[0],
      motivosCodigos: motivosMarcados,
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
    const tecnico = ref.tecnicos.find((t) => String(t.id) === String(form.tecnicoId))?.nombreCompleto ?? "";
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
  const ref = useReferencias();
  const opc = useMemo(() => opciones(ref), [ref]);
  const [form, setForm] = useState<FormValores>({
    tecnicoId: String(visita.tecnicoId),
    fecha: visita.fechaProgramada,
    hora: visita.horaProgramada ?? "",
  });
  const [guardando, setGuardando] = useState(false);

  const esInstalacion = visita.motivoCodigo === "INSTALACION";

  const campos: CampoDef[] = [
    { k: "tecnicoId", label: "Técnico que asistirá", tipo: "select", opciones: opc.tecnicos },
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
    const tecnico = ref.tecnicos.find((t) => String(t.id) === String(form.tecnicoId))?.nombreCompleto ?? "";
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

/**
 * "Cancelar por admin" — el cierre administrativo de una visita que quedó vieja
 * o que ya no sirve.
 *
 * Es lo mismo que cancelar, pero hecho desde la oficina y con su propio estado
 * (CANCELADA_ADMIN), para que al leer la ficha se distinga de la que canceló el
 * técnico parado en la puerta de la tienda.
 *
 * Solo aparece sobre visitas EN CURSO o sin iniciar. Una COMPLETADA ya tiene
 * acta firmada; el motivo escrito acá queda en la bitácora con el nombre de
 * quien lo apretó.
 */
export function CancelarAdminDialogo({
  visita,
  onCerrar,
  onHecho,
}: {
  visita: Visita;
  onCerrar: () => void;
  onHecho: (mensaje: string) => void;
}) {
  const [form, setForm] = useState<FormValores>({ motivo: "" });
  const [guardando, setGuardando] = useState(false);

  const campos: CampoDef[] = [
    {
      k: "motivo",
      label: "Por qué se cierra",
      span: 2,
      tipo: "area",
      ph: "Ej: la tienda cerró en marzo y el pórtico se retiró; la visita quedó agendada sin efecto.",
      ayuda: "Queda guardado en la bitácora de la visita junto con tu usuario y la fecha.",
    },
  ];

  async function guardar() {
    setGuardando(true);
    const res = await cancelarVisitaAdminAction({ folio: visita.folio, motivo: String(form.motivo) });
    setGuardando(false);
    if (!res.ok) {
      onHecho(res.error ?? "No se pudo cerrar la visita.");
      return;
    }
    onHecho(`Visita ${visita.folio} cerrada por administración`);
    onCerrar();
  }

  return (
    <Dialogo
      kicker="Operación · cierre administrativo"
      titulo={`Cancelar por admin ${visita.folio}`}
      cta="Cerrar la visita"
      nota={`La visita está ${ESTADO_VISITA_LABEL[visita.estado].toLowerCase()} y va a quedar «Cancelada por admin». Deja de aparecerle al técnico en el celular y no se puede volver atrás desde el panel: si hay que rehacerla, se agenda una visita nueva.`}
      campos={campos}
      form={form}
      onCampo={(k, v) => setForm((prev) => ({ ...prev, [k]: v }))}
      onCerrar={onCerrar}
      onGuardar={guardar}
      guardando={guardando}
    />
  );
}
