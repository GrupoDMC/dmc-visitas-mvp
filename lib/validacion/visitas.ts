import { z } from "zod";
import { esFechaValida, esHoraValida } from "@/lib/fechas";
import {
  esDireccionMaterial,
  esEstadoProblema,
  esTipoTrabajo,
} from "@/lib/catalogos";
import {
  emailOpcional,
  rut,
  rutOpcional,
  telefonoOpcional,
  textoOpcional,
  textoRequerido,
} from "./campos";

/**
 * Igual que en los maestros: el esquema vive acá y no dentro de la Server
 * Action, para que el formulario y la acción no puedan divergir. La validación
 * que manda es esta, y corre en el servidor siempre.
 *
 * Lo que este archivo NO puede validar: que la sucursal sea de ese cliente, que
 * el técnico esté activo, que el cliente exista. Eso son consultas, y van en la
 * acción. Un esquema solo revisa la forma del dato, no a quién pertenece.
 */

/** Id que viene de un select. Vacío no es cero: es "no eligió". */
function idRequerido(faltante: string) {
  return z
    .string()
    .trim()
    .refine((valor) => {
      const numero = Number(valor);
      return valor !== "" && Number.isInteger(numero) && numero > 0;
    }, faltante)
    .transform(Number);
}

function idOpcional(invalido: string) {
  return z
    .string()
    .trim()
    .transform((valor) => (valor === "" ? null : Number(valor)))
    .refine(
      (valor) => valor === null || (Number.isInteger(valor) && valor > 0),
      invalido,
    );
}

const tipoTrabajo = z
  .string()
  .trim()
  .min(1, "Elegí qué tipo de trabajo se va a hacer.")
  .refine(esTipoTrabajo, "Elegí un tipo de trabajo de la lista.");

const fechaRequerida = z
  .string()
  .trim()
  .min(1, "Elegí la fecha de la visita.")
  .refine(esFechaValida, "Esa fecha no existe. Revisá el día y el mes.");

const horaOpcional = z
  .string()
  .trim()
  .transform((valor) => (valor === "" ? null : valor))
  .refine(
    (valor) => valor === null || esHoraValida(valor),
    "Escribí la hora como HH:MM, por ejemplo 09:30.",
  );

const contacto = {
  contacto_nombre: textoOpcional(
    150,
    "El nombre del contacto no puede pasar de 150 caracteres.",
  ),
  contacto_email: emailOpcional,
  contacto_telefono: telefonoOpcional,
};

const descripcion = textoOpcional(
  2000,
  "La descripción del trabajo no puede pasar de 2000 caracteres.",
);

/**
 * Alta desde coordinación. La fecha es obligatoria: agendar es justamente
 * ponerle día a algo. Una visita sin fecha existe, pero es la que nace en
 * terreno y tiene su propio esquema acá abajo.
 */
export const esquemaVisitaNueva = z.object({
  cliente_id: idRequerido("Elegí el cliente."),
  sucursal_id: idRequerido("Elegí la sucursal donde se hace la visita."),
  tecnico_id: idOpcional("No se pudo identificar al técnico elegido."),
  tipo_trabajo: tipoTrabajo,
  fecha_programada: fechaRequerida,
  hora_programada: horaOpcional,
  descripcion_trabajo: descripcion,
  ...contacto,
});

/**
 * Alta desde terreno: el técnico llegó a un lugar sin agendamiento previo.
 *
 * `fecha_programada` queda en NULL a propósito y por eso no está en el
 * esquema. No es un dato que falte: es la marca de que esta visita no se
 * agendó. El técnico tampoco se pregunta — es quien la está creando.
 */
export const esquemaVisitaEnTerreno = z.object({
  cliente_id: idRequerido("Elegí el cliente."),
  sucursal_id: idRequerido("Elegí la sucursal donde estás."),
  tipo_trabajo: tipoTrabajo,
  descripcion_trabajo: descripcion,
  ...contacto,
});

/** El modal de asignación: una o varias visitas, un técnico. */
export const esquemaAsignacion = z.object({
  tecnico_id: idRequerido("Elegí a qué técnico se la asignás."),
});

export type DatosVisitaValidados = z.output<typeof esquemaVisitaNueva>;
export type DatosVisitaEnTerrenoValidados = z.output<
  typeof esquemaVisitaEnTerreno
>;

// ---------------------------------------------------------------------------
// FORMULARIO DE TERRENO (fase 4)
// ---------------------------------------------------------------------------

/**
 * Sección 1 · Datos de la visita. El RUT del responsable de tienda se valida
 * igual que cualquier otro RUT, pero es opcional: no siempre hay alguien de
 * la tienda disponible para dar el dato apenas empieza la visita.
 */
export const esquemaDatosVisita = z.object({
  tipo_trabajo: tipoTrabajo,
  responsable_tienda_nombre: textoOpcional(
    150,
    "El nombre no puede pasar de 150 caracteres.",
  ),
  responsable_tienda_rut: rutOpcional,
  ...contacto,
});

/**
 * Sección 2 · Trabajo realizado. `requiere_seguimiento` es un checkbox y se
 * lee con `marcada()` directamente de FormData, no acá — este esquema solo
 * cubre los dos textos.
 */
export const esquemaTrabajoRealizado = z.object({
  trabajo_realizado: textoOpcional(
    5000,
    "El trabajo realizado no puede pasar de 5000 caracteres.",
  ),
  observaciones: textoOpcional(
    5000,
    "Las observaciones no pueden pasar de 5000 caracteres.",
  ),
});

/**
 * Sección 3 · Problemas detectados. `sucursal_id` no está acá: se copia de la
 * visita en la acción, nunca se pregunta ni se confía en lo que mande el
 * formulario.
 */
export const esquemaProblema = z.object({
  descripcion: textoRequerido(
    2000,
    "Describí el problema.",
    "La descripción no puede pasar de 2000 caracteres.",
  ),
  solucion_sugerida: textoOpcional(
    2000,
    "La solución sugerida no puede pasar de 2000 caracteres.",
  ),
  estado: z
    .string()
    .trim()
    .min(1, "Elegí un estado.")
    .refine(esEstadoProblema, "Elegí un estado de la lista."),
});

/** Sección 4 · Materiales. `cantidad` llega como texto desde un input numérico. */
export const esquemaMaterial = z.object({
  descripcion: textoRequerido(
    200,
    "Describí el material.",
    "La descripción no puede pasar de 200 caracteres.",
  ),
  codigo_producto: textoOpcional(
    60,
    "El código no puede pasar de 60 caracteres.",
  ),
  cantidad: z
    .string()
    .trim()
    .refine((valor) => {
      const numero = Number(valor);
      return valor !== "" && Number.isFinite(numero) && numero > 0;
    }, "La cantidad tiene que ser un número mayor que 0.")
    .transform(Number),
  direccion: z
    .string()
    .trim()
    .min(1, "Elegí si se instaló o se retiró.")
    .refine(esDireccionMaterial, "Elegí una opción de la lista."),
  observacion: textoOpcional(
    500,
    "La observación no puede pasar de 500 caracteres.",
  ),
});

/**
 * Sección 5 · Firma de TIENDA. Solo esta lleva formulario de identidad: la de
 * TECNICO no pregunta nada, sale del perfil de quien está firmando.
 */
export const esquemaFirmaTienda = z.object({
  firmante_nombre: textoRequerido(
    150,
    "Escribí el nombre de quien firma.",
    "El nombre no puede pasar de 150 caracteres.",
  ),
  firmante_rut: rut,
});

/**
 * La imagen viaja como PNG data URL. El límite de caracteres es una red de
 * seguridad, no el control de peso real —eso lo hace el redimensionado a
 * 600px del lado del cliente antes de mandarla.
 */
export const imagenFirma = z
  .string()
  .trim()
  .min(1, "Dibujá la firma antes de guardar.")
  .max(800_000, "La firma quedó muy pesada. Recargá la página e intentá de nuevo.")
  .refine((valor) => valor.startsWith("data:image/"), "La firma no llegó en un formato válido.");

/** Cierre de la visita: no pide datos nuevos, valida lo que ya está guardado. */
export const esquemaPendiente = z.object({
  motivo_pendiente: textoRequerido(
    1000,
    "Contá por qué queda pendiente.",
    "El motivo no puede pasar de 1000 caracteres.",
  ),
});

/**
 * Reagendamiento (fase 6). La fecha reusa `fechaRequerida` y la hora
 * `horaOpcional` de más arriba — son las mismas reglas que al agendar por
 * primera vez. El motivo pide un mínimo de 10 caracteres para que no se
 * complete con un "no se pudo" que no le sirve a quien retoma la visita.
 */
export const esquemaReagendamiento = z.object({
  fecha_nueva: fechaRequerida,
  hora_nueva: horaOpcional,
  motivo: z
    .string()
    .trim()
    .min(10, "Contá el motivo del reagendamiento (mínimo 10 caracteres).")
    .max(1000, "El motivo no puede pasar de 1000 caracteres."),
});

export type DatosReagendamientoValidados = z.output<typeof esquemaReagendamiento>;

export type DatosDatosVisitaValidados = z.output<typeof esquemaDatosVisita>;
export type DatosTrabajoRealizadoValidados = z.output<
  typeof esquemaTrabajoRealizado
>;
export type DatosProblemaValidados = z.output<typeof esquemaProblema>;
export type DatosMaterialValidados = z.output<typeof esquemaMaterial>;
export type DatosFirmaTiendaValidados = z.output<typeof esquemaFirmaTienda>;
