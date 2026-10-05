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

export const formASiNo = (v: string | boolean | undefined): boolean | null => (v === "si" ? true : v === "no" ? false : null);
