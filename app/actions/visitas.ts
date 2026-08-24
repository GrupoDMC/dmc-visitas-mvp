"use server";

import { revalidatePath } from "next/cache";
import { getSesion } from "@/lib/auth";
import {
  cambiarEstadoVisita,
  crearVisita,
  getVisitaCompletaPorFolio,
  iniciarVisita,
} from "@/lib/data/visitas";
import { listarSucursales } from "@/lib/data/maestros";
import type { EstadoVisita } from "@/lib/types";

export interface ResultadoAccion {
  ok: boolean;
  error?: string;
  /** Folio de la visita recién creada en terreno. */
  folio?: string;
}

/** Solo el técnico dueño de la visita puede tocarla desde el móvil. */
async function visitaDelTecnico(folio: string) {
  const sesion = await getSesion();
  if (!sesion?.tecnico) return null;
  const visita = await getVisitaCompletaPorFolio(folio);
  if (!visita || visita.tecnicoId !== sesion.tecnico.id) return null;
  return { visita, sesion };
}

function revalidar(folio: string) {
  revalidatePath("/tecnico");
  revalidatePath("/tecnico/visitas");
  revalidatePath(`/tecnico/visitas/${folio}`);
  revalidatePath("/tecnico/perfil");
  revalidatePath("/admin", "layout");
}

function comoError(err: unknown, contexto: string): ResultadoAccion {
  console.error(`[dmc] ${contexto}:`, err);
  return { ok: false, error: "No se pudo guardar en el servidor. Revisa la conexión e inténtalo otra vez." };
}

/** "Iniciar visita" — deja la visita EN_CURSO antes de abrir el formulario. */
export async function iniciarVisitaAction(folio: string): Promise<ResultadoAccion> {
  const contexto = await visitaDelTecnico(folio);
  if (!contexto) return { ok: false, error: "No encontramos esa visita entre las tuyas." };
  const { visita } = contexto;
  if (visita.estado !== "PROGRAMADA" && visita.estado !== "EN_CURSO") {
    return { ok: false, error: "Esta visita ya está cerrada." };
  }

  try {
    await iniciarVisita(folio, visita.responsableNombre);
  } catch (err) {
    return comoError(err, "iniciarVisita");
  }
  revalidar(folio);
  return { ok: true };
}

/** Reagendar, dejar pendiente o cancelar desde "Otras acciones de la visita". */
export async function cambiarEstadoVisitaAction(input: {
  folio: string;
  estado: Extract<EstadoVisita, "REAGENDADA" | "PENDIENTE" | "CANCELADA">;
  motivo: string;
  fechaNueva?: string | null;
  horaNueva?: string | null;
}): Promise<ResultadoAccion> {
  const contexto = await visitaDelTecnico(input.folio);
  if (!contexto) return { ok: false, error: "No encontramos esa visita entre las tuyas." };

  const motivo = input.motivo.trim();
  if (!motivo) return { ok: false, error: "El motivo es obligatorio." };
  if (input.estado === "REAGENDADA" && !input.fechaNueva) {
    return { ok: false, error: "Elige la nueva fecha." };
  }

  try {
    await cambiarEstadoVisita({
      folio: input.folio,
      estado: input.estado,
      motivo,
      fechaNueva: input.fechaNueva,
      horaNueva: input.horaNueva,
      origen: "MOVIL",
      usuarioId: contexto.sesion.usuario.id,
      tecnicoId: contexto.sesion.tecnico?.id ?? null,
    });
  } catch (err) {
    return comoError(err, "cambiarEstadoVisita");
  }
  revalidar(input.folio);
  return { ok: true };
}

/**
 * "Agregar visita" desde el celular: la visita que el técnico hace fuera de su
 * planificación. Nace asignada a él y queda EN_CURSO para llenar el acta.
 */
export async function crearVisitaTecnicoAction(input: {
  sucursalId: number;
  motivoCodigo: string;
  fecha: string;
  hora: string | null;
  responsableNombre: string;
  responsableTelefono: string;
  trabajo: string;
}): Promise<ResultadoAccion> {
  const sesion = await getSesion();
  if (!sesion?.tecnico) return { ok: false, error: "Tu cuenta no tiene un técnico asociado." };

  const sucursal = (await listarSucursales()).find((s) => s.id === input.sucursalId);
  if (!sucursal) return { ok: false, error: "Elige la sucursal donde estás." };
  if (!input.motivoCodigo) return { ok: false, error: "Elige el motivo de la visita." };
  if (!input.fecha) return { ok: false, error: "Elige la fecha de la visita." };
  if (input.motivoCodigo === "INSTALACION" && !input.hora) {
    return { ok: false, error: "La hora es obligatoria para instalaciones." };
  }

  try {
    const visita = await crearVisita(
      {
        clienteId: sucursal.clienteId,
        sucursalId: sucursal.id,
        tecnicoId: sesion.tecnico.id,
        motivoCodigo: input.motivoCodigo,
        fechaProgramada: input.fecha,
        horaProgramada: input.hora,
        trabajoSolicitado: input.trabajo.trim() || "Visita agregada por el técnico, fuera de la planificación.",
        indicacionesAcceso: null,
        responsableNombre: input.responsableNombre || null,
        responsableTelefono: input.responsableTelefono || null,
        creadaEnTerreno: true,
      },
      sesion.usuario.id
    );

    await iniciarVisita(visita.folio, visita.responsableNombre);
    revalidar(visita.folio);
    return { ok: true, folio: visita.folio };
  } catch (err) {
    return comoError(err, "crearVisitaTecnico");
  }
}
