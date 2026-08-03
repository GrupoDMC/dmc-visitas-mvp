import type { CookieOptions } from "@supabase/ssr";
import { enProduccion } from "@/lib/env";

/**
 * Endurece las cookies de sesión que emite Supabase Auth.
 *
 * `httpOnly: true` es deliberado: el token de sesión queda invisible para el
 * JavaScript del navegador. Por eso el proyecto no crea ningún cliente de
 * Supabase en el navegador — el ingreso y la salida se hacen con Server
 * Actions. Ver docs/decisiones.md.
 */
export function endurecer(opciones: CookieOptions): CookieOptions {
  return {
    ...opciones,
    httpOnly: true,
    sameSite: "lax",
    secure: enProduccion,
    path: "/",
  };
}
