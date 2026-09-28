import { NextResponse } from "next/server";

// Aviso de actividad de VigilanteSesion. No hace nada por sí mismo: el
// middleware ya renovó el token al dejar pasar la petición. Si la sesión venció,
// el middleware contesta 401 antes de llegar acá.
export async function POST() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
