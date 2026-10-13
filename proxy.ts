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
import { CSP_CABECERA, CSP_RUTA_REPORTE, construirCsp, generarNonce } from "@/lib/csp";

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

const PUBLICAS = new Set(["/login", CSP_RUTA_REPORTE]);

export async function proxy(req: NextRequest) {
  // El nonce viaja a Next en la cabecera de la petición (así lo marca en sus
  // scripts) y la política sale en la respuesta. Va en todas las respuestas
  // que dejan pasar la petición, públicas o no.
  const nonce = generarNonce();
  const csp = construirCsp(nonce, process.env.NODE_ENV === "development");
  const cabeceras = new Headers(req.headers);
  cabeceras.set("x-nonce", nonce);
  cabeceras.set(CSP_CABECERA, csp);
  const pasar = () => {
    const r = NextResponse.next({ request: { headers: cabeceras } });
    r.headers.set(CSP_CABECERA, csp);
    return r;
  };

  const { pathname } = req.nextUrl;
  if (PUBLICAS.has(pathname)) return pasar();

  const token = await verificarToken(req.cookies.get(COOKIE_SESION)?.value);
  if (token) {
    const respuesta = pasar();
    // Sin la cookie de vencimiento (sesiones abiertas antes de que existiera)
    // también se renueva, para que el navegador sepa cuándo vence. Lo mismo un
    // token sin versión: se vuelve a firmar con la 0, que es con la que valía.
    // La versión se copia tal cual; compararla con la base es cosa de getSesion.
    if (tocaRenovar(token) || !req.cookies.get(COOKIE_EXPIRA) || token.sinVersion) {
      try {
        const nuevo = await firmarToken(token.uid, token.sv);
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
    "/((?!_next/static|_next/image|api/salud|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)",
  ],
};
