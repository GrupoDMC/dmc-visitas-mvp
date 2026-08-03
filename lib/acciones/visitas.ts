"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { puedeEditarVisita, puedeVerTodas, requerirSesion, requerirVerTodas } from "@/lib/auth";
import { conAviso } from "@/lib/avisos";
import { fechaLarga, horaCorta } from "@/lib/fechas";
import {
  esquemaAsignacion,
  esquemaDatosVisita,
  esquemaFirmaTienda,
  esquemaMaterial,
  esquemaPendiente,
  esquemaProblema,
  esquemaReagendamiento,
  esquemaTrabajoRealizado,
  esquemaVisitaEnTerreno,
  esquemaVisitaNueva,
  imagenFirma,
} from "@/lib/validacion/visitas";
import { obtenerCliente } from "@/lib/db/clientes";
import { obtenerSucursal } from "@/lib/db/sucursales";
import { nombreTecnico, obtenerTecnico } from "@/lib/db/tecnicos";
import { guardarFirma, listarFirmasDeVisita } from "@/lib/db/firmas";
import { reagendarVisita } from "@/lib/db/reagendamientos";
import {
  actualizarMaterial,
  crearMaterial,
  eliminarMaterial,
  obtenerMaterial,
} from "@/lib/db/materiales";
import {
  actualizarProblema,
  crearProblema,
  obtenerProblema,
} from "@/lib/db/problemas";
import {
  actualizarDatosVisita,
  actualizarTrabajoRealizado,
  asignarTecnico,
  cerrarVisita as cerrarVisitaEnBase,
  crearVisita,
  iniciarVisita as iniciarVisitaEnBase,
  marcarVisitaPendiente,
  obtenerVisita,
  reabrirVisita as reabrirVisitaEnBase,
  type VisitaDetalle,
} from "@/lib/db/visitas";
import {
  erroresDeZod,
  falla,
  fallaEnCampo,
  marcada,
  SIN_ERRORES,
  texto,
  type EstadoAsignacion,
  type EstadoFormulario,
  type EstadoReagendamiento,
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

// ---------------------------------------------------------------------------
// FORMULARIO DE TERRENO (fase 4)
// ---------------------------------------------------------------------------
//
// Ninguna de las acciones de acá abajo redirige: el técnico se queda en
// /visitas/[id], que es exactamente donde tiene que seguir escribiendo la
// próxima sección. `revalidatePath(\`/visitas/${id}\`)` alcanza para que la
// página, que está montada, reciba los datos frescos en la misma respuesta —
// mismo mecanismo que la asignación en lote (ver ./formulario y la decisión
// 21 en docs/03_decisiones.md).

function idDesdeFormulario(datos: FormData, campo: string): number | null {
  const numero = Number(texto(datos, campo));
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

/**
 * Toda acción de esta sección arranca leyendo la visita y verificando acceso:
 * es un POST propio, y que la pantalla que lo llama ya haya filtrado no
 * alcanza. Devuelve la visita si se puede escribir, o el error ya armado si
 * no.
 */
async function cargarVisitaEditable(
  visitaId: number | null,
): Promise<{ visita: VisitaDetalle } | EstadoFormulario> {
  if (visitaId === null) return falla("No se identificó la visita.");

  const sesion = await requerirSesion();
  const visita = await obtenerVisita(visitaId);

  if (!visita) return falla("Esa visita ya no existe.");
  if (!puedeEditarVisita(sesion, visita.tecnico_id)) {
    return falla("No tenés acceso a esta visita.");
  }
  if (visita.estado === "REALIZADA") {
    return falla(
      "Esta visita ya está cerrada. Un coordinador o un administrador puede reabrirla si hace falta corregir algo.",
    );
  }

  return { visita };
}

function esFallo(
  valor: { visita: VisitaDetalle } | EstadoFormulario,
): valor is EstadoFormulario {
  return !("visita" in valor);
}

// ---------------------------------------------------------------------------
// SECCIÓN 1 · Datos de la visita
// ---------------------------------------------------------------------------

export async function guardarDatosVisitaAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const contexto = await cargarVisitaEditable(idDesdeFormulario(datos, "visita_id"));
  if (esFallo(contexto)) return contexto;
  const { visita } = contexto;

  const resultado = esquemaDatosVisita.safeParse({
    tipo_trabajo: texto(datos, "tipo_trabajo"),
    contacto_nombre: texto(datos, "contacto_nombre"),
    contacto_email: texto(datos, "contacto_email"),
    contacto_telefono: texto(datos, "contacto_telefono"),
    responsable_tienda_nombre: texto(datos, "responsable_tienda_nombre"),
    responsable_tienda_rut: texto(datos, "responsable_tienda_rut"),
  });
  if (!resultado.success) return erroresDeZod(resultado.error);

  await actualizarDatosVisita(visita.id, resultado.data);
  revalidatePath(`/visitas/${visita.id}`);

  return SIN_ERRORES;
}

/** Botón "Iniciar visita": EN_CURSO + fecha_inicio, sin pedir nada más. */
export async function iniciarVisitaAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const contexto = await cargarVisitaEditable(idDesdeFormulario(datos, "visita_id"));
  if (esFallo(contexto)) return contexto;
  const { visita } = contexto;

  if (visita.estado === "CANCELADA") {
    return falla("Esta visita está cancelada. No se puede iniciar.");
  }

  await iniciarVisitaEnBase(visita.id);
  revalidatePath(`/visitas/${visita.id}`);

  return SIN_ERRORES;
}

// ---------------------------------------------------------------------------
// SECCIÓN 2 · Trabajo realizado
// ---------------------------------------------------------------------------

export async function guardarTrabajoRealizadoAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const contexto = await cargarVisitaEditable(idDesdeFormulario(datos, "visita_id"));
  if (esFallo(contexto)) return contexto;
  const { visita } = contexto;

  const resultado = esquemaTrabajoRealizado.safeParse({
    trabajo_realizado: texto(datos, "trabajo_realizado"),
    observaciones: texto(datos, "observaciones"),
  });
  if (!resultado.success) return erroresDeZod(resultado.error);

  await actualizarTrabajoRealizado(visita.id, {
    ...resultado.data,
    requiere_seguimiento: marcada(datos, "requiere_seguimiento"),
  });
  revalidatePath(`/visitas/${visita.id}`);

  return SIN_ERRORES;
}

// ---------------------------------------------------------------------------
// SECCIÓN 3 · Problemas detectados
// ---------------------------------------------------------------------------

function leerDatosProblema(datos: FormData) {
  return esquemaProblema.safeParse({
    descripcion: texto(datos, "descripcion"),
    solucion_sugerida: texto(datos, "solucion_sugerida"),
    estado: texto(datos, "estado") || "ABIERTO",
  });
}

export async function crearProblemaAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const contexto = await cargarVisitaEditable(idDesdeFormulario(datos, "visita_id"));
  if (esFallo(contexto)) return contexto;
  const { visita } = contexto;

  const resultado = leerDatosProblema(datos);
  if (!resultado.success) return erroresDeZod(resultado.error);

  // sucursal_id sale de la visita: no se pregunta, y no se confía en un id
  // que pudiera venir armado a mano en el POST.
  await crearProblema(visita.id, visita.sucursal_id, resultado.data);
  revalidatePath(`/visitas/${visita.id}`);

  return SIN_ERRORES;
}

export async function actualizarProblemaAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const contexto = await cargarVisitaEditable(idDesdeFormulario(datos, "visita_id"));
  if (esFallo(contexto)) return contexto;
  const { visita } = contexto;

  const problemaId = idDesdeFormulario(datos, "problema_id");
  if (problemaId === null) return falla("No se identificó el problema.");

  const problema = await obtenerProblema(problemaId);
  if (!problema || problema.visita_id !== visita.id) {
    return falla("Ese problema ya no existe en esta visita.");
  }

  const resultado = leerDatosProblema(datos);
  if (!resultado.success) return erroresDeZod(resultado.error);

  await actualizarProblema(problemaId, resultado.data);
  revalidatePath(`/visitas/${visita.id}`);

  return SIN_ERRORES;
}

// ---------------------------------------------------------------------------
// SECCIÓN 4 · Materiales
// ---------------------------------------------------------------------------

function leerDatosMaterial(datos: FormData) {
  return esquemaMaterial.safeParse({
    descripcion: texto(datos, "descripcion"),
    codigo_producto: texto(datos, "codigo_producto"),
    cantidad: texto(datos, "cantidad"),
    direccion: texto(datos, "direccion"),
    observacion: texto(datos, "observacion"),
  });
}

export async function crearMaterialAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const contexto = await cargarVisitaEditable(idDesdeFormulario(datos, "visita_id"));
  if (esFallo(contexto)) return contexto;
  const { visita } = contexto;

  const resultado = leerDatosMaterial(datos);
  if (!resultado.success) return erroresDeZod(resultado.error);

  await crearMaterial(visita.id, resultado.data);
  revalidatePath(`/visitas/${visita.id}`);

  return SIN_ERRORES;
}

export async function actualizarMaterialAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const contexto = await cargarVisitaEditable(idDesdeFormulario(datos, "visita_id"));
  if (esFallo(contexto)) return contexto;
  const { visita } = contexto;

  const materialId = idDesdeFormulario(datos, "material_id");
  if (materialId === null) return falla("No se identificó el material.");

  const material = await obtenerMaterial(materialId);
  if (!material || material.visita_id !== visita.id) {
    return falla("Ese material ya no existe en esta visita.");
  }

  const resultado = leerDatosMaterial(datos);
  if (!resultado.success) return erroresDeZod(resultado.error);

  await actualizarMaterial(materialId, resultado.data);
  revalidatePath(`/visitas/${visita.id}`);

  return SIN_ERRORES;
}

export async function eliminarMaterialAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const contexto = await cargarVisitaEditable(idDesdeFormulario(datos, "visita_id"));
  if (esFallo(contexto)) return contexto;
  const { visita } = contexto;

  const materialId = idDesdeFormulario(datos, "material_id");
  if (materialId === null) return falla("No se identificó el material.");

  const material = await obtenerMaterial(materialId);
  if (!material || material.visita_id !== visita.id) {
    return falla("Ese material ya no existe en esta visita.");
  }

  await eliminarMaterial(materialId);
  revalidatePath(`/visitas/${visita.id}`);

  return SIN_ERRORES;
}

// ---------------------------------------------------------------------------
// SECCIÓN 5 · Firmas
// ---------------------------------------------------------------------------

/**
 * La firma de TECNICO no pregunta nombre ni RUT: sale del técnico asignado a
 * la visita, que es quien está firmando. La de TIENDA sí los pide en el
 * formulario, y se validan acá antes de aceptar el trazo.
 */
export async function guardarFirmaAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const contexto = await cargarVisitaEditable(idDesdeFormulario(datos, "visita_id"));
  if (esFallo(contexto)) return contexto;
  const { visita } = contexto;

  const tipo = texto(datos, "tipo");
  if (tipo !== "TECNICO" && tipo !== "TIENDA") {
    return falla("No se identificó de quién es la firma.");
  }

  const imagenResultado = imagenFirma.safeParse(texto(datos, "imagen"));
  if (!imagenResultado.success) {
    return fallaEnCampo(
      `firma_${tipo}`,
      imagenResultado.error.issues[0]?.message ?? "La firma no es válida.",
    );
  }

  if (tipo === "TIENDA") {
    const identidad = esquemaFirmaTienda.safeParse({
      firmante_nombre: texto(datos, "firmante_nombre"),
      firmante_rut: texto(datos, "firmante_rut"),
    });
    if (!identidad.success) return erroresDeZod(identidad.error);

    await guardarFirma(visita.id, "TIENDA", {
      firmante_nombre: identidad.data.firmante_nombre,
      firmante_rut: identidad.data.firmante_rut,
      imagen: imagenResultado.data,
    });
  } else {
    await guardarFirma(visita.id, "TECNICO", {
      firmante_nombre: visita.tecnico ? nombreTecnico(visita.tecnico) : null,
      firmante_rut: visita.tecnico?.rut ?? null,
      imagen: imagenResultado.data,
    });
  }

  revalidatePath(`/visitas/${visita.id}`);

  return SIN_ERRORES;
}

// ---------------------------------------------------------------------------
// CIERRE DE LA VISITA
// ---------------------------------------------------------------------------

/**
 * "Cerrar visita" no pide datos nuevos: valida lo que ya está guardado y dice
 * exactamente qué falta si no alcanza. No cerrar a medias es la regla
 * central de esta sección — un cierre silencioso sin trabajo realizado ni
 * firma es peor que no cerrar.
 */
export async function cerrarVisitaAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const contexto = await cargarVisitaEditable(idDesdeFormulario(datos, "visita_id"));
  if (esFallo(contexto)) return contexto;
  const { visita } = contexto;

  const firmas = await listarFirmasDeVisita(visita.id);
  const hayFirmaTecnico = firmas.some((f) => f.tipo === "TECNICO");

  const faltantes: string[] = [];
  if (!visita.trabajo_realizado || visita.trabajo_realizado.trim() === "") {
    faltantes.push("el trabajo realizado (sección 2)");
  }
  if (!hayFirmaTecnico) {
    faltantes.push("la firma del técnico (sección 5)");
  }

  if (faltantes.length > 0) {
    return falla(`Para cerrar la visita todavía falta: ${faltantes.join(" y ")}.`);
  }

  await cerrarVisitaEnBase(visita.id);
  revalidatePath(`/visitas/${visita.id}`);

  return SIN_ERRORES;
}

export async function marcarPendienteAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const contexto = await cargarVisitaEditable(idDesdeFormulario(datos, "visita_id"));
  if (esFallo(contexto)) return contexto;
  const { visita } = contexto;

  const resultado = esquemaPendiente.safeParse({
    motivo_pendiente: texto(datos, "motivo_pendiente"),
  });
  if (!resultado.success) return erroresDeZod(resultado.error);

  await marcarVisitaPendiente(visita.id, resultado.data.motivo_pendiente);
  revalidatePath(`/visitas/${visita.id}`);

  return SIN_ERRORES;
}

/**
 * Reabrir es cosa de COORDINADOR/ADMIN, nunca del técnico —para eso la
 * visita quedó en solo lectura. La confirmación en pantalla es del lado del
 * cliente (un diálogo); acá se revalida el estado igual, porque la acción es
 * un POST que se puede llamar sin haber pasado por el diálogo.
 */
export async function reabrirVisitaAccion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const sesion = await requerirSesion();
  if (!puedeVerTodas(sesion)) {
    return falla("Solo coordinación o administración pueden reabrir una visita.");
  }

  const visitaId = idDesdeFormulario(datos, "visita_id");
  if (visitaId === null) return falla("No se identificó la visita.");

  const visita = await obtenerVisita(visitaId);
  if (!visita) return falla("Esa visita ya no existe.");
  if (visita.estado !== "REALIZADA") {
    return falla("Esta visita no está cerrada, no hay nada que reabrir.");
  }

  await reabrirVisitaEnBase(visita.id);
  revalidatePath(`/visitas/${visita.id}`);

  return SIN_ERRORES;
}

// ---------------------------------------------------------------------------
// REAGENDAMIENTO (fase 6)
// ---------------------------------------------------------------------------

/**
 * Quién puede reagendar y cuándo es exactamente la misma regla que el resto
 * del formulario de terreno: `cargarVisitaEditable` ya deja pasar solo al
 * técnico dueño de la visita o a coordinación/administración, y ya rechaza
 * una visita REALIZADA. Reagendar es otra forma de seguir editando la visita,
 * así que no hace falta duplicar ese chequeo acá.
 *
 * La escritura en sí (el insert en visita_reagendamiento + el update de
 * visita) va en `fn_reagendar_visita` (docs/05_reagendar_fn.sql), como una
 * sola función de Postgres — el equivalente de una transacción para dos
 * escrituras que tienen que caerse juntas.
 */
export async function reagendarVisitaAccion(
  _previo: EstadoReagendamiento,
  datos: FormData,
): Promise<EstadoReagendamiento> {
  const contexto = await cargarVisitaEditable(idDesdeFormulario(datos, "visita_id"));
  if (esFallo(contexto)) return { ...contexto, exito: null };
  const { visita } = contexto;

  const resultado = esquemaReagendamiento.safeParse({
    fecha_nueva: texto(datos, "fecha_nueva"),
    hora_nueva: texto(datos, "hora_nueva"),
    motivo: texto(datos, "motivo"),
  });
  if (!resultado.success) return { ...erroresDeZod(resultado.error), exito: null };

  // Memoizada por request (ver lib/auth.ts): no es una segunda consulta.
  const sesion = await requerirSesion();

  await reagendarVisita(visita.id, resultado.data, sesion.userId);

  revalidatePath("/visitas");
  revalidatePath(`/visitas/${visita.id}`);

  const fecha = fechaLarga(resultado.data.fecha_nueva);
  const hora = horaCorta(resultado.data.hora_nueva);

  return {
    error: null,
    errores: {},
    exito: `Reagendada para ${fecha}${hora ? ` a las ${hora}` : ""}.`,
  };
}

