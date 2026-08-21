"use server";

import { revalidatePath } from "next/cache";
import { getSesion } from "@/lib/auth";
import {
  crearVisitaMock,
  editarVisitaMock,
  reprogramarVisitaMock,
  actualizarProblemaMock,
  marcarActaEnviadaMock,
  type DatosVisita,
} from "@/lib/mock/visitas";
import type { EstadoProblema } from "@/lib/types";

export interface ResultadoAdmin {
  ok: boolean;
  error?: string;
  /** Folio de la visita creada, para poder saltar a su acta. */
  folio?: string;
}

/** Coordinación y administración pueden operar el panel; el técnico no. */
async function permitido(): Promise<boolean> {
  const sesion = await getSesion();
  return !!sesion && sesion.usuario.rol !== "TECNICO";
}

function revalidarPanel(folio?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/visitas");
  revalidatePath("/admin/reagendas");
  revalidatePath("/admin/problemas");
  if (folio) revalidatePath(`/admin/visitas/${folio}`);
  revalidatePath("/tecnico");
  revalidatePath("/tecnico/visitas");
}

export async function crearVisitaAction(datos: DatosVisita): Promise<ResultadoAdmin> {
  if (!(await permitido())) return { ok: false, error: "No tienes permiso para crear visitas." };
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

  const visita = crearVisitaMock(datos);
  revalidarPanel(visita.folio);
  return { ok: true, folio: visita.folio };
}

export async function editarVisitaAction(folio: string, datos: DatosVisita): Promise<ResultadoAdmin> {
  if (!(await permitido())) return { ok: false, error: "No tienes permiso para editar visitas." };
  if (!datos.clienteId || !datos.sucursalId || !datos.tecnicoId) {
    return { ok: false, error: "Cliente, sucursal y técnico asignado son obligatorios." };
  }
  if (!datos.trabajoSolicitado.trim()) {
    return { ok: false, error: "Escribe qué se necesita hacer en la tienda." };
  }
  if (datos.motivoCodigo === "INSTALACION" && !datos.horaProgramada) {
    return { ok: false, error: "En instalación la hora es obligatoria." };
  }

  if (!editarVisitaMock(folio, datos)) return { ok: false, error: "No encontramos esa visita." };
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
  if (!(await permitido())) return { ok: false, error: "No tienes permiso para reprogramar visitas." };
  if (!input.tecnicoId || !input.fecha) return { ok: false, error: "Elige el técnico y la nueva fecha." };
  if (input.motivoCodigo === "INSTALACION" && !input.hora) {
    return { ok: false, error: "En instalación la hora es obligatoria." };
  }

  if (!reprogramarVisitaMock(input.folio, input.tecnicoId, input.fecha, input.hora)) {
    return { ok: false, error: "No encontramos esa visita." };
  }
  revalidarPanel(input.folio);
  return { ok: true, folio: input.folio };
}

export async function actualizarProblemaAction(input: {
  problemaId: number;
  estado: EstadoProblema;
  tipoCodigo: string;
}): Promise<ResultadoAdmin> {
  if (!(await permitido())) return { ok: false, error: "No tienes permiso para cambiar problemas." };
  if (!actualizarProblemaMock(input.problemaId, input.estado, input.tipoCodigo)) {
    return { ok: false, error: "No encontramos ese problema." };
  }
  revalidarPanel();
  return { ok: true };
}

export async function enviarActaAction(input: {
  folio: string;
  para: string;
  cc: string;
  asunto: string;
  adjuntos: number;
}): Promise<ResultadoAdmin> {
  if (!(await permitido())) return { ok: false, error: "No tienes permiso para enviar actas." };
  if (!input.para.includes("@")) return { ok: false, error: "Escribe el correo del destinatario." };
  if (!input.asunto.trim()) return { ok: false, error: "El asunto no puede ir vacío." };

  marcarActaEnviadaMock(input.folio, input.para, input.cc, input.adjuntos);
  revalidarPanel(input.folio);
  return { ok: true, folio: input.folio };
}
