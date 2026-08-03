import { z } from "zod";
import { esFechaValida, esHoraValida } from "@/lib/fechas";
import { esTipoTrabajo } from "@/lib/catalogos";
import { emailOpcional, telefonoOpcional, textoOpcional } from "./campos";

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
