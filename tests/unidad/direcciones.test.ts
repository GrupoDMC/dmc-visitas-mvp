import { describe, expect, it } from "vitest";
import { conMismaDireccion, normalizarDireccion } from "@/lib/ui/direcciones";

describe("normalizarDireccion", () => {
  it("ignora tildes, mayúsculas, puntuación y espacios de más", () => {
    expect(normalizarDireccion("Av. Vicuña  Mackenna #7110")).toBe("av vicuna mackenna 7110");
    expect(normalizarDireccion("av vicuna mackenna 7110")).toBe("av vicuna mackenna 7110");
  });
  it("una dirección vacía o solo de signos queda vacía", () => {
    expect(normalizarDireccion("  --  ")).toBe("");
    expect(normalizarDireccion("")).toBe("");
  });
});

describe("conMismaDireccion", () => {
  const tiendas = [
    { id: 1, direccion: "Av. Providencia 123", comuna: "Providencia" },
    { id: 2, direccion: "Av. Providencia 123", comuna: "Santiago" },
    { id: 3, direccion: "Los Leones 45", comuna: null },
  ];

  it("encuentra la misma dirección aunque esté escrita distinto", () => {
    expect(conMismaDireccion(tiendas, "AV PROVIDENCIA, 123", "providencia")?.id).toBe(1);
  });

  it("la misma calle y número en otra comuna es otro lugar", () => {
    expect(conMismaDireccion(tiendas, "Av. Providencia 123", "Santiago")?.id).toBe(2);
    expect(conMismaDireccion(tiendas, "Av. Providencia 123", "Ñuñoa")).toBeNull();
  });

  it("sin comuna en alguno de los lados, basta la dirección", () => {
    expect(conMismaDireccion(tiendas, "Los Leones 45", "Providencia")?.id).toBe(3);
    expect(conMismaDireccion(tiendas, "los leones 45")?.id).toBe(3);
  });

  it("una dirección vacía no coincide con nada", () => {
    expect(conMismaDireccion(tiendas, "   ")).toBeNull();
    expect(conMismaDireccion([], "Los Leones 45")).toBeNull();
  });
});
