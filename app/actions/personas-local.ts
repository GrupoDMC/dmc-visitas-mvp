"use server";

import { getSesion } from "@/lib/auth";
import { listarPersonasLocal } from "@/lib/data/personas-local";
import type { PersonaLocal } from "@/lib/types";

/**
 * Las personas que ya recibieron o firmaron en una tienda, para elegirlas al
 * agendar una visita o llenar el acta. Cualquiera con sesión puede pedirlas:
 * el técnico las necesita en el celular y coordinación en el panel.
 */
export async function personasDelLocalAction(sucursalId: number): Promise<PersonaLocal[]> {
  const sesion = await getSesion();
  if (!sesion || !Number.isFinite(sucursalId) || sucursalId <= 0) return [];
  return listarPersonasLocal(sucursalId);
}
