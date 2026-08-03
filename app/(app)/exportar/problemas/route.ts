import type { NextRequest } from "next/server";
import { requerirAdmin } from "@/lib/auth";
import { armarCsv, nombreArchivoCsv, type ColumnaCsv } from "@/lib/csv";
import { exportarProblemas, type ProblemaExport } from "@/lib/db/exportar";

const COLUMNAS: ColumnaCsv<ProblemaExport>[] = [
  { clave: "id", encabezado: "id" },
  { clave: "visita_id", encabezado: "visita_id" },
  { clave: "folio_visita", encabezado: "folio_visita" },
  { clave: "sucursal", encabezado: "sucursal" },
  { clave: "descripcion", encabezado: "descripcion" },
  { clave: "solucion_sugerida", encabezado: "solucion_sugerida" },
  { clave: "estado", encabezado: "estado" },
  { clave: "detectado_en", encabezado: "detectado_en" },
];

export async function GET(request: NextRequest) {
  await requerirAdmin();

  const { searchParams } = request.nextUrl;
  const filas = await exportarProblemas({
    desde: searchParams.get("desde") ?? "",
    hasta: searchParams.get("hasta") ?? "",
  });

  return new Response(armarCsv(COLUMNAS, filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivoCsv("problemas")}"`,
    },
  });
}
