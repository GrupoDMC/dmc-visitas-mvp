"use server";

import { getSesion } from "@/lib/auth";
import { log } from "@/lib/log";
import { liberarReserva, tomarReserva } from "@/lib/data/reservas";
import { validar } from "@/lib/validacion/comun";
import { entradaFolio } from "@/lib/validacion/visitas";
import type { ReservaAjena } from "@/lib/reserva";

// Reserva del acta (ver lib/reserva y lib/data/reservas): el aviso de actividad
// del formulario y la salida de él. Ninguna puede tumbar el formulario: si no
// se pudo avisar, el técnico sigue escribiendo y lo suyo sigue en el equipo.

export interface ResultadoReservaAccion {
  ok: boolean;
  /** Otro técnico tiene el acta: el celular deja de editar y no envía nada. */
  reservaAjena?: ReservaAjena;
  /** La visita ya no está abierta para este técnico. */
  cerrada?: boolean;
}

/** "Sigo trabajando": toma la reserva si estaba libre o vencida, o la renueva. */
export async function renovarReservaAction(folioPedido: string): Promise<ResultadoReservaAccion> {
  const entrada = validar(entradaFolio, folioPedido, "renovarReserva");
  if (!entrada.ok) return { ok: false };
  const sesion = await getSesion();
  if (!sesion?.tecnico) return { ok: false };
  try {
    const res = await tomarReserva(entrada.datos, { usuarioId: sesion.usuario.id, tecnicoId: sesion.tecnico.id });
    if (res.ok) return { ok: true };
    if (res.motivo === "ajena") {
      return { ok: false, reservaAjena: { nombre: res.nombre, desde: res.desde, liberaEnSeg: res.liberaEnSeg } };
    }
    return { ok: false, cerrada: true };
  } catch (err) {
    log.error("renovarReserva", { err });
    return { ok: false };
  }
}

/** Salir del formulario: suelta la reserva para que el otro técnico no espere el plazo. */
export async function liberarReservaAction(folioPedido: string): Promise<ResultadoReservaAccion> {
  const entrada = validar(entradaFolio, folioPedido, "liberarReserva");
  if (!entrada.ok) return { ok: false };
  const sesion = await getSesion();
  if (!sesion?.tecnico) return { ok: false };
  await liberarReserva(entrada.datos, sesion.usuario.id);
  return { ok: true };
}
