/**
 * Las secciones agrupan motivos o trabajos del checklist (migración 020): una
 * capa para ordenar y plegar la lista, sin cambiar qué cuelga de qué.
 */

interface ConSeccion {
  seccion?: string | null;
  seccionOrden?: number;
}

export interface GrupoDeSeccion<T> {
  /** Null = las entradas que no están en ninguna sección. */
  nombre: string | null;
  items: T[];
}

/**
 * Parte una lista en sus secciones, en el orden de las secciones, y deja al
 * final lo que no tiene. Dentro de cada una se respeta el orden de entrada.
 *
 * Si nada tiene sección devuelve un solo grupo sin nombre: quien pinta lo
 * muestra plano, igual que antes de que existieran las secciones.
 */
export function agruparPorSeccion<T extends ConSeccion>(items: T[]): GrupoDeSeccion<T>[] {
  const con = new Map<string, { orden: number; items: T[] }>();
  const sin: T[] = [];
  for (const it of items) {
    const nombre = it.seccion?.trim();
    if (!nombre) {
      sin.push(it);
      continue;
    }
    const grupo = con.get(nombre) ?? { orden: it.seccionOrden ?? 0, items: [] };
    grupo.items.push(it);
    con.set(nombre, grupo);
  }
  const grupos: GrupoDeSeccion<T>[] = [...con.entries()]
    .sort((a, b) => a[1].orden - b[1].orden)
    .map(([nombre, g]) => ({ nombre, items: g.items }));
  if (sin.length) grupos.push({ nombre: null, items: sin });
  return grupos;
}

/** ¿Hay alguna sección en la lista? Si no, no vale la pena pintar cajas. */
export function hayAlgunaSeccion(items: ConSeccion[]): boolean {
  return items.some((it) => Boolean(it.seccion?.trim()));
}
