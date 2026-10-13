// Content-Security-Policy con nonce (ver la guía de CSP de Next 15). El
// middleware genera un nonce por petición, lo pasa a Next por la cabecera
// `x-nonce` de la petición y publica la política en la respuesta.
//
// Por ahora se publica como Report-Only: el navegador no bloquea nada, solo
// avisa a /api/csp-reporte. Cuando los logs salgan limpios se cambia
// CSP_CABECERA a "Content-Security-Policy".

export const CSP_CABECERA = "Content-Security-Policy-Report-Only";
export const CSP_RUTA_REPORTE = "/api/csp-reporte";

export function generarNonce(): string {
  return btoa(crypto.randomUUID());
}

export function construirCsp(nonce: string, dev: boolean): string {
  const directivas = [
    "default-src 'self'",
    // 'strict-dynamic' deja cargar los chunks que cuelgan de los scripts con
    // nonce; React necesita 'unsafe-eval' solo en desarrollo.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Los atributos style de React (style={{...}}) no admiten nonce, y Tailwind
    // v4 sale en una hoja propia: 'unsafe-inline' cubre los primeros. Con nonce
    // en la lista el navegador ignoraría 'unsafe-inline', por eso no va.
    "style-src 'self' 'unsafe-inline'",
    // Fotos y firma salen de canvas (data:) y de URLs de objeto (blob:).
    "img-src 'self' data: blob:",
    // Previsualización del video grabado con getUserMedia.
    "media-src 'self' blob: mediastream:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `report-uri ${CSP_RUTA_REPORTE}`,
  ];
  return directivas.join("; ");
}
