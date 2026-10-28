"use server";

import { revalidatePath } from "next/cache";
import { sesionCon } from "@/lib/auth";
import { AlcanceInexistente, guardarContacto, type DatosContacto } from "@/lib/data/contactos";
import { log } from "@/lib/log";
import { problemaDeCargos } from "@/lib/ui/contactos";
import { validar } from "@/lib/validacion/comun";
import { entradaContacto } from "@/lib/validacion/contactos";

// Altas y ediciones de contactos. Los cargos viajan dentro del mismo objeto
// (son pocos y chicos): un argumento suelto grande reventaría el tope de 1 MB.

export interface ResultadoContacto {
  ok: boolean;
  error?: string;
  id?: number;
}

export async function guardarContactoAction(idPedido: number | null, datosPedidos: DatosContacto): Promise<ResultadoContacto> {
  if (!(await sesionCon(`contactos.${idPedido === null ? "crear" : "editar"}`))) {
    return { ok: false, error: "No tienes permiso para editar contactos." };
  }
  const entrada = validar(entradaContacto, { id: idPedido, datos: datosPedidos }, "guardarContacto");
  if (!entrada.ok) return { ok: false, error: entrada.error };
  const { id, datos } = entrada.datos;
  if (!datos.nombre.trim()) return { ok: false, error: "El nombre del contacto es obligatorio." };
  if (datos.email && !datos.email.includes("@")) return { ok: false, error: "Escribe un correo válido." };
  const fallo = problemaDeCargos(datos.cargos);
  if (fallo) return { ok: false, error: fallo };

  try {
    const guardado = await guardarContacto(id, {
      ...datos,
      nombre: datos.nombre.trim(),
      email: datos.email?.trim() || null,
      telefono: datos.telefono?.trim() || null,
    });
    revalidatePath("/admin", "layout");
    return { ok: true, id: guardado };
  } catch (err) {
    if (err instanceof AlcanceInexistente) {
      return { ok: false, error: `Un ${err.cual} elegido ya no existe. Recarga la página.` };
    }
    log.error("guardarContacto", { err });
    return { ok: false, error: "No se pudo guardar. Revisa los datos e inténtalo otra vez." };
  }
}
