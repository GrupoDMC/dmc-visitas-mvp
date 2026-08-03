import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { endurecer } from "@/lib/supabase/opciones-cookie";

/**
 * En Next.js 16 el antiguo `middleware.ts` se llama `proxy.ts`.
 *
 * Hace dos cosas y ninguna más:
 *  1. Refresca el token de sesión y reescribe las cookies.
 *  2. Chequeo optimista: sin sesión, a /login.
 *
 * NO decide permisos ni lee el perfil. Eso lo hace requerirSesion() en el
 * layout, que sí puede consultar la base. Acá solo miramos si hay usuario.
 */

const RUTAS_PUBLICAS = ["/login"];

function esPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
  );
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
