import { describe, expect, it } from "vitest";
import { dispositionAdjunto, nombreArchivoActa } from "@/lib/ui/nombre-acta";
import { extensionDe } from "@/lib/ui/descarga";

const v = (razonSocial: unknown, sucursal: unknown, extra: Record<string, unknown> = {}) =>
  ({ folio: "V-0123", cliente: { razonSocial, nombreFantasia: "Fantasía" }, sucursal: { nombre: sucursal }, ...extra }) as never;

describe("nombreArchivoActa (PDF del acta)", () => {
  it("arma «razón social - sucursal.pdf», sin el nombre de fantasía", () => {
    expect(nombreArchivoActa(v("Comercial Uno SpA", "Tienda Centro"))).toBe("Comercial Uno SpA - Tienda Centro.pdf");
  });

  it("deja la sucursal tal como se escribió, con sus mayúsculas", () => {
    expect(nombreArchivoActa(v("Empresa SpA", "LOCAL 12 Mall Norte"))).toBe("Empresa SpA - LOCAL 12 Mall Norte.pdf");
  });

  it("conserva tildes y ñ, en forma compuesta", () => {
    const nombre = nombreArchivoActa(v("Inversiones Peña Ltda.", "Ñuñoa Plaza Egaña".normalize("NFD")));
    expect(nombre).toBe("Inversiones Peña Ltda. - Ñuñoa Plaza Egaña.pdf");
    expect(nombre).toBe(nombre.normalize("NFC"));
  });

  it("quita los caracteres que Windows no admite y los saltos de línea", () => {
    const nombre = nombreArchivoActa(v('A|B*C "Uno"\\Dos', "Mall / Local: 3?<x>\r\nPiso\t2"));
    expect(nombre).toBe("A B C Uno Dos - Mall Local 3 x Piso 2.pdf");
    expect(nombre).not.toMatch(/[\/:*?"<>|\u0000-\u001f]/);
  });

  it("recorta los espacios de sobra", () => {
    expect(nombreArchivoActa(v("  Empresa   SpA ", "  Tienda    Sur  "))).toBe("Empresa SpA - Tienda Sur.pdf");
  });

  it("corta los nombres larguísimos a 150 caracteres + extensión, sin dejar punto ni guion al final", () => {
    const largo = nombreArchivoActa(v("x".repeat(400), "y"));
    expect(largo).toBe(`${"x".repeat(150)}.pdf`);
    const enElGuion = nombreArchivoActa(v("x".repeat(148), "y"));
    expect(enElGuion).toBe(`${"x".repeat(148)}.pdf`);
    // No parte un carácter fuera del plano básico en dos.
    const emoji = nombreArchivoActa(v("😀".repeat(200), "y"));
    expect(Array.from(emoji.slice(0, -4)).every((c) => c === "😀")).toBe(true);
  });

  it("sin razón social usa el nombre de fantasía", () => {
    expect(nombreArchivoActa(v("", "Tienda Centro"))).toBe("Fantasía - Tienda Centro.pdf");
    expect(nombreArchivoActa(v(null, "Tienda Centro"))).toBe("Fantasía - Tienda Centro.pdf");
  });

  it("con datos faltantes no deja «undefined» ni guiones sueltos", () => {
    expect(nombreArchivoActa(v("Empresa SpA", "   "))).toBe("Empresa SpA.pdf");
    expect(nombreArchivoActa(v("Empresa SpA", undefined))).toBe("Empresa SpA.pdf");
    expect(nombreArchivoActa({ folio: "V-9", sucursal: { nombre: "Tienda" } } as never)).toBe("Tienda.pdf");
    expect(nombreArchivoActa({ folio: "V-9" } as never)).toBe("Acta V-9.pdf");
    expect(nombreArchivoActa({} as never)).toBe("Acta.pdf");
    const soloProhibidos = { folio: "V-1", cliente: { razonSocial: "???", nombreFantasia: "|" }, sucursal: { nombre: "***" } };
    expect(nombreArchivoActa(soloProhibidos as never)).toBe("Acta V-1.pdf");
  });

  it("no produce un nombre reservado de Windows", () => {
    expect(nombreArchivoActa(v("CON", ""))).toBe("CON_.pdf");
  });
});

describe("dispositionAdjunto (Content-Disposition del PDF)", () => {
  it("lleva filename en ASCII y filename* en UTF-8", () => {
    expect(dispositionAdjunto("Peña SpA - Ñuñoa.pdf")).toBe(
      `attachment; filename="Pena SpA - Nunoa.pdf"; filename*=UTF-8''Pe%C3%B1a%20SpA%20-%20%C3%91u%C3%B1oa.pdf`
    );
  });
  it("el encabezado queda en ASCII imprimible, aunque el nombre traiga otros caracteres", () => {
    const d = dispositionAdjunto("Tienda (Sur) O'Higgins 😀.pdf");
    expect(d).toMatch(/^[\x20-\x7e]+$/);
    expect(d).toContain(`filename="Tienda (Sur) O'Higgins __.pdf"`);
    expect(d).toContain("filename*=UTF-8''Tienda%20%28Sur%29%20O%27Higgins%20%F0%9F%98%80.pdf");
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
