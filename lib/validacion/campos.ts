import { z } from "zod";
import { esRutValido, normalizarRut } from "@/lib/rut";
import { REGIONES } from "@/lib/regiones";

/**
 * Piezas compartidas por los esquemas de los maestros.
 *
 * Regla de la casa: en la base, un campo opcional vacío se guarda como NULL y
 * nunca como cadena vacía. Si conviven los dos, cada consulta posterior tiene
 * que preguntar por ambos y siempre se olvida uno.
 */

/** Texto opcional: se recorta, y si queda vacío se convierte en NULL. */
export function textoOpcional(maximo: number, excedido: string) {
  return z
    .string()
    .trim()
    .max(maximo, excedido)
    .transform((valor) => (valor === "" ? null : valor));
}

export function textoRequerido(
  maximo: number,
  faltante: string,
  excedido: string,
) {
  return z.string().trim().min(1, faltante).max(maximo, excedido);
}

/**
 * RUT chileno. Valida el dígito verificador y devuelve el RUT ya normalizado
 * al formato de guardado — el resto de la app nunca ve la forma con puntos.
 */
export const rut = z
  .string()
  .trim()
  .min(1, "Escribí el RUT.")
  .refine(esRutValido, "Ese RUT no es válido. Revisá el dígito verificador.")
  .transform((valor) => normalizarRut(valor) as string);

/** Correo opcional. Vacío es válido; escrito a medias, no. */
export const emailOpcional = z
  .string()
  .trim()
  .max(150, "El correo no puede pasar de 150 caracteres.")
  .transform((valor) => (valor === "" ? null : valor))
  .refine(
    (valor) => valor === null || z.email().safeParse(valor).success,
    "Revisá el correo: parece que le falta el @ o el dominio.",
  );

/** Teléfono: texto libre a propósito. Entran anexos, "+56 9 ..." y celulares. */
export const telefonoOpcional = textoOpcional(
  30,
  "El teléfono no puede pasar de 30 caracteres.",
);

/**
 * RUT opcional. Vacío es válido —quien recibe al técnico puede no darlo—,
 * pero si viene escrito tiene que ser un RUT de verdad: se normaliza igual
 * que el RUT obligatorio de los maestros.
 */
export const rutOpcional = z
  .string()
  .trim()
  .transform((valor) => (valor === "" ? null : valor))
  .refine(
    (valor) => valor === null || esRutValido(valor),
    "Ese RUT no es válido. Revisá el dígito verificador.",
  )
  .transform((valor) => (valor === null ? null : (normalizarRut(valor) as string)));

/**
 * Región: obligatoriamente una de las 16, o NULL.
 *
 * Es texto libre en la base pero no en el formulario: el traspaso a DMC_Core
 * mapea la región por nombre contra `core.region`, y un "RM" escrito a mano no
 * calza con nada.
 */
export const regionOpcional = z
  .string()
  .trim()
  .transform((valor) => (valor === "" ? null : valor))
  .refine(
    (valor) => valor === null || (REGIONES as readonly string[]).includes(valor),
    "Elegí una región de la lista.",
  );
