"use server";

import { revalidatePath } from "next/cache";
import { getSesion } from "@/lib/auth";
import {
  actualizarProblema,
  crearVisita,
  editarVisita,
  registrarEnvioActa,
  reprogramarVisita,
  type DatosVisita,
} from "@/lib/data/visitas";
import {
  actualizarProblemaCatalogo,
  actualizarTrabajoCatalogo,
  crearMotivo,
  crearOpcionProblema,
  crearProblema,
  crearSubtrabajo,
  crearTrabajo,
  eliminarMotivo,
  eliminarOpcionProblema,
  eliminarProblema,
  eliminarSubtrabajo,
  eliminarTrabajo,
  renombrarMotivo,
  renombrarOpcionProblema,
  renombrarSubtrabajo,
  restaurarCatalogoFabrica,
} from "@/lib/data/catalogos";
import type { CatalogoMotivo, CatalogoProblema, CatalogoTrabajo, EstadoProblema } from "@/lib/types";

export interface ResultadoAdmin {
  ok: boolean;
  error?: string;
  /** Folio de la visita creada, para poder saltar a su acta. */
  folio?: string;
}

/** Coordinación y administración pueden operar el panel; el técnico no. */
async function sesionPanel() {
  const sesion = await getSesion();
  if (!sesion || sesion.usuario.rol === "TECNICO") return null;
  return sesion;
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
    return { ok: false, error: "En instalación la hora es obligatoria." };
  }
  console.error(`[dmc] ${contexto}:`, err);
  return { ok: false, error: "No se pudo guardar en el servidor. Inténtalo otra vez." };
}

// ── Visitas ─────────────────────────────────────────────────────────────────

export async function crearVisitaAction(datos: DatosVisita): Promise<ResultadoAdmin> {
  const sesion = await sesionPanel();
  if (!sesion) return { ok: false, error: "No tienes permiso para crear visitas." };
  if (!datos.clienteId || !datos.sucursalId || !datos.tecnicoId) {
    return { ok: false, error: "Cliente, sucursal y técnico asignado son obligatorios." };
  }
  if (!datos.trabajoSolicitado.trim()) {
    return { ok: false, error: "Escribe qué se necesita hacer en la tienda." };
  }
  if (!datos.fechaProgramada) return { ok: false, error: "Elige la fecha programada." };
  if (datos.motivoCodigo === "INSTALACION" && !datos.horaProgramada) {
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

export async function editarVisitaAction(folio: string, datos: DatosVisita): Promise<ResultadoAdmin> {
  const sesion = await sesionPanel();
  if (!sesion) return { ok: false, error: "No tienes permiso para editar visitas." };
  if (!datos.clienteId || !datos.sucursalId || !datos.tecnicoId) {
    return { ok: false, error: "Cliente, sucursal y técnico asignado son obligatorios." };
  }
  if (!datos.trabajoSolicitado.trim()) {
    return { ok: false, error: "Escribe qué se necesita hacer en la tienda." };
  }
  if (datos.motivoCodigo === "INSTALACION" && !datos.horaProgramada) {
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
  motivoCodigo: string;
}): Promise<ResultadoAdmin> {
  const sesion = await sesionPanel();
  if (!sesion) return { ok: false, error: "No tienes permiso para reprogramar visitas." };
  if (!input.tecnicoId || !input.fecha) return { ok: false, error: "Elige el técnico y la nueva fecha." };
  if (input.motivoCodigo === "INSTALACION" && !input.hora) {
    return { ok: false, error: "En instalación la hora es obligatoria." };
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

export async function actualizarProblemaAction(input: {
  problemaId: number;
  estado: EstadoProblema;
  tipoCodigo: string;
}): Promise<ResultadoAdmin> {
  const sesion = await sesionPanel();
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
  const sesion = await sesionPanel();
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

export interface ResultadoChecklist<T> {
  ok: boolean;
  error?: string;
  fila?: T;
}

function revalidarChecklist() {
  revalidatePath("/admin", "layout");
  revalidatePath("/tecnico", "layout");
}

async function conPermiso<T>(accion: () => Promise<T>, contexto: string): Promise<ResultadoChecklist<T>> {
  const sesion = await sesionPanel();
  if (!sesion) return { ok: false, error: "No tienes permiso para editar el checklist." };
  try {
    const fila = await accion();
    revalidarChecklist();
    return { ok: true, fila };
  } catch (err) {
    const texto = err instanceof Error ? err.message : String(err);
    if (/uq_\w*nombre/i.test(texto)) return { ok: false, error: "Ya existe otra entrada con ese nombre." };
    if (/uq_\w*opcion|uq_\w*subtrabajo/i.test(texto)) return { ok: false, error: "Ese subdetalle ya está en la lista." };
    console.error(`[dmc] ${contexto}:`, err);
    return { ok: false, error: "No se pudo guardar el cambio." };
  }
}

// Todas van declaradas como `async function`: Next exige que una Server Action
// exportada lo sea, aunque el cuerpo delegue en otra promesa.

export async function crearMotivoAction(nombre: string): Promise<ResultadoChecklist<CatalogoMotivo>> {
  return conPermiso(() => crearMotivo(nombre.trim() || "Nuevo motivo"), "crearMotivo");
}

export async function renombrarMotivoAction(id: number, nombre: string) {
  return conPermiso(() => renombrarMotivo(id, nombre.trim()), "renombrarMotivo");
}

export async function eliminarMotivoAction(id: number) {
  return conPermiso(() => eliminarMotivo(id), "eliminarMotivo");
}

export async function crearTipoProblemaAction(nombre: string): Promise<ResultadoChecklist<CatalogoProblema>> {
  return conPermiso(() => crearProblema(nombre.trim() || "Nuevo tipo de problema"), "crearProblema");
}

export async function actualizarTipoProblemaAction(
  id: number,
  campos: { nombre?: string; grupoLabel?: string | null }
) {
  return conPermiso(() => actualizarProblemaCatalogo(id, campos), "actualizarProblemaCatalogo");
}

export async function eliminarTipoProblemaAction(id: number) {
  return conPermiso(() => eliminarProblema(id), "eliminarProblema");
}

export async function crearOpcionProblemaAction(problemaId: number, etiqueta: string) {
  return conPermiso(() => crearOpcionProblema(problemaId, etiqueta.trim()), "crearOpcionProblema");
}

export async function renombrarOpcionProblemaAction(id: number, etiqueta: string) {
  return conPermiso(() => renombrarOpcionProblema(id, etiqueta.trim()), "renombrarOpcionProblema");
}

export async function eliminarOpcionProblemaAction(id: number) {
  return conPermiso(() => eliminarOpcionProblema(id), "eliminarOpcionProblema");
}

export async function crearTrabajoAction(nombre: string): Promise<ResultadoChecklist<CatalogoTrabajo>> {
  return conPermiso(() => crearTrabajo(nombre.trim() || "Nuevo trabajo"), "crearTrabajo");
}

export async function actualizarTrabajoAction(id: number, campos: { nombre?: string; grupoLabel?: string | null }) {
  return conPermiso(() => actualizarTrabajoCatalogo(id, campos), "actualizarTrabajoCatalogo");
}

export async function eliminarTrabajoAction(id: number) {
  return conPermiso(() => eliminarTrabajo(id), "eliminarTrabajo");
}

export async function crearSubtrabajoAction(trabajoId: number, etiqueta: string) {
  return conPermiso(() => crearSubtrabajo(trabajoId, etiqueta.trim()), "crearSubtrabajo");
}

export async function renombrarSubtrabajoAction(id: number, etiqueta: string) {
  return conPermiso(() => renombrarSubtrabajo(id, etiqueta.trim()), "renombrarSubtrabajo");
}

export async function eliminarSubtrabajoAction(id: number) {
  return conPermiso(() => eliminarSubtrabajo(id), "eliminarSubtrabajo");
}

export async function restaurarCatalogoAction() {
  return conPermiso(() => restaurarCatalogoFabrica(), "restaurarCatalogo");
}
