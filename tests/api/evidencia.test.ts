import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/visitas");
vi.mock("@/lib/data/videos");
vi.mock("@/lib/data/adjuntos");

import { GET as getFoto } from "@/app/api/visita/foto/[id]/route";
import { GET as getFirma } from "@/app/api/visita/firma/[id]/route";
import { GET as getVideo } from "@/app/api/visita/video/[id]/route";
import { GET as getAdjunto } from "@/app/api/visita/adjunto/[id]/route";
import { esEvidenciaDeEliminada, getDuenosDeImagen, getFirmaBinaria, getFotoBinaria } from "@/lib/data/visitas";
import { getDuenosDeVideo, getVideoMeta, getVideoTramo } from "@/lib/data/videos";
import { getAdjuntoMeta, getAdjuntoTramo, getDuenosDeAdjunto } from "@/lib/data/adjuntos";
import { TRAMO_MAXIMO } from "@/lib/rango-http";
import { TECNICO_PRUEBA, entrarComo, salir } from "../helpers/sesion";

const MIO = TECNICO_PRUEBA.id;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (rango?: string) => new Request("http://localhost/x", { headers: rango ? { range: rango } : {} });

beforeEach(() => {
  vi.resetAllMocks();
  salir();
});

describe.each([
  ["foto", getFoto, "foto", () => vi.mocked(getFotoBinaria), () => vi.mocked(getDuenosDeImagen)],
  ["firma", getFirma, "firma", () => vi.mocked(getFirmaBinaria), () => vi.mocked(getDuenosDeImagen)],
] as const)("GET /api/visita/%s/[id]", (_nombre, GET, tipo, binaria, duenos) => {
  const imagen = { bytes: Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]), mime: "image/jpeg" };

  beforeEach(() => {
    binaria().mockResolvedValue(imagen as never);
    duenos().mockResolvedValue([MIO] as never);
    vi.mocked(esEvidenciaDeEliminada).mockResolvedValue(false);
  });

  it("sin sesión → 401 y no toca la base", async () => {
    const r = await GET(req(), params("5"));
    expect(r.status).toBe(401);
    expect(binaria()).not.toHaveBeenCalled();
  });

  it.each(["0", "-3", "abc", "1.5", ""])("id inválido «%s» → 404", async (id) => {
    entrarComo("admin");
    expect((await GET(req(), params(id))).status).toBe(404);
    expect(binaria()).not.toHaveBeenCalled();
  });

  it("el panel ve cualquier imagen, con cabeceras de evidencia segura", async () => {
    entrarComo("coordinador");
    const r = await GET(req(), params("5"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("content-disposition")).toBe("inline");
    expect(r.headers.get("content-length")).toBe("6");
    expect(Buffer.from(await r.arrayBuffer())).toEqual(imagen.bytes);
  });

  it("un técnico solo ve las de sus propias visitas (lo demás es 404, no 403)", async () => {
    entrarComo("tecnico");
    expect((await GET(req(), params("5"))).status).toBe(200);
    expect(duenos()).toHaveBeenCalledWith(tipo, 5);
    duenos().mockResolvedValue([999] as never);
    expect((await GET(req(), params("5"))).status).toBe(404);
    duenos().mockResolvedValue([] as never);
    expect((await GET(req(), params("5"))).status).toBe(404);
  });

  it("la evidencia de una visita eliminada solo la ve el administrador", async () => {
    vi.mocked(esEvidenciaDeEliminada).mockResolvedValue(true);
    entrarComo("admin");
    expect((await GET(req(), params("5"))).status).toBe(200);
    entrarComo("coordinador");
    expect((await GET(req(), params("5"))).status).toBe(404);
    entrarComo("tecnico");
    expect((await GET(req(), params("5"))).status).toBe(404);
  });

  it("un mime fuera de la lista blanca se sirve como octet-stream (nunca como html ni svg)", async () => {
    entrarComo("admin");
    for (const peligroso of ["text/html", "image/svg+xml", "application/javascript"]) {
      binaria().mockResolvedValue({ ...imagen, mime: peligroso } as never);
      expect((await GET(req(), params("5"))).headers.get("content-type"), peligroso).toBe("application/octet-stream");
    }
  });

  it("una imagen que no existe → 404", async () => {
    entrarComo("admin");
    binaria().mockResolvedValue(null as never);
    expect((await GET(req(), params("5"))).status).toBe(404);
  });
});

describe("GET /api/visita/video/[id] (por rangos)", () => {
  const TOTAL = 5 * 1024 * 1024;
  const clip = (n: number) => Buffer.alloc(n, 7);

  beforeEach(() => {
    entrarComo("admin");
    vi.mocked(getVideoMeta).mockResolvedValue({ mime: "video/mp4", total: TOTAL } as never);
    vi.mocked(getVideoTramo).mockImplementation((async (_id: number, desde: number, hasta: number) => clip(hasta - desde + 1)) as never);
    vi.mocked(esEvidenciaDeEliminada).mockResolvedValue(false);
    vi.mocked(getDuenosDeVideo).mockResolvedValue([MIO] as never);
  });

  it("sin sesión → 401; id inválido → 404", async () => {
    salir();
    expect((await getVideo(req(), params("5"))).status).toBe(401);
    entrarComo("admin");
    expect((await getVideo(req(), params("0"))).status).toBe(404);
  });

  it("sin cabecera Range entrega el primer tramo (máx. 2 MB) como 206, nunca el clip entero", async () => {
    const r = await getVideo(req(), params("5"));
    expect(r.status).toBe(206);
    expect(r.headers.get("content-length")).toBe(String(TRAMO_MAXIMO));
    expect(r.headers.get("content-range")).toBe(`bytes 0-${TRAMO_MAXIMO - 1}/${TOTAL}`);
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(getVideoTramo).toHaveBeenCalledWith(5, 0, TRAMO_MAXIMO - 1);
  });

  it("un clip chico sale completo con 200", async () => {
    vi.mocked(getVideoMeta).mockResolvedValue({ mime: "video/mp4", total: 1000 } as never);
    const r = await getVideo(req(), params("5"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-range")).toBeNull();
    expect(r.headers.get("content-length")).toBe("1000");
  });

  it("un rango explícito responde 206 con su Content-Range", async () => {
    const r = await getVideo(req("bytes=100-199"), params("5"));
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe(`bytes 100-199/${TOTAL}`);
    expect(r.headers.get("content-length")).toBe("100");
  });

  it("un rango fuera del archivo → 416 con el largo real", async () => {
    const r = await getVideo(req(`bytes=${TOTAL + 10}-`), params("5"));
    expect(r.status).toBe(416);
    expect(r.headers.get("content-range")).toBe(`bytes */${TOTAL}`);
    expect(getVideoTramo).not.toHaveBeenCalled();
  });

  it("un técnico solo ve los clips de sus visitas", async () => {
    entrarComo("tecnico");
    expect((await getVideo(req(), params("5"))).status).toBe(206);
    vi.mocked(getDuenosDeVideo).mockResolvedValue([999] as never);
    expect((await getVideo(req(), params("5"))).status).toBe(404);
  });

  it("clip de una visita eliminada: solo el administrador", async () => {
    vi.mocked(esEvidenciaDeEliminada).mockResolvedValue(true);
    expect((await getVideo(req(), params("5"))).status).toBe(206);
    entrarComo("coordinador");
    expect((await getVideo(req(), params("5"))).status).toBe(404);
  });

  it("clip inexistente o vacío → 404; mime raro → octet-stream", async () => {
    vi.mocked(getVideoMeta).mockResolvedValueOnce(null as never);
    expect((await getVideo(req(), params("5"))).status).toBe(404);
    vi.mocked(getVideoMeta).mockResolvedValueOnce({ mime: "video/mp4", total: 0 } as never);
    expect((await getVideo(req(), params("5"))).status).toBe(404);
    vi.mocked(getVideoMeta).mockResolvedValueOnce({ mime: "text/html", total: 100 } as never);
    expect((await getVideo(req(), params("5"))).headers.get("content-type")).toBe("application/octet-stream");
  });
});

describe("GET /api/visita/adjunto/[id]", () => {
  const dueno = (extra: Record<string, unknown> = {}) => ({ tecnicos: [MIO], visitaActiva: true, ...extra });

  beforeEach(() => {
    entrarComo("admin");
    vi.mocked(getDuenosDeAdjunto).mockResolvedValue(dueno() as never);
    vi.mocked(getAdjuntoMeta).mockResolvedValue({ mime: "image/png", tipo: "FOTO", total: 500 } as never);
    vi.mocked(getAdjuntoTramo).mockImplementation((async (_i: number, d: number, h: number) => Buffer.alloc(h - d + 1, 1)) as never);
  });

  it("exige sesión y un id válido", async () => {
    salir();
    expect((await getAdjunto(req(), params("5"))).status).toBe(401);
    entrarComo("admin");
    expect((await getAdjunto(req(), params("x"))).status).toBe(404);
  });

  it("una foto cabe en un tramo y sale con 200", async () => {
    const r = await getAdjunto(req(), params("5"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("content-length")).toBe("500");
  });

  it("un video grande sale por tramos", async () => {
    vi.mocked(getAdjuntoMeta).mockResolvedValue({ mime: "video/webm", tipo: "VIDEO", total: 9_000_000 } as never);
    const r = await getAdjunto(req("bytes=0-"), params("5"));
    expect(r.status).toBe(206);
    expect(r.headers.get("content-length")).toBe(String(TRAMO_MAXIMO));
  });

  it("un técnico ajeno recibe 404; uno de la visita recibe el archivo", async () => {
    entrarComo("tecnico");
    expect((await getAdjunto(req(), params("5"))).status).toBe(200);
    vi.mocked(getDuenosDeAdjunto).mockResolvedValue(dueno({ tecnicos: [999] }) as never);
    expect((await getAdjunto(req(), params("5"))).status).toBe(404);
  });

  it("los de una visita eliminada solo los ve el administrador", async () => {
    vi.mocked(getDuenosDeAdjunto).mockResolvedValue(dueno({ visitaActiva: false }) as never);
    expect((await getAdjunto(req(), params("5"))).status).toBe(200);
    entrarComo("coordinador");
    expect((await getAdjunto(req(), params("5"))).status).toBe(404);
  });

  it("adjunto inexistente → 404; rango inválido → 416", async () => {
    vi.mocked(getDuenosDeAdjunto).mockResolvedValueOnce(null as never);
    expect((await getAdjunto(req(), params("5"))).status).toBe(404);
    expect((await getAdjunto(req("bytes=9999-"), params("5"))).status).toBe(416);
  });
});
