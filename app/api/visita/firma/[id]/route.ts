import { NextResponse } from "next/server";
import { getSesion } from "@/lib/auth";
import { esEvidenciaDeEliminada, getDuenosDeImagen, getFirmaBinaria } from "@/lib/data/visitas";

// Sirve la firma capturada en el canvas del celular. Mismo criterio que la
// foto: bytes en la base y acceso limitado a quien corresponde.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getSesion();
  if (!sesion) return new NextResponse("No autorizado", { status: 401 });

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("No encontrada", { status: 404 });

  if (sesion.usuario.rol === "TECNICO") {
    const duenos = await getDuenosDeImagen("firma", id);
    if (!sesion.tecnico || !duenos.includes(sesion.tecnico.id)) {
      return new NextResponse("No encontrada", { status: 404 });
    }
  }

  // La evidencia de una visita eliminada solo la ve el administrador.
  if (sesion.usuario.rol !== "ADMIN" && (await esEvidenciaDeEliminada("firma", id))) {
    return new NextResponse("No encontrada", { status: 404 });
  }

  const imagen = await getFirmaBinaria(id);
  if (!imagen) return new NextResponse("No encontrada", { status: 404 });

  return new NextResponse(new Uint8Array(imagen.bytes), {
    headers: {
      "Content-Type": imagen.mime,
      "Content-Length": String(imagen.bytes.length),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
