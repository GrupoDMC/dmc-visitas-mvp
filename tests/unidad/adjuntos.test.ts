import { describe, expect, it, vi } from "vitest";

// La capa de datos abre el pool al importarse; acá solo se prueban las reglas puras.
vi.mock("@/lib/data/sql", () => ({ consultaCon: vi.fn(), ejecutar: vi.fn(), num: Number, numONull: (v: unknown) => (v == null ? null : Number(v)), sql: {} }));

import { firmaDeFotoValida, firmaDeVideoValida, motivoRechazoAdjunto } from "@/lib/data/adjuntos";

describe("adjuntos del trabajo", () => {
  it("reconoce JPEG, PNG y WebP por su cabecera", () => {
    expect(firmaDeFotoValida(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(firmaDeFotoValida(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(true);
    expect(firmaDeFotoValida(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1"))).toBe(true);
    expect(firmaDeFotoValida(Buffer.from("<script>alert(1)</script>"))).toBe(false);
  });

  it("reconoce mp4 y webm por su cabecera", () => {
    expect(firmaDeVideoValida(Buffer.from("\0\0\0\x18ftypmp42", "latin1"))).toBe(true);
    expect(firmaDeVideoValida(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))).toBe(true);
    expect(firmaDeVideoValida(Buffer.from("no es un video"))).toBe(false);
  });

  it("rechaza lo que la base no aceptaría", () => {
    const ok = { tipo: "FOTO", mime: "image/jpeg", bytes: 1000 } as const;
    expect(motivoRechazoAdjunto(ok)).toBeNull();
    expect(motivoRechazoAdjunto({ ...ok, mime: "image/gif" })).not.toBeNull();
    expect(motivoRechazoAdjunto({ ...ok, mime: "video/mp4" })).not.toBeNull();
    expect(motivoRechazoAdjunto({ ...ok, bytes: 26 * 1024 * 1024 })).not.toBeNull();
    expect(motivoRechazoAdjunto({ tipo: "VIDEO", mime: "video/webm", bytes: 5000, duracionSeg: 61 })).not.toBeNull();
    expect(motivoRechazoAdjunto({ tipo: "VIDEO", mime: "video/webm", bytes: 5000, duracionSeg: 60 })).toBeNull();
  });
});
