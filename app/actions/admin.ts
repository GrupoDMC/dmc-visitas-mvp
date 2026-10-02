"use server";

import { revalidatePath } from "next/cache";
import { sesionCon } from "@/lib/auth";
import {
  actualizarProblema,
  cancelarVisitaPorAdmin,
  crearVisita,
  editarVisita,
  eliminarVisita,
  FaltaMigracionMargen,
  getVisitaCompletaPorFolio,
  liberarVisita,
  registrarEnvioActa,
  reprogramarVisita,
  type DatosVisita,
} from "@/lib/data/visitas";
import { marcarGestionPendiente } from "@/lib/data/pendientes";
import { marcarGestionProblema } from "@/lib/data/problemas";
import {
  aplicarPlantilla,
  FaltaMigracionEstadosProblema,
  FaltaMigracionGestionProblemas,
  FaltaMigracionPendientes,
  getPlantilla,
  guardarChecklist,
  guardarPlantilla,
  listarEstadosProblema,
  listarMotivos,
  PLANTILLA_PROPIA,
  type BorradorChecklist,
  type ResumenChecklist,
} from "@/lib/data/catalogos";
import {
  atenderSolicitudPassword,
  descartarSolicitudPassword,
} from "@/lib/data/solicitudes-password";
import { modificarVisita, type CambiosVisita } from "@/lib/data/visitas-lote";
import { tiene } from "@/lib/permisos";
import { algunoPideHora } from "@/lib/ui/motivos";
import type { ChecklistPlantilla, EstadoProblema } from "@/lib/types";

export interface ResultadoAdmin {
  ok: boolean;
  error?: string;
  /** Folio de la visita creada, para poder saltar a su acta. */
  folio?: string;
}

function revalidarPanel(folio?: string) {
  revalidatePath("/admin", "layout");
  if (folio) revalidatePath(`/admin/visitas/${folio}`);
  revalidatePath("/tecnico", "layout");
}

function comoError(err: unknown, contexto: string): ResultadoAdmin {
  if (err instanceof FaltaMigracionMargen) {
    return { ok: false, error: "Para agendar con margen de días falta correr la migración 010 en la base." };
  }
  const texto = err instanceof Error ? err.message : String(err);
  if (/ck_visita_fecha_hasta/i.test(texto)) return { ok: false, error: ERROR_MARGEN };
  if (/fk_visita_motivo/i.test(texto)) {
    return { ok: false, error: "Ese motivo ya no existe en el checklist. Elige otro." };
  }
  if (/ck_visita_hora_instalacion/i.test(texto)) {
    // Solo pasa en una base sin la migración 007: el CHECK viejo todavía mira
    // el código INSTALACION, que hoy es otro motivo.
    return { ok: false, error: "La base todavía exige hora para este motivo. Falta correr la migración 007." };
  }
  if (/ck_visita_ayudante/i.test(texto)) {
    return { ok: false, error: "El ayudante no puede ser el mismo técnico asignado." };
  }
  if (/ck_problema_otro_desc/i.test(texto)) {
    return { ok: false, error: "Un problema del tipo «Otro» necesita una descripción escrita." };
  }
  console.error(`[dmc] ${contexto}:`, err);
  return { ok: false, error: "No se pudo guardar en el servidor. Inténtalo otra vez." };
}

// ── Visitas ─────────────────────────────────────────────────────────────────

const ERROR_MARGEN = "En el margen de días, la fecha «hasta» tiene que ser posterior a la primera.";

/** El margen, si viene, termina después de empezar. */
function margenInvalido(datos: DatosVisita): boolean {
  return Boolean(datos.fechaHasta) && String(datos.fechaHasta) <= datos.fechaProgramada;
}

/** Basta con que una instalación esté entre los motivos marcados. */
async function incluyeInstalacion(datos: DatosVisita): Promise<boolean> {
  const marcados = datos.motivosCodigos?.length ? datos.motivosCodigos : [datos.motivoCodigo];
  return algunoPideHora(marcados, await listarMotivos());
}

export async function crearVisitaAction(datos: DatosVisita): Promise<ResultadoAdmin> {
  const sesion = await sesionCon("visitas.crear");
  if (!sesion) return { ok: false, error: "No tienes permiso para crear visitas." };
  if (!datos.clienteId || !datos.sucursalId || !datos.tecnicoId) {
    return { ok: false, error: "Cliente, sucursal y técnico asignado son obligatorios." };
  }
  if (!datos.trabajoSolicitado.trim()) {
    return { ok: false, error: "Escribe qué se necesita hacer en la tienda." };
  }
  if (!datos.fechaProgramada) return { ok: false, error: "Elige la fecha programada." };
  if (margenInvalido(datos)) return { ok: false, error: ERROR_MARGEN };
  if (datos.tecnicoAyudanteId && datos.tecnicoAyudanteId === datos.tecnicoId) {
    return { ok: false, error: "El ayudante no puede ser el mismo técnico asignado." };
  }
  if (!datos.horaProgramada && (await incluyeInstalacion(datos))) {
    return { ok: false, error: "En instalación la hora es obligatoria." };
  }

  try {
    const visita = await crearVisita(datos, sesion.usuario.id);
    revalidarPanel(visita.folio);
    return { ok: true, folio: visita.folio };
  } catch (err) {
    return comoError(err, "crearVisita");
  }
}

export interface ResultadoMasivo {
  ok: boolean;
  error?: string;
  /** Folios de las visitas que sí quedaron creadas. */
  folios: string[];
  /** Sucursales cuya visita no se pudo crear, para reintentar solo esas. */
  fallidas: number[];
}

/**
 * "Visitas masivas": la ruta de un técnico, un local por visita.
 *
 * Cada elemento ya viene resuelto desde el diálogo (lo común más lo propio del
 * local). Se valida todo antes de escribir nada; si después falla alguna en la
 * base, las anteriores quedan creadas y se devuelve cuáles faltaron.
 */
export async function crearVisitasMasivasAction(visitas: DatosVisita[]): Promise<ResultadoMasivo> {
  const falla = (error: string): ResultadoMasivo => ({
    ok: false,
    error,
    folios: [],
    fallidas: visitas.map((v) => v.sucursalId),
  });

  const sesion = await sesionCon("visitas.crear");
  if (!sesion) return falla("No tienes permiso para crear visitas.");
  if (visitas.length === 0) return falla("Agrega al menos un local a la ruta.");
  if (new Set(visitas.map((v) => v.sucursalId)).size !== visitas.length) {
    return falla("Hay un local repetido en la ruta.");
  }

  const motivos = await listarMotivos();
  for (const datos of visitas) {
    if (!datos.clienteId || !datos.sucursalId || !datos.tecnicoId) {
      return falla("Cliente, sucursal y técnico asignado son obligatorios.");
    }
    if (!datos.motivoCodigo) return falla("Marca al menos un motivo de la visita.");
    if (!datos.trabajoSolicitado.trim()) {
      return falla("Escribe qué se necesita hacer: para todos o en cada local.");
    }
    if (!datos.fechaProgramada) return falla("Elige la fecha programada.");
    if (margenInvalido(datos)) return falla(ERROR_MARGEN);
    if (datos.tecnicoAyudanteId && datos.tecnicoAyudanteId === datos.tecnicoId) {
      return falla("El ayudante no puede ser el mismo técnico asignado.");
    }
    const marcados = datos.motivosCodigos?.length ? datos.motivosCodigos : [datos.motivoCodigo];
    if (!datos.horaProgramada && algunoPideHora(marcados, motivos)) {
      return falla("En instalación la hora es obligatoria en cada local.");
    }
  }

  const folios: string[] = [];
  const fallidas: number[] = [];
  let error: string | undefined;
  for (const datos of visitas) {
    try {
      const visita = await crearVisita({ ...datos, problemaOrigenId: null, creadaEnTerreno: false }, sesion.usuario.id);
      folios.push(visita.folio);
    } catch (err) {
      fallidas.push(datos.sucursalId);
      error = comoError(err, "crearVisitasMasivas").error;
    }
  }

  if (folios.length > 0) revalidarPanel();
  return { ok: fallidas.length === 0, error, folios, fallidas };
}

export async function editarVisitaAction(folio: string, datos: DatosVisita): Promise<ResultadoAdmin> {
  const sesion = await sesionCon("visitas.editar");
  if (!sesion) return { ok: false, error: "No tienes permiso para editar visitas." };
  if (!datos.clienteId || !datos.sucursalId || !datos.tecnicoId) {
    return { ok: false, error: "Cliente, sucursal y técnico asignado son obligatorios." };
  }
  if (!datos.trabajoSolicitado.trim()) {
    return { ok: false, error: "Escribe qué se necesita hacer en la tienda." };
  }
  if (margenInvalido(datos)) return { ok: false, error: ERROR_MARGEN };
  if (datos.tecnicoAyudanteId && datos.tecnicoAyudanteId === datos.tecnicoId) {
    return { ok: false, error: "El ayudante no puede ser el mismo técnico asignado." };
  }
  if (!datos.horaProgramada && (await incluyeInstalacion(datos))) {
    return { ok: false, error: "En instalación la hora es obligatoria." };
  }

  try {
    if (!(await editarVisita(folio, datos, sesion.usuario.id))) {
      return { ok: false, error: "No encontramos esa visita." };
    }
  } catch (err) {
    return comoError(err, "editarVisita");
  }
  revalidarPanel(folio);
  return { ok: true, folio };
}

export async function reprogramarVisitaAction(input: {
  folio: string;
  tecnicoId: number;
  fecha: string;
  hora: string | null;
}): Promise<ResultadoAdmin> {
  const sesion = await sesionCon("visitas.reprogramar");
  if (!sesion) return { ok: false, error: "No tienes permiso para reprogramar visitas." };
  if (!input.tecnicoId || !input.fecha) return { ok: false, error: "Elige el técnico y la nueva fecha." };
  if (!input.hora) {
    const visita = await getVisitaCompletaPorFolio(input.folio);
    if (visita && algunoPideHora(visita.motivosCodigos, await listarMotivos())) {
      return { ok: false, error: "En instalación la hora es obligatoria." };
    }
  }

  try {
    const ok = await reprogramarVisita({
      folio: input.folio,
      tecnicoId: input.tecnicoId,
      fecha: input.fecha,
      hora: input.hora,
      usuarioId: sesion.usuario.id,
    });
    if (!ok) return { ok: false, error: "No encontramos esa visita." };
  } catch (err) {
    return comoError(err, "reprogramarVisita");
  }
  revalidarPanel(input.folio);
  return { ok: true, folio: input.folio };
}

/**
 * "Cancelar por admin" — el cierre administrativo de una visita vieja o que ya
 * no sirve.
 *
 * Vale para las que están EN CURSO y para las que no se han iniciado. Una
 * visita COMPLETADA ya tiene acta firmada y no se toca: eso lo vuelve a
 * comprobar la capa de datos con la fila bloqueada, por si el técnico alcanza a
 * cerrarla mientras el administrador confirma el diálogo.
 */
export async function cancelarVisitaAdminAction(input: {
  folio: string;
  motivo: string;
}): Promise<ResultadoAdmin> {
  const sesion = await sesionCon("visitas.cancelar");
  if (!sesion) {
    return { ok: false, error: "No tienes permiso para cancelar visitas por admin." };
  }
  const motivo = input.motivo.trim();
  if (motivo.length < 10) {
    return { ok: false, error: "Escribe por qué se cierra la visita: queda en la bitácora." };
  }

  try {
    const fallo = await cancelarVisitaPorAdmin({
      folio: input.folio,
      motivo,
      usuarioId: sesion.usuario.id,
    });
    if (fallo) return { ok: false, error: fallo.error };
  } catch (err) {
    return comoError(err, "cancelarVisitaPorAdmin");
  }
  revalidarPanel(input.folio);
  return { ok: true, folio: input.folio };
}

/**
 * "Liberar" — suelta una visita EN CURSO y la deja PROGRAMADA.
 *
 * Mientras está en curso solo puede terminarla el técnico que la inició (el
 * asignado o el ayudante). Esto la destraba: lo que estaba en curso se anula
 * y cualquiera de los dos puede iniciarla de nuevo.
 */
export async function liberarVisitaAction(folio: string): Promise<ResultadoAdmin> {
  const sesion = await sesionCon("visitas.liberar");
  if (!sesion) return { ok: false, error: "No tienes permiso para liberar visitas." };

  try {
    const fallo = await liberarVisita({ folio, usuarioId: sesion.usuario.id });
    if (fallo) return { ok: false, error: fallo.error };
  } catch (err) {
    return comoError(err, "liberarVisita");
  }
  revalidarPanel(folio);
  return { ok: true, folio };
}

/**
 * "Eliminar visita" — sacarla de circulación por completo, no solo cerrarla.
 *
 * A diferencia de "Cancelar por admin", esto vale sobre cualquier estado
 * (incluida una COMPLETADA): es para una visita que nunca debió existir —el
 * cliente de prueba, el ensayo del técnico— y no para una que se hizo pero ya
 * no sirve. Solo quien tenga el permiso, y solo si escribe el folio de nuevo: es la
 * traba contra el clic accidental. Queda con nombre y apellido en
 * dmc.visita_eliminacion.
 */
export async function eliminarVisitaAction(input: {
  folio: string;
  confirmacionFolio: string;
}): Promise<ResultadoAdmin> {
  const sesion = await sesionCon("visitas.eliminar");
  if (!sesion) {
    return { ok: false, error: "No tienes permiso para eliminar visitas." };
  }

  try {
    const fallo = await eliminarVisita({
      folio: input.folio,
      confirmacionFolio: input.confirmacionFolio,
      usuarioId: sesion.usuario.id,
    });
    if (fallo) return { ok: false, error: fallo.error };
  } catch (err) {
    return comoError(err, "eliminarVisita");
  }
  revalidarPanel();
  return { ok: true, folio: input.folio };
}

// ── Acciones para múltiples visitas ─────────────────────────────────────────
//
// Las mismas operaciones de arriba, sobre las visitas marcadas en la tabla.
// Hace falta el permiso «Acciones para múltiples visitas» y además el de la
// operación. Cada visita se resuelve por separado: la que no se puede queda
// con su explicación y las demás siguen.

export interface ResultadoLote {
  ok: boolean;
  /** Cuando no se alcanzó a tocar ninguna: falta el permiso o algo viene mal. */
  error?: string;
  /** Folios en los que quedó aplicado. */
  hechas: string[];
  /** Las que no se pudieron, con el porqué de cada una. */
  fallidas: { folio: string; error: string }[];
}

/** El diálogo manda las visitas por tandas de este tamaño. */
const MAXIMO_POR_TANDA = 25;

const loteRechazado = (error: string): ResultadoLote => ({ ok: false, error, hechas: [], fallidas: [] });

async function sesionParaLote(permiso: string) {
  const sesion = await sesionCon("visitas.masivo");
  return sesion && tiene(sesion.permisos, permiso) ? sesion : null;
}

function tandaInvalida(folios: string[]): string | null {
  if (folios.length === 0) return "No hay ninguna visita seleccionada.";
  if (folios.length > MAXIMO_POR_TANDA) return "Son demasiadas visitas de una vez.";
  if (new Set(folios).size !== folios.length) return "Hay una visita repetida en la selección.";
  return null;
}

async function aplicarEnLote(
  folios: string[],
  contexto: string,
  aplicar: (folio: string, i: number) => Promise<{ error: string } | null>
): Promise<ResultadoLote> {
  const hechas: string[] = [];
  const fallidas: ResultadoLote["fallidas"] = [];
  for (const [i, folio] of folios.entries()) {
    try {
      const fallo = await aplicar(folio, i);
      if (fallo) fallidas.push({ folio, error: fallo.error });
      else hechas.push(folio);
    } catch (err) {
      fallidas.push({ folio, error: comoError(err, contexto).error ?? "No se pudo guardar." });
    }
  }
  if (hechas.length > 0) revalidarPanel();
  return { ok: fallidas.length === 0, hechas, fallidas };
}

/**
 * Reagendar, cambiar el técnico, el motivo o el detalle de varias visitas.
 * Cada elemento ya viene resuelto desde el diálogo: lo común más lo propio de
 * esa visita. Lo que no viene en `cambios` se queda como estaba.
 */
export async function modificarVisitasAction(
  items: { folio: string; cambios: CambiosVisita }[]
): Promise<ResultadoLote> {
  const sesion = await sesionParaLote("visitas.editar");
  if (!sesion) return loteRechazado("No tienes permiso para editar varias visitas a la vez.");
  const mal = tandaInvalida(items.map((x) => x.folio));
  if (mal) return loteRechazado(mal);

  const limpios: CambiosVisita[] = [];
  for (const { folio, cambios: c } of items) {
    const limpio: CambiosVisita = {};
    if (c.tecnicoId) limpio.tecnicoId = Number(c.tecnicoId);
    if (c.tecnicoAyudanteId !== undefined) limpio.tecnicoAyudanteId = Number(c.tecnicoAyudanteId) || null;
    if (c.fecha) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha)) return loteRechazado(`${folio}: la fecha no es válida.`);
      limpio.fecha = c.fecha;
    }
    if (c.hora) {
      if (!/^\d{2}:\d{2}/.test(c.hora)) return loteRechazado(`${folio}: la hora no es válida.`);
      limpio.hora = c.hora;
    }
    const motivos = (c.motivosCodigos ?? []).filter(Boolean);
    if (motivos.length) limpio.motivosCodigos = motivos;
    if (c.trabajoSolicitado?.trim()) limpio.trabajoSolicitado = c.trabajoSolicitado.trim();
    if (c.indicacionesAcceso?.trim()) limpio.indicacionesAcceso = c.indicacionesAcceso.trim();
    if (Object.keys(limpio).length === 0) return loteRechazado(`${folio} no tiene ningún cambio.`);
    limpios.push(limpio);
  }

  const motivos = await listarMotivos();
  return aplicarEnLote(
    items.map((x) => x.folio),
    "modificarVisitas",
    (folio, i) => modificarVisita(folio, limpios[i], sesion.usuario.id, motivos)
  );
}

/** «Cancelar por admin» sobre varias: cada una con su motivo (el común o el suyo). */
export async function cancelarVisitasAdminAction(items: { folio: string; motivo: string }[]): Promise<ResultadoLote> {
  const sesion = await sesionParaLote("visitas.cancelar");
  if (!sesion) return loteRechazado("No tienes permiso para cancelar varias visitas por admin.");
  const mal = tandaInvalida(items.map((x) => x.folio));
  if (mal) return loteRechazado(mal);
  const sinMotivo = items.find((x) => x.motivo.trim().length < 10);
  if (sinMotivo) {
    return loteRechazado(`${sinMotivo.folio}: escribe por qué se cierra la visita, queda en la bitácora.`);
  }

  return aplicarEnLote(
    items.map((x) => x.folio),
    "cancelarVisitas",
    (folio, i) => cancelarVisitaPorAdmin({ folio, motivo: items[i].motivo.trim(), usuarioId: sesion.usuario.id })
  );
}

/**
 * «Eliminar» sobre varias. La traba contra el clic accidental no es el folio
 * —son muchos— sino escribir «ELIMINAR» y cuántas son: `total` es el número
 * que se le mostró a quien confirma, aunque lleguen por tandas.
 */
export async function eliminarVisitasAction(input: {
  folios: string[];
  total: number;
  confirmacion: string;
}): Promise<ResultadoLote> {
  const sesion = await sesionParaLote("visitas.eliminar");
  if (!sesion) return loteRechazado("No tienes permiso para eliminar varias visitas a la vez.");
  const mal = tandaInvalida(input.folios);
  if (mal) return loteRechazado(mal);
  if (input.folios.length > input.total || input.confirmacion.trim().toUpperCase() !== `ELIMINAR ${input.total}`) {
    return loteRechazado(`La confirmación no coincide. Escribe «ELIMINAR ${input.total}» tal cual.`);
  }

  return aplicarEnLote(input.folios, "eliminarVisitas", (folio) =>
    eliminarVisita({ folio, confirmacionFolio: folio, usuarioId: sesion.usuario.id })
  );
}

export async function actualizarProblemaAction(input: {
  problemaId: number;
  estado: EstadoProblema;
  tipoCodigo: string;
  /** Por qué se cambia. Opcional; queda en la bitácora del problema. */
  nota?: string;
}): Promise<ResultadoAdmin> {
  const sesion = await sesionCon("problemas.editar");
  if (!sesion) return { ok: false, error: "No tienes permiso para cambiar problemas." };

  // El estado tiene que ser uno de la Lista 7 del checklist.
  if (!(await listarEstadosProblema()).some((e) => e.codigo === input.estado)) {
    return { ok: false, error: "Ese estado ya no existe en el checklist. Recarga la página y elige otro." };
  }

  try {
    const nota = input.nota?.trim() || null;
    if (!(await actualizarProblema(input.problemaId, input.estado, input.tipoCodigo, sesion.usuario.id, nota))) {
      return { ok: false, error: "No encontramos ese problema." };
    }
  } catch (err) {
    return comoError(err, "actualizarProblema");
  }
  revalidarPanel();
  return { ok: true };
}

/** Marca o desmarca un paso del checklist de gestión en «Reagendas y pendientes». */
export async function marcarGestionPendienteAction(input: {
  folio: string;
  codigo: string;
  marcado: boolean;
}): Promise<ResultadoAdmin> {
  const sesion = await sesionCon("reagendas.gestionar");
  if (!sesion) return { ok: false, error: "No tienes permiso para marcar la gestión de pendientes." };

  try {
    const fallo = await marcarGestionPendiente({
      folio: input.folio,
      codigo: input.codigo,
      marcado: input.marcado,
      usuarioId: sesion.usuario.id,
    });
    if (fallo) return { ok: false, error: fallo.error };
  } catch (err) {
    return comoError(err, "marcarGestionPendiente");
  }
  revalidatePath("/admin/reagendas");
  return { ok: true, folio: input.folio };
}

/** Marca o desmarca un paso del checklist de gestión en «Problemas». */
export async function marcarGestionProblemaAction(input: {
  problemaId: number;
  codigo: string;
  marcado: boolean;
}): Promise<ResultadoAdmin> {
  const sesion = await sesionCon("problemas.editar");
  if (!sesion) return { ok: false, error: "No tienes permiso para marcar la gestión de problemas." };

  try {
    const fallo = await marcarGestionProblema({
      problemaId: Number(input.problemaId),
      codigo: input.codigo,
      marcado: input.marcado,
      usuarioId: sesion.usuario.id,
    });
    if (fallo) return { ok: false, error: fallo.error };
  } catch (err) {
    return comoError(err, "marcarGestionProblema");
  }
  revalidatePath("/admin/problemas");
  return { ok: true };
}

export async function enviarActaAction(input: {
  folio: string;
  para: string;
  cc: string;
  asunto: string;
  cuerpo?: string;
  adjuntos: number;
}): Promise<ResultadoAdmin> {
  const sesion = await sesionCon("visitas.enviar");
  if (!sesion) return { ok: false, error: "No tienes permiso para enviar actas." };
  if (!input.para.includes("@")) return { ok: false, error: "Escribe el correo del destinatario." };
  if (!input.asunto.trim()) return { ok: false, error: "El asunto no puede ir vacío." };

  try {
    const ok = await registrarEnvioActa({
      folio: input.folio,
      para: input.para,
      cc: input.cc,
      asunto: input.asunto,
      cuerpo: input.cuerpo?.trim() || `Acta de la visita ${input.folio}.`,
      adjuntos: input.adjuntos,
      usuarioId: sesion.usuario.id,
    });
    if (!ok) return { ok: false, error: "No encontramos esa visita." };
  } catch (err) {
    return comoError(err, "enviarActa");
  }
  revalidarPanel(input.folio);
  return { ok: true, folio: input.folio };
}

// ── Checklist ───────────────────────────────────────────────────────────────
//
// El editor ya no guarda letra por letra: junta todo en un borrador y lo manda
// de una vez cuando el coordinador confirma. Así el orden, los renombres, las
// altas y las bajas quedan consistentes entre sí.

export interface ResultadoChecklist {
  ok: boolean;
  error?: string;
  resumen?: ResumenChecklist;
  plantilla?: ChecklistPlantilla | null;
}

function revalidarChecklist() {
  revalidatePath("/admin", "layout");
  revalidatePath("/tecnico", "layout");
}

function errorChecklist(err: unknown, contexto: string): ResultadoChecklist {
  if (err instanceof FaltaMigracionPendientes) {
    return { ok: false, error: "Para guardar la lista «Gestión de pendientes» falta correr la migración 014 en la base." };
  }
  if (err instanceof FaltaMigracionEstadosProblema) {
    return { ok: false, error: "Para cambiar la lista «Estados del problema» falta correr la migración 016 en la base." };
  }
  if (err instanceof FaltaMigracionGestionProblemas) {
    return { ok: false, error: "Para guardar la lista «Gestión de problemas» falta correr la migración 015 en la base." };
  }
  const texto = err instanceof Error ? err.message : String(err);
  if (/uq_\w*nombre/i.test(texto)) return { ok: false, error: "Hay dos entradas con el mismo nombre en la misma lista." };
  if (/uq_\w*opcion|uq_\w*subtrabajo/i.test(texto)) {
    return { ok: false, error: "Hay dos subdetalles con la misma etiqueta dentro de la misma entrada." };
  }
  console.error(`[dmc] ${contexto}:`, err);
  return { ok: false, error: "No se pudo guardar el checklist. Inténtalo otra vez." };
}

/** Detecta nombres repetidos antes de que SQL Server los rechace. */
function repetidos(nombres: string[]): string | null {
  const vistos = new Set<string>();
  for (const n of nombres) {
    const clave = n.trim().toLowerCase();
    if (!clave) continue;
    if (vistos.has(clave)) return n.trim();
    vistos.add(clave);
  }
  return null;
}

export async function guardarChecklistAction(borrador: BorradorChecklist): Promise<ResultadoChecklist> {
  const sesion = await sesionCon("checklist.editar");
  if (!sesion) return { ok: false, error: "No tienes permiso para editar el checklist." };

  const choque =
    repetidos(borrador.motivos.map((m) => m.nombre)) ??
    repetidos(borrador.problemas.map((x) => x.nombre)) ??
    repetidos(borrador.trabajos.map((x) => x.nombre)) ??
    repetidos((borrador.internos ?? []).map((x) => x.nombre)) ??
    repetidos((borrador.pendientes ?? []).map((x) => x.nombre)) ??
    repetidos((borrador.gestionProblemas ?? []).map((x) => x.nombre)) ??
    repetidos((borrador.estadosProblema ?? []).map((x) => x.nombre));
  if (choque) return { ok: false, error: `«${choque}» está dos veces en la misma lista.` };

  for (const pr of borrador.problemas) {
    const dup = repetidos(pr.opciones.map((o) => o.etiqueta));
    if (dup) return { ok: false, error: `«${dup}» está dos veces dentro de «${pr.nombre}».` };
  }
  for (const t of borrador.trabajos) {
    const dup = repetidos(t.subtrabajos.map((o) => o.etiqueta));
    if (dup) return { ok: false, error: `«${dup}» está dos veces dentro de «${t.nombre}».` };
  }

  try {
    const resumen = await guardarChecklist(borrador);
    revalidarChecklist();
    return { ok: true, resumen };
  } catch (err) {
    return errorChecklist(err, "guardarChecklist");
  }
}

/** Guarda la lista actual como la plantilla propia del panel. */
export async function guardarPlantillaChecklistAction(): Promise<ResultadoChecklist> {
  const sesion = await sesionCon("checklist.editar");
  if (!sesion) return { ok: false, error: "No tienes permiso para editar el checklist." };
  try {
    const plantilla = await guardarPlantilla(PLANTILLA_PROPIA, sesion.usuario.id);
    return { ok: true, plantilla };
  } catch (err) {
    return errorChecklist(err, "guardarPlantilla");
  }
}

/** Deja las tres listas exactamente como quedaron en la plantilla propia. */
export async function reiniciarChecklistAction(): Promise<ResultadoChecklist> {
  const sesion = await sesionCon("checklist.editar");
  if (!sesion) return { ok: false, error: "No tienes permiso para editar el checklist." };
  try {
    const resumen = await aplicarPlantilla(PLANTILLA_PROPIA);
    revalidarChecklist();
    return { ok: true, resumen, plantilla: await getPlantilla(PLANTILLA_PROPIA) };
  } catch (err) {
    const texto = err instanceof Error ? err.message : String(err);
    if (/plantilla/i.test(texto)) return { ok: false, error: texto };
    return errorChecklist(err, "reiniciarChecklist");
  }
}

// ── Recuperación de contraseña ──────────────────────────────────────────────

export async function atenderSolicitudPasswordAction(
  id: number,
  passwordTemporal: string
): Promise<ResultadoAdmin> {
  const sesion = await sesionCon("usuarios.contrasenas");
  if (!sesion) return { ok: false, error: "No tienes permiso para asignar contraseñas." };
  if (passwordTemporal.trim().length < 8) {
    return { ok: false, error: "La contraseña temporal debe tener al menos 8 caracteres." };
  }

  try {
    if (!(await atenderSolicitudPassword(id, passwordTemporal.trim(), sesion.usuario.id))) {
      return {
        ok: false,
        error: "Ese correo no tiene ninguna cuenta. Créala en Maestros › Usuarios antes de asignarle una clave.",
      };
    }
  } catch (err) {
    return comoError(err, "atenderSolicitudPassword");
  }
  revalidarPanel();
  return { ok: true };
}

export async function descartarSolicitudPasswordAction(id: number): Promise<ResultadoAdmin> {
  const sesion = await sesionCon("usuarios.contrasenas");
  if (!sesion) return { ok: false, error: "No tienes permiso para cerrar solicitudes." };
  try {
    if (!(await descartarSolicitudPassword(id, sesion.usuario.id))) {
      return { ok: false, error: "Esa solicitud ya estaba cerrada." };
    }
  } catch (err) {
    return comoError(err, "descartarSolicitudPassword");
  }
  revalidarPanel();
  return { ok: true };
}
