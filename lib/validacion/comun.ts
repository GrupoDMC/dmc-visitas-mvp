import { z } from "zod";
import { log } from "@/lib/log";

// Validación en runtime de lo que llega a las Server Actions.
//
// Los tipos de TypeScript desaparecen al compilar: una Server Action es un
// endpoint HTTP y el navegador puede mandarle cualquier JSON. Cada acción
// exportada de app/actions/ valida su entrada con un esquema de esta carpeta
// ANTES de tocar nada, y después del control de permisos (quien no puede hacer
// la operación recibe el mismo rechazo de siempre, sin enterarse de la forma de
// los datos).
//
// Los largos máximos calzan con las columnas de sql/dmc_contingencia_sqlserver.sql;
// los campos nvarchar(max) llevan un tope razonable de todos modos, para que
// nadie suba megas de texto por un campo de observaciones.

/** Mensaje por defecto cuando un esquema no trae uno propio. */
z.config({
  customError: (iss) => {
    const campo = (iss.path ?? []).filter((p) => typeof p === "string").join(".");
    return campo ? `Dato no válido: ${campo}.` : "Los datos enviados no son válidos.";
  },
});

export type Validado<T> = { ok: true; datos: T } | { ok: false; error: string };

/**
 * Valida `valor` contra el esquema. En el fallo devuelve el primer mensaje
 * (los esquemas ponen uno claro donde la pantalla ya tenía un texto propio) y
 * deja en el log DÓNDE falló, sin el valor: puede traer datos personales.
 */
export function validar<S extends z.ZodType>(esquema: S, valor: unknown, contexto: string): Validado<z.output<S>> {
  const r = esquema.safeParse(valor);
  if (r.success) return { ok: true, datos: r.data };
  const primera = r.error.issues[0];
  log.warn(contexto, { rechazo: "entrada rechazada", campo: (primera?.path ?? []).join(".") || "(raíz)" });
  return { ok: false, error: primera?.message ?? "Los datos enviados no son válidos." };
}

// ── Primitivas ──────────────────────────────────────────────────────────────

/** Un id de fila: entero positivo. */
export const idPositivo = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** Un id que se elige en un selector: 0 es «sin elegir», que es lo que manda un select vacío. */
export const idElegible = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const texto = (max: number) => z.string().max(max, `El texto es demasiado largo (máximo ${max} caracteres).`);

/** Folio de visita: varchar(16). */
export const folio = z.string().min(1).max(16);

/** Código de catálogo: varchar(40). */
export const codigo = z.string().max(40);

/** YYYY-MM-DD. */
export const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida.");

/** Fecha que el formulario puede dejar vacía (la acción dice entonces qué falta). */
export const fechaOVacia = z.union([z.literal(""), fechaISO]);

/** HH:mm o HH:mm:ss. */
export const hora = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "La hora no es válida.");
export const horaOVacia = z.union([z.literal(""), hora]);

/** RUT tal como lo escribe el usuario; se normaliza a varchar(12) más adentro. */
export const rutEscrito = z.string().max(16, "El RUT es demasiado largo.");
/** RUT ya guardable: varchar(12). */
export const rutGuardable = z.string().max(12, "El RUT es demasiado largo.");

/** Teléfono: varchar(30). */
export const telefono = z.string().max(30, "El teléfono es demasiado largo.");

export const correo = z.string().max(160, "El correo es demasiado largo.");

/** Texto libre de las columnas nvarchar(max). */
export const textoLibre = texto(20_000);

export const arreglo = <T extends z.ZodType>(item: T, max: number) =>
  z.array(item).max(max, `Son demasiados elementos (máximo ${max}).`);
