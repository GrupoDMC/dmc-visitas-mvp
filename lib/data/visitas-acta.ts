import "server-only";
import {
  consultaCon,
  ejecutar,
  enTransaccion,
  num,
  numONull,
  paramIds,
  sql,
  subIds,
  F_HORA,
  type Ejecutor,
} from "@/lib/data/sql";
import { decodificarImagen } from "@/lib/imagen";
import { cargoDelChecklist } from "@/lib/data/catalogos";
import { motivoParaNoCerrar } from "@/lib/validacion/reglas-acta";
import { soltarReservaEn, tomarReservaEn, traspasarTomadaEn } from "@/lib/data/reservas";
import { prepararResolucionesEn } from "@/lib/data/avisos-problema";
import { CERRADA_POR_OTRO, textoActaEnCurso } from "@/lib/reserva";
import type { EstadoVisita } from "@/lib/types";
import type { ActaEntrada, ProblemaActa, ResultadoActa, SubtrabajoActa, TrabajoActa } from "@/lib/contratos/acta";
import { CERRADA_POR, TOMADA_POR } from "@/lib/data/visitas-lectura";

// Visitas: el acta. El envío al cliente, el cierre desde el celular y las
// escrituras de sus partes, que también usan la edición del acta y las
// visitas en papel.

// ── Envío del acta ──────────────────────────────────────────────────────────

export interface ActaEnviada {
  para: string;
  cc: string;
  adjuntos: number;
}

/**
 * Registra el envío del acta en dmc.acta_envio. Todavía no hay SMTP: la fila
 * queda ENCOLADO, que es justo el estado que el esquema define para eso.
 */
export async function registrarEnvioActa(input: {
  folio: string;
  para: string;
  cc: string;
  asunto: string;
  cuerpo: string;
  adjuntos: number;
  usuarioId: number | null;
}): Promise<boolean> {
  const [visita] = await consultaCon<{ id: number }>(`SELECT id FROM dmc.visita WHERE folio = @folio AND activo = 1`, [
    ["folio", sql.VarChar(16), input.folio],
  ]);
  if (!visita) return false;

  await ejecutar(
    `INSERT INTO dmc.acta_envio (visita_id, para, cc, asunto, cuerpo, enviado_por)
     VALUES (@visita, @para, @cc, @asunto, @cuerpo, @usuario)`,
    [
      ["visita", sql.BigInt, num(visita.id)],
      ["para", sql.NVarChar(600), input.para],
      ["cc", sql.NVarChar(600), input.cc || null],
      ["asunto", sql.NVarChar(240), input.asunto],
      ["cuerpo", sql.NVarChar(sql.MAX), input.cuerpo],
      ["usuario", sql.BigInt, input.usuarioId],
    ]
  );
  return true;
}

export async function getActaEnviada(folio: string): Promise<ActaEnviada | null> {
  const [fila] = await consultaCon<{ para: string; cc: string | null; adjuntos: number }>(
    `SELECT TOP 1 e.para, e.cc,
            (SELECT COUNT(*) FROM dmc.acta_envio_adjunto a WHERE a.envio_id = e.id) AS adjuntos
       FROM dmc.acta_envio e
       JOIN dmc.visita v ON v.id = e.visita_id
      WHERE v.folio = @folio
      ORDER BY e.creado_en DESC, e.id DESC`,
    [["folio", sql.VarChar(16), folio]]
  );
  return fila ? { para: fila.para, cc: fila.cc ?? "", adjuntos: num(fila.adjuntos) } : null;
}

// ── Cierre del acta desde el celular ────────────────────────────────────────

/** ISO del celular → Date, o null si no es una fecha que se pueda creer. */
function fechaValida(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Guarda el acta completa y cierra la visita.
 *
 * Todo va dentro de una transacción: responsable, motivos, trabajos con sus
 * subtrabajos, problemas con sus items, fotos, firma y el paso a COMPLETADA.
 * Si algo falla no queda nada a medias y el técnico puede volver a apretar
 * Guardar sin duplicar nada.
 */
export async function guardarActa(
  entrada: ActaEntrada,
  ctx: { usuarioId: number; tecnicoId: number }
): Promise<ResultadoActa> {
  // Lo que falta en el acta (errorDeActa) y quién la puede cerrar ya lo vio la
  // acción. Acá queda lo que solo se sabe al escribir.
  const principal = entrada.motivosCodigos.filter(Boolean)[0] ?? null;
  if (!principal || !entrada.firma) return { ok: false, error: "El acta llegó incompleta." };

  // Solo vale un cargo del checklist; uno suelto se descarta en vez de frenar el cierre.
  const cargo = await cargoDelChecklist(entrada.responsableCargo);

  const firmaImagen = decodificarImagen(entrada.firma.dataUrl);
  if (!firmaImagen) return { ok: false, error: "La firma no se pudo leer. Vuelve a firmar." };

  const fotos: FotoLista[] = [];
  for (const f of entrada.fotos) {
    const img = decodificarImagen(f.dataUrl);
    if (!img) return { ok: false, error: "Una de las fotos llegó dañada. Quítala y vuelve a tomarla." };
    fotos.push({ ...img, etiqueta: f.etiqueta, interno: Boolean(f.interno) });
  }

  return enTransaccion(async (ej) => {
    const [visita] = await ej.consulta<{
      id: number;
      estado: EstadoVisita;
      tecnico_id: number;
      tecnico_ayudante_id: number | null;
      tomada_por: number | null;
    }>(
      `SELECT v.id, v.estado, v.tecnico_id, v.tecnico_ayudante_id, ${TOMADA_POR} AS tomada_por
         FROM dmc.visita v WITH (UPDLOCK, ROWLOCK) WHERE v.folio = @folio AND v.activo = 1`,
      [["folio", sql.VarChar(16), entrada.folio]]
    );
    if (!visita) return { ok: false, error: "No encontramos esa visita." };
    const id = num(visita.id);
    // La acción ya autorizó; con la fila tomada se vuelve a aplicar la misma
    // regla, porque entre medio la visita pudo cambiar de manos o de estado.
    // Quien puede escribir lo decide la reserva: si otro técnico la tiene
    // vigente no se guarda nada; si venció o es de este técnico, el acta se
    // cierra y la reserva se suelta más abajo.
    const equipo = {
      estado: visita.estado,
      tecnicoId: num(visita.tecnico_id),
      tecnicoAyudanteId: numONull(visita.tecnico_ayudante_id),
      tomadaPorTecnicoId: numONull(visita.tomada_por),
    };
    const noEsSuya = motivoParaNoCerrar(equipo, ctx.tecnicoId, { conReserva: true });
    if (noEsSuya) {
      // Un acta cerrada por el otro técnico no es la de este celular: se avisa
      // aparte para que lo escrito aquí no se dé por enviado ni se pierda.
      if (equipo.estado === "COMPLETADA") {
        const [cierre] = await ej.consulta<{ cerrada_por: number | null }>(
          `SELECT ${CERRADA_POR} AS cerrada_por FROM dmc.visita v WHERE v.id = @id`,
          [["id", sql.BigInt, id]]
        );
        const quien = numONull(cierre?.cerrada_por);
        if (quien !== null && quien !== ctx.tecnicoId) {
          return { ok: false, error: CERRADA_POR_OTRO, cerradaPorOtro: true };
        }
      }
      return { ok: false, error: noEsSuya };
    }
    // Los problemas que la visita venía a resolver: cada uno necesita su
    // «¿quedó solucionado?». Se revisa antes de escribir nada del acta.
    const resoluciones = await prepararResolucionesEn(ej, id, entrada.resoluciones);
    if ("error" in resoluciones) return { ok: false, error: resoluciones.error };
    const reserva = await tomarReservaEn(ej, id, ctx);
    if (!reserva.ok) {
      if (reserva.motivo === "ajena") {
        return {
          ok: false,
          error: textoActaEnCurso(reserva),
          reservaAjena: { nombre: reserva.nombre, desde: reserva.desde, liberaEnSeg: reserva.liberaEnSeg },
        };
      }
      return { ok: false, error: reserva.error };
    }
    if (equipo.estado === "EN_CURSO" && equipo.tomadaPorTecnicoId !== ctx.tecnicoId) {
      await traspasarTomadaEn(ej, id, ctx);
    }

    // 1 · Ejecución: hora de llegada si no estaba, y la de término ahora.
    await ej.ejecutar(
      `IF NOT EXISTS (SELECT 1 FROM dmc.visita_ejecucion WHERE visita_id = @id)
         INSERT INTO dmc.visita_ejecucion (visita_id, hora_inicio, responsable_nombre)
         VALUES (@id, SYSDATETIME(), @nombre);

       -- La hora del celular llega en UTC (el driver manda los Date en UTC) y
       -- el resto de la tabla está en la hora local del servidor, que es la que
       -- pone SYSDATETIME(). Sin esta conversión el instante de cierre nunca
       -- calzaría y siempre se caería al valor por defecto.
       DECLARE @cierre datetime2(0) = CASE
         WHEN @capturada IS NULL THEN NULL
         ELSE DATEADD(second, DATEDIFF(second, SYSUTCDATETIME(), SYSDATETIME()), @capturada)
       END;

       UPDATE dmc.visita_ejecucion SET responsable_cargo = @cargo WHERE visita_id = @id;

       UPDATE dmc.visita_ejecucion
          SET responsable_nombre   = @nombre,
              responsable_rut      = @rut,
              responsable_telefono = @telefono,
              motivo_real_codigo   = @motivo,
              observaciones        = @obs,
              comentario_interno   = @interno,
              dispositivo          = @dispositivo,
              -- Un acta que esperó señal se cerró en terreno hace rato: vale la
              -- hora del celular, siempre que no sea anterior a la llegada ni
              -- esté en el futuro (ck_ejecucion_horas y relojes desajustados).
              hora_termino         = CASE
                                       WHEN @cierre IS NOT NULL
                                        AND @cierre >= hora_inicio
                                        AND @cierre <= SYSDATETIME()
                                       THEN @cierre
                                       ELSE SYSDATETIME()
                                     END,
              registrado_offline   = @offline,
              sincronizado_en      = SYSDATETIME()
        WHERE visita_id = @id;`,
      [
        ["id", sql.BigInt, id],
        ["nombre", sql.NVarChar(120), entrada.responsableNombre.trim()],
        ["rut", sql.VarChar(12), entrada.responsableRut || null],
        ["telefono", sql.VarChar(30), entrada.responsableTelefono || null],
        ["cargo", sql.NVarChar(80), cargo],
        ["motivo", sql.VarChar(40), principal],
        ["obs", sql.NVarChar(sql.MAX), entrada.observaciones || null],
        ["interno", sql.NVarChar(sql.MAX), entrada.comentarioInterno || null],
        ["dispositivo", sql.NVarChar(60), entrada.dispositivo || null],
        ["capturada", sql.DateTime2(0), fechaValida(entrada.capturadaEn)],
        ["offline", sql.Bit, Boolean(entrada.registradoOffline)],
      ]
    );

    // 2 · Motivos confirmados en terreno.
    await sincronizarMotivosCon(ej, id, "REAL", entrada.motivosCodigos);

    // 3 · Trabajos realizados. Los que hubiera de un intento anterior se dejan
    //     inactivos, no se borran: acá tampoco se elimina nada.
    await escribirTrabajos(ej, id, entrada.trabajos, entrada.motivosCodigos);

    // 4 · Problemas levantados. Se limpian los que nacieron acá y todavía no
    //     los agarró nadie más (una visita de resolución, una foto o el panel).
    await ej.ejecutar(
      `DELETE FROM dmc.problema
        WHERE visita_id = @id
          AND NOT EXISTS (SELECT 1 FROM dmc.problema_visita_resolucion r WHERE r.problema_id = dmc.problema.id)
          AND NOT EXISTS (SELECT 1 FROM dmc.visita v2 WHERE v2.problema_origen_id = dmc.problema.id)
          AND NOT EXISTS (SELECT 1 FROM dmc.visita_foto f WHERE f.problema_id = dmc.problema.id)`,
      [["id", sql.BigInt, id]]
    );
    for (const [i, pr] of entrada.problemas.entries()) {
      await insertarProblema(ej, id, pr, i + 1);
    }

    // 4b · Los que venía a resolver: RESUELTO si quedó solucionado, ABIERTO si no.
    await resoluciones.aplicar(entrada.folio, ctx.usuarioId);

    // 5 · Fotos. Las anteriores no se borran: se dejan inactivas.
    await ej.ejecutar(`UPDATE dmc.visita_foto SET activo = 0 WHERE visita_id = @id AND activo = 1`, [
      ["id", sql.BigInt, id],
    ]);
    for (const [i, f] of fotos.entries()) {
      await insertarFoto(ej, id, f, i + 1);
    }

    // 5b · Videos. Ya estaban subidos mientras el técnico llenaba el acta: acá
    //      solo se decide cuáles quedan y en qué orden. Los que sacó del
    //      formulario se dejan inactivos, igual que las fotos.
    const videosIds = [...new Set((entrada.videosIds ?? []).filter((n) => Number.isInteger(n) && n > 0))];
    await ej.ejecutar(
      `UPDATE dmc.visita_video
          SET activo = 0
        WHERE visita_id = @id AND activo = 1 AND id NOT IN ${subIds("vivos")}`,
      [["id", sql.BigInt, id], paramIds("vivos", videosIds)]
    );
    const internosVideo = new Set(entrada.videosInternosIds ?? []);
    for (const [i, videoId] of videosIds.entries()) {
      await ej.ejecutar(
        `UPDATE dmc.visita_video SET orden = @orden, interno = @interno
          WHERE id = @video AND visita_id = @id AND subida_completa = 1`,
        [
          ["video", sql.BigInt, videoId],
          ["id", sql.BigInt, id],
          ["orden", sql.SmallInt, i + 1],
          ["interno", sql.Bit, internosVideo.has(videoId)],
        ]
      );
    }

    // 5c · Checklist del comentario interno. Se reescribe entero.
    await escribirInternos(ej, id, entrada.internosCodigos ?? []);

    // 6 · Firma de la tienda. Es única por (visita, rol): se pisa la anterior.
    await ej.ejecutar(
      `DECLARE @firma TABLE (id bigint);

       UPDATE dmc.visita_firma
          SET nombre = @nombre, rut = @rut, contenido = @contenido,
              firmado_en = SYSDATETIME(), actualizado_en = SYSDATETIME()
       OUTPUT INSERTED.id INTO @firma
        WHERE visita_id = @visita AND rol = 'TIENDA';

       IF NOT EXISTS (SELECT 1 FROM @firma)
         INSERT INTO dmc.visita_firma (visita_id, rol, nombre, rut, imagen_url, contenido)
         OUTPUT INSERTED.id INTO @firma
         VALUES (@visita, 'TIENDA', @nombre, @rut, '', @contenido);

       UPDATE dmc.visita_firma
          SET imagen_url = CONCAT('/api/visita/firma/', CAST(id AS varchar(20)))
        WHERE id IN (SELECT id FROM @firma);`,
      [
        ["visita", sql.BigInt, id],
        ["nombre", sql.NVarChar(120), entrada.firma!.nombre.trim()],
        ["rut", sql.VarChar(12), entrada.firma!.rut || null],
        ["contenido", sql.VarBinary(sql.MAX), firmaImagen.bytes],
      ]
    );

    // 7 · La visita queda cerrada. Desde acá el panel la ve COMPLETADA y al
    //     técnico deja de aparecerle en curso, sin esperar ninguna sincronización.
    await ej.ejecutar(
      `DECLARE @antes bigint =
         (SELECT ISNULL(MAX(id), 0) FROM dmc.visita_estado_historial WHERE visita_id = @id);

       UPDATE dmc.visita SET estado = 'COMPLETADA' WHERE id = @id;

       IF EXISTS (SELECT 1 FROM dmc.visita_estado_historial WHERE visita_id = @id AND id > @antes)
         UPDATE dmc.visita_estado_historial
            SET motivo = @motivo, origen = 'MOVIL', usuario_id = @usuario, tecnico_id = @tecnico
          WHERE visita_id = @id AND id > @antes;
       ELSE
         INSERT INTO dmc.visita_estado_historial (visita_id, estado, motivo, origen, usuario_id, tecnico_id)
         VALUES (@id, 'COMPLETADA', @motivo, 'MOVIL', @usuario, @tecnico);`,
      [
        ["id", sql.BigInt, id],
        ["motivo", sql.NVarChar(sql.MAX), "Acta cerrada y firmada en terreno."],
        ["usuario", sql.BigInt, ctx.usuarioId],
        ["tecnico", sql.BigInt, ctx.tecnicoId],
      ]
    );

    // 8 · El acta quedó cerrada: la reserva ya no tiene nada que proteger.
    await soltarReservaEn(ej, id);

    const [cierre] = await ej.consulta<{ hora: string }>(
      `SELECT ${F_HORA("hora_termino")} AS hora FROM dmc.visita_ejecucion WHERE visita_id = @id`,
      [["id", sql.BigInt, id]]
    );

    return { ok: true, horaTermino: cierre?.hora ?? "" };
  });
}

// Las piezas del guardado que también usa la edición del acta ya cerrada
// (lib/data/ediciones): se escriben igual la primera vez que al corregir.

/** Una foto ya decodificada, lista para guardar. */
export interface FotoLista {
  mime: string;
  bytes: Buffer;
  etiqueta: string | null;
  interno: boolean;
}

/**
 * Reescribe los trabajos realizados. Los que había se dejan inactivos, no se
 * borran: acá tampoco se elimina nada.
 */
export async function escribirTrabajos(
  ej: Ejecutor,
  visitaId: number,
  trabajos: TrabajoActa[],
  motivosCodigos: string[]
): Promise<void> {
  await ej.ejecutar(`UPDATE dmc.visita_trabajo SET activo = 0 WHERE visita_id = @id AND activo = 1`, [
    ["id", sql.BigInt, visitaId],
  ]);
  for (const [i, t] of trabajos.entries()) {
    // El motivo solo se guarda si es uno de los que quedaron en el acta: un
    // borrador viejo podría traer uno que el técnico desmarcó después.
    const motivoDelTrabajo = t.motivoCodigo && motivosCodigos.includes(t.motivoCodigo) ? t.motivoCodigo : null;
    const [fila] = await ej.consulta<{ id: number }>(
      `INSERT INTO dmc.visita_trabajo (visita_id, trabajo_codigo, motivo_codigo, detalle, orden)
       OUTPUT INSERTED.id AS id VALUES (@visita, @codigo, @motivo, @detalle, @orden)`,
      [
        ["visita", sql.BigInt, visitaId],
        ["codigo", sql.VarChar(40), t.codigo],
        ["motivo", sql.VarChar(40), motivoDelTrabajo],
        ["detalle", sql.NVarChar(sql.MAX), t.detalle || null],
        ["orden", sql.SmallInt, i + 1],
      ]
    );
    const trabajoId = num(fila.id);
    const vistas = new Set<string>();
    for (const [j, s] of t.subtrabajos.entries()) {
      const etiqueta = s.etiqueta.trim();
      if (!etiqueta || vistas.has(etiqueta)) continue;
      vistas.add(etiqueta);
      await ej.ejecutar(
        `INSERT INTO dmc.visita_trabajo_subtrabajo (visita_trabajo_id, etiqueta, cantidad, orden)
         VALUES (@trabajo, @etiqueta, @cantidad, @orden)`,
        [
          ["trabajo", sql.BigInt, trabajoId],
          ["etiqueta", sql.NVarChar(80), etiqueta],
          ["cantidad", sql.SmallInt, Math.min(99, Math.max(1, s.cantidad || 1))],
          ["orden", sql.SmallInt, j + 1],
        ]
      );
    }
  }
}

/** Inserta un problema con sus items y devuelve su id. */
export async function insertarProblema(
  ej: Ejecutor,
  visitaId: number,
  pr: ProblemaActa,
  orden: number
): Promise<number> {
  // dmc.problema tiene el trigger tg_problema_cambio (AFTER INSERT), y SQL
  // Server rechaza OUTPUT sin INTO sobre una tabla con triggers para esa
  // acción: el id se recoge en una tabla de paso.
  const [fila] = await ej.consulta<{ id: number }>(
    `DECLARE @nuevo TABLE (id bigint);
     INSERT INTO dmc.problema (visita_id, tipo_codigo, estado, descripcion, solucion, orden, resuelto_en)
     OUTPUT INSERTED.id INTO @nuevo
     VALUES (@visita, @tipo, @estado, @desc, @sol, @orden,
             CASE WHEN @estado = 'RESUELTO' THEN SYSDATETIME() ELSE NULL END);
     SELECT id FROM @nuevo;`,
    [
      ["visita", sql.BigInt, visitaId],
      ["tipo", sql.VarChar(40), pr.tipoCodigo],
      ["estado", sql.VarChar(10), pr.estado],
      ["desc", sql.NVarChar(sql.MAX), pr.descripcion?.trim() || null],
      ["sol", sql.NVarChar(sql.MAX), pr.solucion?.trim() || null],
      ["orden", sql.SmallInt, orden],
    ]
  );
  const problemaId = num(fila.id);
  await insertarItemsDeProblema(ej, problemaId, pr.items);
  return problemaId;
}

/** Los items de un problema, sin etiquetas vacías ni repetidas. */
export async function insertarItemsDeProblema(
  ej: Ejecutor,
  problemaId: number,
  items: SubtrabajoActa[]
): Promise<void> {
  const vistas = new Set<string>();
  for (const it of items) {
    const etiqueta = it.etiqueta.trim();
    if (!etiqueta || vistas.has(etiqueta)) continue;
    vistas.add(etiqueta);
    await ej.ejecutar(
      `INSERT INTO dmc.problema_item (problema_id, etiqueta, cantidad) VALUES (@p, @etiqueta, @cantidad)`,
      [
        ["p", sql.BigInt, problemaId],
        ["etiqueta", sql.NVarChar(80), etiqueta],
        ["cantidad", sql.SmallInt, Math.min(99, Math.max(1, it.cantidad || 1))],
      ]
    );
  }
}

/** Guarda una foto con sus bytes y le deja la ruta con la que se sirve. */
export async function insertarFoto(ej: Ejecutor, visitaId: number, f: FotoLista, orden: number): Promise<void> {
  await ej.ejecutar(
    `DECLARE @nueva TABLE (id bigint);
     INSERT INTO dmc.visita_foto (visita_id, etiqueta, archivo_url, contenido, mime, bytes, orden, interno, tomada_en)
     OUTPUT INSERTED.id INTO @nueva
     VALUES (@visita, @etiqueta, '', @contenido, @mime, @bytes, @orden, @interno, SYSDATETIME());

     UPDATE dmc.visita_foto
        SET archivo_url = CONCAT('/api/visita/foto/', CAST(id AS varchar(20)))
      WHERE id IN (SELECT id FROM @nueva);`,
    [
      ["visita", sql.BigInt, visitaId],
      ["etiqueta", sql.NVarChar(40), f.etiqueta || null],
      ["contenido", sql.VarBinary(sql.MAX), f.bytes],
      ["mime", sql.VarChar(40), f.mime],
      ["bytes", sql.Int, f.bytes.length],
      ["orden", sql.SmallInt, orden],
      ["interno", sql.Bit, f.interno],
    ]
  );
}

/** Reescribe entero lo marcado del checklist del comentario interno. */
export async function escribirInternos(ej: Ejecutor, visitaId: number, codigos: string[]): Promise<void> {
  await ej.ejecutar(`DELETE FROM dmc.visita_interno WHERE visita_id = @id`, [["id", sql.BigInt, visitaId]]);
  for (const [i, codigo] of [...new Set(codigos.filter(Boolean))].entries()) {
    await ej.ejecutar(
      `INSERT INTO dmc.visita_interno (visita_id, interno_codigo, orden)
       SELECT @id, codigo, @orden FROM dmc.catalogo_interno WHERE codigo = @codigo`,
      [
        ["id", sql.BigInt, visitaId],
        ["codigo", sql.VarChar(40), codigo],
        ["orden", sql.SmallInt, i + 1],
      ]
    );
  }
}

/** La versión de sincronizarMotivos que corre dentro de una transacción. */
export async function sincronizarMotivosCon(
  ej: Ejecutor,
  visitaId: number,
  ambito: "PLAN" | "REAL",
  codigos: string[]
): Promise<void> {
  const lista = [...new Set(codigos.filter(Boolean))];

  await ej.ejecutar(`DELETE FROM dmc.visita_motivo WHERE visita_id = @visita AND ambito = @ambito`, [
    ["visita", sql.BigInt, visitaId],
    ["ambito", sql.VarChar(4), ambito],
  ]);

  for (const [i, codigo] of lista.entries()) {
    await ej.ejecutar(
      `INSERT INTO dmc.visita_motivo (visita_id, motivo_codigo, ambito, orden)
       VALUES (@visita, @codigo, @ambito, @orden)`,
      [
        ["visita", sql.BigInt, visitaId],
        ["ambito", sql.VarChar(4), ambito],
        ["codigo", sql.VarChar(40), codigo],
        ["orden", sql.SmallInt, i + 1],
      ]
    );
  }
}
