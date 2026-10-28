import { describe, expect, it } from "vitest";
import { CSP_CABECERA, CSP_RUTA_REPORTE, construirCsp, generarNonce } from "@/lib/csp";

describe("Content-Security-Policy", () => {
  it("el nonce es distinto en cada petición y viene en base64", () => {
    const a = generarNonce();
    const b = generarNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("la política lleva el nonce en script-src y las restricciones de base", () => {
    const csp = construirCsp("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain(`report-uri ${CSP_RUTA_REPORTE}`);
  });

  it("'unsafe-eval' solo existe en desarrollo", () => {
    expect(construirCsp("n", true)).toContain("'unsafe-eval'");
    expect(construirCsp("n", false)).not.toContain("'unsafe-eval'");
  });

  it("permite lo que el acta móvil necesita: fotos de canvas y video de la cámara", () => {
    const csp = construirCsp("n", false);
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("media-src 'self' blob: mediastream:");
  });

  it("por ahora se publica solo como Report-Only", () => {
    expect(CSP_CABECERA).toBe("Content-Security-Policy-Report-Only");
  });
});
