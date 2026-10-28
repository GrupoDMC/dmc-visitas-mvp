import { describe, expect, it } from "vitest";
import { TRAMO_MAXIMO, leerRango } from "@/lib/rango-http";

const MB = 1024 * 1024;

describe("leerRango", () => {
  it("sin cabecera o ilegible: null (se ignora)", () => {
    expect(leerRango(null, 1000)).toBeNull();
    expect(leerRango("", 1000)).toBeNull();
    expect(leerRango("items=0-10", 1000)).toBeNull();
    expect(leerRango("bytes=0-10,20-30", 1000)).toBeNull();
    expect(leerRango("bytes=-", 1000)).toBeNull();
    expect(leerRango("bytes=a-b", 1000)).toBeNull();
  });

  it("rango cerrado", () => {
    expect(leerRango("bytes=0-99", 1000)).toEqual({ desde: 0, hasta: 99 });
    expect(leerRango(" bytes=100-199 ", 1000)).toEqual({ desde: 100, hasta: 199 });
  });

  it("recorta el final al tamaño del archivo", () => {
    expect(leerRango("bytes=900-5000", 1000)).toEqual({ desde: 900, hasta: 999 });
  });

  it("rango abierto: hasta el final, pero nunca más de TRAMO_MAXIMO", () => {
    expect(leerRango("bytes=500-", 1000)).toEqual({ desde: 500, hasta: 999 });
    expect(leerRango("bytes=0-", 11 * MB)).toEqual({ desde: 0, hasta: TRAMO_MAXIMO - 1 });
  });

  it("también recorta un rango cerrado más grande que el tramo máximo", () => {
    expect(leerRango(`bytes=1000-${10 * MB}`, 11 * MB)).toEqual({ desde: 1000, hasta: 1000 + TRAMO_MAXIMO - 1 });
  });

  it("sufijo: los últimos N bytes", () => {
    expect(leerRango("bytes=-500", 1000)).toEqual({ desde: 500, hasta: 999 });
    expect(leerRango("bytes=-5000", 1000)).toEqual({ desde: 0, hasta: 999 });
    expect(leerRango("bytes=-0", 1000)).toBe("invalido");
  });

  it("fuera del archivo o invertido: inválido (416)", () => {
    expect(leerRango("bytes=1000-", 1000)).toBe("invalido");
    expect(leerRango("bytes=2000-3000", 1000)).toBe("invalido");
    expect(leerRango("bytes=50-10", 1000)).toBe("invalido");
    expect(leerRango("bytes=0-10", 0)).toBe("invalido");
    expect(leerRango("bytes=99999999999999999999-", 1000)).toBe("invalido");
  });
});
