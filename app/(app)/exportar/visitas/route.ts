import type { NextRequest } from "next/server";
import { requerirAdmin } from "@/lib/auth";
import { armarCsv, nombreArchivoCsv, type ColumnaCsv } from "@/lib/csv";
import { exportarVisitas, type VisitaExport } from "@/lib/db/exportar";

/**
 * Route Handler, no página: no pasa por el layout de `(app)`, así que repite
 * el chequeo de admin acá mismo, igual que cada Server Action re-chequea el
 * suyo — es un endpoint propio, no algo que herede el guardia de una pantalla.
 */
const COLUMNAS: ColumnaCsv<VisitaExport>[] = [
  { clave: "id", encabezado: "id" },
  { clave: "folio", encabezado: "folio" },
  { clave: "cliente_rut", encabezado: "cliente_rut" },
  { clave: "razon_social", encabezado: "razon_social" },
  { clave: "sucursal", encabezado: "sucursal" },
  { clave: "direccion", encabezado: "direccion" },
  { clave: "comuna", encabezado: "comuna" },
  { clave: "tecnico_rut", encabezado: "tecnico_rut" },
  { clave: "tecnico", encabezado: "tecnico" },
  { clave: "estado", encabezado: "estado" },
  { clave: "tipo_trabajo", encabezado: "tipo_trabajo" },
  { clave: "fecha_programada", encabezado: "fecha_programada" },
  { clave: "hora_programada", encabezado: "hora_programada" },
  { clave: "fecha_inicio", encabezado: "fecha_inicio" },
  { clave: "fecha_termino", encabezado: "fecha_termino" },
  { clave: "contacto_nombre", encabezado: "contacto_nombre" },
  { clave: "contacto_email", encabezado: "contacto_email" },
  { clave: "contacto_telefono", encabezado: "contacto_telefono" },
  { clave: "responsable_tienda_nombre", encabezado: "responsable_tienda_nombre" },
  { clave: "responsable_tienda_rut", encabezado: "responsable_tienda_rut" },
  { clave: "descripcion_trabajo", encabezado: "descripcion_trabajo" },
  { clave: "trabajo_realizado", encabezado: "trabajo_realizado" },
  { clave: "observaciones", encabezado: "observaciones" },
  { clave: "motivo_pendiente", encabezado: "motivo_pendiente" },
  { clave: "requiere_seguimiento", encabezado: "requiere_seguimiento" },
  { clave: "creado_en", encabezado: "creado_en" },
];

export async function GET(request: NextRequest) {
  await requerirAdmin();

  const { searchParams } = request.nextUrl;
  const filas = await exportarVisitas({
    desde: searchParams.get("desde") ?? "",
    hasta: searchParams.get("hasta") ?? "",
  });

  return new Response(armarCsv(COLUMNAS, filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivoCsv("visitas")}"`,
    },
  });
}
