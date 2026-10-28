import { describe, expect, it } from "vitest";
import { lineaDeLog } from "@/lib/log";

const AHORA = new Date("2026-01-01T12:00:00Z");

describe("lineaDeLog", () => {
  it("es JSON con marca de tiempo, nivel y contexto", () => {
    expect(JSON.parse(lineaDeLog("info", "login", {}, AHORA))).toEqual({
      ts: "2026-01-01T12:00:00.000Z",
      nivel: "info",
      contexto: "login",
    });
  });

  it("incluye el id del usuario solo si se conoce", () => {
    expect(JSON.parse(lineaDeLog("warn", "x", { usuarioId: 4 }, AHORA)).usuarioId).toBe(4);
    expect(JSON.parse(lineaDeLog("warn", "x", { usuarioId: null }, AHORA))).not.toHaveProperty("usuarioId");
  });

  it("serializa un Error sin volcar toda la pila", () => {
    const l = JSON.parse(lineaDeLog("error", "x", { err: new Error("boom") }, AHORA));
    expect(l.error.nombre).toBe("Error");
    expect(l.error.mensaje).toBe("boom");
    expect(l.error.pila.split("\n").length).toBeLessThanOrEqual(6);
  });

  it("no revienta con referencias circulares", () => {
    const a: Record<string, unknown> = {};
    a.a = a;
    expect(() => JSON.parse(lineaDeLog("info", "x", { a }, AHORA))).not.toThrow();
  });
});
