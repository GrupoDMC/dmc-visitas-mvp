/**
 * Las marcas opcionales de los maestros (remota, en garantía, plan de
 * calibración) tienen tres valores: sí, no y «no se sabe». En el formulario
 * van como un selector y en la base como un bit que admite NULL.
 */
export const OPCIONES_SI_NO = [
  { v: "", t: "Sin indicar" },
  { v: "si", t: "Sí" },
  { v: "no", t: "No" },
];

export const siNoAForm = (v: boolean | null | undefined): string => (v === true ? "si" : v === false ? "no" : "");

/**
 * Meses de garantía escritos en un formulario. Vacío = null (sin plazo);
 * undefined = lo escrito no es un entero entre 1 y 240.
 */
export function mesesDeForm(v: string | boolean | undefined): number | null | undefined {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 && n <= 240 ? n : undefined;
}

export const formASiNo = (v: string | boolean | undefined): boolean | null => (v === "si" ? true : v === "no" ? false : null);

/**
 * ¿La tienda está en plan de calibración? Si su cliente lo está, sí, siempre;
 * si no, manda lo marcado en la tienda (que puede estarlo por su cuenta).
 */
export function calibracionDeSucursal(
  sucursal: { planCalibracion?: boolean | null },
  cliente: { planCalibracion?: boolean | null } | undefined
): { valor: boolean | null; porCliente: boolean } {
  if (cliente?.planCalibracion === true) return { valor: true, porCliente: true };
  return { valor: sucursal.planCalibracion ?? null, porCliente: false };
}
