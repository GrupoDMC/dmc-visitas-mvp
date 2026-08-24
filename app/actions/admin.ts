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
  aplicarPlantilla,
  getPlantilla,
  guardarChecklist,
  guardarPlantilla,
  PLANTILLA_PROPIA,
  type BorradorChecklist,
  type ResumenChecklist,
} from "@/lib/data/catalogos";
import {
  atenderSolicitudPassword,
  descartarSolicitudPassword,
} from "@/lib/data/solicitudes-password";
import type { ChecklistPlantilla, EstadoProblema } from "@/lib/types";

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
  if (/ck_problema_otro_desc/i.test(texto)) {
    return { ok: false, error: "Un problema del tipo «Otro» necesita una descripción escrita." };
  }
  console.error(`[dmc] ${contexto}:`, err);
  return { ok: false, error: "No se pudo guardar en el servidor. Inténtalo otra vez." };
}

// ── Visitas ─────────────────────────────────────────────────────────────────

/** Basta con que una instalación esté entre los motivos marcados. */
function incluyeInstalacion(datos: DatosVisita): boolean {
  const marcados = datos.motivosCodigos?.length ? datos.motivosCodigos : [datos.motivoCodigo];
  return marcados.includes("INSTALACION");
}

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
  if (incluyeInstalacion(datos) && !datos.horaProgramada) {
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
  if (incluyeInstalacion(datos) && !datos.horaProgramada) {
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
  const sesion = await sesionPanel();
  if (!sesion) return { ok: false, error: "No tienes permiso para editar el checklist." };

  const choque =
    repetidos(borrador.motivos.map((m) => m.nombre)) ??
    repetidos(borrador.problemas.map((x) => x.nombre)) ??
    repetidos(borrador.trabajos.map((x) => x.nombre));
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
  const sesion = await sesionPanel();
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
  const sesion = await sesionPanel();
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
  const sesion = await sesionPanel();
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
  const sesion = await sesionPanel();
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
