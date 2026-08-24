import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, verificarToken } from "@/lib/session";

// Puerta de entrada única. Antes solo miraba que la cookie existiera; ahora
// verifica la firma del token, así que una cookie inventada o caducada no
// llega siquiera a renderizar una pantalla.
//
// Sigue siendo el primer filtro, no el único: lib/auth.getSesion vuelve a leer
// el usuario en cada petición para comprobar que existe y sigue activo.

const PUBLICAS = new Set(["/login"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICAS.has(pathname)) return NextResponse.next();

  const token = await verificarToken(req.cookies.get(COOKIE_SESION)?.value);
  if (token) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const respuesta = NextResponse.redirect(url);
  // Cookie inválida o vencida: se limpia para no reintentar con ella en cada
  // navegación.
  respuesta.cookies.delete(COOKIE_SESION);
  return respuesta;
}

export const config = {
  matcher: [
    // Todo salvo estáticos de Next, imágenes y la ruta de diagnóstico
    // (/api/salud tiene su propia autorización por token).
    "/((?!_next/static|_next/image|api/salud|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)",
  ],
};
