import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { mediosDelActa } from "@/lib/ui/medios-acta";
import { nombreArchivoActa, nombreCarpetaLocal, nombresSinColision } from "@/lib/ui/nombre-acta";
import { armarZip } from "@/lib/ui/zip";
import { NOMBRE_CONSTANCIA, armarArchivosZip, bajarCompleto, reunirActas } from "@/lib/ui/zip-actas";

const bytes = (t: string) => new TextEncoder().encode(t);
const texto = (b: Uint8Array) => new TextDecoder().decode(b);
const visita = (razon: unknown, sucursal: unknown, folio = "V-1") =>
  ({ folio, cliente: { razonSocial: razon, nombreFantasia: "Fantasía" }, sucursal: { nombre: sucursal } }) as never;

async function abrir(archivos: ReturnType<typeof armarArchivosZip>) {
  return unzipSync(new Uint8Array(await armarZip(archivos).arrayBuffer()));
}

describe("estructura del .zip de actas", () => {
  it("una carpeta por local con el PDF (razón social - sucursal) y sus medios", async () => {
    const zip = await abrir(
      armarArchivosZip([
        {
          visita: visita("Comercial Uno SpA", "Tienda Centro"),
          pdf: bytes("%PDF a"),
          medios: [
            { nombre: "Foto 1.jpg", bytes: bytes("f1") },
            { nombre: "Video 1.mp4", bytes: bytes("v1") },
          ],
        },
        { visita: visita("Empresa Ñandú Ltda.", "Ñuñoa Plaza", "V-2"), pdf: bytes("%PDF b"), medios: [] },
      ])
    );
    expect(Object.keys(zip).sort()).toEqual([
      "Tienda Centro/Comercial Uno SpA - Tienda Centro.pdf",
      "Tienda Centro/Multimedia Comercial Uno SpA Tienda Centro/Foto 1.jpg",
      "Tienda Centro/Multimedia Comercial Uno SpA Tienda Centro/Video 1.mp4",
      "Ñuñoa Plaza/Empresa Ñandú Ltda. - Ñuñoa Plaza.pdf",
    ]);
    expect(texto(zip["Tienda Centro/Multimedia Comercial Uno SpA Tienda Centro/Video 1.mp4"])).toBe("v1");
    expect(texto(zip["Ñuñoa Plaza/Empresa Ñandú Ltda. - Ñuñoa Plaza.pdf"])).toBe("%PDF b");
  });

  it("el PDF lleva el mismo nombre que la descarga individual", () => {
    const v = visita("Comercial Uno SpA", "Tienda Centro");
    const [pdf] = armarArchivosZip([{ visita: v, pdf: bytes("x"), medios: [] }]);
    expect(pdf.nombre).toBe(`${nombreCarpetaLocal(v)}/${nombreArchivoActa(v)}`);
  });

  it("un acta sin multimedia lleva solo el PDF y sin constancia si nada falló", async () => {
    const zip = await abrir(armarArchivosZip([{ visita: visita("Empresa", "Sur"), pdf: bytes("p"), medios: [] }]));
    expect(Object.keys(zip)).toEqual(["Sur/Empresa - Sur.pdf"]);
  });

  it("dos locales con el mismo nombre (aunque cambie la mayúscula) reciben (2), (3)", async () => {
    const zip = await abrir(
      armarArchivosZip([
        { visita: visita("A", "Local", "V-1"), pdf: bytes("1"), medios: [] },
        { visita: visita("A", "LOCAL", "V-2"), pdf: bytes("2"), medios: [] },
        { visita: visita("A", "local", "V-3"), pdf: bytes("3"), medios: [] },
      ])
    );
    expect(Object.keys(zip).sort()).toEqual(["LOCAL (3)/A - LOCAL.pdf", "Local (2)/A - Local.pdf", "local/A - local.pdf"]);
    // Se numera en el orden en que quedan ordenadas las carpetas, no en el de llegada.
    expect(texto(zip["local/A - local.pdf"])).toBe("3");
  });

  it("los medios con el mismo nombre no se pisan, ni siquiera con el PDF", async () => {
    const zip = await abrir(
      armarArchivosZip([
        {
          visita: visita("E", "S"),
          pdf: bytes("pdf"),
          medios: [
            { nombre: "Foto 1.jpg", bytes: bytes("a") },
            { nombre: "foto 1.JPG", bytes: bytes("b") },
            { nombre: "E - S.pdf", bytes: bytes("c") },
          ],
        },
      ])
    );
    // El PDF queda en la carpeta del local y los medios en la suya: el medio «E - S.pdf» no pisa al PDF.
    expect(Object.keys(zip).sort()).toEqual([
      "S/E - S.pdf",
      "S/Multimedia E S/E - S.pdf",
      "S/Multimedia E S/Foto 1.jpg",
      "S/Multimedia E S/foto 1 (2).JPG",
    ]);
    expect(texto(zip["S/E - S.pdf"])).toBe("pdf");
  });

  it("los caracteres prohibidos de Windows no llegan a ninguna carpeta ni archivo", async () => {
    const zip = await abrir(
      armarArchivosZip([{ visita: visita('A|B*C "Uno"', "Mall / Local: 3?<x>\\Piso"), pdf: bytes("p"), medios: [] }])
    );
    const [ruta] = Object.keys(zip);
    const partes = ruta.split("/");
    expect(Object.keys(zip)).toHaveLength(1);
    expect(partes[0]).toBe("Mall Local 3 x Piso");
    for (const parte of partes) expect(parte).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("la carpeta usa la sucursal tal cual y cae al nombre del PDF si no tiene", () => {
    expect(nombreCarpetaLocal(visita("Empresa", "  Ñuñoa   Plaza  "))).toBe("Ñuñoa Plaza");
    expect(nombreCarpetaLocal(visita("Empresa", "   "))).toBe("Empresa");
    expect(nombreCarpetaLocal(visita("", "CON"))).toBe("CON_");
    expect(Array.from(nombreCarpetaLocal(visita("e", "x".repeat(400)))).length).toBeLessThanOrEqual(100);
  });

  it("las carpetas salen ordenadas por local y los nombres conservan tildes y ñ", async () => {
    const zip = await abrir(
      armarArchivosZip([
        { visita: visita("A", "Zeta", "V-1"), pdf: bytes("1"), medios: [] },
        { visita: visita("A", "Ágora", "V-2"), pdf: bytes("2"), medios: [] },
      ])
    );
    expect(Object.keys(zip)).toEqual(["Ágora/A - Ágora.pdf", "Zeta/A - Zeta.pdf"]);
  });

  it("cada local deja su multimedia en «Multimedia razón social local», también con locales repetidos", async () => {
    const m = [{ nombre: "Foto 1.jpg", bytes: bytes("f") }];
    const zip = await abrir(
      armarArchivosZip([
        { visita: visita("Empresa Ñandú", "Local", "V-1"), pdf: bytes("1"), medios: m },
        { visita: visita("Empresa Ñandú", "Local", "V-2"), pdf: bytes("2"), medios: m },
      ])
    );
    expect(Object.keys(zip).sort()).toEqual([
      "Local (2)/Empresa Ñandú - Local.pdf",
      "Local (2)/Multimedia Empresa Ñandú Local/Foto 1.jpg",
      "Local/Empresa Ñandú - Local.pdf",
      "Local/Multimedia Empresa Ñandú Local/Foto 1.jpg",
    ]);
  });

  it("deja constancia de lo que no se pudo incluir", async () => {
    const zip = await abrir(
      armarArchivosZip([{ visita: visita("E", "S"), pdf: bytes("p"), medios: [] }], ["V-1 (S) / Video 1.mp4: no se pudo descargar (HTTP 500)."])
    );
    expect(Object.keys(zip).sort()).toEqual([NOMBRE_CONSTANCIA, "S/E - S.pdf"].sort());
    expect(texto(zip[NOMBRE_CONSTANCIA])).toContain("Video 1.mp4");
  });

  it("nombresSinColision respeta la extensión", () => {
    expect(nombresSinColision(["a.jpg", "A.jpg", "a.jpg"], true)).toEqual(["a.jpg", "A (2).jpg", "a (3).jpg"]);
    expect(nombresSinColision(["x.y", "x.y"])).toEqual(["x.y", "x.y (2)"]);
  });
});

describe("mediosDelActa", () => {
  const foto = (id: number, interno = false) => ({ id, interno, archivoUrl: `/api/visita/foto/${id}` });
  const video = (id: number, interno = false) => ({ id, interno, archivoUrl: `/api/visita/video/${id}`, mime: "video/quicktime", bytes: 10 });
  const adjunto = (id: number, nombre: string | null, tipo = "FOTO") => ({
    id, tipo, nombre, mime: tipo === "FOTO" ? "image/png" : "video/mp4", bytes: 5, duracionSeg: null, url: `/api/visita/adjunto/${id}`,
  });

  it("junta fotos, videos y adjuntos con nombres ordenados, sin los internos", () => {
    const medios = mediosDelActa({
      fotos: [foto(1), foto(2, true), foto(3)],
      videos: [video(7), video(8, true)],
      adjuntos: [adjunto(20, "plano"), adjunto(21, "plano.png"), adjunto(22, null, "VIDEO")],
    } as never);
    expect(medios.map((m) => m.nombre)).toEqual([
      "Foto 1.jpg",
      "Foto 2.jpg",
      "Video 1.mov",
      "Trabajo - plano.png",
      "Trabajo - plano (2).png",
      "Trabajo - video 3.mp4",
    ]);
    expect(medios[1].url).toBe("/api/visita/foto/3");
  });

  it("un acta sin nada devuelve lista vacía", () => {
    expect(mediosDelActa({} as never)).toEqual([]);
  });
});

describe("bajarCompleto (rutas por tramos de 2 MB)", () => {
  const contenido = Uint8Array.from({ length: 25 }, (_, i) => i);
  /** Un servidor que responde a lo Range con tramos de 10 bytes, como la ruta real. */
  const servidor = (peticiones: string[] = []) => async (_url: string, init?: RequestInit) => {
    const rango = new Headers(init?.headers).get("Range") ?? "";
    peticiones.push(rango);
    const desde = Number(/bytes=(\d+)-/.exec(rango)?.[1] ?? 0);
    const hasta = Math.min(desde + 9, contenido.length - 1);
    return new Response(contenido.slice(desde, hasta + 1), {
      status: 206,
      headers: { "Content-Range": `bytes ${desde}-${hasta}/${contenido.length}` },
    });
  };

  it("pide tramo a tramo hasta completar y devuelve el archivo entero", async () => {
    const pedidos: string[] = [];
    const salida = await bajarCompleto("/x", servidor(pedidos));
    expect(Array.from(salida)).toEqual(Array.from(contenido));
    expect(pedidos).toEqual(["bytes=0-", "bytes=10-", "bytes=20-"]);
  });

  it("acepta una respuesta 200 completa (las fotos)", async () => {
    const salida = await bajarCompleto("/foto", async () => new Response(contenido, { status: 200 }));
    expect(salida).toHaveLength(25);
  });

  it("falla si el servidor corta a mitad o el archivo supera el tope", async () => {
    let n = 0;
    const cortado = async () =>
      n++ === 0
        ? new Response(contenido.slice(0, 10), { status: 206, headers: { "Content-Range": "bytes 0-9/25" } })
        : new Response("x", { status: 500 });
    await expect(bajarCompleto("/x", cortado)).rejects.toThrow();
    await expect(bajarCompleto("/x", servidor(), 20)).rejects.toThrow(/tope/);
  });
});

describe("reunirActas", () => {
  const medios = (...nombres: string[]) => nombres.map((n) => ({ url: `/m/${n}`, nombre: n, bytes: 3 }));

  /** Un fetch falso: PDF por folio, lista de medios por folio y cada medio por su ruta. */
  function falso(opciones: { pdfCae?: string[]; listaCae?: string[]; medioCae?: string[]; porFolio: Record<string, string[]> }) {
    return async (url: string) => {
      const acta = /\/acta\/([^/]+)$/.exec(url)?.[1];
      const lista = /\/medios\/([^/]+)$/.exec(url)?.[1];
      if (acta) return opciones.pdfCae?.includes(acta) ? new Response("", { status: 500 }) : new Response(`pdf ${acta}`);
      if (lista) {
        return opciones.listaCae?.includes(lista)
          ? new Response("", { status: 500 })
          : Response.json({ medios: medios(...(opciones.porFolio[lista] ?? [])) });
      }
      const nombre = url.split("/").pop()!;
      return opciones.medioCae?.includes(nombre) ? new Response("", { status: 500 }) : new Response("xyz");
    };
  }

  it("arma cada acta con su PDF y sus medios, en el orden pedido", async () => {
    const r = await reunirActas([visita("A", "L1", "V-1"), visita("A", "L2", "V-2")] as never[], {
      peticion: falso({ porFolio: { "V-1": ["Foto 1.jpg", "Video 1.mp4"], "V-2": [] } }),
    });
    expect(r.fallidas).toEqual([]);
    expect(r.incidencias).toEqual([]);
    expect(r.actas.map((a) => a.medios.map((m) => m.nombre))).toEqual([["Foto 1.jpg", "Video 1.mp4"], []]);
    expect(texto(r.actas[0].medios[1].bytes)).toBe("xyz");
  });

  it("un medio o una lista que falla no tumba el zip: se anota y se sigue", async () => {
    const r = await reunirActas([visita("A", "L1", "V-1"), visita("A", "L2", "V-2"), visita("A", "L3", "V-3")] as never[], {
      peticion: falso({ medioCae: ["Video 1.mp4"], listaCae: ["V-2"], pdfCae: ["V-3"], porFolio: { "V-1": ["Foto 1.jpg", "Video 1.mp4"] } }),
    });
    expect(r.fallidas).toEqual(["V-3"]);
    expect(r.actas.map((a) => a.visita.folio)).toEqual(["V-1", "V-2"]);
    expect(r.actas[0].medios.map((m) => m.nombre)).toEqual(["Foto 1.jpg"]);
    expect(r.incidencias).toHaveLength(2);
    expect(r.incidencias.join("\n")).toMatch(/Video 1\.mp4/);
    expect(r.incidencias.join("\n")).toMatch(/lista de fotos y videos/);

    const zip = await abrir(armarArchivosZip(r.actas, r.incidencias));
    expect(Object.keys(zip)).toContain(NOMBRE_CONSTANCIA);
  });

  it("no pasa del tope de tamaño: lo que sobra se anota", async () => {
    const r = await reunirActas([visita("A", "L1", "V-1")] as never[], {
      peticion: falso({ porFolio: { "V-1": ["a.jpg", "b.jpg", "c.jpg"] } }),
      topeBytes: 7, // cada medio declara 3 bytes: caben dos
      simultaneas: 1,
    });
    expect(r.actas[0].medios.map((m) => m.nombre)).toEqual(["a.jpg", "b.jpg"]);
    expect(r.incidencias).toEqual([expect.stringContaining("c.jpg")]);
  });
});
