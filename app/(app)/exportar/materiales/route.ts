import type { NextRequest } from "next/server";
import { requerirAdmin } from "@/lib/auth";
import { armarCsv, nombreArchivoCsv, type ColumnaCsv } from "@/lib/csv";
import { exportarMateriales, type MaterialExport } from "@/lib/db/exportar";

const COLUMNAS: ColumnaCsv<MaterialExport>[] = [
  { clave: "id", encabezado: "id" },
  { clave: "visita_id", encabezado: "visita_id" },
  { clave: "folio_visita", encabezado: "folio_visita" },
  { clave: "descripcion", encabezado: "descripcion" },
  { clave: "codigo_producto", encabezado: "codigo_producto" },
  { clave: "cantidad", encabezado: "cantidad" },
  { clave: "direccion", encabezado: "direccion" },
  { clave: "observacion", encabezado: "observacion" },
];

export async function GET(request: NextRequest) {
  await requerirAdmin();

  const { searchParams } = request.nextUrl;
  const filas = await exportarMateriales({
    desde: searchParams.get("desde") ?? "",
    hasta: searchParams.get("hasta") ?? "",
  });

  return new Response(armarCsv(COLUMNAS, filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivoCsv("materiales")}"`,
    },
  });
}
