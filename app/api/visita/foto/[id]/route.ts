import { NextResponse } from "next/server";
import { getSesion } from "@/lib/auth";
import { getDuenoDeImagen, getFotoBinaria } from "@/lib/data/visitas";

// Sirve la foto que el técnico tomó en terreno. Los bytes viven en
// dmc.visita_foto.contenido: no hay almacenamiento de archivos contratado.
//
// Requiere sesión. Coordinación y administración ven cualquier foto; el técnico
// solo las de sus propias visitas.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getSesion();
  if (!sesion) return new NextResponse("No autorizado", { status: 401 });

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("No encontrada", { status: 404 });

  if (sesion.usuario.rol === "TECNICO") {
    const dueno = await getDuenoDeImagen("foto", id);
    if (dueno === null || dueno !== sesion.tecnico?.id) {
      return new NextResponse("No encontrada", { status: 404 });
    }
  }

  const imagen = await getFotoBinaria(id);
  if (!imagen) return new NextResponse("No encontrada", { status: 404 });

  return new NextResponse(new Uint8Array(imagen.bytes), {
    headers: {
      "Content-Type": imagen.mime,
      "Content-Length": String(imagen.bytes.length),
      // Privada: la foto es de una visita concreta y no debe quedar en ninguna
      // caché compartida. Inmutable porque una foto guardada no cambia nunca.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
