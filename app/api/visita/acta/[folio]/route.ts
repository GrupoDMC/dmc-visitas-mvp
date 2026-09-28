import { NextResponse } from "next/server";
import { getSesion } from "@/lib/auth";
import { getFirmaBinaria, getFotoBinaria, getVisitaCompletaPorFolio } from "@/lib/data/visitas";
import { listarMotivos, listarProblemas, listarTrabajos } from "@/lib/data/catalogos";
import { generarPdfActa } from "@/lib/pdf/acta";

// El acta en PDF para mandarle al cliente. Sin comentario interno: ni el texto,
// ni su checklist, ni las fotos o clips marcados como internos.
//
// Requiere sesión. Coordinación y administración bajan cualquier acta; el
// técnico solo las de sus propias visitas.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ folio: string }> }) {
  const sesion = await getSesion();
  if (!sesion) return new NextResponse("No autorizado", { status: 401 });

  const { folio: folioParam } = await params;
  const folio = decodeURIComponent(folioParam);
  const visita = await getVisitaCompletaPorFolio(folio);
  if (!visita) return new NextResponse("No encontrada", { status: 404 });
  if (sesion.usuario.rol === "TECNICO" && visita.tecnicoId !== sesion.tecnico?.id) {
    return new NextResponse("No encontrada", { status: 404 });
  }
  if (visita.estado !== "COMPLETADA") {
    return new NextResponse("El acta todavía no está cerrada.", { status: 409 });
  }

  try {
    const firmaTienda = visita.firmas?.find((f) => f.rol === "TIENDA") ?? visita.firmas?.[0];
    const [motivos, trabajos, problemas, fotos, firma] = await Promise.all([
      listarMotivos(),
      listarTrabajos(),
      listarProblemas(),
      Promise.all((visita.fotos ?? []).filter((f) => !f.interno).map((f) => getFotoBinaria(f.id))),
      firmaTienda ? getFirmaBinaria(firmaTienda.id) : Promise.resolve(null),
    ]);

    const pdf = await generarPdfActa({
      visita,
      motivos,
      trabajos,
      problemas,
      fotos: fotos.filter((f) => f !== null).map((f) => ({ bytes: new Uint8Array(f.bytes), mime: f.mime })),
      firma: firma ? { bytes: new Uint8Array(firma.bytes), mime: firma.mime } : null,
    });

    const nombre = `Acta ${visita.folio}.pdf`;
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `attachment; filename="${nombre.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[dmc] no se pudo generar el PDF del acta:", err);
    return new NextResponse("No se pudo generar el PDF.", { status: 500 });
  }
}
