import { NextResponse } from "next/server";
import { getSesion } from "@/lib/auth";
import { getVisitaCompletaPorFolio } from "@/lib/data/visitas";
import { participaEnVisita } from "@/lib/ui/estado";
import { mediosDelActa } from "@/lib/ui/medios-acta";

// La lista de fotos y videos de un acta (con el nombre que llevan en el .zip de
// actas), sin bajar un solo byte: cada archivo se pide después a su ruta.
//
// Mismas reglas que el PDF: requiere sesión; coordinación y administración ven
// cualquier acta y el técnico solo las de sus propias visitas.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ folio: string }> }) {
  const sesion = await getSesion();
  if (!sesion) return new NextResponse("No autorizado", { status: 401 });

  const { folio: folioParam } = await params;
  const visita = await getVisitaCompletaPorFolio(decodeURIComponent(folioParam));
  if (!visita) return new NextResponse("No encontrada", { status: 404 });
  if (sesion.usuario.rol === "TECNICO" && !(sesion.tecnico && participaEnVisita(visita, sesion.tecnico.id))) {
    return new NextResponse("No encontrada", { status: 404 });
  }

  return NextResponse.json({ medios: mediosDelActa(visita) }, { headers: { "Cache-Control": "private, no-store" } });
}
