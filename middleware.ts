import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_EXPIRA,
  COOKIE_SESION,
  VIGENCIA_SESION,
  firmarToken,
  opcionesCookie,
  tocaRenovar,
  verificarToken,
} from "@/lib/session";

// Puerta de entrada única. Antes solo miraba que la cookie existiera; ahora
// verifica la firma del token, así que una cookie inventada o caducada no
// llega siquiera a renderizar una pantalla.
//
// Sigue siendo el primer filtro, no el único: lib/auth.getSesion vuelve a leer
// el usuario en cada petición para comprobar que existe y sigue activo.
//
// La sesión vence por inactividad: cualquier petición —navegar, guardar, el
// respaldo del borrador, el aviso de actividad de VigilanteSesion— vuelve a
// firmar el token con el plazo completo. Solo se cae si nadie hace nada
// durante VIGENCIA_SESION.

const PUBLICAS = new Set(["/login"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICAS.has(pathname)) return NextResponse.next();

  const token = await verificarToken(req.cookies.get(COOKIE_SESION)?.value);
  if (token) {
    const respuesta = NextResponse.next();
    // Sin la cookie de vencimiento (sesiones abiertas antes de que existiera)
    // también se renueva, para que el navegador sepa cuándo vence.
    if (tocaRenovar(token) || !req.cookies.get(COOKIE_EXPIRA)) {
      try {
        const nuevo = await firmarToken(token.uid);
        const exp = Math.floor(Date.now() / 1000) + VIGENCIA_SESION;
        respuesta.cookies.set(COOKIE_SESION, nuevo, opcionesCookie(VIGENCIA_SESION));
        respuesta.cookies.set(COOKIE_EXPIRA, String(exp), opcionesCookie(VIGENCIA_SESION, false));
      } catch {
        // Sin poder firmar se sigue con el token vigente: vencerá a su hora.
      }
    }
    return respuesta;
  }

  // Las llamadas en segundo plano (aviso de actividad) no se redirigen: un
  // 401 basta para que el navegador sepa que ya no hay sesión.
  if (pathname.startsWith("/api/")) {
    const respuesta = NextResponse.json({ ok: false }, { status: 401 });
    respuesta.cookies.delete(COOKIE_SESION);
    respuesta.cookies.delete(COOKIE_EXPIRA);
    return respuesta;
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const respuesta = NextResponse.redirect(url);
  // Cookie inválida o vencida: se limpia para no reintentar con ella en cada
  // navegación.
  respuesta.cookies.delete(COOKIE_SESION);
  respuesta.cookies.delete(COOKIE_EXPIRA);
  return respuesta;
}

export const config = {
  matcher: [
    // Todo salvo estáticos de Next, imágenes y la ruta de diagnóstico
    // (/api/salud tiene su propia autorización por token).
    "/((?!_next/static|_next/image|api/salud|favicon.ico|.*\.(?:png|jpg|jpeg|svg|ico|webp)$).*)",
  ],
};
