"use server";

import { revalidatePath } from "next/cache";
import { sesionCon } from "@/lib/auth";
import { listarMotivos, listarTrabajos } from "@/lib/data/catalogos";
import { consultaCon, num } from "@/lib/data/sql";
import { crearInformePapel, type InformePapel } from "@/lib/data/visitas-papel";
import { hoyISO } from "@/lib/ui/fecha";
import { PRIMER_ANIO_PAPEL } from "@/lib/ui/papel";

/** Cuántos informes se aceptan por guardado: más que eso conviene partirlo. */
const MAXIMO_POR_LOTE = 150;

/** Lo que pasó con cada informe, en el mismo orden en que llegaron. */
export interface ResultadoLotePapel {
  ok: boolean;
  /** Un error que tumbó el lote entero (permiso, tamaño…). */
  error?: string;
  resultados: { ok: boolean; folio?: string; error?: string; repetida?: boolean }[];
}

/**
 * "Visitas en papel": guarda un lote de informes. Cada uno va en su propia
 * transacción, así que si uno falla los demás igual quedan; el que falló
 * vuelve con su motivo para corregirlo y reintentar solo ese.
 *
 * Va envuelto en un objeto y no como arreglo suelto: los argumentos de una
 * Server Action tienen un tope de 1 MB y así queda un solo nivel que medir.
 */
export async function crearVisitasPapelAction(lote: { informes: InformePapel[] }): Promise<ResultadoLotePapel> {
  const informes = lote?.informes ?? [];
  const fallaTodo = (error: string): ResultadoLotePapel => ({
    ok: false,
    error,
    resultados: informes.map(() => ({ ok: false, error })),
  });

  const sesion = await sesionCon("visitas.crear");
  if (!sesion) return fallaTodo("No tienes permiso para crear visitas.");
  if (informes.length === 0) return fallaTodo("Agrega al menos un informe.");
  if (informes.length > MAXIMO_POR_LOTE) {
    return fallaTodo(`Son ${informes.length} informes: guarda de a ${MAXIMO_POR_LOTE} como máximo.`);
  }

  // Lo que se valida contra la base se pide una sola vez para todo el lote.
  const idsSucursal = [...new Set(informes.map((i) => Number(i.sucursalId)).filter((n) => Number.isInteger(n) && n > 0))];
  const [motivos, trabajos, sucursales, tecnicos] = await Promise.all([
    listarMotivos(),
    listarTrabajos(),
    idsSucursal.length
      ? consultaCon<{ id: number; cliente_id: number }>(
          // Interpolado porque la lista es de largo variable; el filtro de
          // arriba garantiza que solo son enteros positivos.
          `SELECT id, cliente_id FROM dmc.sucursal WHERE id IN (${idsSucursal.join(",")})`,
          []
        )
      : Promise.resolve([]),
    consultaCon<{ id: number }>(`SELECT id FROM dmc.tecnico`, []),
  ]);
  const clienteDe = new Map(sucursales.map((s) => [num(s.id), num(s.cliente_id)]));
  const hayTecnico = new Set(tecnicos.map((t) => num(t.id)));
  const hayMotivo = new Set(motivos.map((m) => m.codigo));
  const hayTrabajo = new Set(trabajos.map((t) => t.codigo));
  const hoy = hoyISO();

  function porQueNo(inf: InformePapel): string | null {
    if (!inf.sucursalId || clienteDe.get(Number(inf.sucursalId)) !== Number(inf.clienteId)) {
      return "La sucursal no es de ese cliente.";
    }
    if (!hayTecnico.has(Number(inf.tecnicoId))) return "Elige el técnico que hizo el trabajo.";
    if (inf.tecnicoAyudanteId && !hayTecnico.has(Number(inf.tecnicoAyudanteId))) return "Ese ayudante no existe.";
    if (inf.tecnicoAyudanteId && Number(inf.tecnicoAyudanteId) === Number(inf.tecnicoId)) {
      return "El ayudante no puede ser el mismo técnico.";
    }
    const marcados = (inf.motivosCodigos ?? []).filter(Boolean);
    if (marcados.length === 0) return "Elige el motivo.";
    if (marcados.some((c) => !hayMotivo.has(c))) return "Ese motivo ya no existe en el checklist.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inf.fecha ?? "") || Number.isNaN(new Date(inf.fecha).getTime())) {
      return "Falta la fecha del informe.";
    }
    if (inf.fecha > hoy) return "La fecha del informe no puede ser futura.";
    if (Number(inf.fecha.slice(0, 4)) < PRIMER_ANIO_PAPEL) return `La fecha es anterior a ${PRIMER_ANIO_PAPEL}.`;
    if (!inf.firmanteNombre?.trim()) return "Falta quién firmó el informe.";
    if (!inf.descripcion?.trim()) return "Falta la descripción del informe.";
    if ((inf.trabajos ?? []).some((t) => !hayTrabajo.has(t.codigo))) return "Uno de los trabajos ya no está en el checklist.";
    return null;
  }

  const resultados: ResultadoLotePapel["resultados"] = [];
  for (const inf of informes) {
    const error = porQueNo(inf);
    if (error) {
      resultados.push({ ok: false, error });
      continue;
    }
    try {
      const res = await crearInformePapel(
        {
          clienteId: Number(inf.clienteId),
          sucursalId: Number(inf.sucursalId),
          tecnicoId: Number(inf.tecnicoId),
          tecnicoAyudanteId: inf.tecnicoAyudanteId ? Number(inf.tecnicoAyudanteId) : null,
          motivosCodigos: inf.motivosCodigos,
          // Sin repetidos y con lo justo: el mismo trabajo dos veces no suma nada.
          trabajos: [...new Map((inf.trabajos ?? []).map((t) => [t.codigo, t])).values()].map((t) => ({
            codigo: t.codigo,
            motivoCodigo: inf.motivosCodigos[0] ?? null,
            detalle: null,
            subtrabajos: (t.subtrabajos ?? []).map((x) => ({
              etiqueta: String(x.etiqueta ?? "").slice(0, 80),
              cantidad: Number(x.cantidad) || 1,
            })),
          })),
          fecha: inf.fecha,
          firmanteNombre: inf.firmanteNombre.trim().slice(0, 120),
          // Un RUT mal escrito en el papel se guarda tal cual: no hay cómo
          // corregirlo y es mejor que nada. El panel solo avisa.
          firmanteRut: inf.firmanteRut?.trim().slice(0, 12) || null,
          descripcion: inf.descripcion.trim(),
          aunqueRepetida: Boolean(inf.aunqueRepetida),
        },
        sesion.usuario.id
      );
      resultados.push(
        res.ok ? { ok: true, folio: res.folio } : { ok: false, error: res.error, repetida: Boolean(res.repetidaFolio) }
      );
    } catch (err) {
      console.error("[crearVisitasPapel]", err);
      resultados.push({ ok: false, error: "No se pudo guardar. Inténtalo de nuevo." });
    }
  }

  if (resultados.some((r) => r.ok)) {
    revalidatePath("/admin", "layout");
    revalidatePath("/tecnico", "layout");
  }
  return { ok: resultados.every((r) => r.ok), resultados };
}

/** Quién firmó antes en una tienda, con su RUT: las sugerencias del campo «Firmó». */
export interface FirmanteSugerido {
  nombre: string;
  rut: string;
}

/**
 * Los firmantes que ya constan en las visitas de esas sucursales, los más
 * frecuentes primero. Solo lee: no toca nada.
 */
export async function firmantesDeSucursalesAction(lote: {
  sucursalIds: number[];
}): Promise<Record<string, FirmanteSugerido[]>> {
  const sesion = await sesionCon("visitas.crear");
  if (!sesion) return {};
  const ids = [...new Set((lote?.sucursalIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 200);
  if (ids.length === 0) return {};

  try {
    // Interpolado porque la lista es de largo variable; el filtro de arriba
    // garantiza que solo son enteros positivos.
    const filas = await consultaCon<{ sucursal_id: number; nombre: string; rut: string | null; n: number }>(
      `SELECT sucursal_id, LTRIM(RTRIM(responsable_nombre)) AS nombre,
              MAX(LTRIM(RTRIM(responsable_rut))) AS rut, COUNT(*) AS n
         FROM dmc.visita
        WHERE sucursal_id IN (${ids.join(",")})
          AND responsable_nombre IS NOT NULL AND LTRIM(RTRIM(responsable_nombre)) <> ''
        GROUP BY sucursal_id, LTRIM(RTRIM(responsable_nombre))
        ORDER BY sucursal_id, COUNT(*) DESC`,
      []
    );
    const salida: Record<string, FirmanteSugerido[]> = {};
    for (const f of filas) {
      const lista = (salida[String(num(f.sucursal_id))] ??= []);
      if (lista.length < 8) lista.push({ nombre: f.nombre, rut: f.rut ?? "" });
    }
    return salida;
  } catch (err) {
    console.error("[firmantesDeSucursales]", err);
    return {};
  }
}
