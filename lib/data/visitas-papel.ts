import "server-only";
import { consultaCon, enTransaccion, num, sql } from "@/lib/data/sql";
import { sincronizarMotivosCon } from "@/lib/data/visitas";
import { DISPOSITIVO_PAPEL } from "@/lib/ui/papel";

// "Visitas en papel": cargar los informes que se hicieron a mano en años
// anteriores. Cada uno entra ya cerrado —COMPLETADA, con su acta y el nombre
// de quien firmó— porque el trabajo se hizo hace rato. No llevan fotos, video
// ni firma dibujada: la firma quedó en el papel.

/** Un informe en papel, tal como se transcribe. */
export interface InformePapel {
  clienteId: number;
  sucursalId: number;
  tecnicoId: number;
  tecnicoAyudanteId: number | null;
  /** El primero es el principal. */
  motivosCodigos: string[];
  /** El día del informe (YYYY-MM-DD). */
  fecha: string;
  firmanteNombre: string;
  firmanteRut: string | null;
  /** Lo que dice el informe: queda como las observaciones del acta. */
  descripcion: string;
  /** Guardarlo aunque ya haya una visita de esa sucursal ese mismo día. */
  aunqueRepetida?: boolean;
}

export type ResultadoInformePapel =
  | { ok: true; folio: string }
  | { ok: false; error: string; repetidaFolio?: string };

/**
 * Crea la visita ya completada con su acta, todo en una transacción: si algo
 * falla no queda una visita cerrada sin acta.
 *
 * El folio lleva el año del informe y no el de hoy (V-2023-00412): así se lee
 * de qué año es sin abrirlo. El número sale de la misma secuencia de siempre,
 * de modo que no choca con ningún otro.
 */
export async function crearInformePapel(inf: InformePapel, usuarioId: number): Promise<ResultadoInformePapel> {
  const motivos = [...new Set(inf.motivosCodigos.filter(Boolean))];
  const anio = Number(inf.fecha.slice(0, 4));

  if (!inf.aunqueRepetida) {
    const [repetida] = await consultaCon<{ folio: string }>(
      `SELECT TOP 1 folio FROM dmc.visita
        WHERE sucursal_id = @sucursal AND fecha_programada = @fecha AND activo = 1
        ORDER BY id`,
      [
        ["sucursal", sql.BigInt, inf.sucursalId],
        ["fecha", sql.Date, inf.fecha],
      ]
    );
    if (repetida) {
      return {
        ok: false,
        error: `Ya hay una visita de esta sucursal ese día (${repetida.folio}).`,
        repetidaFolio: repetida.folio,
      };
    }
  }

  return enTransaccion(async (ej) => {
    // dmc.visita tiene trigger: el id se lee con SCOPE_IDENTITY y no con OUTPUT.
    // El trigger también deja la fila de historial COMPLETADA; acá se completa
    // con quién la cargó y desde dónde.
    const [fila] = await ej.consulta<{ id: number; folio: string }>(
      `INSERT INTO dmc.visita
         (folio, cliente_id, sucursal_id, tecnico_id, tecnico_ayudante_id, motivo_codigo, estado,
          fecha_programada, trabajo_solicitado, responsable_nombre, responsable_rut, creada_por)
       VALUES (CONCAT('V-', @anio, '-', FORMAT(NEXT VALUE FOR dmc.seq_folio_visita, '00000')),
               @cliente, @sucursal, @tecnico, @ayudante, @motivo, 'COMPLETADA',
               @fecha, @trabajo, @nombre, @rut, @usuario);

       DECLARE @id bigint = SCOPE_IDENTITY();

       UPDATE dmc.visita_estado_historial
          SET motivo = @nota, origen = 'WEB', usuario_id = @usuario
        WHERE visita_id = @id;

       SELECT id, folio FROM dmc.visita WHERE id = @id;`,
      [
        ["anio", sql.VarChar(4), String(anio)],
        ["cliente", sql.BigInt, inf.clienteId],
        ["sucursal", sql.BigInt, inf.sucursalId],
        ["tecnico", sql.BigInt, inf.tecnicoId],
        ["ayudante", sql.BigInt, inf.tecnicoAyudanteId || null],
        ["motivo", sql.VarChar(40), motivos[0]],
        ["fecha", sql.Date, inf.fecha],
        ["trabajo", sql.NVarChar(sql.MAX), inf.descripcion],
        ["nombre", sql.NVarChar(120), inf.firmanteNombre],
        ["rut", sql.VarChar(12), inf.firmanteRut || null],
        ["usuario", sql.BigInt, usuarioId],
        ["nota", sql.NVarChar(sql.MAX), "Informe en papel cargado desde el panel."],
      ]
    );
    const id = num(fila.id);

    // El informe no trae horas: llegada y salida quedan a las 00:00 del día, y
    // el acta las muestra como «en papel» en vez de inventar un horario.
    await ej.ejecutar(
      `INSERT INTO dmc.visita_ejecucion
         (visita_id, hora_inicio, hora_termino, responsable_nombre, responsable_rut,
          motivo_real_codigo, observaciones, dispositivo, sincronizado_en)
       VALUES (@id, CAST(@fecha AS datetime2(0)), CAST(@fecha AS datetime2(0)), @nombre, @rut,
               @motivo, @obs, @dispositivo, SYSDATETIME());

       -- La firma quedó en el papel: se guarda quién firmó, sin imagen.
       INSERT INTO dmc.visita_firma (visita_id, rol, nombre, rut, imagen_url, contenido, firmado_en)
       VALUES (@id, 'TIENDA', @nombre, @rut, '', NULL, CAST(@fecha AS datetime2(0)));`,
      [
        ["id", sql.BigInt, id],
        ["fecha", sql.Date, inf.fecha],
        ["nombre", sql.NVarChar(120), inf.firmanteNombre],
        ["rut", sql.VarChar(12), inf.firmanteRut || null],
        ["motivo", sql.VarChar(40), motivos[0]],
        ["obs", sql.NVarChar(sql.MAX), inf.descripcion],
        ["dispositivo", sql.NVarChar(60), DISPOSITIVO_PAPEL],
      ]
    );

    // Lo planificado y lo hecho son lo mismo: es lo que dice el informe.
    await sincronizarMotivosCon(ej, id, "PLAN", motivos);
    await sincronizarMotivosCon(ej, id, "REAL", motivos);

    return { ok: true, folio: fila.folio };
  });
}
