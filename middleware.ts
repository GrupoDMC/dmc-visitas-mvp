import { NextResponse, type NextRequest } from "next/server";

// Puerta de entrada única: sin cookie de sesión, cualquier ruta cae en /login.
// El reparto por rol lo sigue haciendo el login (app/actions/auth.ts) y, si ya
// hay sesión, la raíz (app/page.tsx) manda a /tecnico o /admin según el rol.
// La validación real de la sesión ocurre en lib/auth.getSesion — esto es solo
// el primer filtro para que nadie vea una pantalla antes de identificarse.
const COOKIE = "dmc_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login") return NextResponse.next();

  if (!req.cookies.get(COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
