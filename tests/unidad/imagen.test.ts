import { describe, expect, it } from "vitest";
import { MAX_BYTES_IMAGEN, decodificarImagen, mimeDeImagen } from "@/lib/imagen";

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 0, 0, 0]), Buffer.from("WEBP"), Buffer.from("VP8 ")]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const url = (b: Buffer, mime = "image/jpeg") => `data:${mime};base64,${b.toString("base64")}`;

describe("mimeDeImagen", () => {
  it("detecta JPEG, PNG y WebP por sus primeros bytes", () => {
    expect(mimeDeImagen(JPG)).toBe("image/jpeg");
    expect(mimeDeImagen(PNG)).toBe("image/png");
    expect(mimeDeImagen(WEBP)).toBe("image/webp");
  });

  it("rechaza SVG, GIF, HTML y vacío", () => {
    expect(mimeDeImagen(SVG)).toBeNull();
    expect(mimeDeImagen(Buffer.from("GIF89a....."))).toBeNull();
    expect(mimeDeImagen(Buffer.from("<html></html>"))).toBeNull();
    expect(mimeDeImagen(Buffer.alloc(0))).toBeNull();
  });

  it("exige la firma completa: un RIFF que no es WEBP no vale", () => {
    expect(mimeDeImagen(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE")]))).toBeNull();
    expect(mimeDeImagen(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});

describe("decodificarImagen", () => {
  it("decodifica una data URL válida", () => {
    const r = decodificarImagen(url(PNG, "image/png"));
    expect(r?.mime).toBe("image/png");
    expect(r?.bytes.equals(PNG)).toBe(true);
  });

  it("el tipo sale de los bytes, no de lo que declara la data URL", () => {
    expect(decodificarImagen(url(PNG, "image/jpeg"))?.mime).toBe("image/png");
  });

  it("rechaza SVG aunque se declare como imagen", () => {
    expect(decodificarImagen(url(SVG, "image/svg+xml"))).toBeNull();
    expect(decodificarImagen(url(SVG, "image/png"))).toBeNull();
  });

  it("rechaza lo que no es una data URL de imagen en base64", () => {
    expect(decodificarImagen("")).toBeNull();
    expect(decodificarImagen("hola")).toBeNull();
    expect(decodificarImagen("data:text/html;base64,PGh0bWw+")).toBeNull();
    expect(decodificarImagen(`data:image/png;charset=utf8,${PNG.toString("hex")}`)).toBeNull();
    expect(decodificarImagen(undefined as unknown as string)).toBeNull();
  });

  it("tolera espacios y saltos de línea dentro del base64", () => {
    const b64 = PNG.toString("base64");
    expect(decodificarImagen(`data:image/png;base64,${b64.slice(0, 4)}\n${b64.slice(4)}`)?.mime).toBe("image/png");
  });

  it("rechaza lo que pasa del tope", () => {
    const grande = Buffer.concat([JPG, Buffer.alloc(MAX_BYTES_IMAGEN)]);
    expect(decodificarImagen(url(grande))).toBeNull();
  });
});
