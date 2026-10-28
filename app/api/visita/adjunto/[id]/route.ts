import { NextResponse } from "next/server";
import { getSesion } from "@/lib/auth";
import { TRAMO_MAXIMO, leerRango } from "@/lib/rango-http";
import { cabecerasEvidencia, mimeSeguro } from "@/lib/evidencia-http";
import { getAdjuntoMeta, getAdjuntoTramo, getDuenosDeAdjunto } from "@/lib/data/adjuntos";

// Sirve las fotos y los videos que explican el trabajo a realizar. Los bytes
// viven en dmc.visita_adjunto.contenido.
//
// Se piden por rangos, como el video del acta: sin responder 206 no se puede
// adelantar un clip y en Safari ni arranca. Una foto cabe en un tramo y sale
// con 200.
//
// Requiere sesión. El panel ve cualquier adjunto; el técnico solo los de sus
// visitas. Los de una visita eliminada solo los ve el administrador.

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getSesion();
  if (!sesion) return new NextResponse("No autorizado", { status: 401 });

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("No encontrado", { status: 404 });

  const duenos = await getDuenosDeAdjunto(id);
  if (!duenos) return new NextResponse("No encontrado", { status: 404 });
  if (sesion.usuario.rol === "TECNICO" && (!sesion.tecnico || !duenos.tecnicos.includes(sesion.tecnico.id))) {
    return new NextResponse("No encontrado", { status: 404 });
  }
  if (sesion.usuario.rol !== "ADMIN" && !duenos.visitaActiva) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const meta = await getAdjuntoMeta(id);
  if (!meta || meta.total <= 0) return new NextResponse("No encontrado", { status: 404 });
  const total = meta.total;

  const base = cabecerasEvidencia(mimeSeguro(meta.mime, meta.tipo === "FOTO" ? "imagen" : "video"));

  const rango = leerRango(req.headers.get("range"), total);
  if (rango === "invalido") {
    return new NextResponse(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${total}` } });
  }
  const tramo = rango ?? { desde: 0, hasta: Math.min(TRAMO_MAXIMO - 1, total - 1) };

  const bytes = await getAdjuntoTramo(id, tramo.desde, tramo.hasta);
  if (!bytes) return new NextResponse("No encontrado", { status: 404 });

  const parcial = rango !== null || tramo.hasta < total - 1;
  return new NextResponse(new Uint8Array(bytes), {
    status: parcial ? 206 : 200,
    headers: {
      ...base,
      "Accept-Ranges": "bytes",
      "Content-Length": String(bytes.length),
      ...(parcial ? { "Content-Range": `bytes ${tramo.desde}-${tramo.hasta}/${total}` } : {}),
    },
  });
}
