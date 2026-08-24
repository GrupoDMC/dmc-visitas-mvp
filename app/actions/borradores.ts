"use server";

import { getSesion } from "@/lib/auth";
import { getVisitaCompletaPorFolio } from "@/lib/data/visitas";
import { borrarBorrador, guardarBorrador, leerBorrador } from "@/lib/data/borradores";

// Respaldo en el servidor del acta a medio llenar.
//
// El borrador de verdad vive en el celular: esto es la copia de arriba, para
// cuando hay señal. Ninguna de estas acciones puede tumbar el formulario, así
// que todas fallan en silencio: si no se pudo respaldar, el técnico sigue
// escribiendo y lo suyo sigue guardado en el equipo.

export interface ResultadoBorrador {
  ok: boolean;
  /** Contenido del borrador que había en el servidor, si se pidió. */
  payload?: string;
  guardadoEn?: string;
}

async function tecnicoDeLaVisita(folio: string) {
  const sesion = await getSesion();
  if (!sesion?.tecnico) return null;
  const visita = await getVisitaCompletaPorFolio(folio);
  if (!visita || visita.tecnicoId !== sesion.tecnico.id) return null;
  return { sesion, visita };
}

/** Sube lo que lleva escrito. Se llama cada tanto, no en cada tecla. */
export async function guardarBorradorAction(folio: string, payload: string): Promise<ResultadoBorrador> {
  const contexto = await tecnicoDeLaVisita(folio);
  if (!contexto) return { ok: false };
  try {
    const ok = await guardarBorrador(folio, contexto.sesion.usuario.id, payload);
    return { ok };
  } catch (err) {
    console.error("[dmc] guardarBorrador:", err);
    return { ok: false };
  }
}

/** El borrador que haya quedado en el servidor de este técnico y esta visita. */
export async function leerBorradorAction(folio: string): Promise<ResultadoBorrador> {
  const contexto = await tecnicoDeLaVisita(folio);
  if (!contexto) return { ok: false };
  try {
    const guardado = await leerBorrador(folio, contexto.sesion.usuario.id);
    return guardado ? { ok: true, payload: guardado.payload, guardadoEn: guardado.guardadoEn } : { ok: true };
  } catch (err) {
    console.error("[dmc] leerBorrador:", err);
    return { ok: false };
  }
}

/** "Empezar de nuevo": tira el borrador respaldado. */
export async function descartarBorradorAction(folio: string): Promise<ResultadoBorrador> {
  const contexto = await tecnicoDeLaVisita(folio);
  if (!contexto) return { ok: false };
  try {
    await borrarBorrador(folio, contexto.sesion.usuario.id);
    return { ok: true };
  } catch (err) {
    console.error("[dmc] descartarBorrador:", err);
    return { ok: false };
  }
}
