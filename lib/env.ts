/**
 * Acceso validado a las variables de entorno.
 *
 * Falla temprano y con un mensaje que dice qué falta, en vez de reventar
 * más adelante con un "fetch failed" sin contexto.
 */

function requerida(nombre: string, valor: string | undefined): string {
  if (!valor || valor.trim() === "") {
    throw new Error(
      `Falta la variable de entorno ${nombre}. ` +
        `Copiá .env.local.example como .env.local y completá los valores, ` +
        `o cargala en Vercel → Settings → Environment Variables.`,
    );
  }
  return valor.trim();
}

/** Públicas: se referencian literalmente para que Next las inyecte en el bundle. */
export function urlSupabase(): string {
  return requerida(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

export function claveAnonima(): string {
  return requerida(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * SECRETO. Saltea RLS. Solo se llama desde módulos marcados con `server-only`.
 */
export function claveServicio(): string {
  return requerida(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export const enProduccion = process.env.NODE_ENV === "production";
