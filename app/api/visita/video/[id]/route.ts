import { NextResponse } from "next/server";
import { getSesion } from "@/lib/auth";
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

// Cuánto se manda como máximo por respuesta. El tope existe porque la
// respuesta de una función serverless también está acotada: si el cliente pide
// "bytes=0-" sobre un clip de 11 MB y se le manda entero, la petición muere. Se
// le devuelve el primer tramo con su Content-Range y el reproductor sigue
// pidiendo lo que falta.
const TRAMO_MAXIMO = 2 * 1024 * 1024;

type Rango = { desde: number; hasta: number } | "invalido" | null;

/**
 * "bytes=0-" / "bytes=1048576-2097151" → posiciones. null si no hay rango (o no
 * se entiende, y entonces se ignora); "invalido" si cae fuera del archivo.
 * El tramo siempre se recorta a TRAMO_MAXIMO, tenga o no final explícito.
 */
function leerRango(cabecera: string | null, total: number): Rango {
  const m = /^bytes=(\d*)-(\d*)$/.exec((cabecera ?? "").trim());
  if (!m) return null;
  const [, a, b] = m;
  if (!a && !b) return null;
  if (total <= 0) return "invalido";

  // "bytes=-500" son los últimos 500 bytes.
  if (!a) {
    const largo = Math.min(Number(b), total);
    if (largo <= 0) return "invalido";
    const desde = Math.max(0, total - largo);
    return { desde, hasta: Math.min(total - 1, desde + TRAMO_MAXIMO - 1) };
  }
  const desde = Number(a);
  if (!Number.isSafeInteger(desde) || desde >= total) return "invalido";
  const pedido = b ? Number(b) : total - 1;
  if (!Number.isSafeInteger(pedido) || pedido < desde) return "invalido";
  return { desde, hasta: Math.min(pedido, total - 1, desde + TRAMO_MAXIMO - 1) };
}

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
