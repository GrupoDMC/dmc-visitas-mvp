import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { claveServicio, urlSupabase } from "@/lib/env";

/**
 * Cliente con service_role: saltea RLS por completo.
 *
 * REGLA CENTRAL: este es el único cliente que toca datos de negocio, y solo
 * corre en el servidor. El `import "server-only"` de arriba hace que el build
 * falle si alguien lo importa por accidente desde un componente de cliente.
 *
 * No lo uses directo desde un componente: todo el acceso pasa por lib/db/*.ts.
 */
let instancia: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (instancia) return instancia;

  instancia = createClient(urlSupabase(), claveServicio(), {
    auth: {
      // Es un cliente de servidor sin usuario: no persiste ni refresca sesión.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return instancia;
}
