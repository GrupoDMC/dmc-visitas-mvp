import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { armarZip } from "@/lib/ui/zip";

const bytes = (t: string) => new TextEncoder().encode(t);

describe("armarZip (zip sin compresión armado en el navegador)", () => {
  it("genera un zip válido que una librería estándar sabe abrir, con nombres UTF-8", async () => {
    const blob = armarZip([
      { nombre: "Acta V-1 - Ñandú.pdf", bytes: bytes("%PDF uno") },
      { nombre: "otro.txt", bytes: bytes("hola") },
    ]);
    expect(blob.type).toBe("application/zip");

    const contenido = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(contenido).sort()).toEqual(["Acta V-1 - Ñandú.pdf", "otro.txt"]);
    expect(new TextDecoder().decode(contenido["otro.txt"])).toBe("hola");
    expect(new TextDecoder().decode(contenido["Acta V-1 - Ñandú.pdf"])).toBe("%PDF uno");
  });

  it("un zip vacío es válido", async () => {
    const blob = armarZip([]);
    expect(blob.size).toBe(22);
    expect(Object.keys(unzipSync(new Uint8Array(await blob.arrayBuffer())))).toEqual([]);
  });
});
