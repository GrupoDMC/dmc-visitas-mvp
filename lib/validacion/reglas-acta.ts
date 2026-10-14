import type { ActaEntrada, EdicionActaEntrada } from "@/lib/contratos/acta";
import type { EstadoVisita } from "@/lib/types";

// Las reglas del acta que no son de forma (eso lo ve zod en actas.ts): qué
// tiene que traer un acta para cerrarse o corregirse, y quién puede hacerlo.
//
// Son funciones puras. Las acciones las aplican antes de llamar a la capa de
// datos; la de quién puede cerrar se vuelve a aplicar en lib/data con la fila
// tomada (UPDLOCK), porque entre la acción y la escritura la visita pudo
// cambiar de manos o de estado.

export const TOMADA_POR_OTRO = "El otro técnico ya inició esta visita: solo él puede terminarla.";
const NO_ASIGNADA = "Esa visita no está asignada a ti.";

const txt = (s: string | null | undefined) => String(s ?? "").trim();

/** Lo que hace falta saber de una visita para decidir quién la toca. */
export interface EquipoVisita {
  estado: EstadoVisita;
  tecnicoId: number;
  tecnicoAyudanteId: number | null;
  /** Quién la inició, si está EN_CURSO. */
  tomadaPorTecnicoId: number | null;
}

/**
 * Por qué este técnico no puede cerrar el acta, o null si puede.
 *
 * `conReserva`: quién puede escribir lo decide la reserva del acta (lib/reserva),
 * no la marca de quién inició la visita. Se usa donde la reserva se comprueba
 * aparte: un acta que esperaba señal sale aunque el otro técnico la haya
 * iniciado, siempre que él ya no la tenga reservada.
 */
export function motivoParaNoCerrar(
  v: EquipoVisita,
  tecnicoId: number,
  opciones: { conReserva?: boolean } = {}
): string | null {
  if (v.tecnicoId !== tecnicoId && v.tecnicoAyudanteId !== tecnicoId) return NO_ASIGNADA;
  if (!opciones.conReserva && v.estado === "EN_CURSO" && v.tomadaPorTecnicoId !== tecnicoId) return TOMADA_POR_OTRO;
  if (v.estado === "COMPLETADA") return "Esta visita ya quedó cerrada.";
  if (v.estado !== "PROGRAMADA" && v.estado !== "EN_CURSO") return "Esta visita ya no se puede cerrar desde el celular.";
  return null;
}

/** Por qué este técnico no puede corregir el acta desde el celular, o null si puede. */
export function motivoParaNoEditar(v: EquipoVisita, tecnicoId: number): string | null {
  if (v.tecnicoId !== tecnicoId && v.tecnicoAyudanteId !== tecnicoId) return NO_ASIGNADA;
  return null;
}

/** Lo que le falta al acta para cerrarse, o null si está completa. */
export function errorDeActa(entrada: ActaEntrada): string | null {
  if (!entrada.motivosCodigos.some(Boolean)) return "Marca al menos un motivo de la visita.";
  if (!txt(entrada.responsableNombre)) return "Falta el nombre del responsable de la tienda.";
  if (!entrada.firma) return "Falta la firma de la tienda.";
  // ck_problema_otro_desc exige descripción escrita cuando el tipo es OTRO. Se
  // valida antes: descubrirlo a mitad del guardado dejaría el acta a medias.
  if (entrada.problemas.some((pr) => pr.tipoCodigo === "OTRO" && !txt(pr.descripcion))) {
    return "El problema marcado como «Otro» necesita que escribas qué encontraste.";
  }
  return null;
}

/** Lo que le falta a una corrección del acta, o null si está completa. */
export function errorDeEdicion(entrada: EdicionActaEntrada): string | null {
  if (txt(entrada.motivoEdicion).length < 5) return "Escribe por qué se edita el acta: queda en el registro.";
  if (!entrada.motivosCodigos.some(Boolean)) return "Marca al menos un motivo de la visita.";
  if (!txt(entrada.responsableNombre)) return "Falta el nombre del responsable de la tienda.";
  if (entrada.problemas.some((pr) => pr.tipoCodigo === "OTRO" && !txt(pr.descripcion))) {
    return "El problema marcado como «Otro» necesita que escribas qué se encontró.";
  }
  return null;
}
