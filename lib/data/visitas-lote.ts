import "server-only";
import {
  editarVisita,
  getVisitaCompletaPorFolio,
  reprogramarVisita,
  type DatosVisita,
} from "@/lib/data/visitas";
import { ESTADO_VISITA_LABEL } from "@/lib/ui/estado";
import { algunoPideHora } from "@/lib/ui/motivos";
import type { CatalogoMotivo, EstadoVisita } from "@/lib/types";

// "Acciones para múltiples visitas": el cambio de una visita dentro de un lote.
//
// Cancelar y eliminar en lote usan tal cual las funciones de una sola visita
// (ver app/actions/admin.ts). Lo propio del lote es esto: un cambio parcial,
// donde lo que no viene se queda como estaba.

/** Lo que se le cambia a una visita. Lo que no viene, no se toca. */
export interface CambiosVisita {
  tecnicoId?: number;
  /** null = pasa a ir solo. */
  tecnicoAyudanteId?: number | null;
  fecha?: string;
  hora?: string;
  motivosCodigos?: string[];
  trabajoSolicitado?: string;
  indicacionesAcceso?: string;
}

/** Los estados en que todavía tiene sentido mover la fecha o el técnico. */
const SE_PUEDE_MOVER: EstadoVisita[] = ["PROGRAMADA", "REAGENDADA", "PENDIENTE", "CANCELADA"];
/** Con fecha nueva, estas vuelven a quedar programadas (igual que «Cambiar fecha y técnico»). */
const VUELVE_A_PROGRAMADA: EstadoVisita[] = ["REAGENDADA", "PENDIENTE", "CANCELADA"];

/**
 * Aplica los cambios a una visita. Devuelve por qué no se pudo, o null si
 * quedó como se pidió (también cuando ya estaba así y no hubo nada que escribir).
 */
export async function modificarVisita(
  folio: string,
  cambios: CambiosVisita,
  usuarioId: number,
  motivos: CatalogoMotivo[]
): Promise<{ error: string } | null> {
  const v = await getVisitaCompletaPorFolio(folio);
  if (!v) return { error: "No encontramos esa visita." };

  const tecnicoId = cambios.tecnicoId ?? v.tecnicoId;
  if (cambios.tecnicoAyudanteId && cambios.tecnicoAyudanteId === tecnicoId) {
    return { error: "El ayudante no puede ser el mismo técnico asignado." };
  }
  let ayudanteId = cambios.tecnicoAyudanteId !== undefined ? cambios.tecnicoAyudanteId : v.tecnicoAyudanteId;
  // Si el nuevo asignado era el ayudante, pasa a ir solo: no puede ser las dos cosas.
  if (ayudanteId === tecnicoId) ayudanteId = null;

  const fecha = cambios.fecha ?? v.fechaProgramada;
  const hora = cambios.hora ?? v.horaProgramada;
  const motivosAntes = v.motivosCodigos.length ? v.motivosCodigos : [v.motivoCodigo];
  const motivosAhora = cambios.motivosCodigos?.length ? [...new Set(cambios.motivosCodigos)] : motivosAntes;
  const trabajo = cambios.trabajoSolicitado?.trim() || v.trabajoSolicitado;
  const acceso = cambios.indicacionesAcceso?.trim() || v.indicacionesAcceso;

  const cambiaFecha = fecha !== v.fechaProgramada;
  const mueve = cambiaFecha || hora !== v.horaProgramada || tecnicoId !== v.tecnicoId || ayudanteId !== v.tecnicoAyudanteId;
  const cambiaDetalle =
    motivosAhora.join("|") !== motivosAntes.join("|") ||
    trabajo !== v.trabajoSolicitado ||
    acceso !== v.indicacionesAcceso;
  if (!mueve && !cambiaDetalle) return null;

  if (mueve && !SE_PUEDE_MOVER.includes(v.estado)) {
    return {
      error: `Está ${ESTADO_VISITA_LABEL[v.estado].toLowerCase()}: no se le cambia la fecha, la hora ni el técnico.`,
    };
  }
  if (!hora && algunoPideHora(motivosAhora, motivos)) {
    return { error: "En instalación la hora es obligatoria." };
  }

  // Una reagendada, pendiente o cancelada con fecha nueva se reprograma: queda
  // el registro del cambio de fecha y vuelve a Programada.
  const reprograma = cambiaFecha && VUELVE_A_PROGRAMADA.includes(v.estado);
  if (reprograma) {
    if (!(await reprogramarVisita({ folio, tecnicoId, fecha, hora, usuarioId }))) {
      return { error: "No encontramos esa visita." };
    }
    if (!cambiaDetalle && ayudanteId === v.tecnicoAyudanteId) return null;
  }

  const datos: DatosVisita = {
    clienteId: v.clienteId,
    sucursalId: v.sucursalId,
    tecnicoId,
    tecnicoAyudanteId: ayudanteId,
    motivoCodigo: motivosAhora[0],
    motivosCodigos: motivosAhora,
    fechaProgramada: fecha,
    // Reprogramar deja un día fijo; si no, el margen sigue mientras termine
    // después de la fecha nueva.
    fechaHasta: !reprograma && v.fechaHasta && v.fechaHasta > fecha ? v.fechaHasta : null,
    horaProgramada: hora,
    trabajoSolicitado: trabajo,
    indicacionesAcceso: acceso,
    responsableNombre: v.responsableNombre,
    responsableRut: v.responsableRut,
    responsableTelefono: v.responsableTelefono,
  };
  if (!(await editarVisita(folio, datos, usuarioId))) return { error: "No encontramos esa visita." };
  return null;
}
