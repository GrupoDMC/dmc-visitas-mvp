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
  eliminarVisitaAction,
  liberarVisitaAction,
  reprogramarVisitaAction,
} from "@/app/actions/admin";
import { ESTADO_VISITA_LABEL, nombreDeQuienLaTomo } from "@/lib/ui/estado";
import { mensajeRut } from "@/lib/ui/formato";
import { hoyISO } from "@/lib/ui/fecha";
import { algunoPideHora } from "@/lib/ui/motivos";
import type { Visita } from "@/lib/types";

/** Opciones de los selectores, derivadas de los maestros que baja el layout. */
export function opciones(ref: Referencias) {
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

/**
 * La fecha de la visita, con la casilla «Margen de días» arriba. Sin marcar es
 * un solo campo; marcada, aparece el segundo y la visita vale cualquier día
 * entre los dos. Usa `fecha`, `margen` y `fechaHasta` del formulario.
 */
export function camposFecha(form: FormValores, ayuda?: string): CampoDef[] {
  const conMargen = form.margen === true;
  const desde: CampoDef = {
    k: "fecha",
    label: conMargen ? "Desde" : "Fecha programada",
    tipo: "date",
    casilla: { k: "margen", label: "Margen de días" },
    ayuda,
  };
  if (!conMargen) return [desde];
  return [
    desde,
    {
      k: "fechaHasta",
      label: "Hasta",
      tipo: "date",
      ayuda: "Al técnico le aparece en «Hoy» cada día del margen, hasta que la cierre.",
    },
  ];
}

/** El texto del error del margen, o null si está bien (o no se usa). */
export function errorMargen(form: FormValores): string | null {
  if (form.margen !== true) return null;
  if (!form.fechaHasta) return "Marcaste margen de días: falta la fecha «hasta».";
  return String(form.fechaHasta) > String(form.fecha) ? null : "La fecha «hasta» tiene que ser posterior a «desde».";
}

/** Lo que se guarda en fecha_hasta: nada si la casilla está sin marcar. */
export function fechaHastaDe(form: FormValores): string | null {
  return form.margen === true ? String(form.fechaHasta || "") || null : null;
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

function valoresIniciales(opc: Opciones, visita?: Visita, origen?: OrigenProblema): FormValores {
  if (visita) {
    return {
      clienteId: String(visita.clienteId),
      sucursalId: String(visita.sucursalId),
      tecnicoId: String(visita.tecnicoId),
      ayudanteId: visita.tecnicoAyudanteId ? String(visita.tecnicoAyudanteId) : "",
      motivoCodigo: escribirChecks(
        visita.motivosCodigos?.length ? visita.motivosCodigos : [visita.motivoCodigo]
      ),
      fecha: visita.fechaProgramada,
      margen: Boolean(visita.fechaHasta),
      fechaHasta: visita.fechaHasta ?? "",
      hora: visita.horaProgramada ?? "",
      responsable: visita.responsableNombre ?? "",
      respRut: visita.responsableRut ?? "",
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
      ayudanteId: "",
      // Si el motivo sugerido ya no está en el checklist, se cae al primero.
      motivoCodigo: escribirChecks([
        opc.motivos.some((m) => m.v === porFalla) ? porFalla : opc.motivos[0]?.v ?? "",
      ]),
      // Se agenda para hoy salvo que se cambie.
      fecha: hoyISO(),
      margen: false,
      fechaHasta: "",
      hora: "",
      responsable: "",
      respRut: "",
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
    ayudanteId: "",
    motivoCodigo: escribirChecks([opc.motivos[0]?.v ?? ""]),
    // Se agenda para hoy salvo que se cambie.
    fecha: hoyISO(),
    margen: false,
    fechaHasta: "",
    hora: "",
    responsable: "",
    respRut: "",
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
  // principal: es el que va a dmc.visita.motivo_codigo. La hora es obligatoria
  // si cualquiera de los marcados es una instalación.
  const motivosMarcados = leerChecks(form.motivoCodigo);
  const esInstalacion = algunoPideHora(motivosMarcados, ref.motivos);
  // El ayudante sale de los mismos técnicos, menos el asignado.
  const opcAyudante = [
    { v: "", t: "Sin ayudante · va solo" },
    ...opc.tecnicos.filter((t) => t.v !== String(form.tecnicoId)),
  ];

  const campos: CampoDef[] = [
    // Los tres se escriben y filtran: son los catálogos que crecen.
    { k: "clienteId", label: "Cliente", tipo: "select", buscable: true, opciones: opc.clientes },
    {
      k: "sucursalId",
      label: "Sucursal",
      tipo: "select",
      buscable: true,
      opciones: opc.sucursalesDe(String(form.clienteId)),
    },
    { k: "tecnicoId", label: "Técnico asignado", tipo: "select", buscable: true, opciones: opc.tecnicos },
    {
      k: "ayudanteId",
      label: "Técnico ayudante (opcional)",
      tipo: "select",
      buscable: true,
      opciones: opcAyudante,
      ayuda: "Si van dos al local. Lo ve en su celular; el acta la llena el asignado.",
    },
    {
      k: "motivoCodigo",
      label: "Motivo de la visita",
      span: 2,
      tipo: "checks",
      opciones: opc.motivos,
      ayuda: "Marca todos los que correspondan. El primero es el que encabeza la ficha del técnico.",
    },
    ...camposFecha(form),
    {
      k: "hora",
      label: esInstalacion ? "Hora de la instalación (obligatoria)" : "Hora de llegada (opcional)",
      tipo: "time",
      // Con margen, «desde» y «hasta» llenan la fila: la hora baja a la suya.
      span: form.margen === true ? 2 : 1,
      ayuda: esInstalacion
        ? "En instalación la hora es obligatoria: la tienda tiene que dejar el acceso libre."
        : "Si la dejas vacía, el técnico la realiza en cualquier momento del día.",
    },
    { k: "responsable", label: "Responsable de tienda", span: 2, ph: "Nombre de quien recibe" },
    {
      k: "respRut",
      label: "RUT del responsable",
      tipo: "rut",
      ph: "12.345.678-9",
      ayuda: "Opcional al agendar. Si va, el técnico lo encuentra ya escrito en el acta.",
    },
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
      plegable: true,
      ph: "Ej: entrar por acceso de proveedores, estacionamiento -2, pedir credencial en control.",
    },
  ];

  function onCampo(k: string, valor: string | boolean) {
    setForm((prev) => {
      if (k === "clienteId") {
        const primera = opc.sucursalesDe(String(valor))[0]?.v ?? "";
        return { ...prev, clienteId: valor, sucursalId: primera };
      }
      // Si el asignado pasa a ser el que iba de ayudante, el ayudante se suelta.
      if (k === "tecnicoId" && String(valor) === String(prev.ayudanteId)) {
        return { ...prev, tecnicoId: valor, ayudanteId: "" };
      }
      return { ...prev, [k]: valor };
    });
  }

  async function guardar() {
    if (motivosMarcados.length === 0) {
      onHecho("Marca al menos un motivo de la visita.");
      return;
    }
    // El RUT es opcional; a medio escribir, no. Si va, va bien.
    const errorRut = mensajeRut(String(form.respRut ?? ""));
    if (errorRut) {
      onHecho(errorRut);
      return;
    }
    if (esInstalacion && !form.hora) {
      onHecho("En instalación la hora es obligatoria.");
      return;
    }
    const malMargen = errorMargen(form);
    if (malMargen) {
      onHecho(malMargen);
      return;
    }
    setGuardando(true);
    const datos = {
      clienteId: Number(form.clienteId),
      sucursalId: Number(form.sucursalId),
      tecnicoId: Number(form.tecnicoId),
      tecnicoAyudanteId: form.ayudanteId ? Number(form.ayudanteId) : null,
      motivoCodigo: motivosMarcados[0],
      motivosCodigos: motivosMarcados,
      fechaProgramada: String(form.fecha),
      fechaHasta: fechaHastaDe(form),
      horaProgramada: String(form.hora) || null,
      trabajoSolicitado: String(form.trabajo),
      indicacionesAcceso: String(form.acceso) || null,
      responsableNombre: String(form.responsable) || null,
      responsableRut: String(form.respRut) || null,
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
    // Una fecha ya pasada no sirve para reprogramar: se propone hoy.
    fecha: visita.fechaProgramada < hoyISO() ? hoyISO() : visita.fechaProgramada,
    hora: visita.horaProgramada ?? "",
  });
  const [guardando, setGuardando] = useState(false);

  const esInstalacion = algunoPideHora(visita.motivosCodigos, ref.motivos);

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
 * "Liberar" — suelta una visita EN CURSO y la deja programada.
 *
 * Mientras está en curso solo puede terminarla quien la inició (el asignado o
 * el ayudante). Es solo una confirmación: no hay nada que llenar.
 */
export function LiberarDialogo({
  visita,
  onCerrar,
  onHecho,
}: {
  visita: Visita;
  onCerrar: () => void;
  onHecho: (mensaje: string) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const quien = nombreDeQuienLaTomo(visita) ?? "el técnico";

  async function guardar() {
    setGuardando(true);
    const res = await liberarVisitaAction(visita.folio);
    setGuardando(false);
    if (!res.ok) {
      onHecho(res.error ?? "No se pudo liberar la visita.");
      return;
    }
    onHecho(`Visita ${visita.folio} liberada: quedó programada`);
    onCerrar();
  }

  return (
    <Dialogo
      kicker="Operación · liberar visita"
      titulo={`Liberar ${visita.folio}`}
      cta="Liberar la visita"
      nota={`La visita está en curso y la tiene ${quien}. Al liberarla se anula ese inicio y vuelve a quedar «Programada»: ${
        visita.tecnicoAyudante ? "cualquiera de los dos técnicos" : "el técnico"
      } puede iniciarla de nuevo, y la hora de llegada será la de ese nuevo inicio. Lo que ${quien} llevaba escrito queda guardado como borrador en su celular.`}
      campos={[]}
      form={{}}
      onCampo={() => {}}
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

/**
 * "Eliminar visita" — sacarla de circulación por completo, no solo cerrarla.
 *
 * A propósito pide escribir el folio de nuevo: cerrarlo de un clic de más se
 * arregla reabriendo el diálogo, esto no. La visita no se borra —queda
 * inactiva y en dmc.visita_eliminacion con el usuario y la fecha— pero deja
 * de aparecer en el panel, en el celular del técnico y en los gráficos.
 */
export function EliminarVisitaDialogo({
  visita,
  onCerrar,
  onEliminada,
  onError,
}: {
  visita: Visita;
  onCerrar: () => void;
  /** La visita quedó eliminada: ya no hay ficha que mostrar acá. */
  onEliminada: () => void;
  onError: (mensaje: string) => void;
}) {
  const [form, setForm] = useState<FormValores>({ confirmacion: "" });
  const [guardando, setGuardando] = useState(false);

  const campos: CampoDef[] = [
    {
      k: "confirmacion",
      label: `Escribe el folio para confirmar`,
      span: 2,
      ph: visita.folio,
      ayuda: `Tiene que ser exactamente «${visita.folio}».`,
    },
  ];

  async function guardar() {
    if (String(form.confirmacion).trim() !== visita.folio) {
      onError("El folio no coincide. Escríbelo tal cual aparece arriba para confirmar.");
      return;
    }
    setGuardando(true);
    const res = await eliminarVisitaAction({
      folio: visita.folio,
      confirmacionFolio: String(form.confirmacion).trim(),
    });
    setGuardando(false);
    if (!res.ok) {
      onError(res.error ?? "No se pudo eliminar la visita.");
      return;
    }
    onEliminada();
  }

  return (
    <Dialogo
      kicker="Operación · eliminar visita"
      titulo={`Eliminar ${visita.folio}`}
      cta="Eliminar visita"
      nota="No se borra de la base: queda inactiva y registrada en la auditoría de eliminaciones, con tu usuario y la fecha. Pero desaparece del panel, del celular del técnico, de los problemas y de los gráficos de coordinación —solo el administrador la sigue viendo, con el filtro «Eliminadas»—, y no hay forma de deshacerlo desde acá — si hace falta recuperarla, hay que pedirlo directo en la base de datos."
      campos={campos}
      form={form}
      onCampo={(k, v) => setForm((prev) => ({ ...prev, [k]: v }))}
      onCerrar={onCerrar}
      onGuardar={guardar}
      guardando={guardando}
    />
  );
}
