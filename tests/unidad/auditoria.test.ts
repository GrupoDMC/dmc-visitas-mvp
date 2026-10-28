import { describe, expect, it } from "vitest";
import { detalleParaAuditoria, diferencia } from "@/lib/data/auditoria";

describe("detalleParaAuditoria", () => {
  it("sin detalle, no guarda nada", () => {
    expect(detalleParaAuditoria(undefined)).toBeNull();
    expect(detalleParaAuditoria({})).toBeNull();
  });

  it("guarda JSON", () => {
    expect(JSON.parse(detalleParaAuditoria({ rol: "ADMIN", n: 2 })!)).toEqual({ rol: "ADMIN", n: 2 });
  });

  it("si no cabe en la columna, queda un JSON válido marcado como truncado", () => {
    const largo = detalleParaAuditoria({ permisos: Array(500).fill("visitas.ver") })!;
    expect(largo.length).toBeLessThanOrEqual(2000);
    expect(JSON.parse(largo).truncado).toBe(true);
  });

  it("referencias circulares no rompen", () => {
    const a: Record<string, unknown> = {};
    a.a = a;
    expect(JSON.parse(detalleParaAuditoria(a)!)).toEqual({ truncado: true });
  });
});

describe("diferencia", () => {
  it("separa lo agregado de lo quitado", () => {
    expect(diferencia(["a", "b"], ["b", "c"])).toEqual({ agregados: ["c"], quitados: ["a"] });
    expect(diferencia([], ["x"])).toEqual({ agregados: ["x"], quitados: [] });
    expect(diferencia(["x"], ["x"])).toEqual({ agregados: [], quitados: [] });
  });
});
