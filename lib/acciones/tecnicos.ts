"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirVerTodas } from "@/lib/auth";
import { conAviso } from "@/lib/avisos";
import { formatearRut } from "@/lib/rut";
import { esquemaTecnico } from "@/lib/validacion/maestros";
import {
  actualizarTecnico,
  cambiarActivoTecnico,
  crearTecnico,
  nombreTecnico,
  obtenerTecnico,
  RutRepetido,
  tecnicoConRut,
} from "@/lib/db/tecnicos";
import {
  contarVisitasAbiertasDeTecnico,
  frasearVisitasAbiertas,
} from "@/lib/db/visitas";
import {
  erroresDeZod,
  falla,
  fallaEnCampo,
  marcada,
  texto,
  type EstadoFormulario,
} from "./formulario";

async function permitido() {
  await requerirVerTodas();
}

function leerFormulario(datos: FormData) {
  return {
    rut: texto(datos, "rut"),
    nombres: texto(datos, "nombres"),
    apellidos: texto(datos, "apellidos"),
    telefono: texto(datos, "telefono"),
    email: texto(datos, "email"),
    activo: marcada(datos, "activo"),
  };
}

function leerId(datos: FormData): number | null {
  const numero = Number(texto(datos, "id"));
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function mensajeRutRepetido(
  duenio: { nombres: string; apellidos: string } | null,
  rut: string,
): string {
  if (!duenio) {
    return `El RUT ${formatearRut(rut)} ya está registrado en otro técnico.`;
  }
  return `El RUT ${formatearRut(rut)} ya lo tiene ${nombreTecnico(duenio)}.`;
}

export async function crearTecnicoAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await permitido();

  const resultado = esquemaTecnico.safeParse(leerFormulario(datos));
  if (!resultado.success) return erroresDeZod(resultado.error);

  const valores = resultado.data;

  const ocupado = await tecnicoConRut(valores.rut);
  if (ocupado) {
    return fallaEnCampo("rut", mensajeRutRepetido(ocupado, valores.rut));
  }

  let nuevoId: number;

  try {
    const creado = await crearTecnico(valores);
    nuevoId = creado.id;
  } catch (error) {
    if (error instanceof RutRepetido) {
      const duenio = await tecnicoConRut(valores.rut);
      return fallaEnCampo("rut", mensajeRutRepetido(duenio, valores.rut));
    }
    throw error;
  }

  revalidatePath("/tecnicos");
  redirect(conAviso(`/tecnicos/${nuevoId}`, "tecnico-creado"));
}

export async function actualizarTecnicoAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await permitido();

  const id = leerId(datos);
  if (id === null) return falla("No se pudo identificar el técnico a guardar.");

  const actual = await obtenerTecnico(id);
  if (!actual) return falla("Ese técnico ya no existe.");

  const resultado = esquemaTecnico.safeParse(leerFormulario(datos));
  if (!resultado.success) return erroresDeZod(resultado.error);

  const valores = resultado.data;

  const ocupado = await tecnicoConRut(valores.rut, id);
  if (ocupado) {
    return fallaEnCampo("rut", mensajeRutRepetido(ocupado, valores.rut));
  }

  if (actual.activo && !valores.activo) {
    const abiertas = await contarVisitasAbiertasDeTecnico(id);
    if (abiertas > 0 && !marcada(datos, "confirmar_desactivar")) {
      return falla(
        `${nombreTecnico(actual)} tiene ${frasearVisitasAbiertas(abiertas)} ` +
          `asignadas. Marcá la confirmación para desactivarlo igual.`,
      );
    }
  }

  try {
    await actualizarTecnico(id, valores);
  } catch (error) {
    if (error instanceof RutRepetido) {
      const duenio = await tecnicoConRut(valores.rut, id);
      return fallaEnCampo("rut", mensajeRutRepetido(duenio, valores.rut));
    }
    throw error;
  }

  revalidatePath("/tecnicos");
  revalidatePath(`/tecnicos/${id}`);
  redirect(conAviso(`/tecnicos/${id}`, "tecnico-guardado"));
}

/**
 * Desactivar un técnico no lo despega de sus visitas: las que tenga asignadas
 * siguen asignadas. Lo que cambia es que deja de aparecer para asignar nuevas.
 * Por eso el aviso previo con la cuenta de visitas abiertas.
 */
export async function cambiarActivoTecnicoAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await permitido();

  const id = leerId(datos);
  if (id === null) return falla("No se pudo identificar el técnico.");

  const tecnico = await obtenerTecnico(id);
  if (!tecnico) return falla("Ese técnico ya no existe.");

  const activar = marcada(datos, "activar");

  if (!activar) {
    const abiertas = await contarVisitasAbiertasDeTecnico(id);
    if (abiertas > 0 && !marcada(datos, "confirmado")) {
      return falla(
        `${nombreTecnico(tecnico)} tiene ${frasearVisitasAbiertas(abiertas)} ` +
          `asignadas. Confirmá que querés desactivarlo igual.`,
      );
    }
  }

  await cambiarActivoTecnico(id, activar);

  revalidatePath("/tecnicos");
  revalidatePath(`/tecnicos/${id}`);
  redirect(
    conAviso(
      `/tecnicos/${id}`,
      activar ? "tecnico-activado" : "tecnico-desactivado",
    ),
  );
}
