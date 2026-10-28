"use server";

import { revalidatePath } from "next/cache";
import { getSesion } from "@/lib/auth";
import { log } from "@/lib/log";
import {
  ADJUNTOS_MAX_POR_VISITA,
  abrirAdjunto,
  cerrarAdjunto,
  desactivarAdjunto,
  getVisitaParaAdjunto,
  motivoRechazoAdjunto,
  pegarTrozoAdjunto,
} from "@/lib/data/adjuntos";
import { tiene } from "@/lib/permisos";
import { validar } from "@/lib/validacion/comun";
import { entradaAbrirAdjunto, entradaAdjuntoId, trozoAdjunto } from "@/lib/validacion/actas";

/**
 * Fotos y videos que explican el trabajo a realizar.
 *
 * Se suben con la visita ya creada y por trozos (el cuerpo de una Server Action
 * se corta en 4,5 MB), igual que el video del acta. Pueden adjuntar:
 *   · el panel, con «Crear visitas» o «Editar visitas», mientras la visita no
 *     esté cerrada ni cancelada;
 *   · el técnico, solo en una visita que él creó en terreno y que sigue abierta.
 */

export interface ResultadoAdjunto {
  ok: boolean;
  error?: string;
  adjuntoId?: number;
  /** Cuántos bytes lleva escritos la base; sirve para reanudar tras un corte. */
  recibidos?: number;
}

const NO_PERMITIDO = "No puedes adjuntar archivos a esa visita.";
const ABIERTAS = ["PROGRAMADA", "EN_CURSO", "REAGENDADA", "PENDIENTE"];

async function puedeAdjuntar(folio: string) {
  const sesion = await getSesion();
  if (!sesion) return null;
  const visita = await getVisitaParaAdjunto(folio);
  if (!visita) return null;

  if (sesion.usuario.rol !== "TECNICO") {
    if (!tiene(sesion.permisos, "visitas.crear") && !tiene(sesion.permisos, "visitas.editar")) return null;
    return ABIERTAS.includes(visita.estado) ? { visita, sesion } : null;
  }
  if (!tiene(sesion.permisos, "celular.crearVisita")) return null;
  if (!sesion.tecnico || (visita.tecnicoId !== sesion.tecnico.id && visita.tecnicoAyudanteId !== sesion.tecnico.id)) return null;
  if (!visita.creadaEnTerreno || (visita.estado !== "PROGRAMADA" && visita.estado !== "EN_CURSO")) return null;
  return { visita, sesion };
}

function revalidar(folio: string) {
  revalidatePath("/tecnico");
  revalidatePath(`/tecnico/visitas/${folio}`);
  revalidatePath("/admin", "layout");
}

/** Paso 1: reserva la fila del archivo y devuelve su id. */
export async function abrirAdjuntoAction(folioPedido: string, datosPedidos: unknown): Promise<ResultadoAdjunto> {
  const valida = validar(entradaAbrirAdjunto, { folio: folioPedido, datos: datosPedidos }, "abrirAdjunto");
  if (!valida.ok) return { ok: false, error: "El archivo llegó en un formato que no se puede guardar." };
  const { folio, datos } = valida.datos;
  const contexto = await puedeAdjuntar(folio);
  if (!contexto) return { ok: false, error: NO_PERMITIDO };

  const rechazo = motivoRechazoAdjunto(datos);
  if (rechazo) return { ok: false, error: rechazo };

  try {
    const adjuntoId = await abrirAdjunto(contexto.visita.id, datos, contexto.sesion.usuario.id);
    if (!adjuntoId) {
      return { ok: false, error: `Una visita admite hasta ${ADJUNTOS_MAX_POR_VISITA} adjuntos.` };
    }
    return { ok: true, adjuntoId, recibidos: 0 };
  } catch (err) {
    log.error("abrirAdjunto", { err });
    return { ok: false, error: "No se pudo empezar a subir el archivo." };
  }
}

/**
 * Lo que lleva un envío de trozo. Va en un objeto a propósito: un string grande
 * suelto, como argumento de una Server Action, revienta el tope de React (ver
 * TrozoVideo en app/actions/videos).
 */
export interface TrozoAdjunto {
  folio: string;
  adjuntoId: number;
  desde: number;
  trozoBase64: string;
}

/** Paso 2: pega un trozo al final del archivo. */
export async function subirTrozoAdjuntoAction(envio: TrozoAdjunto): Promise<ResultadoAdjunto> {
  const valido = validar(trozoAdjunto, envio, "subirTrozoAdjunto");
  if (!valido.ok) return { ok: false, error: "Un trozo del archivo llegó dañado." };
  const { folio, adjuntoId, desde, trozoBase64 } = valido.datos;
  const contexto = await puedeAdjuntar(folio);
  if (!contexto) return { ok: false, error: NO_PERMITIDO };

  try {
    const res = await pegarTrozoAdjunto(adjuntoId, contexto.visita.id, desde, Buffer.from(trozoBase64, "base64"));
    return res.ok
      ? { ok: true, adjuntoId, recibidos: res.recibidos }
      : { ok: false, error: res.error, recibidos: res.recibidos };
  } catch (err) {
    log.error("subirTrozoAdjunto", { err });
    return { ok: false, error: "Se cortó la subida del archivo." };
  }
}

/** Paso 3: el archivo queda utilizable. Falla si no llegó completo. */
export async function cerrarAdjuntoAction(folioPedido: string, adjuntoIdPedido: number): Promise<ResultadoAdjunto> {
  const valido = validar(entradaAdjuntoId, { folio: folioPedido, adjuntoId: adjuntoIdPedido }, "cerrarAdjunto");
  if (!valido.ok) return { ok: false, error: "Ese archivo no existe." };
  const { folio, adjuntoId } = valido.datos;
  const contexto = await puedeAdjuntar(folio);
  if (!contexto) return { ok: false, error: NO_PERMITIDO };

  try {
    if (!(await cerrarAdjunto(adjuntoId, contexto.visita.id))) {
      return { ok: false, error: "El archivo no llegó completo. Vuelve a subirlo." };
    }
  } catch (err) {
    log.error("cerrarAdjunto", { err });
    return { ok: false, error: "No se pudo terminar de guardar el archivo." };
  }
  revalidar(folio);
  return { ok: true, adjuntoId };
}

/** Quitar un adjunto. La fila no se borra: queda inactiva. */
export async function borrarAdjuntoAction(folioPedido: string, adjuntoIdPedido: number): Promise<ResultadoAdjunto> {
  const valido = validar(entradaAdjuntoId, { folio: folioPedido, adjuntoId: adjuntoIdPedido }, "borrarAdjunto");
  if (!valido.ok) return { ok: false, error: "Ese archivo no existe." };
  const { folio, adjuntoId } = valido.datos;
  const contexto = await puedeAdjuntar(folio);
  if (!contexto) return { ok: false, error: NO_PERMITIDO };

  try {
    await desactivarAdjunto(adjuntoId, contexto.visita.id);
  } catch (err) {
    log.error("borrarAdjunto", { err });
    return { ok: false, error: "No se pudo quitar el archivo." };
  }
  revalidar(folio);
  return { ok: true, adjuntoId };
}
