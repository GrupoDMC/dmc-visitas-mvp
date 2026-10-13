import { NextResponse } from "next/server";
import { getSesion } from "@/lib/auth";
import { TRAMO_MAXIMO, leerRango } from "@/lib/rango-http";
import { cabecerasEvidencia, mimeSeguro } from "@/lib/evidencia-http";
import { getDuenosDeVideo, getVideoMeta, getVideoTramo } from "@/lib/data/videos";
import { esEvidenciaDeEliminada } from "@/lib/data/visitas";

// Sirve el video que el técnico grabó en terreno. Los bytes viven en
// dmc.visita_video.contenido: no hay almacenamiento de archivos contratado.
//
// A diferencia de la foto, un video se pide por rangos: sin responder 206 no se
// puede adelantar el clip y en Safari ni siquiera arranca. El rango se resuelve
// con SUBSTRING en SQL Server, así que nunca pasa el clip entero por memoria.
//
// Requiere sesión. Coordinación y administración ven cualquier clip; el técnico
// solo los de sus propias visitas.

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getSesion();
  if (!sesion) return new NextResponse("No autorizado", { status: 401 });

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("No encontrado", { status: 404 });

  if (sesion.usuario.rol === "TECNICO") {
    const duenos = await getDuenosDeVideo(id);
    if (!sesion.tecnico || !duenos.includes(sesion.tecnico.id)) {
      return new NextResponse("No encontrado", { status: 404 });
    }
  }

  // La evidencia de una visita eliminada solo la ve el administrador.
  if (sesion.usuario.rol !== "ADMIN" && (await esEvidenciaDeEliminada("video", id))) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  // Primero el tipo y el largo, sin leer un byte del clip: con eso se resuelve
  // qué tramo corresponde devolver.
  const meta = await getVideoMeta(id);
  if (!meta) return new NextResponse("No encontrado", { status: 404 });
  const total = meta.total;

  const base = cabecerasEvidencia(mimeSeguro(meta.mime, "video"));

  // Un clip vacío no se puede servir (getVideoMeta ya lo descarta); por si acaso.
  if (total <= 0) return new NextResponse("No encontrado", { status: 404 });

  const rango = leerRango(req.headers.get("range"), total);
  if (rango === "invalido") {
    return new NextResponse(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${total}` } });
  }
  const tramo = rango ?? { desde: 0, hasta: Math.min(TRAMO_MAXIMO - 1, total - 1) };

  const bytes = await getVideoTramo(id, tramo.desde, tramo.hasta);
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
