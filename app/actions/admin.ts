"use server";

import { revalidatePath } from "next/cache";
import { sesionCon } from "@/lib/auth";
import {
  actualizarProblema,
  cancelarVisitaPorAdmin,
  crearVisita,
  editarVisita,
  eliminarVisita,
  getVisitaCompletaPorFolio,
  registrarEnvioActa,
  reprogramarVisita,
  type DatosVisita,
} from "@/lib/data/visitas";
import {
  aplicarPlantilla,
  getPlantilla,
  guardarChecklist,
  guardarPlantilla,
  listarMotivos,
  PLANTILLA_PROPIA,
  type BorradorChecklist,
  type ResumenChecklist,
} from "@/lib/data/catalogos";
import {
  atenderSolicitudPassword,
  descartarSolicitudPassword,
} from "@/lib/data/solicitudes-password";
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
  const texto = err instanceof Error ? err.message : String(err);
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

export async function actualizarProblemaAction(input: {
  problemaId: number;
  estado: EstadoProblema;
  tipoCodigo: string;
}): Promise<ResultadoAdmin> {
  const sesion = await sesionCon("problemas.editar");
  if (!sesion) return { ok: false, error: "No tienes permiso para cambiar problemas." };

  try {
    if (!(await actualizarProblema(input.problemaId, input.estado, input.tipoCodigo, sesion.usuario.id))) {
      return { ok: false, error: "No encontramos ese problema." };
    }
  } catch (err) {
    return comoError(err, "actualizarProblema");
  }
  revalidarPanel();
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
    repetidos((borrador.internos ?? []).map((x) => x.nombre));
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
