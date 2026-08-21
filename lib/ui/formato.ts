// Formateo de RUT y teléfono chileno — mismas reglas que fmtRut/fmtTel del
// mockup (Claude Design · "DMC Contingencia Movil"). Se aplican en cada
// pulsación para que el técnico no tenga que escribir puntos ni guiones.

/** 12345678K → 12.345.678-K. Tolera cualquier basura de entrada. */
export function fmtRut(v: string): string {
  const raw = String(v ?? "")
    .replace(/[^0-9kK]/g, "")
    .toUpperCase()
    .slice(0, 9);
  if (raw.length < 8) return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cuerpo = raw.slice(0, -1);
  const dv = raw.slice(-1);
  return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + dv;
}

/** Solo cuerpo + dígito verificador, sin puntos ni guion. */
export function rutLimpio(v: string): string {
  return String(v ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
}

/** Un RUT está completo cuando tiene cuerpo de 7-8 dígitos más el DV. */
export function rutCompleto(v: string): boolean {
  return rutLimpio(v).length >= 8;
}

/** Dígito verificador por módulo 11 — informativo, no bloquea el guardado. */
export function rutDvCorrecto(v: string): boolean {
  const raw = rutLimpio(v);
  if (raw.length < 8) return false;
  const cuerpo = raw.slice(0, -1);
  const dv = raw.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0;
  let mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === esperado;
}

/** Cualquier entrada → "+56 9 1234 5678". Descarta prefijos repetidos. */
export function fmtTel(v: string): string {
  const original = String(v ?? "");
  let d = original.replace(/\D/g, "");
  if (d.startsWith("569")) d = d.slice(3);
  else if (d.startsWith("56")) d = d.slice(2);
  else if (d.startsWith("9") && d.length > 8) d = d.slice(1);
  if (d === "9") d = "";
  d = d.slice(0, 8);
  if (!d) return original.trim() ? "+56 9 " : "";
  return "+56 9 " + d.slice(0, 4) + (d.length > 4 ? " " + d.slice(4) : "");
}

/** Un teléfono está completo con los 8 dígitos después del 9. */
export function telCompleto(v: string): boolean {
  const d = String(v ?? "").replace(/\D/g, "");
  const sinPrefijo = d.startsWith("569") ? d.slice(3) : d.startsWith("56") ? d.slice(2) : d;
  return sinPrefijo.length === 8;
}

/** URL de Google Maps para el botón "Ruta" del detalle de la visita. */
export function urlMapa(...partes: (string | null | undefined)[]): string {
  const q = partes.filter(Boolean).join(" ");
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
}

/** URL tel: para el botón "Llamar". */
export function urlTel(telefono: string | null | undefined): string {
  return "tel:" + String(telefono ?? "").replace(/[^+0-9]/g, "");
}
