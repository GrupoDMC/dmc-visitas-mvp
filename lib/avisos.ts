/**
 * Confirmaciones que se muestran después de guardar.
 *
 * El mecanismo es a propósito el más tonto que funciona: la acción hace
 * `redirect` a la ruta destino con `?ok=<clave>`, y el componente Toast lo
 * traduce y limpia la URL. Sin estado global, sin librería, y sobrevive al
 * redirect — que es justo donde un toast en memoria se pierde.
 */
export const AVISOS = {
  "cliente-creado": "Cliente creado.",
  "cliente-guardado": "Cambios guardados.",
  "cliente-desactivado": "Cliente desactivado. Ya no aparece en visitas nuevas.",
  "cliente-activado": "Cliente reactivado.",
  "sucursal-creada": "Sucursal creada.",
  "sucursal-guardada": "Cambios guardados.",
  "sucursal-desactivada": "Sucursal desactivada.",
  "sucursal-activada": "Sucursal reactivada.",
  "tecnico-creado": "Técnico creado.",
  "tecnico-guardado": "Cambios guardados.",
  "tecnico-desactivado": "Técnico desactivado. Ya no aparece para asignar visitas.",
  "tecnico-activado": "Técnico reactivado.",
  "visita-creada": "Visita creada.",
  "visita-en-terreno-creada":
    "Visita abierta en terreno. Quedó a tu nombre, sin fecha agendada.",
  "usuario-desactivado": "Usuario desactivado. Ya no puede ingresar a la app.",
  "usuario-activado": "Usuario reactivado.",
} as const;

/**
 * La asignación de técnico NO tiene clave acá: es la única acción que no
 * redirige, porque el coordinador se queda en el listado que venía filtrando.
 * Su confirmación vuelve en el estado de la acción. Ver `lib/acciones/visitas.ts`.
 */

export type ClaveAviso = keyof typeof AVISOS;

export function esClaveAviso(valor: string): valor is ClaveAviso {
  return valor in AVISOS;
}

/** Arma la URL de destino de un redirect con su confirmación. */
export function conAviso(ruta: string, clave: ClaveAviso): string {
  const separador = ruta.includes("?") ? "&" : "?";
  return `${ruta}${separador}ok=${clave}`;
}
