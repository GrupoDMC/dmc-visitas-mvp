import "server-only";
import { log } from "@/lib/log";
import { consultaCon, ejecutar, num, sql } from "@/lib/data/sql";
import { trabajosDelMotivo } from "@/lib/ui/motivos";
import type { ChecklistPlantilla } from "@/lib/types";
import type { BorradorChecklist, ResumenChecklist } from "@/lib/contratos/checklist";
import { guardarChecklist } from "@/lib/data/catalogos-guardado";
import {
  listarCargos,
  listarGestionProblemas,
  listarInternos,
  listarMotivos,
  listarPendientes,
  listarProblemas,
  listarSecciones,
  listarTrabajos,
} from "@/lib/data/catalogos-lectura";

// Las listas del checklist: la plantilla propia, la foto del checklist a la
// que vuelve el botón Reiniciar.

// ── Plantilla propia ────────────────────────────────────────────────────────

/**
 * El checklist arranca vacío y se arma a mano. Cuando queda como se quiere, el
 * panel guarda esta foto; el botón Reiniciar vuelve exactamente a ella.
 *
 * Se guarda por nombre y no por id: el panel maneja una sola, "Mi plantilla".
 */
export const PLANTILLA_PROPIA = "Mi plantilla";

export async function guardarPlantilla(nombre: string, usuarioId: number | null): Promise<ChecklistPlantilla> {
  const [motivos, problemas, trabajos, internos, pendientes, cargos, gestionProblemas, seccionesMotivo, seccionesTrabajo] =
    await Promise.all([
      listarMotivos(),
      listarProblemas(),
      listarTrabajos(),
      listarInternos(),
      listarPendientes(),
      listarCargos(),
      listarGestionProblemas(),
      listarSecciones("MOTIVO"),
      listarSecciones("TRABAJO"),
    ]);
  const payload: BorradorChecklist = {
    seccionesMotivo: seccionesMotivo.map((s) => s.nombre),
    seccionesTrabajo: seccionesTrabajo.map((s) => s.nombre),
    motivos: motivos.map((m) => ({
      id: null,
      nombre: m.nombre,
      seccion: m.seccion ?? null,
      trabajos: trabajosDelMotivo(trabajos, m.codigo).map((t) => t.nombre),
    })),
    problemas: problemas.map((p) => ({
      id: null,
      nombre: p.nombre,
      grupoLabel: p.grupoLabel,
      opciones: p.opciones.map((o) => ({
        id: null,
        etiqueta: o.etiqueta,
        permiteCantidad: o.permiteCantidad,
      })),
    })),
    trabajos: trabajos.map((t) => ({
      id: null,
      nombre: t.nombre,
      grupoLabel: t.grupoLabel,
      seccion: t.seccion ?? null,
      subtrabajos: t.subtrabajos.map((s) => ({
        id: null,
        etiqueta: s.etiqueta,
        permiteCantidad: s.permiteCantidad,
      })),
    })),
    internos: internos.map((x) => ({ id: null, nombre: x.nombre })),
    pendientes: pendientes.map((x) => ({ id: null, nombre: x.nombre })),
    cargos: cargos.map((x) => ({ id: null, nombre: x.nombre })),
    gestionProblemas: gestionProblemas.map((x) => ({ id: null, nombre: x.nombre })),
  };

  await ejecutar(
    `MERGE dmc.checklist_plantilla AS destino
     USING (SELECT @nombre AS nombre) AS origen ON destino.nombre = origen.nombre
     WHEN MATCHED THEN UPDATE SET payload = @payload, creado_por = @usuario, actualizado_en = SYSDATETIME()
     WHEN NOT MATCHED THEN INSERT (nombre, payload, creado_por) VALUES (@nombre, @payload, @usuario);`,
    [
      ["nombre", sql.NVarChar(80), nombre],
      ["payload", sql.NVarChar(sql.MAX), JSON.stringify(payload)],
      ["usuario", sql.BigInt, usuarioId],
    ]
  );

  const guardada = await getPlantilla(nombre);
  if (!guardada) throw new Error("La plantilla no quedó guardada.");
  return guardada;
}

interface FilaPlantilla {
  id: number;
  nombre: string;
  payload: string;
  creado_en: string;
  actualizado_en: string;
}

async function leerPlantilla(nombre: string): Promise<{ fila: FilaPlantilla; datos: BorradorChecklist } | null> {
  const [fila] = await consultaCon<FilaPlantilla>(
    `SELECT id, nombre, payload,
            CONVERT(varchar(19), creado_en, 126)      AS creado_en,
            CONVERT(varchar(19), actualizado_en, 126) AS actualizado_en
       FROM dmc.checklist_plantilla WHERE nombre = @nombre`,
    [["nombre", sql.NVarChar(80), nombre]]
  );
  if (!fila) return null;

  try {
    const datos = JSON.parse(fila.payload) as BorradorChecklist;
    return {
      fila,
      datos: {
        motivos: datos.motivos ?? [],
        problemas: datos.problemas ?? [],
        trabajos: datos.trabajos ?? [],
        // Plantillas guardadas antes de que existieran las secciones: sin ellas.
        seccionesMotivo: datos.seccionesMotivo,
        seccionesTrabajo: datos.seccionesTrabajo,
        // Plantillas guardadas antes de que existieran: sin estas listas.
        internos: datos.internos,
        pendientes: datos.pendientes,
        cargos: datos.cargos,
        gestionProblemas: datos.gestionProblemas,
      },
    };
  } catch {
    log.error("plantilla del checklist con JSON ilegible", { nombre });
    return null;
  }
}

/** Metadatos de la plantilla, para mostrar qué tiene guardado sin aplicarla. */
export async function getPlantilla(nombre: string): Promise<ChecklistPlantilla | null> {
  const leida = await leerPlantilla(nombre);
  if (!leida) return null;
  return {
    id: num(leida.fila.id),
    nombre: leida.fila.nombre,
    creadoEn: leida.fila.creado_en,
    actualizadoEn: leida.fila.actualizado_en,
    motivos: leida.datos.motivos.length,
    problemas: leida.datos.problemas.length,
    trabajos: leida.datos.trabajos.length,
    internos: leida.datos.internos?.length ?? 0,
    pendientes: leida.datos.pendientes?.length ?? 0,
    cargos: leida.datos.cargos?.length ?? 0,
    gestionProblemas: leida.datos.gestionProblemas?.length ?? 0,
  };
}

/**
 * Deja las tres listas exactamente como quedaron en la plantilla. Todo lo que
 * no esté en ella se desactiva; lo que coincida por nombre se reutiliza para no
 * romper el código con el que ya se registraron visitas.
 */
export async function aplicarPlantilla(nombre: string): Promise<ResumenChecklist> {
  const leida = await leerPlantilla(nombre);
  if (!leida) throw new Error("Todavía no has guardado ninguna plantilla.");

  const [motivos, problemas, trabajos, internos, pendientes, cargos, gestionProblemas] = await Promise.all([
    listarMotivos(),
    listarProblemas(),
    listarTrabajos(),
    listarInternos(),
    listarPendientes(),
    listarCargos(),
    listarGestionProblemas(),
  ]);

  const idPorNombre = <T extends { id: number; nombre: string }>(lista: T[], buscado: string) =>
    lista.find((x) => x.nombre.trim().toLowerCase() === buscado.trim().toLowerCase())?.id ?? null;

  // Una plantilla fijada antes de los trabajos por motivo trae la relación al revés:
  // cada trabajo con sus motivos, y sin motivos quería decir «en todos».
  const deTrabajos = !leida.datos.motivos.some((m) => m.trabajos);
  const trabajosDe = (motivo: string) =>
    leida.datos.trabajos
      .filter((t) => {
        const suyos = (t.motivos ?? []).map((n) => n.trim().toLowerCase());
        return !suyos.length || suyos.includes(motivo.trim().toLowerCase());
      })
      .map((t) => t.nombre);

  const borrador: BorradorChecklist = {
    // Una plantilla sin secciones (anterior a ellas) las deja como están.
    seccionesMotivo: leida.datos.seccionesMotivo,
    seccionesTrabajo: leida.datos.seccionesTrabajo,
    motivos: leida.datos.motivos.map((m) => ({
      id: idPorNombre(motivos, m.nombre),
      nombre: m.nombre,
      seccion: m.seccion ?? null,
      trabajos: deTrabajos ? trabajosDe(m.nombre) : (m.trabajos ?? []),
    })),
    problemas: leida.datos.problemas.map((p) => ({
      id: idPorNombre(problemas, p.nombre),
      nombre: p.nombre,
      grupoLabel: p.grupoLabel,
      // Los hijos van siempre con id null: guardarHijos reactiva por etiqueta.
      opciones: p.opciones.map((o) => ({ id: null, etiqueta: o.etiqueta, permiteCantidad: o.permiteCantidad })),
    })),
    trabajos: leida.datos.trabajos.map((t) => ({
      id: idPorNombre(trabajos, t.nombre),
      nombre: t.nombre,
      grupoLabel: t.grupoLabel,
      seccion: t.seccion ?? null,
      subtrabajos: t.subtrabajos.map((s) => ({ id: null, etiqueta: s.etiqueta, permiteCantidad: s.permiteCantidad })),
    })),
    internos: leida.datos.internos?.map((x) => ({ id: idPorNombre(internos, x.nombre), nombre: x.nombre })),
    pendientes: leida.datos.pendientes?.map((x) => ({ id: idPorNombre(pendientes, x.nombre), nombre: x.nombre })),
    cargos: leida.datos.cargos?.map((x) => ({ id: idPorNombre(cargos, x.nombre), nombre: x.nombre })),
    gestionProblemas: leida.datos.gestionProblemas?.map((x) => ({
      id: idPorNombre(gestionProblemas, x.nombre),
      nombre: x.nombre,
    })),
  };

  return guardarChecklist(borrador);
}
