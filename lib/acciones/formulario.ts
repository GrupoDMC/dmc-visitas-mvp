import type { ZodError } from "zod";

/**
 * Estado que devuelven todas las Server Actions de formulario, y que las
 * pantallas leen con `useActionState`.
 *
 * `error` es el problema general ("ese RUT ya lo tiene otro cliente").
 * `errores` es el problema de un campo puntual, y se muestra debajo de él.
 *
 * No lleva los valores tipeados de vuelta, y no hace falta: los formularios
 * controlan sus campos con `useCampos`, así que lo escrito sobrevive del lado
 * del cliente. Ojo con esto — React 19 vacía los campos NO controlados en
 * cuanto la acción termina, también cuando vuelve con error, así que un
 * formulario de estos con `defaultValue` pierde todo al primer tropiezo.
 */
export type EstadoFormulario = {
  error: string | null;
  errores: Record<string, string>;
};

export const SIN_ERRORES: EstadoFormulario = { error: null, errores: {} };

/** Un problema general, sin campo culpable. */
export function falla(mensaje: string): EstadoFormulario {
  return { error: mensaje, errores: {} };
}

/** Un problema atribuible a un campo. */
export function fallaEnCampo(campo: string, mensaje: string): EstadoFormulario {
  return { error: null, errores: { [campo]: mensaje } };
}

/**
 * Primer mensaje por campo. Si un campo junta dos problemas mostramos uno
 * solo: apilarlos no ayuda a corregir más rápido.
 */
export function erroresDeZod(error: ZodError): EstadoFormulario {
  const errores: Record<string, string> = {};

  for (const problema of error.issues) {
    const campo = String(problema.path[0] ?? "");
    if (campo && !errores[campo]) errores[campo] = problema.message;
  }

  return { error: null, errores };
}

/** Lectura defensiva de FormData: nunca devuelve undefined ni un File. */
export function texto(datos: FormData, campo: string): string {
  const valor = datos.get(campo);
  return typeof valor === "string" ? valor : "";
}

/**
 * Checkbox. Ausente = false, que es exactamente cómo un navegador serializa
 * una casilla sin marcar. Funciona con y sin JavaScript.
 */
export function marcada(datos: FormData, campo: string): boolean {
  return datos.get(campo) === "si";
}
