"use server";

import { getSesion } from "@/lib/auth";
import { listarPersonasLocal, tecnicoTieneVisitaEn } from "@/lib/data/personas-local";
import { tiene } from "@/lib/permisos";
import type { PersonaLocal } from "@/lib/types";

/**
 * Las personas que ya recibieron o firmaron en una tienda, para elegirlas al
 * agendar una visita o llenar el acta. Son datos personales, así que no basta
 * con tener sesión:
 *
 * - Panel: coordinación que puede ver o agregar visitas.
 * - Técnico: las tiendas donde tiene una visita (titular o ayudante). Con el
 *   permiso de agregar visitas en terreno también las que elige en esa hoja,
 *   porque ahí la sucursal todavía no tiene visita suya.
 */
export async function personasDelLocalAction(sucursalId: number): Promise<PersonaLocal[]> {
  const sesion = await getSesion();
  if (!sesion || !Number.isInteger(sucursalId) || sucursalId <= 0) return [];

  if (sesion.usuario.rol === "TECNICO") {
    if (!sesion.tecnico) return [];
    const permitido =
      tiene(sesion.permisos, "celular.crearVisita") || (await tecnicoTieneVisitaEn(sesion.tecnico.id, sucursalId));
    if (!permitido) return [];
  } else if (!tiene(sesion.permisos, "visitas.crear") && !tiene(sesion.permisos, "visitas.ver")) {
    return [];
  }
  return listarPersonasLocal(sucursalId);
}
