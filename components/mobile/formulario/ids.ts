// Ids locales para las filas nuevas del formulario del acta: trabajos,
// problemas, fotos y videos. Son del celular y nunca llegan a la base.

let autoId = 1;

/** El siguiente id libre. */
export function nuevoId(): number {
  return autoId++;
}

/** Los ids que ya trae un acta o un borrador recuperado no se vuelven a dar. */
export function reservarIdsHasta(siguiente: number): void {
  autoId = Math.max(autoId, siguiente);
}
