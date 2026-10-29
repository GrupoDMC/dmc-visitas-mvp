import { describe, expect, it } from "vitest";
import {
  dispositionAdjunto,
  nombreArchivoActa,
  nombreMultimedia,
  nombreZipActas,
  nombreZipMultimedia,
} from "@/lib/ui/nombre-acta";
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

describe("nombres de las descargas de multimedia", () => {
  it("«Multimedia razón social local», con la sucursal tal como se escribió y sin el nombre de fantasía", () => {
    expect(nombreMultimedia(v("Comercial Peña SpA", "Tienda ÑANDÚ"))).toBe("Multimedia Comercial Peña SpA Tienda ÑANDÚ");
    expect(nombreZipMultimedia(v("Comercial Peña SpA", "Tienda Centro"))).toBe("Multimedia Comercial Peña SpA Tienda Centro.zip");
  });

  it("sanea para Windows y limita el largo", () => {
    expect(nombreMultimedia(v('A|B*C "Uno"', "Mall / Local: 3?"))).toBe("Multimedia A B C Uno Mall Local 3");
    const largo = nombreMultimedia(v("R".repeat(300), "S".repeat(300)));
    expect(Array.from(largo).length).toBeLessThanOrEqual(150);
  });

  it("con datos faltantes usa un respaldo sin «undefined»", () => {
    expect(nombreMultimedia(v("", "Sur"))).toBe("Multimedia Fantasía Sur");
    expect(nombreMultimedia(v("Empresa", undefined))).toBe("Multimedia Empresa");
    expect(nombreMultimedia({ folio: "V-9" } as never)).toBe("Multimedia V-9");
    expect(nombreMultimedia({} as never)).toBe("Multimedia");
    for (const n of [nombreZipMultimedia({} as never), nombreZipMultimedia(v(null, null))]) expect(n).not.toMatch(/undefined|null/);
  });

  it("el encabezado de descarga lleva el nombre ASCII y filename* UTF-8 con tildes y ñ", () => {
    const d = dispositionAdjunto(nombreZipMultimedia(v("Peña Ltda", "Ñuñoa")));
    expect(d).toContain('filename="Multimedia Pena Ltda Nunoa.zip"');
    expect(d).toContain("filename*=UTF-8''Multimedia%20Pe%C3%B1a%20Ltda%20%C3%91u%C3%B1oa.zip");
  });

  it("el zip de varias actas usa el cliente si es el mismo y solo la cuenta si no", () => {
    expect(nombreZipActas([v("Peña SpA", "A"), v("peña spa", "B"), v("Peña SpA", "C")])).toBe("Multimedia Peña SpA 3 locales.zip");
    expect(nombreZipActas([v("Uno", "A"), v("Dos", "B")])).toBe("Multimedia 2 locales.zip");
    expect(nombreZipActas([v("Uno", "A")])).toBe("Multimedia Uno A.zip");
    expect(nombreZipActas([v("R".repeat(400), "A"), v("R".repeat(400), "B")]).length).toBeLessThanOrEqual(160);
  });
});
