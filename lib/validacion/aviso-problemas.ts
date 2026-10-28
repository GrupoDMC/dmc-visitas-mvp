import type { AvisoProblemas } from "@/lib/contratos/visitas";
import type { ResolucionActa } from "@/lib/contratos/acta";

// Las reglas del aviso de problemas sin resolver: al agendar o reprogramar en
// una sucursal que los tiene, y al cerrar el acta de la visita que venía a
// resolverlos.
//
// Son funciones puras. La capa de datos las aplica dentro de la transacción,
// con la lista de problemas recién leída de la base: lo que diga la pantalla
// no basta, porque entre que se abrió el formulario y se guardó pudo aparecer
// otro problema o resolverse uno.

export const FALTA_RESPUESTA =
  "Esta sucursal tiene problemas sin resolver: responde si la visita es para resolverlos.";
export const PROBLEMA_NUEVO =
  "Apareció un problema nuevo en esta sucursal mientras agendabas. Revisa el aviso y vuelve a responder.";
export const FALTA_ELEGIR = "Marca qué problema va a resolver la visita.";
export const ELEGIDO_AJENO = "Uno de los problemas elegidos ya no está sin resolver en esta sucursal. Revisa el aviso.";
export const FALTA_RESOLUCION = "Responde si quedó solucionado cada problema que venías a resolver.";

export type RevisionAviso =
  | {
      ok: true;
      /** false = la sucursal no tiene problemas sin resolver: no hay nada que registrar. */
      registrar: boolean;
      /** Los problemas que quedan vinculados a la visita. */
      vinculos: number[];
    }
  | { ok: false; error: string };

/**
 * Decide si la respuesta al aviso sirve.
 *
 * `abiertos`: los problemas sin resolver de la sucursal, leídos recién. Sin
 * ninguno el formulario no cambia y no se exige nada. Con alguno, la respuesta
 * es obligatoria, tiene que haberlos mostrado todos, y si es «resuelve» tiene
 * que elegir al menos uno de ellos.
 */
export function revisarAviso(abiertos: readonly number[], aviso: AvisoProblemas | null | undefined): RevisionAviso {
  if (abiertos.length === 0) return { ok: true, registrar: false, vinculos: [] };
  if (!aviso) return { ok: false, error: FALTA_RESPUESTA };

  const avisados = new Set(aviso.avisados);
  if (abiertos.some((id) => !avisados.has(id))) return { ok: false, error: PROBLEMA_NUEVO };

  if (aviso.respuesta === "OTRA_COSA") return { ok: true, registrar: true, vinculos: [] };

  const elegidos = [...new Set(aviso.elegidos)];
  if (elegidos.length === 0) return { ok: false, error: FALTA_ELEGIR };
  const vigentes = new Set(abiertos);
  if (elegidos.some((id) => !vigentes.has(id))) return { ok: false, error: ELEGIDO_AJENO };
  return { ok: true, registrar: true, vinculos: elegidos };
}

export type RevisionResoluciones =
  | { ok: true; resueltos: number[]; noResueltos: number[] }
  | { ok: false; error: string };

/**
 * Lo que respondió el acta sobre los problemas que la visita venía a resolver.
 *
 * `porResolver`: los vinculados a la visita que siguen sin resolver y sin
 * respuesta. Cada uno necesita la suya. Una respuesta sobre un problema que no
 * está en la lista (ya lo resolvió coordinación, o no era de esta visita) se
 * ignora.
 */
export function revisarResoluciones(
  porResolver: readonly number[],
  respuestas: readonly ResolucionActa[] | null | undefined
): RevisionResoluciones {
  const dicho = new Map<number, boolean>();
  for (const r of respuestas ?? []) if (!dicho.has(r.problemaId)) dicho.set(r.problemaId, r.resuelto);

  const resueltos: number[] = [];
  const noResueltos: number[] = [];
  for (const id of porResolver) {
    const resuelto = dicho.get(id);
    if (resuelto === undefined) return { ok: false, error: FALTA_RESOLUCION };
    (resuelto ? resueltos : noResueltos).push(id);
  }
  return { ok: true, resueltos, noResueltos };
}
