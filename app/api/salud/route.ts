import { timingSafeEqual } from "node:crypto";
import { log } from "@/lib/log";
import { NextResponse, type NextRequest } from "next/server";
import { describirDestinoSql } from "@/lib/db/config";
import { getPool } from "@/lib/db/pool";
import { env, enProduccion, exigirConexionSql } from "@/lib/env";
import { SQL_VERSION_ESQUEMA, VERSION_ESQUEMA } from "@/lib/data/esquema";

// Diagnóstico del despliegue: dice si la app llega a SQL Server sin exigir un
// inicio de sesión (que es justo lo que falla cuando la base no responde).
//
// Requiere HEALTHCHECK_TOKEN. Sin esa variable la ruta no existe: nunca debe
// quedar abierta, porque revela host y nombre de la base de datos.
//
//   curl -H "Authorization: Bearer $HEALTHCHECK_TOKEN" https://<app>/api/salud

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest, esperado: string): boolean {
  const cabecera = req.headers.get("authorization") ?? "";
  const recibido = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const esperado = env("HEALTHCHECK_TOKEN");
  if (!esperado) {
    return new NextResponse(null, { status: 404 });
  }
  if (!autorizado(req, esperado)) {
    return new NextResponse(null, { status: 401 });
  }

  try {
    exigirConexionSql();
  } catch (err) {
    log.error("/api/salud: configuración SQL incompleta", { err });
    return NextResponse.json(
      { ok: false, entorno: enProduccion ? "produccion" : "desarrollo", error: "Configuración de SQL incompleta. Revisa el log del despliegue." },
      { status: 503 }
    );
  }

  const inicio = Date.now();
  try {
    const pool = await getPool();
    // Además de responder, se comprueba que estén las listas sin las cuales no
    // se puede programar una visita: una base sin catálogo arranca pero no sirve.
    // Y la versión del esquema: la app no tiene caminos para una base atrasada.
    const r = await pool
      .request()
      .query<{ motivos: number; problemas: number; trabajos: number; esquema: number | null }>(
        `SELECT (SELECT COUNT(*) FROM dmc.catalogo_motivo   WHERE activo = 1) AS motivos,
                (SELECT COUNT(*) FROM dmc.catalogo_problema WHERE activo = 1) AS problemas,
                (SELECT COUNT(*) FROM dmc.catalogo_trabajo  WHERE activo = 1) AS trabajos,
                ${SQL_VERSION_ESQUEMA} AS esquema`
      );
    const catalogo = r.recordset[0];
    const catalogoListo = Number(catalogo.motivos) > 0 && Number(catalogo.trabajos) > 0;
    const version = Number(catalogo.esquema ?? 0);
    const esquemaAlDia = version >= VERSION_ESQUEMA;

    return NextResponse.json({
      ok: true,
      entorno: enProduccion ? "produccion" : "desarrollo",
      destino: describirDestinoSql(),
      latenciaMs: Date.now() - inicio,
      sesionFirmada: Boolean(env("SESSION_SECRET")),
      esquema: {
        version,
        requerida: VERSION_ESQUEMA,
        alDia: esquemaAlDia,
        ...(esquemaAlDia
          ? {}
          : { aviso: `La base está en la versión ${version} y esta app necesita la ${VERSION_ESQUEMA}: aplica las migraciones que faltan.` }),
      },
      catalogo: {
        motivos: Number(catalogo.motivos),
        problemas: Number(catalogo.problemas),
        trabajos: Number(catalogo.trabajos),
        listo: catalogoListo,
        ...(catalogoListo
          ? {}
          : { aviso: "Catálogo vacío: cárgalo desde Checklist en el panel." }),
      },
    });
  } catch (err) {
    log.error("/api/salud: no se pudo consultar SQL Server", { err });
    return NextResponse.json(
      {
        ok: false,
        entorno: enProduccion ? "produccion" : "desarrollo",
        destino: describirDestinoSql(),
        latenciaMs: Date.now() - inicio,
        error: "No se pudo consultar SQL Server. Revisa el log del despliegue.",
      },
      { status: 503 }
    );
  }
}
