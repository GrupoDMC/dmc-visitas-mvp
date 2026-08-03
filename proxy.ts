import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { endurecer } from "@/lib/supabase/opciones-cookie";
import { esRutaDeMaestros, INICIO_TECNICO } from "@/lib/navegacion";

/**
 * En Next.js 16 el antiguo `middleware.ts` se llama `proxy.ts`.
 *
 * Hace tres cosas y ninguna más:
 *  1. Refresca el token de sesión y reescribe las cookies.
 *  2. Chequeo optimista: sin sesión, a /login.
 *  3. Rebota a un TECNICO que intente entrar a los maestros.
 *
 * Lo de (3) es comodidad, no la barrera de seguridad. La barrera está en
 * `requerirVerTodas()`, que corre en la página con la sesión ya validada y
 * cubre también a las Server Actions, que no pasan por acá. Si la consulta de
 * abajo falla, dejamos pasar: la página va a frenar igual.
 */

const RUTAS_PUBLICAS = ["/login"];

function esPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
  );
}

/**
 * Rol del usuario, leído directo de PostgREST.
 *
 * No usa `lib/supabase/admin.ts` a propósito: el proxy corre en un runtime
 * aparte del render y la documentación de Next pide no compartir módulos con
 * estado entre los dos. Un `fetch` suelto no tiene ese problema.
 *
 * Solo se llama en las rutas de maestros. Un técnico navegando sus visitas no
 * paga este viaje de red, que es justo el que no queremos cobrarle a alguien
 * en terreno con mala señal.
 */
async function rolDelUsuario(usuarioId: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) return null;

  try {
    const respuesta = await fetch(
      `${url}/rest/v1/perfil?id=eq.${encodeURIComponent(usuarioId)}&select=rol&limit=1`,
      {
        headers: { apikey: clave, Authorization: `Bearer ${clave}` },
        cache: "no-store",
      },
    );

    if (!respuesta.ok) return null;

    const filas: Array<{ rol?: string }> = await respuesta.json();
    return filas[0]?.rol ?? null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(porGuardar, cabeceras) {
          for (const { name, value } of porGuardar) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of porGuardar) {
            response.cookies.set(name, value, endurecer(options));
          }
          // Una respuesta que setea cookies de sesión no se puede cachear:
          // si un CDN la guarda, le sirve la sesión de uno a otro usuario.
          for (const [clave, valor] of Object.entries(cabeceras ?? {})) {
            response.headers.set(clave, valor);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !esPublica(pathname)) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    // Para volver a donde iba después de entrar.
    if (pathname !== "/") {
      destino.searchParams.set("volverA", pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(destino);
  }

  if (user && pathname === "/login") {
    const destino = request.nextUrl.clone();
    destino.pathname = "/";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  // Clientes, sucursales y técnicos son de coordinación. Un técnico que llegue
  // por URL directa vuelve a sus visitas.
  if (user && esRutaDeMaestros(pathname)) {
    const rol = await rolDelUsuario(user.id);

    if (rol === "TECNICO") {
      const destino = request.nextUrl.clone();
      destino.pathname = INICIO_TECNICO;
      destino.search = "";
      return NextResponse.redirect(destino);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Todo salvo los assets estáticos. Sin este filtro el proxy corre
     * también sobre el CSS y las imágenes, y la redirección a /login
     * termina rompiendo la carga de la propia página de ingreso.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
