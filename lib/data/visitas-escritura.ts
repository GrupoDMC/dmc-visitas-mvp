import "server-only";
import {
  consultaCon,
  ejecutorSuelto,
  conTransaccion,
  enTransaccion,
  num,
  numONull,
  sql,
  F_FECHA,
  F_HORA,
  type Ejecutor,
} from "@/lib/data/sql";
import { cargoDelChecklist } from "@/lib/data/catalogos";
import { registrarPersonaLocal } from "@/lib/data/personas-local";
import { soltarReservaEn, tomarReservaEn, traspasarTomadaEn } from "@/lib/data/reservas";
import { textoActaEnCurso } from "@/lib/reserva";
import type { EstadoProblema, EstadoVisita, OrigenRegistro, Visita } from "@/lib/types";
import type { AvisoProblemas, DatosVisita } from "@/lib/contratos/visitas";
import { MOTIVO_PENDIENTE, TOMADA_POR, getVisitaCompleta } from "@/lib/data/visitas-lectura";
import { registrarAvisoEn, soltarAgendadosEn, vincularEn } from "@/lib/data/avisos-problema";

// Visitas: los cambios de estado, el alta, la corrección, la reprogramación
// y los problemas que cambia coordinación.

// ── Escritura ───────────────────────────────────────────────────────────────

/**
 * "Iniciar visita": deja la visita EN_CURSO y abre su ejecución.
 *
 * La puede iniciar el asignado o el ayudante, y el que la inicia se la queda:
 * queda anotado en la bitácora (ver TOMADA_POR) y reserva el acta (ver
 * lib/data/reservas). Mientras esa reserva esté vigente el otro solo la mira;
 * si vence sin actividad, el otro puede iniciarla y la marca pasa a él. El
 * UPDLOCK hace que, si los dos aprietan a la vez, gane uno solo.
 *
 * Devuelve por qué no se pudo, o null si quedó iniciada.
 */
export async function iniciarVisita(
  folio: string,
  responsable: string | null,
  ctx: { tecnicoId: number; usuarioId: number }
): Promise<{ error: string } | null> {
  return enTransaccion((ej) => iniciarVisitaEn(ej, folio, responsable, ctx));
}

/** iniciarVisita dentro de una transacción ajena (ver crearEIniciarVisita). */
async function iniciarVisitaEn(
  ej: Ejecutor,
  folio: string,
  responsable: string | null,
  ctx: { tecnicoId: number; usuarioId: number }
): Promise<{ error: string } | null> {
  {
    const [visita] = await ej.consulta<{
      id: number;
      estado: EstadoVisita;
      tecnico_id: number;
      tecnico_ayudante_id: number | null;
      tomada_por: number | null;
    }>(
      `SELECT v.id, v.estado, v.tecnico_id, v.tecnico_ayudante_id, ${TOMADA_POR} AS tomada_por
         FROM dmc.visita v WITH (UPDLOCK, ROWLOCK) WHERE v.folio = @folio AND v.activo = 1`,
      [["folio", sql.VarChar(16), folio]]
    );
    if (!visita) return { error: "No encontramos esa visita entre las tuyas." };
    if (num(visita.tecnico_id) !== ctx.tecnicoId && numONull(visita.tecnico_ayudante_id) !== ctx.tecnicoId) {
      return { error: "No encontramos esa visita entre las tuyas." };
    }
    if (visita.estado !== "PROGRAMADA" && visita.estado !== "EN_CURSO") {
      return { error: "Esta visita ya está cerrada." };
    }

    const id = num(visita.id);
    const reserva = await tomarReservaEn(ej, id, ctx);
    if (!reserva.ok) return { error: reserva.motivo === "ajena" ? textoActaEnCurso(reserva) : reserva.error };
    if (visita.estado === "EN_CURSO" && numONull(visita.tomada_por) !== ctx.tecnicoId) {
      await traspasarTomadaEn(ej, id, ctx);
    }

    if (visita.estado === "PROGRAMADA") {
      // tg_visita_cambio deja la fila EN_CURSO con el técnico asignado: se le
      // pone el que de verdad la inició, que puede ser el ayudante.
      await ej.ejecutar(
        `DECLARE @antes bigint =
           (SELECT ISNULL(MAX(id), 0) FROM dmc.visita_estado_historial WHERE visita_id = @id);

         UPDATE dmc.visita SET estado = 'EN_CURSO' WHERE id = @id;

         UPDATE dmc.visita_estado_historial
            SET tecnico_id = @tecnico, origen = 'MOVIL', usuario_id = @usuario
          WHERE visita_id = @id AND id > @antes;`,
        [
          ["id", sql.BigInt, id],
          ["tecnico", sql.BigInt, ctx.tecnicoId],
          ["usuario", sql.BigInt, ctx.usuarioId],
        ]
      );
    }

    // La ejecución guarda la hora real de llegada. Se crea una sola vez: si el
    // técnico vuelve a entrar, no se pisa la hora con la que ya había registrado.
    await ej.ejecutar(
      `IF NOT EXISTS (SELECT 1 FROM dmc.visita_ejecucion WHERE visita_id = @id)
         INSERT INTO dmc.visita_ejecucion (visita_id, hora_inicio, responsable_nombre)
         VALUES (@id, SYSDATETIME(), @responsable)`,
      [
        ["id", sql.BigInt, id],
        ["responsable", sql.NVarChar(120), responsable || "Por registrar"],
      ]
    );
    return null;
  }
}

/**
 * "Liberar": suelta una visita EN_CURSO y la deja PROGRAMADA, como si nadie la
 * hubiera iniciado. Es la salida cuando el técnico que la tomó no la va a
 * terminar: desde ahí la puede iniciar cualquiera de los dos.
 *
 * Se borra la ejecución a medio abrir para que la hora de llegada sea la de
 * quien la inicie de nuevo. El borrador del que la tenía no se toca: si la
 * vuelve a tomar él, recupera lo que llevaba escrito.
 *
 * Devuelve por qué no se pudo, o null si quedó liberada.
 */
export async function liberarVisita(input: {
  folio: string;
  usuarioId: number;
}): Promise<{ error: string } | null> {
  return enTransaccion(async (ej) => {
    const [visita] = await ej.consulta<{ id: number; estado: EstadoVisita }>(
      `SELECT id, estado FROM dmc.visita WITH (UPDLOCK, ROWLOCK) WHERE folio = @folio AND activo = 1`,
      [["folio", sql.VarChar(16), input.folio]]
    );
    if (!visita) return { error: "No encontramos esa visita." };
    if (visita.estado !== "EN_CURSO") {
      return { error: "Solo se libera una visita en curso: esta ya cambió de estado." };
    }

    const id = num(visita.id);
    await ej.ejecutar(
      `DECLARE @antes bigint =
         (SELECT ISNULL(MAX(id), 0) FROM dmc.visita_estado_historial WHERE visita_id = @id);

       UPDATE dmc.visita SET estado = 'PROGRAMADA' WHERE id = @id;

       UPDATE dmc.visita_estado_historial
          SET motivo = @motivo, origen = 'WEB', usuario_id = @usuario
        WHERE visita_id = @id AND id > @antes;

       DELETE FROM dmc.visita_ejecucion WHERE visita_id = @id;`,
      [
        ["id", sql.BigInt, id],
        ["motivo", sql.NVarChar(sql.MAX), "Liberada por administración: vuelve a quedar programada."],
        ["usuario", sql.BigInt, input.usuarioId],
      ]
    );
    // Liberarla también suelta la reserva: el otro técnico no tiene que esperar el plazo.
    await soltarReservaEn(ej, id);
    return null;
  });
}

/**
 * Reagendar, dejar pendiente o cancelar. El motivo queda en la bitácora
 * dmc.visita_estado_historial, que es donde el esquema lo guarda: dmc.visita no
 * tiene columna para él.
 */
export async function cambiarEstadoVisita(input: {
  folio: string;
  estado: EstadoVisita;
  motivo: string;
  fechaNueva?: string | null;
  horaNueva?: string | null;
  origen: OrigenRegistro;
  usuarioId?: number | null;
  tecnicoId?: number | null;
}): Promise<boolean> {
  const [visita] = await consultaCon<{ id: number; fecha: string; hora: string | null }>(
    `SELECT id, ${F_FECHA("fecha_programada")} AS fecha, ${F_HORA("hora_programada")} AS hora
       FROM dmc.visita WHERE folio = @folio AND activo = 1`,
    [["folio", sql.VarChar(16), input.folio]]
  );
  if (!visita) return false;
  const id = num(visita.id);

  // Reagendar toca tres tablas (reagendamiento, visita y la bitácora): o quedan
  // las tres o ninguna.
  await enTransaccion(async (ej) => {
    if (input.estado === "REAGENDADA") {
      await ej.ejecutar(
        `INSERT INTO dmc.reagendamiento
           (visita_id, fecha_anterior, hora_anterior, fecha_nueva, hora_nueva, motivo, origen, tecnico_id, usuario_id)
         VALUES (@id, @fechaAnt, @horaAnt, @fechaNue, @horaNue, @motivo, @origen, @tecnico, @usuario)`,
        [
          ["id", sql.BigInt, id],
          ["fechaAnt", sql.Date, visita.fecha],
          ["horaAnt", sql.VarChar(8), visita.hora],
          ["fechaNue", sql.Date, input.fechaNueva || null],
          ["horaNue", sql.VarChar(8), input.horaNueva || null],
          ["motivo", sql.NVarChar(sql.MAX), input.motivo],
          ["origen", sql.VarChar(6), input.origen],
          ["tecnico", sql.BigInt, input.tecnicoId ?? null],
          ["usuario", sql.BigInt, input.usuarioId ?? null],
        ]
      );
      if (input.fechaNueva) {
        // Reagendar deja un día fijo: el margen que tuviera se suelta.
        await ej.ejecutar(`UPDATE dmc.visita SET fecha_programada = @fecha, hora_programada = @hora, fecha_hasta = NULL WHERE id = @id`, [
          ["fecha", sql.Date, input.fechaNueva],
          ["hora", sql.VarChar(8), input.horaNueva || null],
          ["id", sql.BigInt, id],
        ]);
      }
    }

    await marcarEstado(id, input.estado, input.motivo, input.origen, input.usuarioId ?? null, ej);
    // Cancelada en la tienda, ya no va a resolver nada: lo que esperaba por ella vuelve a abierto.
    if (input.estado === "CANCELADA") await soltarAgendadosEn(ej, id, input.folio, input.usuarioId ?? null);
  });
  return true;
}

/**
 * "Cancelar por admin": el cierre administrativo de una visita que quedó vieja
 * o que ya no sirve.
 *
 * Es una cancelación, pero con estado propio (CANCELADA_ADMIN) porque la
 * diferencia importa al leer la ficha: CANCELADA la deja el técnico parado en
 * la puerta de la tienda, esta la cierra administración desde la oficina.
 *
 * Solo se puede aplicar sobre una visita PROGRAMADA o EN_CURSO. Una COMPLETADA
 * ya tiene acta firmada y no se toca; el UPDLOCK evita que el técnico alcance a
 * cerrarla mientras el administrador confirma el diálogo.
 *
 * Devuelve por qué no se pudo, o null si quedó cancelada.
 */
export async function cancelarVisitaPorAdmin(input: {
  folio: string;
  motivo: string;
  usuarioId: number;
}): Promise<{ error: string } | null> {
  return enTransaccion(async (ej) => {
    const [visita] = await ej.consulta<{ id: number; estado: EstadoVisita }>(
      `SELECT id, estado FROM dmc.visita WITH (UPDLOCK, ROWLOCK) WHERE folio = @folio AND activo = 1`,
      [["folio", sql.VarChar(16), input.folio]]
    );
    if (!visita) return { error: "No encontramos esa visita." };
    if (visita.estado === "CANCELADA_ADMIN") return { error: "Esta visita ya la cerró administración." };
    if (visita.estado === "COMPLETADA") {
      return { error: "Esta visita ya tiene acta firmada: una visita completada no se cancela." };
    }
    if (visita.estado !== "PROGRAMADA" && visita.estado !== "EN_CURSO") {
      return {
        error: "Solo se pueden cerrar por administración las visitas programadas o en curso.",
      };
    }

    const id = num(visita.id);
    await ej.ejecutar(
      `DECLARE @antes bigint =
         (SELECT ISNULL(MAX(id), 0) FROM dmc.visita_estado_historial WHERE visita_id = @id);

       UPDATE dmc.visita SET estado = 'CANCELADA_ADMIN' WHERE id = @id;

       IF EXISTS (SELECT 1 FROM dmc.visita_estado_historial WHERE visita_id = @id AND id > @antes)
         UPDATE dmc.visita_estado_historial
            SET motivo = @motivo, origen = 'WEB', usuario_id = @usuario
          WHERE visita_id = @id AND id > @antes;
       ELSE
         INSERT INTO dmc.visita_estado_historial (visita_id, estado, motivo, origen, usuario_id)
         VALUES (@id, 'CANCELADA_ADMIN', @motivo, 'WEB', @usuario);`,
      [
        ["id", sql.BigInt, id],
        ["motivo", sql.NVarChar(sql.MAX), input.motivo],
        ["usuario", sql.BigInt, input.usuarioId],
      ]
    );

    // La ejecución a medio abrir se sella: si el técnico había apretado
    // "Iniciar visita", la hora de término queda en el momento del cierre y no
    // en null para siempre.
    await ej.ejecutar(
      `UPDATE dmc.visita_ejecucion
          SET hora_termino = SYSDATETIME()
        WHERE visita_id = @id AND hora_termino IS NULL`,
      [["id", sql.BigInt, id]]
    );

    await soltarAgendadosEn(ej, id, input.folio, input.usuarioId);
    return null;
  });
}

/**
 * "Eliminar visita" — la saca de circulación sin borrar la fila.
 *
 * No es un DELETE: dmc.visita.activo pasa a 0 y ahí se queda. El acta, las
 * fotos, el video y la firma siguen en la base tal cual estaban; lo único que
 * cambia es que el panel, el celular del técnico y los gráficos dejan de
 * contarla (ver TODAS/porTecnico/porFolio/porId acá arriba y las vistas de la
 * migración 005). Sirve para sacar del medio una visita de prueba sin perder
 * el rastro de que existió.
 *
 * `confirmacionFolio` tiene que calzar con el folio real: es la traba contra
 * el clic accidental que pidió el administrador, no una segunda fuente de
 * verdad — la acción ya llega con el folio, esto solo obliga a escribirlo de
 * nuevo a propósito.
 *
 * Deja registro en dmc.visita_eliminacion con quién, cuándo y en qué estado
 * estaba: es la auditoría, y a diferencia de dmc.visita_estado_historial no
 * es un cambio de estado sino sacarla de circulación.
 */
export async function eliminarVisita(input: {
  folio: string;
  confirmacionFolio: string;
  usuarioId: number;
}): Promise<{ error: string } | null> {
  if (input.confirmacionFolio.trim() !== input.folio.trim()) {
    return { error: "El folio no coincide. Escríbelo tal cual para confirmar." };
  }

  return enTransaccion(async (ej) => {
    const [visita] = await ej.consulta<{ id: number; estado: EstadoVisita }>(
      `SELECT id, estado FROM dmc.visita WITH (UPDLOCK, ROWLOCK) WHERE folio = @folio AND activo = 1`,
      [["folio", sql.VarChar(16), input.folio]]
    );
    if (!visita) return { error: "No encontramos esa visita, o ya está eliminada." };

    const id = num(visita.id);
    await ej.ejecutar(`UPDATE dmc.visita SET activo = 0 WHERE id = @id`, [["id", sql.BigInt, id]]);
    await ej.ejecutar(
      `INSERT INTO dmc.visita_eliminacion (visita_id, folio, estado_previo, usuario_id)
       VALUES (@id, @folio, @estado, @usuario)`,
      [
        ["id", sql.BigInt, id],
        ["folio", sql.VarChar(16), input.folio],
        ["estado", sql.VarChar(16), visita.estado],
        ["usuario", sql.BigInt, input.usuarioId],
      ]
    );
    await soltarAgendadosEn(ej, id, input.folio, input.usuarioId);
    return null;
  });
}

/**
 * Cambia el estado y deja el motivo en la bitácora. El trigger tg_visita_cambio
 * ya inserta la fila del historial cuando el estado cambia de verdad: se le
 * completa el motivo. Si el estado no cambió, el trigger no insertó nada y la
 * fila se agrega acá para no perder la explicación.
 */
async function marcarEstado(
  id: number,
  estado: EstadoVisita,
  motivo: string | null,
  origen: OrigenRegistro,
  usuarioId: number | null,
  ej: Ejecutor = ejecutorSuelto
): Promise<void> {
  await ej.ejecutar(
    `DECLARE @antes bigint =
       (SELECT ISNULL(MAX(id), 0) FROM dmc.visita_estado_historial WHERE visita_id = @id);

     UPDATE dmc.visita SET estado = @estado WHERE id = @id;

     IF EXISTS (SELECT 1 FROM dmc.visita_estado_historial WHERE visita_id = @id AND id > @antes)
       UPDATE dmc.visita_estado_historial
          SET motivo = @motivo, origen = @origen, usuario_id = @usuario
        WHERE visita_id = @id AND id > @antes;
     ELSE
       INSERT INTO dmc.visita_estado_historial (visita_id, estado, motivo, origen, usuario_id)
       VALUES (@id, @estado, @motivo, @origen, @usuario);`,
    [
      ["id", sql.BigInt, id],
      // varchar(16) desde CANCELADA_ADMIN: con 12 el driver truncaba el valor
      // y el CHECK de dmc.visita lo rechazaba.
      ["estado", sql.VarChar(16), estado],
      ["motivo", sql.NVarChar(sql.MAX), motivo],
      ["origen", sql.VarChar(6), origen],
      ["usuario", sql.BigInt, usuarioId],
    ]
  );
}

/**
 * "Nueva visita" del panel y la ruta masiva. Nace PROGRAMADA.
 *
 * `exigirAviso`: si la sucursal tiene problemas sin resolver, la visita no se
 * crea sin la respuesta al aviso (ver lib/data/avisos-problema). Lanza
 * ErrorDeAviso si falta o no sirve.
 */
export async function crearVisita(
  datos: DatosVisita,
  creadaPor: number | null,
  opciones: { exigirAviso?: boolean } = {}
): Promise<Visita> {
  const { id, folio, cargo } = await enTransaccion(async (ej) => {
    const nueva = await crearVisitaEn(ej, datos, creadaPor);
    if (opciones.exigirAviso) {
      await registrarAvisoEn(ej, {
        visitaId: nueva.id,
        folio: nueva.folio,
        sucursalId: datos.sucursalId,
        ocasion: "AGENDAR",
        aviso: datos.avisoProblemas,
        usuarioId: creadaPor,
      });
    }
    return nueva;
  });
  return visitaCreada(id, folio, datos, cargo);
}

/** Lo que va después de confirmada la creación: la lista de la tienda y la relectura. */
async function visitaCreada(id: number, folio: string, datos: DatosVisita, cargo: string | null): Promise<Visita> {
  // Fuera de la transacción: es un favor a la próxima visita, nunca lanza, y un
  // fallo suyo no debe deshacer la visita.
  await registrarPersonaLocal(datos.sucursalId, {
    nombre: datos.responsableNombre,
    rut: datos.responsableRut,
    telefono: datos.responsableTelefono,
    cargo,
  });
  const visita = await getVisitaCompleta(id);
  if (!visita) throw new Error(`La visita ${folio} se creó pero no se pudo releer.`);
  return visita;
}

/** Las escrituras de crearVisita: la visita, su enlace al problema, los motivos y el cargo. */
async function crearVisitaEn(
  ej: Ejecutor,
  datos: DatosVisita,
  creadaPor: number | null
): Promise<{ id: number; folio: string; cargo: string | null }> {
  // El folio lo genera el DEFAULT de dmc.visita con la secuencia seq_folio_visita.
  const [fila] = await ej.consulta<{ id: number; folio: string }>(
    `INSERT INTO dmc.visita
       (cliente_id, sucursal_id, tecnico_id, tecnico_ayudante_id, motivo_codigo, fecha_programada,
        hora_programada, trabajo_solicitado, indicaciones_acceso, responsable_nombre, responsable_rut,
        responsable_telefono, problema_origen_id, creada_en_terreno, creada_por, fecha_hasta)
     VALUES (@cliente, @sucursal, @tecnico, @ayudante, @motivo, @fecha, @hora, @trabajo, @acceso,
             @responsable, @rut, @telefono, @problema, @terreno, @creadaPor, @hasta);

     SELECT id, folio FROM dmc.visita WHERE id = SCOPE_IDENTITY();`,
    [
      ["hasta", sql.Date, datos.fechaHasta || null],
      ["cliente", sql.BigInt, datos.clienteId],
      ["sucursal", sql.BigInt, datos.sucursalId],
      ["tecnico", sql.BigInt, datos.tecnicoId],
      ["ayudante", sql.BigInt, datos.tecnicoAyudanteId || null],
      ["motivo", sql.VarChar(40), datos.motivoCodigo],
      ["fecha", sql.Date, datos.fechaProgramada],
      ["hora", sql.VarChar(8), datos.horaProgramada || null],
      ["trabajo", sql.NVarChar(sql.MAX), datos.trabajoSolicitado],
      ["acceso", sql.NVarChar(sql.MAX), datos.indicacionesAcceso],
      ["responsable", sql.NVarChar(120), datos.responsableNombre],
      ["rut", sql.VarChar(12), datos.responsableRut || null],
      ["telefono", sql.VarChar(30), datos.responsableTelefono],
      ["problema", sql.BigInt, datos.problemaOrigenId ?? null],
      ["terreno", sql.Bit, datos.creadaEnTerreno ?? false],
      ["creadaPor", sql.BigInt, creadaPor],
    ]
  );

  const id = num(fila.id);

  // La visita que nace de un problema queda enlazada y el problema pasa a
  // AGENDADO: así el panel lo muestra agendado y el acta pregunta si se resolvió.
  if (datos.problemaOrigenId) {
    await vincularEn(ej, datos.problemaOrigenId, id, fila.folio, creadaPor);
  }

  await sincronizarMotivos(ej, id, "PLAN", motivosDe(datos));
  const cargo = await guardarCargoAgendado(ej, id, datos.responsableCargo);
  return { id, folio: fila.folio, cargo };
}

/**
 * "Agregar visita" del celular: crea la visita y la inicia en una sola
 * transacción. Si iniciarla falla no queda una visita creada y sin iniciar.
 *
 * Devuelve el folio, o por qué no se pudo.
 */
export async function crearEIniciarVisita(
  datos: DatosVisita,
  ctx: { tecnicoId: number; usuarioId: number }
): Promise<{ folio: string } | { error: string }> {
  try {
    const creada = await enTransaccion(async (ej) => {
      const nueva = await crearVisitaEn(ej, datos, ctx.usuarioId);
      const fallo = await iniciarVisitaEn(ej, nueva.folio, datos.responsableNombre, ctx);
      // Lanzar es lo que deshace la creación: devolver el error confirmaría.
      if (fallo) throw new NoSePudoIniciar(fallo.error);
      return nueva;
    });
    await visitaCreada(creada.id, creada.folio, datos, creada.cargo);
    return { folio: creada.folio };
  } catch (err) {
    if (err instanceof NoSePudoIniciar) return { error: err.message };
    throw err;
  }
}

class NoSePudoIniciar extends Error {}

/**
 * Deja en la visita el cargo del responsable, si es uno del checklist (vacío lo
 * borra). Devuelve el que quedó.
 */
async function guardarCargoAgendado(
  ej: Ejecutor,
  visitaId: number,
  pedido: string | null | undefined
): Promise<string | null> {
  const cargo = await cargoDelChecklist(pedido);
  await ej.ejecutar(`UPDATE dmc.visita SET responsable_cargo = @cargo WHERE id = @id`, [
    ["cargo", sql.NVarChar(80), cargo],
    ["id", sql.BigInt, visitaId],
  ]);
  return cargo;
}

/** El principal siempre primero, sin repetidos y sin vacios. */
function motivosDe(datos: DatosVisita): string[] {
  const lista = [datos.motivoCodigo, ...(datos.motivosCodigos ?? [])].filter(Boolean);
  return [...new Set(lista)];
}

/**
 * Deja dmc.visita_motivo con exactamente los codigos indicados, respetando el
 * orden en que vienen. Es un reemplazo completo: los que ya no estan se borran
 * porque no son un dato historico, son la seleccion actual de la visita.
 */
async function sincronizarMotivos(
  ej: Ejecutor,
  visitaId: number,
  ambito: "PLAN" | "REAL",
  codigos: string[]
): Promise<void> {
  const lista = [...new Set(codigos.filter(Boolean))];

  await ej.ejecutar(
    `DELETE FROM dmc.visita_motivo
      WHERE visita_id = @visita AND ambito = @ambito
        AND (@codigos IS NULL OR motivo_codigo NOT IN
             (SELECT value FROM STRING_SPLIT(@codigos, ',')))`,
    [
      ["visita", sql.BigInt, visitaId],
      ["ambito", sql.VarChar(4), ambito],
      ["codigos", sql.NVarChar(sql.MAX), lista.length ? lista.join(",") : null],
    ]
  );

  for (const [i, codigo] of lista.entries()) {
    await ej.ejecutar(
      `MERGE dmc.visita_motivo AS destino
       USING (SELECT @visita AS visita_id, @ambito AS ambito, @codigo AS motivo_codigo) AS origen
          ON destino.visita_id = origen.visita_id
         AND destino.ambito = origen.ambito
         AND destino.motivo_codigo = origen.motivo_codigo
       WHEN MATCHED THEN UPDATE SET orden = @orden
       WHEN NOT MATCHED THEN INSERT (visita_id, motivo_codigo, ambito, orden)
                             VALUES (@visita, @codigo, @ambito, @orden);`,
      [
        ["visita", sql.BigInt, visitaId],
        ["ambito", sql.VarChar(4), ambito],
        ["codigo", sql.VarChar(40), codigo],
        ["orden", sql.SmallInt, i + 1],
      ]
    );
  }
}

/** "Corregir visita" del acta. Si venía REAGENDADA vuelve a PROGRAMADA. */
export async function editarVisita(
  folio: string,
  datos: DatosVisita,
  usuarioId: number | null,
  // Dentro de una transacción ajena (ver modificarVisita) todo se lee y escribe por ella.
  ejAjeno?: Ejecutor
): Promise<boolean> {
  const [visita] = await (ejAjeno ?? ejecutorSuelto).consulta<{ id: number; estado: EstadoVisita }>(
    `SELECT id, estado FROM dmc.visita WHERE folio = @folio AND activo = 1`,
    [["folio", sql.VarChar(16), folio]]
  );
  if (!visita) return false;
  const id = num(visita.id);

  // Datos, motivos, cargo y estado van juntos: una visita con los datos nuevos
  // y los motivos viejos es peor que una sin corregir.
  const cargo = await conTransaccion(ejAjeno, async (ej) => {
    await ej.ejecutar(
      `UPDATE dmc.visita
          SET cliente_id = @cliente, sucursal_id = @sucursal, tecnico_id = @tecnico,
              tecnico_ayudante_id = @ayudante, motivo_codigo = @motivo, fecha_programada = @fecha, hora_programada = @hora,
              trabajo_solicitado = @trabajo, indicaciones_acceso = @acceso,
              responsable_nombre = @responsable, responsable_rut = @rut,
              responsable_telefono = @telefono, fecha_hasta = @hasta
        WHERE id = @id`,
      [
        ["hasta", sql.Date, datos.fechaHasta || null],
        ["cliente", sql.BigInt, datos.clienteId],
        ["sucursal", sql.BigInt, datos.sucursalId],
        ["tecnico", sql.BigInt, datos.tecnicoId],
        ["ayudante", sql.BigInt, datos.tecnicoAyudanteId || null],
        ["motivo", sql.VarChar(40), datos.motivoCodigo],
        ["fecha", sql.Date, datos.fechaProgramada],
        ["hora", sql.VarChar(8), datos.horaProgramada || null],
        ["trabajo", sql.NVarChar(sql.MAX), datos.trabajoSolicitado],
        ["acceso", sql.NVarChar(sql.MAX), datos.indicacionesAcceso],
        ["responsable", sql.NVarChar(120), datos.responsableNombre],
        ["rut", sql.VarChar(12), datos.responsableRut || null],
        ["telefono", sql.VarChar(30), datos.responsableTelefono],
        ["id", sql.BigInt, id],
      ]
    );

    await sincronizarMotivos(ej, id, "PLAN", motivosDe(datos));
    const cargoGuardado = await guardarCargoAgendado(ej, id, datos.responsableCargo);
    if (visita.estado === "REAGENDADA") {
      await marcarEstado(id, "PROGRAMADA", "Corregida desde coordinación.", "WEB", usuarioId, ej);
    }
    return cargoGuardado;
  });
  await registrarPersonaLocal(datos.sucursalId, {
    nombre: datos.responsableNombre,
    rut: datos.responsableRut,
    telefono: datos.responsableTelefono,
    cargo,
  });
  return true;
}

/** "Cambiar fecha y técnico": reagendadas, pendientes y canceladas. */
export async function reprogramarVisita(
  input: {
    folio: string;
    tecnicoId: number;
    fecha: string;
    hora: string | null;
    usuarioId: number | null;
    /** Como en crearVisita: sin respuesta al aviso no se reprograma (lanza ErrorDeAviso). */
    exigirAviso?: boolean;
    aviso?: AvisoProblemas | null;
  },
  // Dentro de una transacción ajena (ver modificarVisita) todo se lee y escribe por ella.
  ejAjeno?: Ejecutor
): Promise<boolean> {
  const [visita] = await (ejAjeno ?? ejecutorSuelto).consulta<{
    id: number;
    sucursal_id: number;
    fecha: string;
    hora: string | null;
    motivo: string | null;
  }>(
    `SELECT v.id, v.sucursal_id, ${F_FECHA("v.fecha_programada")} AS fecha, ${F_HORA("v.hora_programada")} AS hora,
            ${MOTIVO_PENDIENTE} AS motivo
       FROM dmc.visita v WHERE v.folio = @folio AND v.activo = 1`,
    [["folio", sql.VarChar(16), input.folio]]
  );
  if (!visita) return false;
  const id = num(visita.id);

  // Reprogramar deja un día fijo: el margen que tuviera se suelta.
  await conTransaccion(ejAjeno, async (ej) => {
    await ej.ejecutar(
      `INSERT INTO dmc.reagendamiento
         (visita_id, fecha_anterior, hora_anterior, fecha_nueva, hora_nueva, motivo, origen, usuario_id)
       VALUES (@id, @fechaAnt, @horaAnt, @fechaNue, @horaNue, @motivo, 'WEB', @usuario)`,
      [
        ["id", sql.BigInt, id],
        ["fechaAnt", sql.Date, visita.fecha],
        ["horaAnt", sql.VarChar(8), visita.hora],
        ["fechaNue", sql.Date, input.fecha],
        ["horaNue", sql.VarChar(8), input.hora || null],
        ["motivo", sql.NVarChar(sql.MAX), visita.motivo ?? "Reprogramada desde coordinación."],
        ["usuario", sql.BigInt, input.usuarioId],
      ]
    );

    await ej.ejecutar(
      // Si el nuevo asignado era el ayudante, pasa a ir solo: no puede ser las dos cosas.
      `UPDATE dmc.visita
          SET tecnico_id = @tecnico, fecha_programada = @fecha, hora_programada = @hora, fecha_hasta = NULL,
              tecnico_ayudante_id = CASE WHEN tecnico_ayudante_id = @tecnico THEN NULL
                                         ELSE tecnico_ayudante_id END
        WHERE id = @id`,
      [
        ["tecnico", sql.BigInt, input.tecnicoId],
        ["fecha", sql.Date, input.fecha],
        ["hora", sql.VarChar(8), input.hora || null],
        ["id", sql.BigInt, id],
      ]
    );

    await marcarEstado(id, "PROGRAMADA", "Reprogramada desde coordinación.", "WEB", input.usuarioId, ej);

    if (input.exigirAviso) {
      await registrarAvisoEn(ej, {
        visitaId: id,
        folio: input.folio,
        sucursalId: num(visita.sucursal_id),
        ocasion: "REAGENDAR",
        aviso: input.aviso,
        usuarioId: input.usuarioId,
      });
    }
  });
  return true;
}

/**
 * Cambio de estado y/o reclasificación de tipo desde "Problemas". La nota,
 * si viene, queda en la bitácora junto a cada cambio que se hizo.
 */
export async function actualizarProblema(
  problemaId: number,
  estado: EstadoProblema,
  tipoCodigo: string,
  usuarioId: number | null,
  nota: string | null = null
): Promise<boolean> {
  const [actual] = await consultaCon<{ estado: EstadoProblema; tipo_codigo: string }>(
    `SELECT estado, tipo_codigo FROM dmc.problema WHERE id = @id`,
    [["id", sql.BigInt, problemaId]]
  );
  if (!actual) return false;

  // resuelto_en se escribe en el mismo UPDATE, no se deja al trigger.
  //
  // ck_problema_resuelto exige que RESUELTO traiga fecha de resolución, y los
  // CHECK se evalúan durante el UPDATE: tg_problema_cambio es AFTER UPDATE y
  // corre demasiado tarde para salvarlo. Por eso marcar «Resuelto» desde el
  // panel fallaba siempre con una violación de constraint.
  await enTransaccion(async (ej) => {
    await ej.ejecutar(
      `UPDATE dmc.problema
          SET estado = @estado,
              tipo_codigo = @tipo,
              resuelto_en = CASE WHEN @estado = 'RESUELTO'
                                 THEN COALESCE(resuelto_en, SYSDATETIME())
                                 ELSE NULL END
        WHERE id = @id`,
      [
        ["estado", sql.VarChar(10), estado],
        ["tipo", sql.VarChar(40), tipoCodigo],
        ["id", sql.BigInt, problemaId],
      ]
    );

    for (const [campo, antes, ahora] of [
      ["ESTADO", actual.estado, estado],
      ["TIPO", actual.tipo_codigo, tipoCodigo],
    ] as const) {
      if (antes === ahora) continue;
      await ej.ejecutar(
        `INSERT INTO dmc.problema_historial (problema_id, campo, valor_anterior, valor_nuevo, motivo, usuario_id)
         VALUES (@id, @campo, @antes, @ahora, @nota, @usuario)`,
        [
          ["id", sql.BigInt, problemaId],
          ["campo", sql.VarChar(20), campo],
          ["antes", sql.NVarChar(40), antes],
          ["ahora", sql.NVarChar(40), ahora],
          ["nota", sql.NVarChar(sql.MAX), nota],
          ["usuario", sql.BigInt, usuarioId],
        ]
      );
    }
  });
  return true;
}
