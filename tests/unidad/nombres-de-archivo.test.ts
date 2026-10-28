import { describe, expect, it } from "vitest";
import { nombreArchivoActa } from "@/lib/ui/nombre-acta";
import { extensionDe } from "@/lib/ui/descarga";

describe("nombreArchivoActa (PDF del acta)", () => {
  const visita = {
    folio: "V-0123",
    sucursal: { nombre: "Tienda Centro" },
    cliente: { nombreFantasia: "Cliente Uno" },
  } as never;

  it("arma «Acta folio - tienda - cliente.pdf»", () => {
    expect(nombreArchivoActa(visita)).toBe("Acta V-0123 - Tienda Centro - Cliente Uno.pdf");
  });

  it("quita los caracteres que Windows no admite en un nombre de archivo", () => {
    const v = { folio: "V-1", sucursal: { nombre: 'Mall "Plaza" / Local: 3?' }, cliente: { nombreFantasia: "A|B*C" } } as never;
    const nombre = nombreArchivoActa(v);
    expect(nombre).not.toMatch(/[\/:*?"<>|]/);
    expect(nombre.endsWith(".pdf")).toBe(true);
  });

  it("omite las partes que faltan sin dejar guiones colgando", () => {
    expect(nombreArchivoActa({ folio: "V-9" } as never)).toBe("Acta V-9.pdf");
    expect(nombreArchivoActa({ folio: "V-9", sucursal: { nombre: "  " }, cliente: { nombreFantasia: "X" } } as never)).toBe(
      "Acta V-9 - X.pdf"
    );
  });

  it("corta los nombres larguísimos a 150 caracteres + extensión", () => {
    const v = { folio: "V-1", sucursal: { nombre: "x".repeat(400) }, cliente: { nombreFantasia: "y" } } as never;
    expect(nombreArchivoActa(v).length).toBeLessThanOrEqual(154);
  });
});

describe("extensionDe (nombres de los archivos del zip)", () => {
  it("traduce los tipos MIME habituales", () => {
    expect(extensionDe("image/jpeg", "bin")).toBe("jpg");
    expect(extensionDe("image/png", "bin")).toBe("png");
    expect(extensionDe("video/mp4", "bin")).toBe("mp4");
    expect(extensionDe("video/quicktime", "bin")).toBe("mov");
    expect(extensionDe("video/webm;codecs=vp9", "bin")).toBe("webm");
  });
  it("cae en el valor por defecto si no hay tipo", () => {
    expect(extensionDe(null, "bin")).toBe("bin");
    expect(extensionDe("", "bin")).toBe("bin");
    expect(extensionDe("sinbarra", "bin")).toBe("bin");
  });
});
