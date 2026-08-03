import { NextResponse, type NextRequest } from "next/server";
import { clienteAuth } from "@/lib/supabase/server";

/**
 * Cierra la sesión y manda a /login.
 *
 * Existe para un caso puntual: el usuario tiene sesión válida en Supabase
 * pero su perfil se deshabilitó (o nunca se creó). El layout no puede
 * escribir cookies, así que no puede cerrarle la sesión; si solo lo mandara
 * a /login, el proxy lo devolvería a / por tener sesión, y quedaría rebotando.
 * Acá sí podemos borrar la cookie y cortar el ciclo.
 */
export async function GET(request: NextRequest) {
  const supabase = await clienteAuth();
  await supabase.auth.signOut();

  const destino = request.nextUrl.clone();
  destino.pathname = "/login";
  destino.search = "";

  const motivo = request.nextUrl.searchParams.get("motivo");
  if (motivo === "deshabilitada") {
    destino.searchParams.set("motivo", "deshabilitada");
  }

  return NextResponse.redirect(destino);
}
