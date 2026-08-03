/**
 * Las 16 regiones de Chile, de norte a sur.
 *
 * Acá son texto libre guardado en `sucursal.region`. En DMC_Core la región es
 * FK a `core.comuna` → `core.region`; el traspaso de septiembre mapea por
 * nombre, así que estos nombres tienen que ser los oficiales y no abreviaturas
 * de uso interno.
 *
 * El orden es geográfico, no alfabético: es el que espera cualquiera que haya
 * llenado un formulario chileno antes.
 */
export const REGIONES = [
  "Arica y Parinacota",
  "Tarapacá",
  "Antofagasta",
  "Atacama",
  "Coquimbo",
  "Valparaíso",
  "Metropolitana de Santiago",
  "Libertador General Bernardo O'Higgins",
  "Maule",
  "Ñuble",
  "Biobío",
  "La Araucanía",
  "Los Ríos",
  "Los Lagos",
  "Aysén del General Carlos Ibáñez del Campo",
  "Magallanes y de la Antártica Chilena",
] as const;

export type Region = (typeof REGIONES)[number];

export function esRegionValida(valor: string): valor is Region {
  return (REGIONES as readonly string[]).includes(valor);
}
