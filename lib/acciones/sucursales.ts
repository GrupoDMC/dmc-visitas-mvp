"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirVerTodas } from "@/lib/auth";
import { conAviso } from "@/lib/avisos";
import { esquemaSucursal } from "@/lib/validacion/maestros";
import { obtenerCliente } from "@/lib/db/clientes";
import {
  actualizarSucursal,
  cambiarActivoSucursal,
  crearSucursal,
  obtenerSucursal,
} from "@/lib/db/sucursales";
import {
  erroresDeZod,
  falla,
  marcada,
  texto,
  type EstadoFormulario,
} from "./formulario";

async function permitido() {
  await requerirVerTodas();
}

function leerFormulario(datos: FormData) {
  return {
    nombre: texto(datos, "nombre"),
    codigo_interno: texto(datos, "codigo_interno"),
    direccion: texto(datos, "direccion"),
    comuna: texto(datos, "comuna"),
    region: texto(datos, "region"),
    telefono: texto(datos, "telefono"),
    activo: marcada(datos, "activo"),
  };
}

function leerId(datos: FormData, campo: string): number | null {
  const numero = Number(texto(datos, campo));
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

/** Las sucursales cuelgan del cliente: siempre volvemos a su ficha. */
function refrescarFicha(clienteId: number) {
  revalidatePath(`/clientes/${clienteId}`);
}

export async function crearSucursalAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await permitido();

  const clienteId = leerId(datos, "cliente_id");
  if (clienteId === null) {
    return falla("No se pudo identificar el cliente de la sucursal.");
  }

  const cliente = await obtenerCliente(clienteId);
  if (!cliente) return falla("Ese cliente ya no existe.");

  const resultado = esquemaSucursal.safeParse(leerFormulario(datos));
  if (!resultado.success) return erroresDeZod(resultado.error);

  await crearSucursal(clienteId, resultado.data);

  refrescarFicha(clienteId);
  redirect(conAviso(`/clientes/${clienteId}`, "sucursal-creada"));
}

export async function actualizarSucursalAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await permitido();

  const id = leerId(datos, "id");
  if (id === null) return falla("No se pudo identificar la sucursal a guardar.");

  const actual = await obtenerSucursal(id);
  if (!actual) return falla("Esa sucursal ya no existe.");

  const resultado = esquemaSucursal.safeParse(leerFormulario(datos));
  if (!resultado.success) return erroresDeZod(resultado.error);

  await actualizarSucursal(id, resultado.data);

  // El cliente sale de la fila, no del formulario: así nadie puede mover una
  // sucursal de cliente mandando un cliente_id distinto por POST.
  refrescarFicha(actual.cliente_id);
  redirect(conAviso(`/clientes/${actual.cliente_id}`, "sucursal-guardada"));
}

export async function cambiarActivoSucursalAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await permitido();

  const id = leerId(datos, "id");
  if (id === null) return falla("No se pudo identificar la sucursal.");

  const sucursal = await obtenerSucursal(id);
  if (!sucursal) return falla("Esa sucursal ya no existe.");

  const activar = marcada(datos, "activar");
  await cambiarActivoSucursal(id, activar);

  refrescarFicha(sucursal.cliente_id);
  redirect(
    conAviso(
      `/clientes/${sucursal.cliente_id}`,
      activar ? "sucursal-activada" : "sucursal-desactivada",
    ),
  );
}
