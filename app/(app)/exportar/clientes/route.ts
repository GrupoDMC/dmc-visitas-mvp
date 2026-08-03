import type { NextRequest } from "next/server";
import { requerirAdmin } from "@/lib/auth";
import { armarCsv, nombreArchivoCsv, type ColumnaCsv } from "@/lib/csv";
import {
  exportarClientesSucursales,
  type ClienteSucursalExport,
} from "@/lib/db/exportar";

const COLUMNAS: ColumnaCsv<ClienteSucursalExport>[] = [
  { clave: "cliente_id", encabezado: "cliente_id" },
  { clave: "cliente_rut", encabezado: "cliente_rut" },
  { clave: "razon_social", encabezado: "razon_social" },
  { clave: "nombre_fantasia", encabezado: "nombre_fantasia" },
  { clave: "cliente_telefono", encabezado: "cliente_telefono" },
  { clave: "cliente_email", encabezado: "cliente_email" },
  { clave: "cliente_activo", encabezado: "cliente_activo" },
  { clave: "cliente_creado_en", encabezado: "cliente_creado_en" },
  { clave: "sucursal_id", encabezado: "sucursal_id" },
  { clave: "sucursal_nombre", encabezado: "sucursal_nombre" },
  { clave: "sucursal_codigo_interno", encabezado: "sucursal_codigo_interno" },
  { clave: "sucursal_direccion", encabezado: "sucursal_direccion" },
  { clave: "sucursal_comuna", encabezado: "sucursal_comuna" },
  { clave: "sucursal_region", encabezado: "sucursal_region" },
  { clave: "sucursal_telefono", encabezado: "sucursal_telefono" },
  { clave: "sucursal_activo", encabezado: "sucursal_activo" },
  { clave: "sucursal_creado_en", encabezado: "sucursal_creado_en" },
];

export async function GET(request: NextRequest) {
  await requerirAdmin();

  const { searchParams } = request.nextUrl;
  const filas = await exportarClientesSucursales({
    desde: searchParams.get("desde") ?? "",
    hasta: searchParams.get("hasta") ?? "",
  });

  return new Response(armarCsv(COLUMNAS, filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivoCsv("clientes_sucursales")}"`,
    },
  });
}
