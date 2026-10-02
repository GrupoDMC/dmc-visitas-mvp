import "server-only";
import { agrupar, consulta, consultaCon, ejecutar, num, sql, F_TS, type Parametro } from "@/lib/data/sql";
import { hayGestionPendientes, listarPendientes } from "@/lib/data/catalogos";
import { getVisitasCompletas } from "@/lib/data/visitas";
import { hoyISO } from "@/lib/ui/fecha";
import type { CatalogoPendiente, EstadoProblema, EstadoVisita, OrigenRegistro, Visita } from "@/lib/types";

// "Reagendas y pendientes" del panel: las visitas que no se pudieron hacer, con
// lo que coordinación necesita para destrabarlas sin abrir cada ficha — desde
// cuándo esperan, qué pasos de gestión llevan marcados y qué ha pasado antes en
// ese mismo local.

/** Un paso del checklist de gestión ya marcado en una visita. */
export interface GestionMarca {
  codigo: string;
  /** Quién lo marcó: su nombre si es técnico, si no su correo. */
  por: string | null;
  en: string;
}

export interface ProblemaLocal {
  id: number;
  tipoCodigo: string;
  estado: EstadoProblema;
  descripcion: string | null;
  solucion: string | null;
  items: { etiqueta: string; cantidad: number }[];
  /** La visita donde se levantó. */
  folio: string;
  fecha: string;
  resueltoEn: string | null;
}

export interface VisitaLocal {
  folio: string;
  fecha: string;
  estado: EstadoVisita;
  tecnico: string;
  motivos: string[];
  trabajosCodigos: string[];
  observaciones: string | null;
  /** Por qué quedó pendiente o cancelada, si fue el caso. */
  motivoTecnico: string | null;
}

/** Todo lo registrado en una sucursal, de lo más nuevo a lo más viejo. */
export interface HistorialLocal {
  visitas: VisitaLocal[];
  problemas: ProblemaLocal[];
}

export interface Pendiente {
  visita: Visita;
  /** Cuándo quedó en este estado y quién la dejó así. Null si la bitácora no lo trae. */
  desde: { en: string; por: string | null; origen: OrigenRegistro } | null;
  /** Días que lleva esperando, contados desde `desde` (o desde su fecha programada). */
  dias: number;
  gestion: GestionMarca[];
}

export interface DatosPendientes {
  pendientes: Pendiente[];
  /** Por id de sucursal. Incluye a la propia visita pendiente: la vista la aparta. */
  historial: Record<number, HistorialLocal>;
  /** La Lista 5 del checklist, en su orden. */
  pasos: CatalogoPendiente[];
  /** false = falta la migración 014: no hay checklist que marcar. */
  conGestion: boolean;
}

const diasEntre = (desde: string, hasta: string) =>
  Math.max(0, Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000));

export async function getPendientes(): Promise<DatosPendientes> {
  const conGestion = await hayGestionPendientes();
  const [todas, pasos, desde, marcas] = await Promise.all([
    getVisitasCompletas(),
    listarPendientes(),
    consulta<{ visita_id: number; en: string; origen: OrigenRegistro; por: string | null }>(
      `SELECT v.id AS visita_id, ${F_TS("h.ocurrido_en")} AS en, h.origen,
              COALESCE(tu.nombre_completo, u.email, th.nombre_completo) AS por
         FROM dmc.visita v
        CROSS APPLY (SELECT TOP 1 x.ocurrido_en, x.origen, x.usuario_id, x.tecnico_id
                       FROM dmc.visita_estado_historial x
                      WHERE x.visita_id = v.id AND x.estado = v.estado
                      ORDER BY x.ocurrido_en DESC, x.id DESC) h
         LEFT JOIN dmc.usuario u  ON u.id  = h.usuario_id
         LEFT JOIN dmc.tecnico tu ON tu.id = u.tecnico_id
         LEFT JOIN dmc.tecnico th ON th.id = h.tecnico_id
        WHERE v.estado IN ('REAGENDADA', 'PENDIENTE') AND v.activo = 1`
    ),
    conGestion
      ? consulta<{ visita_id: number; codigo: string; en: string; por: string | null }>(
          `SELECT g.visita_id, g.pendiente_codigo AS codigo, ${F_TS("g.marcado_en")} AS en,
                  COALESCE(tu.nombre_completo, u.email) AS por
             FROM dmc.visita_pendiente_gestion g
             JOIN dmc.visita v ON v.id = g.visita_id
             LEFT JOIN dmc.usuario u  ON u.id  = g.usuario_id
             LEFT JOIN dmc.tecnico tu ON tu.id = u.tecnico_id
            WHERE v.estado IN ('REAGENDADA', 'PENDIENTE') AND v.activo = 1
            ORDER BY g.marcado_en, g.id`
        )
      : [],
  ]);

  const hoy = hoyISO();
  const desdePorVisita = new Map(desde.map((d) => [num(d.visita_id), d]));
  const marcasPorVisita = agrupar(marcas, (m) => num(m.visita_id));
  const vigentes = new Set(pasos.map((p) => p.codigo));

  const pendientes = todas
    .filter((v) => v.estado === "REAGENDADA" || v.estado === "PENDIENTE")
    .map((visita): Pendiente => {
      const d = desdePorVisita.get(visita.id);
      return {
        visita,
        desde: d ? { en: d.en, por: d.por, origen: d.origen } : null,
        dias: diasEntre((d?.en ?? visita.fechaProgramada).slice(0, 10), hoy),
        // Solo lo marcado desde que quedó así: si antes ya estuvo pendiente y se
        // reprogramó, aquella gestión no cuenta para esta vuelta. Y solo los
        // pasos que siguen en el checklist.
        gestion: (marcasPorVisita.get(visita.id) ?? [])
          .filter((m) => vigentes.has(m.codigo) && (!d || m.en >= d.en))
          .map((m) => ({ codigo: m.codigo, por: m.por, en: m.en })),
      };
    })
    // Lo que más lleva esperando, arriba.
    .sort((a, b) => b.dias - a.dias || a.visita.fechaProgramada.localeCompare(b.visita.fechaProgramada));

  // El historial sale de las mismas visitas ya cargadas: no hace falta otra
  // consulta para saber qué pasó antes en cada local.
  const sucursales = new Set(pendientes.map((p) => p.visita.sucursalId));
  const historial: Record<number, HistorialLocal> = {};
  const masNuevaPrimero = [...todas].sort(
    (a, b) => b.fechaProgramada.localeCompare(a.fechaProgramada) || b.id - a.id
  );
  for (const v of masNuevaPrimero) {
    if (!sucursales.has(v.sucursalId)) continue;
    const local = (historial[v.sucursalId] ??= { visitas: [], problemas: [] });
    local.visitas.push({
      folio: v.folio,
      fecha: v.fechaProgramada,
      estado: v.estado,
      tecnico: v.tecnico?.nombreCompleto ?? "—",
      motivos: v.motivosNombres,
      trabajosCodigos: (v.trabajos ?? []).map((t) => t.trabajoCodigo),
      observaciones: v.ejecucion?.observaciones ?? null,
      // El motivo del reagendamiento solo vale mientras siga reagendada: una
      // visita que después se hizo no "quedó sin hacer".
      motivoTecnico:
        v.motivoPendiente ?? (v.estado === "REAGENDADA" ? v.reagendamientos?.[0]?.motivo ?? null : null),
    });
    for (const p of v.problemas ?? []) {
      local.problemas.push({
        id: p.id,
        tipoCodigo: p.tipoCodigo,
        estado: p.estado,
        descripcion: p.descripcion,
        solucion: p.solucion,
        items: p.items.map((i) => ({ etiqueta: i.etiqueta, cantidad: i.cantidad })),
        folio: v.folio,
        fecha: v.fechaProgramada,
        resueltoEn: p.resueltoEn,
      });
    }
  }

  return { pendientes, historial, pasos, conGestion };
}

/**
 * Marca o desmarca un paso del checklist de gestión en una visita.
 *
 * Solo vale mientras la visita siga REAGENDADA o PENDIENTE: una vez
 * reprogramada ya no hay nada que gestionar. Devuelve por qué no se pudo, o
 * null si quedó guardado.
 */
export async function marcarGestionPendiente(input: {
  folio: string;
  codigo: string;
  marcado: boolean;
  usuarioId: number;
}): Promise<{ error: string } | null> {
  if (!(await hayGestionPendientes())) {
    return { error: "Para marcar la gestión falta correr la migración 014 en la base." };
  }

  const [visita] = await consultaCon<{ id: number; estado: EstadoVisita }>(
    `SELECT id, estado FROM dmc.visita WHERE folio = @folio AND activo = 1`,
    [["folio", sql.VarChar(16), input.folio]]
  );
  if (!visita) return { error: "No encontramos esa visita." };
  if (visita.estado !== "REAGENDADA" && visita.estado !== "PENDIENTE") {
    return { error: "Esa visita ya no está reagendada ni pendiente: recarga la página." };
  }

  const params: Parametro[] = [
    ["visita", sql.BigInt, num(visita.id)],
    ["codigo", sql.VarChar(40), input.codigo],
    ["usuario", sql.BigInt, input.usuarioId],
  ];

  if (!input.marcado) {
    await ejecutar(
      `DELETE FROM dmc.visita_pendiente_gestion WHERE visita_id = @visita AND pendiente_codigo = @codigo`,
      params
    );
    return null;
  }

  const [paso] = await consultaCon<{ id: number }>(
    `SELECT id FROM dmc.catalogo_pendiente WHERE codigo = @codigo AND activo = 1`,
    [["codigo", sql.VarChar(40), input.codigo]]
  );
  if (!paso) return { error: "Ese paso ya no está en el checklist: recarga la página." };

  // Una marca vieja (de una vuelta anterior como pendiente) se renueva en vez
  // de chocar con la unicidad: pasa a contar desde ahora.
  await ejecutar(
    `UPDATE dmc.visita_pendiente_gestion
        SET usuario_id = @usuario, marcado_en = SYSDATETIME()
      WHERE visita_id = @visita AND pendiente_codigo = @codigo;

     IF @@ROWCOUNT = 0
       INSERT INTO dmc.visita_pendiente_gestion (visita_id, pendiente_codigo, usuario_id)
       VALUES (@visita, @codigo, @usuario);`,
    params
  );
  return null;
}
