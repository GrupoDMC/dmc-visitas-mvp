"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirVerTodas } from "@/lib/auth";
import { conAviso } from "@/lib/avisos";
import { formatearRut } from "@/lib/rut";
import { esquemaCliente } from "@/lib/validacion/maestros";
import {
  actualizarCliente,
  cambiarActivoCliente,
  clienteConRut,
  crearCliente,
  obtenerCliente,
  RutRepetido,
} from "@/lib/db/clientes";
import {
  contarVisitasAbiertasDeCliente,
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

/**
 * Toda acción de este archivo empieza por acá. Una Server Action es un
 * endpoint POST: que la pantalla que la llama esté protegida no protege a la
 * acción, hay que chequear adentro.
 */
async function permitido() {
  await requerirVerTodas();
}

function leerFormulario(datos: FormData) {
  return {
    rut: texto(datos, "rut"),
    razon_social: texto(datos, "razon_social"),
    nombre_fantasia: texto(datos, "nombre_fantasia"),
    telefono: texto(datos, "telefono"),
    email: texto(datos, "email"),
    activo: marcada(datos, "activo"),
  };
}

function leerId(datos: FormData, campo = "id"): number | null {
  const numero = Number(texto(datos, campo));
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

/** El mensaje de RUT repetido nombra al dueño: sin eso hay que salir a buscarlo. */
function mensajeRutRepetido(
  duenio: { razon_social: string; activo: boolean } | null,
  rut: string,
): string {
  if (!duenio) {
    return `El RUT ${formatearRut(rut)} ya está registrado en otro cliente.`;
  }
  const inactivo = duenio.activo ? "" : " (está inactivo)";
  return `El RUT ${formatearRut(rut)} ya lo tiene ${duenio.razon_social}${inactivo}.`;
}

export async function crearClienteAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await permitido();

  const resultado = esquemaCliente.safeParse(leerFormulario(datos));
  if (!resultado.success) return erroresDeZod(resultado.error);

  const valores = resultado.data;

  const ocupado = await clienteConRut(valores.rut);
  if (ocupado) {
    return fallaEnCampo("rut", mensajeRutRepetido(ocupado, valores.rut));
  }

  let nuevoId: number;

  try {
    const creado = await crearCliente(valores);
    nuevoId = creado.id;
  } catch (error) {
    // Dos altas del mismo RUT al mismo tiempo: el chequeo de arriba pasó en
    // las dos y el índice único frenó a la segunda.
    if (error instanceof RutRepetido) {
      const duenio = await clienteConRut(valores.rut);
      return fallaEnCampo("rut", mensajeRutRepetido(duenio, valores.rut));
    }
    throw error;
  }

  revalidatePath("/clientes");
  // Después de crear, lo que sigue casi siempre es cargarle las sucursales.
  redirect(conAviso(`/clientes/${nuevoId}`, "cliente-creado"));
}

export async function actualizarClienteAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await permitido();

  const id = leerId(datos);
  if (id === null) return falla("No se pudo identificar el cliente a guardar.");

  const actual = await obtenerCliente(id);
  if (!actual) return falla("Ese cliente ya no existe.");

  const resultado = esquemaCliente.safeParse(leerFormulario(datos));
  if (!resultado.success) return erroresDeZod(resultado.error);

  const valores = resultado.data;

  const ocupado = await clienteConRut(valores.rut, id);
  if (ocupado) {
    return fallaEnCampo("rut", mensajeRutRepetido(ocupado, valores.rut));
  }

  // Apagar el cliente desde el formulario tiene el mismo resguardo que el
  // botón "Desactivar": si tiene visitas abiertas, hay que confirmarlo.
  if (actual.activo && !valores.activo) {
    const abiertas = await contarVisitasAbiertasDeCliente(id);
    if (abiertas > 0 && !marcada(datos, "confirmar_desactivar")) {
      return falla(
        `${actual.razon_social} tiene ${frasearVisitasAbiertas(abiertas)}. ` +
          `Marcá la confirmación para desactivarlo igual.`,
      );
    }
  }

  try {
    await actualizarCliente(id, valores);
  } catch (error) {
    if (error instanceof RutRepetido) {
      const duenio = await clienteConRut(valores.rut, id);
      return fallaEnCampo("rut", mensajeRutRepetido(duenio, valores.rut));
    }
    throw error;
  }

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  redirect(conAviso(`/clientes/${id}`, "cliente-guardado"));
}

/**
 * "Eliminar" un cliente es esto. Nada se borra nunca: la visita de marzo tiene
 * que seguir diciendo a quién se visitó, aunque el cliente ya no sea cliente.
 */
export async function cambiarActivoClienteAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await permitido();

  const id = leerId(datos);
  if (id === null) return falla("No se pudo identificar el cliente.");

  const cliente = await obtenerCliente(id);
  if (!cliente) return falla("Ese cliente ya no existe.");

  const activar = marcada(datos, "activar");

  if (!activar) {
    const abiertas = await contarVisitasAbiertasDeCliente(id);
    if (abiertas > 0 && !marcada(datos, "confirmado")) {
      return falla(
        `${cliente.razon_social} tiene ${frasearVisitasAbiertas(abiertas)}. ` +
          `Confirmá que querés desactivarlo igual.`,
      );
    }
  }

  await cambiarActivoCliente(id, activar);

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  redirect(
    conAviso(
      `/clientes/${id}`,
      activar ? "cliente-activado" : "cliente-desactivado",
    ),
  );
}
