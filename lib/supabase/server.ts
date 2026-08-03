import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { claveAnonima, urlSupabase } from "@/lib/env";
import { endurecer } from "./opciones-cookie";

/**
 * Cliente de Auth ligado a las cookies de la petición.
 *
 * Usa la clave anónima y sirve para UNA sola cosa: leer, crear y cerrar la
 * sesión del usuario. Con RLS en deny-all no puede tocar datos de negocio,
 * que es exactamente lo que queremos. Los datos salen de supabaseAdmin().
 */
export async function clienteAuth() {
  const almacen = await cookies();

  return createServerClient(urlSupabase(), claveAnonima(), {
    cookies: {
      getAll() {
        return almacen.getAll();
      },
      setAll(porGuardar) {
        try {
          for (const { name, value, options } of porGuardar) {
            almacen.set(name, value, endurecer(options));
          }
        } catch {
          // Escribir cookies desde un Server Component lanza excepción.
          // No es un problema: proxy.ts ya refrescó la sesión antes de
          // renderizar, así que acá no hay nada que perder.
        }
      },
    },
  });
}
