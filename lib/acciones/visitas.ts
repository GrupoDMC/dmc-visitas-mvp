"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirSesion, requerirVerTodas } from "@/lib/auth";
import { conAviso } from "@/lib/avisos";
import {
  esquemaAsignacion,
  esquemaVisitaEnTerreno,
  esquemaVisitaNueva,
} from "@/lib/validacion/visitas";
import { obtenerCliente } from "@/lib/db/clientes";
import { obtenerSucursal } from "@/lib/db/sucursales";
import { nombreTecnico, obtenerTecnico } from "@/lib/db/tecnicos";
import { asignarTecnico, crearVisita } from "@/lib/db/visitas";
import {
  erroresDeZod,
  falla,
  fallaEnCampo,
  texto,
  type EstadoAsignacion,
  type EstadoFormulario,
} from "./formulario";

/**
 * Una Server Action es un endpoint POST: que la pantalla que la llama esté
 * protegida no protege a la acción. Todas las de este archivo empiezan por un
 * chequeo propio.
 */

/**
 * Cliente y sucursal llegan como dos ids sueltos desde dos selects, y el
 * navegador puede mandar cualquier par. Acá se verifica lo que el esquema de
 * zod no puede: que existan, que estén activos y que la sucursal sea de ese
 * cliente.
 *
 * Se rechaza la sucursal inactiva pero NO se toca la visita si el maestro se
 * apaga después: una visita ya creada sigue apuntando a donde apuntaba.
 */
async function verificarDestino(
  clienteId: number,
  sucursalId: number,
): Promise<EstadoFormulario | null> {
  const [cliente, sucursal] = await Promise.all([
    obtenerCliente(clienteId),
    obtenerSucursal(sucursalId),
  ]);

  if (!cliente) return fallaEnCampo("cliente_id", "Ese cliente ya no existe.");
  if (!cliente.activo) {
    return fallaEnCampo(
      "cliente_id",
      `${cliente.razon_social} está desactivado. Reactivalo antes de agendarle visitas.`,
    );
  }

  if (!sucursal) return fallaEnCampo("sucursal_id", "Esa sucursal ya no existe.");
  if (sucursal.cliente_id !== clienteId) {
    return fallaEnCampo(
      "sucursal_id",
      `${sucursal.nombre} no es una sucursal de ${cliente.razon_social}. Elegila de nuevo.`,
    );
  }
  if (!sucursal.activo) {
    return fallaEnCampo(
      "sucursal_id",
      `${sucursal.nombre} está desactivada. Reactivala antes de agendarle visitas.`,
    );
  }

  return null;
}

/** El técnico es opcional al crear, pero si viene tiene que servir. */
async function verificarTecnico(
  tecnicoId: number | null,
  campo: string,
): Promise<EstadoFormulario | null> {
  if (tecnicoId === null) return null;

  const tecnico = await obtenerTecnico(tecnicoId);
  if (!tecnico) return fallaEnCampo(campo, "Ese técnico ya no existe.");
  if (!tecnico.activo) {
    return fallaEnCampo(
      campo,
      `${nombreTecnico(tecnico)} está desactivado. Elegí a otro o dejala sin asignar.`,
    );
  }

  return null;
}

function leerContacto(datos: FormData) {
  return {
    contacto_nombre: texto(datos, "contacto_nombre"),
    contacto_email: texto(datos, "contacto_email"),
    contacto_telefono: texto(datos, "contacto_telefono"),
  };
}

// ---------------------------------------------------------------------------
// ALTA DESDE COORDINACIÓN
// ---------------------------------------------------------------------------

export async function crearVisitaAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const sesion = await requerirVerTodas();

  const resultado = esquemaVisitaNueva.safeParse({
    cliente_id: texto(datos, "cliente_id"),
    sucursal_id: texto(datos, "sucursal_id"),
    tecnico_id: texto(datos, "tecnico_id"),
    tipo_trabajo: texto(datos, "tipo_trabajo"),
    fecha_programada: texto(datos, "fecha_programada"),
    hora_programada: texto(datos, "hora_programada"),
    descripcion_trabajo: texto(datos, "descripcion_trabajo"),
    ...leerContacto(datos),
  });

  if (!resultado.success) return erroresDeZod(resultado.error);

  const valores = resultado.data;

  const destinoMal = await verificarDestino(valores.cliente_id, valores.sucursal_id);
  if (destinoMal) return destinoMal;

  const tecnicoMal = await verificarTecnico(valores.tecnico_id, "tecnico_id");
  if (tecnicoMal) return tecnicoMal;

  // El folio no se toca: lo pone la secuencia de la base.
  const creada = await crearVisita({
    ...valores,
    tipo_trabajo: valores.tipo_trabajo,
    creado_por: sesion.userId,
  });

  revalidatePath("/visitas");
  redirect(conAviso(`/visitas/${creada.id}`, "visita-creada"));
}

// ---------------------------------------------------------------------------
// ALTA DESDE TERRENO
// ---------------------------------------------------------------------------

/**
 * El técnico llegó a una sucursal sin agendamiento previo. Es un caso válido,
 * no un error: la visita nace con `fecha_programada` en NULL y asignada a quien
 * la está creando.
 *
 * El `tecnico_id` sale de la sesión y nunca del formulario. Si viniera del POST,
 * cualquiera podría cargarle trabajo a otro.
 */
export async function crearVisitaEnTerrenoAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const sesion = await requerirSesion();

  if (sesion.tecnicoId === null) {
    return falla(
      "Tu usuario no está vinculado a un técnico, así que no puede abrir visitas en terreno. " +
        "Pedí que la agenden desde coordinación.",
    );
  }

  const resultado = esquemaVisitaEnTerreno.safeParse({
    cliente_id: texto(datos, "cliente_id"),
    sucursal_id: texto(datos, "sucursal_id"),
    tipo_trabajo: texto(datos, "tipo_trabajo"),
    descripcion_trabajo: texto(datos, "descripcion_trabajo"),
    ...leerContacto(datos),
  });

  if (!resultado.success) return erroresDeZod(resultado.error);

  const valores = resultado.data;

  const destinoMal = await verificarDestino(valores.cliente_id, valores.sucursal_id);
  if (destinoMal) return destinoMal;

  const creada = await crearVisita({
    ...valores,
    tipo_trabajo: valores.tipo_trabajo,
    tecnico_id: sesion.tecnicoId,
    fecha_programada: null,
    hora_programada: null,
    creado_por: sesion.userId,
  });

  revalidatePath("/visitas");
  redirect(conAviso(`/visitas/${creada.id}`, "visita-en-terreno-creada"));
}

// ---------------------------------------------------------------------------
// ASIGNACIÓN
// ---------------------------------------------------------------------------

/**
 * La asignación no redirige, y es a propósito.
 *
 * El resto de la app confirma con `redirect(conAviso(...))`, que sirve cuando
 * la acción te lleva a otra pantalla. Acá el coordinador se queda en el mismo
 * listado, con los mismos filtros y a veces con más filas que asignar: sacarlo
 * de ahí para volver a entrar sería peor. `revalidatePath` refresca la tabla en
 * la misma respuesta y el mensaje vuelve en el estado, para mostrarlo al lado
 * del botón.
 *
 * `EstadoAsignacion` y su valor inicial viven en `./formulario`: este archivo
 * es `"use server"` y solo puede exportar funciones asíncronas.
 */

function fallaAsignacion(estado: EstadoFormulario): EstadoAsignacion {
  return { ...estado, exito: null };
}

/** Los ids llegan como campos repetidos: una casilla marcada por visita. */
function leerIds(datos: FormData): number[] {
  const vistos = new Set<number>();

  for (const crudo of datos.getAll("ids")) {
    const numero = Number(typeof crudo === "string" ? crudo : "");
    if (Number.isInteger(numero) && numero > 0) vistos.add(numero);
  }

  return [...vistos];
}

export async function asignarTecnicoAccion(
  _previo: EstadoAsignacion,
  datos: FormData,
): Promise<EstadoAsignacion> {
  await requerirVerTodas();

  const ids = leerIds(datos);
  if (ids.length === 0) {
    return fallaAsignacion(
      falla("No quedó ninguna visita seleccionada. Marcá al menos una."),
    );
  }

  const resultado = esquemaAsignacion.safeParse({
    tecnico_id: texto(datos, "tecnico_id"),
  });
  if (!resultado.success) return fallaAsignacion(erroresDeZod(resultado.error));

  const tecnicoId = resultado.data.tecnico_id;

  const tecnico = await obtenerTecnico(tecnicoId);
  if (!tecnico) {
    return fallaAsignacion(fallaEnCampo("tecnico_id", "Ese técnico ya no existe."));
  }
  if (!tecnico.activo) {
    return fallaAsignacion(
      fallaEnCampo(
        "tecnico_id",
        `${nombreTecnico(tecnico)} está desactivado. No se le puede asignar trabajo nuevo.`,
      ),
    );
  }

  const asignadas = await asignarTecnico(ids, tecnicoId);

  if (asignadas === 0) {
    return fallaAsignacion(
      falla(
        "Ninguna de esas visitas sigue existiendo. Actualizá el listado y probá de nuevo.",
      ),
    );
  }

  revalidatePath("/visitas");

  const cuantas =
    asignadas === 1 ? "1 visita" : `${asignadas} visitas`;

  // Si el número no coincide con lo pedido, algo cambió mientras el modal
  // estaba abierto. Decirlo evita que el coordinador crea que asignó todas.
  const faltantes =
    asignadas < ids.length
      ? ` De las ${ids.length} marcadas, el resto ya no estaba.`
      : "";

  return {
    error: null,
    errores: {},
    exito: `${cuantas} para ${nombreTecnico(tecnico)}.${faltantes}`,
  };
}
