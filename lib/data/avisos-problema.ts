import "server-only";
import { consultaCon, num, paramIds, subIds, sql, F_TS, type Ejecutor } from "@/lib/data/sql";
import type { AvisoProblemas, ProblemaSinResolver } from "@/lib/contratos/visitas";
import type { ResolucionActa } from "@/lib/contratos/acta";
import { revisarAviso, revisarResoluciones } from "@/lib/validacion/aviso-problemas";
import { ESTADO_PROBLEMA_AGENDADO, ESTADO_PROBLEMA_CIERRE, ESTADO_PROBLEMA_INICIAL } from "@/lib/ui/estado";

// El aviso de problemas sin resolver (migración 030).
//
// Al agendar o reprogramar una visita en una sucursal con problemas sin
// resolver, el panel pregunta si la visita es para resolverlos. «Sí» vincula
// los elegidos a la visita (dmc.problema_visita_resolucion) y los pasa a
// AGENDADO; «otra cosa» no vincula nada. En los dos casos queda registro del
// aviso en dmc.visita_aviso_problema.
//
// Al cerrar el acta de esa visita el técnico dice si cada uno quedó
// solucionado: RESUELTO si sí, de vuelta a ABIERTO si no. Si la visita se
// cancela o se elimina antes, los que esperaban por ella vuelven a ABIERTO.

/** Lanza cuando la respuesta al aviso no sirve: la transacción se deshace y el mensaje llega tal cual. */
export class ErrorDeAviso extends Error {}

/** Una visita que todavía puede ir a la tienda. */
const VISITA_VIGENTE = `v2.activo = 1 AND v2.estado IN ('PROGRAMADA','EN_CURSO','REAGENDADA','PENDIENTE')`;

/**
 * Los problemas sin resolver de la sucursal. Con `excluirVisitaId`, sin los que
 * ya están vinculados a esa visita: al reprogramarla no se vuelve a preguntar
 * por lo que ya venía a resolver.
 */
const WHERE_SIN_RESOLVER = `
  v.sucursal_id = @sucursal AND v.activo = 1 AND p.estado <> '${ESTADO_PROBLEMA_CIERRE}'
  AND (@excluir IS NULL OR NOT EXISTS (SELECT 1 FROM dmc.problema_visita_resolucion rx
                                        WHERE rx.problema_id = p.id AND rx.visita_id = @excluir))`;

/** Para el aviso del panel. Con `excluirFolio`, el de la visita que se reprograma. */
export async function problemasSinResolver(
  sucursalId: number,
  excluirFolio: string | null = null
): Promise<ProblemaSinResolver[]> {
  const filas = await consultaCon<{
    id: number;
    tipo: string;
    descripcion: string | null;
    estado: string;
    estado_nombre: string;
    creado_en: string;
    folio: string;
    agendado_en: string | null;
  }>(
    `DECLARE @excluir bigint = (SELECT id FROM dmc.visita WHERE folio = @folio);

     SELECT p.id, ISNULL(cp.nombre, p.tipo_codigo) AS tipo, p.descripcion, p.estado,
            ISNULL(ce.nombre, p.estado) AS estado_nombre, ${F_TS("p.creado_en")} AS creado_en, v.folio,
            (SELECT TOP 1 v2.folio
               FROM dmc.problema_visita_resolucion r
               JOIN dmc.visita v2 ON v2.id = r.visita_id
              WHERE r.problema_id = p.id AND r.resultado IS NULL AND ${VISITA_VIGENTE}
              ORDER BY v2.fecha_programada DESC, v2.id DESC) AS agendado_en
       FROM dmc.problema p
       JOIN dmc.visita v ON v.id = p.visita_id
       LEFT JOIN dmc.catalogo_problema cp ON cp.codigo = p.tipo_codigo
       LEFT JOIN dmc.catalogo_problema_estado ce ON ce.codigo = p.estado
      WHERE ${WHERE_SIN_RESOLVER}
      ORDER BY p.creado_en, p.id`,
    [
      ["sucursal", sql.BigInt, sucursalId],
      ["folio", sql.VarChar(16), excluirFolio],
    ]
  );
  return filas.map((f) => ({
    id: num(f.id),
    tipo: f.tipo,
    descripcion: f.descripcion,
    estado: f.estado,
    estadoNombre: f.estado_nombre,
    creadoEn: f.creado_en,
    folio: f.folio,
    agendadoEn: f.agendado_en,
  }));
}

/** Las sucursales de la lista que tienen algún problema sin resolver. */
export async function sucursalesConProblemas(sucursalIds: number[]): Promise<number[]> {
  if (sucursalIds.length === 0) return [];
  const filas = await consultaCon<{ sucursal_id: number }>(
    `SELECT DISTINCT v.sucursal_id
       FROM dmc.problema p
       JOIN dmc.visita v ON v.id = p.visita_id
      WHERE v.activo = 1 AND p.estado <> '${ESTADO_PROBLEMA_CIERRE}' AND v.sucursal_id IN ${subIds("ids")}`,
    [paramIds("ids", sucursalIds)]
  );
  return filas.map((f) => num(f.sucursal_id));
}

/**
 * Aplica la respuesta al aviso dentro de la transacción que crea o reprograma
 * la visita. Vuelve a leer los problemas sin resolver: si la respuesta no
 * sirve contra lo que hay ahora, lanza ErrorDeAviso y no queda nada.
 */
export async function registrarAvisoEn(
  ej: Ejecutor,
  input: {
    visitaId: number;
    folio: string;
    sucursalId: number;
    ocasion: "AGENDAR" | "REAGENDAR";
    aviso: AvisoProblemas | null | undefined;
    usuarioId: number | null;
  }
): Promise<void> {
  const excluir = input.ocasion === "REAGENDAR" ? input.visitaId : null;
  const abiertos = (
    await ej.consulta<{ id: number }>(
      `SELECT p.id FROM dmc.problema p JOIN dmc.visita v ON v.id = p.visita_id WHERE ${WHERE_SIN_RESOLVER}`,
      [
        ["sucursal", sql.BigInt, input.sucursalId],
        ["excluir", sql.BigInt, excluir],
      ]
    )
  ).map((f) => num(f.id));

  const revision = revisarAviso(abiertos, input.aviso);
  if (!revision.ok) throw new ErrorDeAviso(revision.error);
  if (!revision.registrar || !input.aviso) return;

  const [aviso] = await ej.consulta<{ id: number }>(
    `INSERT INTO dmc.visita_aviso_problema (visita_id, ocasion, respuesta, usuario_id)
     VALUES (@visita, @ocasion, @respuesta, @usuario);

     SELECT CAST(SCOPE_IDENTITY() AS bigint) AS id;`,
    [
      ["visita", sql.BigInt, input.visitaId],
      ["ocasion", sql.VarChar(10), input.ocasion],
      ["respuesta", sql.VarChar(10), input.aviso.respuesta],
      ["usuario", sql.BigInt, input.usuarioId],
    ]
  );
  await ej.ejecutar(
    `INSERT INTO dmc.visita_aviso_problema_detalle (aviso_id, problema_id)
     SELECT @aviso, p.id FROM dmc.problema p WHERE p.id IN ${subIds("ids")}`,
    [["aviso", sql.BigInt, num(aviso.id)], paramIds("ids", abiertos)]
  );

  for (const problemaId of revision.vinculos) {
    await vincularEn(ej, problemaId, input.visitaId, input.folio, input.usuarioId);
  }
}

/**
 * Vincula el problema a la visita y lo pasa a AGENDADO. También lo usa la
 * visita que nace desde «Agendar visita para resolver» del panel de problemas.
 */
export async function vincularEn(
  ej: Ejecutor,
  problemaId: number,
  visitaId: number,
  folio: string,
  usuarioId: number | null
): Promise<void> {
  await ej.ejecutar(
    `IF NOT EXISTS (SELECT 1 FROM dmc.problema_visita_resolucion
                     WHERE problema_id = @problema AND visita_id = @visita)
       INSERT INTO dmc.problema_visita_resolucion (problema_id, visita_id, agendado_por)
       VALUES (@problema, @visita, @usuario)`,
    [
      ["problema", sql.BigInt, problemaId],
      ["visita", sql.BigInt, visitaId],
      ["usuario", sql.BigInt, usuarioId],
    ]
  );
  await cambiarEstadoEn(ej, problemaId, ESTADO_PROBLEMA_AGENDADO, `Visita ${folio} agendada para resolverlo.`, usuarioId, {
    salvo: [ESTADO_PROBLEMA_CIERRE, ESTADO_PROBLEMA_AGENDADO],
  });
}

/**
 * La visita se canceló o se eliminó: los problemas que esperaban por ella
 * vuelven a ABIERTO, salvo que otra visita vigente también los tenga agendados.
 */
export async function soltarAgendadosEn(
  ej: Ejecutor,
  visitaId: number,
  folio: string,
  usuarioId: number | null
): Promise<void> {
  const filas = await ej.consulta<{ id: number }>(
    `SELECT p.id
       FROM dmc.problema p
       JOIN dmc.problema_visita_resolucion r ON r.problema_id = p.id
      WHERE r.visita_id = @visita AND r.resultado IS NULL AND p.estado = '${ESTADO_PROBLEMA_AGENDADO}'
        AND NOT EXISTS (SELECT 1
                          FROM dmc.problema_visita_resolucion r2
                          JOIN dmc.visita v2 ON v2.id = r2.visita_id
                         WHERE r2.problema_id = p.id AND r2.visita_id <> @visita
                           AND r2.resultado IS NULL AND ${VISITA_VIGENTE})`,
    [["visita", sql.BigInt, visitaId]]
  );
  for (const f of filas) {
    await cambiarEstadoEn(ej, num(f.id), ESTADO_PROBLEMA_INICIAL, `La visita ${folio} que iba a resolverlo ya no va.`, usuarioId, {
      solo: ESTADO_PROBLEMA_AGENDADO,
    });
  }
}

/** Los problemas vinculados a la visita que siguen sin resolver y sin respuesta del acta. */
async function idsPorResolverEn(ej: Ejecutor, visitaId: number): Promise<number[]> {
  const filas = await ej.consulta<{ id: number }>(
    `SELECT p.id
       FROM dmc.problema_visita_resolucion r
       JOIN dmc.problema p ON p.id = r.problema_id
      WHERE r.visita_id = @visita AND r.resultado IS NULL AND p.estado <> '${ESTADO_PROBLEMA_CIERRE}'
      ORDER BY p.creado_en, p.id`,
    [["visita", sql.BigInt, visitaId]]
  );
  return filas.map((f) => num(f.id));
}

/** Para el formulario del acta: lo que la visita venía a resolver. */
export async function problemasPorResolver(visitaId: number): Promise<ProblemaSinResolver[]> {
  const filas = await consultaCon<{
    id: number;
    tipo: string;
    descripcion: string | null;
    estado: string;
    estado_nombre: string;
    creado_en: string;
    folio: string;
  }>(
    `SELECT p.id, ISNULL(cp.nombre, p.tipo_codigo) AS tipo, p.descripcion, p.estado,
            ISNULL(ce.nombre, p.estado) AS estado_nombre, ${F_TS("p.creado_en")} AS creado_en, v.folio
       FROM dmc.problema_visita_resolucion r
       JOIN dmc.problema p ON p.id = r.problema_id
       JOIN dmc.visita   v ON v.id = p.visita_id
       LEFT JOIN dmc.catalogo_problema cp ON cp.codigo = p.tipo_codigo
       LEFT JOIN dmc.catalogo_problema_estado ce ON ce.codigo = p.estado
      WHERE r.visita_id = @visita AND r.resultado IS NULL AND p.estado <> '${ESTADO_PROBLEMA_CIERRE}'
      ORDER BY p.creado_en, p.id`,
    [["visita", sql.BigInt, visitaId]]
  );
  return filas.map((f) => ({
    id: num(f.id),
    tipo: f.tipo,
    descripcion: f.descripcion,
    estado: f.estado,
    estadoNombre: f.estado_nombre,
    creadoEn: f.creado_en,
    folio: f.folio,
    agendadoEn: null,
  }));
}

/**
 * Lo que dijo el acta, para revisarlo antes de escribir nada del acta.
 * Devuelve por qué no sirve, o la función que lo aplica.
 */
export async function prepararResolucionesEn(
  ej: Ejecutor,
  visitaId: number,
  respuestas: ResolucionActa[] | undefined
): Promise<{ error: string } | { aplicar: (folio: string, usuarioId: number) => Promise<void> }> {
  const revision = revisarResoluciones(await idsPorResolverEn(ej, visitaId), respuestas);
  if (!revision.ok) return { error: revision.error };

  return {
    aplicar: async (folio, usuarioId) => {
      for (const id of revision.resueltos) {
        await cambiarEstadoEn(ej, id, ESTADO_PROBLEMA_CIERRE, `Quedó solucionado en la visita ${folio}.`, usuarioId);
        await responderEn(ej, id, visitaId, "RESUELTO");
      }
      for (const id of revision.noResueltos) {
        // Solo vuelve a ABIERTO si estaba esperando la visita: un estado que le
        // puso coordinación a mano (espera repuesto…) se respeta.
        await cambiarEstadoEn(ej, id, ESTADO_PROBLEMA_INICIAL, `No quedó solucionado en la visita ${folio}.`, usuarioId, {
          solo: ESTADO_PROBLEMA_AGENDADO,
        });
        await responderEn(ej, id, visitaId, "NO_RESUELTO");
      }
    },
  };
}

async function responderEn(ej: Ejecutor, problemaId: number, visitaId: number, resultado: "RESUELTO" | "NO_RESUELTO") {
  await ej.ejecutar(
    `UPDATE dmc.problema_visita_resolucion
        SET resultado = @resultado, respondido_en = SYSDATETIME()
      WHERE problema_id = @problema AND visita_id = @visita`,
    [
      ["resultado", sql.VarChar(12), resultado],
      ["problema", sql.BigInt, problemaId],
      ["visita", sql.BigInt, visitaId],
    ]
  );
}

/**
 * Cambia el estado de un problema y lo deja en su bitácora.
 *
 * Se lee primero y se escribe después, sin OUTPUT: dmc.problema tiene trigger
 * y un OUTPUT sin INTO revienta. resuelto_en va en el mismo UPDATE porque
 * ck_problema_resuelto se evalúa antes que el trigger (ver actualizarProblema).
 */
async function cambiarEstadoEn(
  ej: Ejecutor,
  problemaId: number,
  estado: string,
  motivo: string,
  usuarioId: number | null,
  condicion: { solo?: string; salvo?: string[] } = {}
): Promise<void> {
  const [actual] = await ej.consulta<{ estado: string }>(
    `SELECT estado FROM dmc.problema WITH (UPDLOCK, ROWLOCK) WHERE id = @id`,
    [["id", sql.BigInt, problemaId]]
  );
  if (!actual || actual.estado === estado) return;
  if (condicion.solo && actual.estado !== condicion.solo) return;
  if (condicion.salvo?.includes(actual.estado)) return;

  await ej.ejecutar(
    `UPDATE dmc.problema
        SET estado = @estado,
            resuelto_en = CASE WHEN @estado = '${ESTADO_PROBLEMA_CIERRE}'
                               THEN COALESCE(resuelto_en, SYSDATETIME()) ELSE NULL END
      WHERE id = @id;

     INSERT INTO dmc.problema_historial (problema_id, campo, valor_anterior, valor_nuevo, motivo, usuario_id)
     VALUES (@id, 'ESTADO', @antes, @estado, @motivo, @usuario);`,
    [
      ["id", sql.BigInt, problemaId],
      ["estado", sql.VarChar(10), estado],
      ["antes", sql.NVarChar(40), actual.estado],
      ["motivo", sql.NVarChar(sql.MAX), motivo],
      ["usuario", sql.BigInt, usuarioId],
    ]
  );
}
