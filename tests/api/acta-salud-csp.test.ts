import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/visitas");
vi.mock("@/lib/data/catalogos");
vi.mock("@/lib/pdf/acta", () => ({ generarPdfActa: vi.fn() }));
// La ruta de salud necesita un pool que responda: aquí es un pool de mentira.
const consultaFalsa = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/pool", () => ({
  getPool: vi.fn(async () => ({ request: () => ({ query: consultaFalsa }) })),
}));

import { GET as getActa } from "@/app/api/visita/acta/[folio]/route";
import { GET as getSalud } from "@/app/api/salud/route";
import { POST as postSesion } from "@/app/api/sesion/route";
import { POST as postCsp } from "@/app/api/csp-reporte/route";
import { getFirmaBinaria, getFotoBinaria, getVisitaCompletaPorFolio } from "@/lib/data/visitas";
import { listarMotivos, listarProblemas, listarTrabajos } from "@/lib/data/catalogos";
import { generarPdfActa } from "@/lib/pdf/acta";
import { getPool } from "@/lib/db/pool";
import { log } from "@/lib/log";
import { VERSION_ESQUEMA } from "@/lib/data/esquema";
import { TECNICO_PRUEBA, entrarComo, salir } from "../helpers/sesion";

const MIO = TECNICO_PRUEBA.id;
const params = (folio: string) => ({ params: Promise.resolve({ folio }) });
const peticion = () => new Request("http://localhost/api/visita/acta/V-1");

describe("GET /api/visita/acta/[folio] (PDF del acta)", () => {
  const visita = (extra: Record<string, unknown> = {}) => ({
    folio: "V-1",
    estado: "COMPLETADA",
    tecnicoId: MIO,
    tecnicoAyudanteId: null,
    sucursal: { nombre: "Tienda Ñandú" },
    cliente: { razonSocial: "Comercial Peña SpA", nombreFantasia: "Cliente Uno" },
    firmas: [{ id: 70, rol: "TIENDA" }],
    fotos: [
      { id: 1, interno: false, etiqueta: "Antes" },
      { id: 2, interno: true, etiqueta: "Interna" },
      { id: 3, interno: false, etiqueta: "Después" },
    ],
    ...extra,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    salir();
    entrarComo("admin");
    vi.mocked(getVisitaCompletaPorFolio).mockResolvedValue(visita() as never);
    vi.mocked(listarMotivos).mockResolvedValue([] as never);
    vi.mocked(listarTrabajos).mockResolvedValue([] as never);
    vi.mocked(listarProblemas).mockResolvedValue([] as never);
    vi.mocked(getFotoBinaria).mockImplementation((async (id: number) => ({ bytes: Buffer.from([id]), mime: "image/jpeg" })) as never);
    vi.mocked(getFirmaBinaria).mockResolvedValue({ bytes: Buffer.from([9]), mime: "image/png" } as never);
    vi.mocked(generarPdfActa).mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  });

  it("sin sesión → 401", async () => {
    salir();
    expect((await getActa(peticion(), params("V-1"))).status).toBe(401);
  });

  it("entrega el PDF con nombre de archivo seguro y sin caché", async () => {
    const r = await getActa(peticion(), params("V-1"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("content-length")).toBe("4");
    const disp = r.headers.get("content-disposition") ?? "";
    expect(disp).toContain("attachment");
    // Razón social + sucursal: en ASCII para los clientes viejos y en UTF-8 con la ñ.
    expect(disp).toContain('filename="Comercial Pena SpA - Tienda Nandu.pdf"');
    expect(disp).toContain(`filename*=UTF-8''${encodeURIComponent("Comercial Peña SpA - Tienda Ñandú.pdf")}`);
  });

  it("las fotos y clips INTERNOS no llegan al PDF que se manda al cliente", async () => {
    await getActa(peticion(), params("V-1"));
    const fotos = vi.mocked(generarPdfActa).mock.calls[0][0].fotos;
    expect(fotos.map((f) => f.etiqueta)).toEqual(["Antes", "Después"]);
    expect(getFotoBinaria).not.toHaveBeenCalledWith(2);
  });

  it("decodifica el folio de la URL", async () => {
    await getActa(peticion(), params("V%2D1"));
    expect(getVisitaCompletaPorFolio).toHaveBeenCalledWith("V-1");
  });

  it("folio inexistente → 404; acta aún abierta → 409", async () => {
    vi.mocked(getVisitaCompletaPorFolio).mockResolvedValueOnce(null as never);
    expect((await getActa(peticion(), params("V-9"))).status).toBe(404);
    vi.mocked(getVisitaCompletaPorFolio).mockResolvedValueOnce(visita({ estado: "EN_CURSO" }) as never);
    const r = await getActa(peticion(), params("V-1"));
    expect(r.status).toBe(409);
    expect(await r.text()).toBe("El acta todavía no está cerrada.");
  });

  it("el técnico solo baja las actas de sus visitas (404 en las ajenas)", async () => {
    entrarComo("tecnico");
    expect((await getActa(peticion(), params("V-1"))).status).toBe(200);
    vi.mocked(getVisitaCompletaPorFolio).mockResolvedValue(visita({ tecnicoId: 999 }) as never);
    expect((await getActa(peticion(), params("V-1"))).status).toBe(404);
  });

  it("si falla la generación, 500 sin detalles internos", async () => {
    vi.mocked(generarPdfActa).mockRejectedValue(new Error("fuente no encontrada C:\\secreto\\x.ttf"));
    const r = await getActa(peticion(), params("V-1"));
    expect(r.status).toBe(500);
    expect(await r.text()).toBe("No se pudo generar el PDF.");
  });
});

describe("POST /api/sesion (aviso de actividad)", () => {
  it("responde 204 sin cuerpo y sin caché", async () => {
    const r = await postSesion();
    expect(r.status).toBe(204);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});

describe("POST /api/csp-reporte (público)", () => {
  const cuerpo = (texto: string, extra: Record<string, string> = {}) =>
    new Request("http://localhost/api/csp-reporte", { method: "POST", body: texto, headers: extra });

  beforeEach(() => vi.clearAllMocks());

  it("registra el reporte y responde 204", async () => {
    const r = await postCsp(cuerpo(JSON.stringify({ "csp-report": { "blocked-uri": "https://x.test" } })));
    expect(r.status).toBe(204);
    expect(log.warn).toHaveBeenCalledWith("csp", { resumen: '{"blocked-uri":"https://x.test"}' });
  });

  it("un cuerpo que no es JSON se registra recortado", async () => {
    await postCsp(cuerpo("x".repeat(5000)));
    const { resumen } = vi.mocked(log.warn).mock.calls[0][1] as { resumen: string };
    expect(resumen.length).toBe(1500);
  });

  it("rechaza con 413 lo que declara más de 8 KB, y lo que lo supera aunque no lo declare", async () => {
    expect((await postCsp(cuerpo("x", { "content-length": "9000" }))).status).toBe(413);
    expect((await postCsp(cuerpo("y".repeat(9000)))).status).toBe(413);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("sin cuerpo responde 204 y no registra nada", async () => {
    const r = await postCsp(new Request("http://localhost/api/csp-reporte", { method: "POST" }));
    expect(r.status).toBe(204);
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe("GET /api/salud (diagnóstico protegido)", () => {
  const llamar = (token?: string) =>
    getSalud(new Request("http://localhost/api/salud", { headers: token ? { authorization: `Bearer ${token}` } : {} }) as never);
  const TOKEN = "token-de-prueba-0123456789";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    consultaFalsa.mockResolvedValue({ recordset: [{ motivos: 3, problemas: 4, trabajos: 5, esquema: VERSION_ESQUEMA }] });
  });

  it("sin HEALTHCHECK_TOKEN la ruta no existe (404), aunque manden un token", async () => {
    expect((await llamar(TOKEN)).status).toBe(404);
  });

  it("con token definido: sin cabecera o con un token malo → 401, y no consulta la base", async () => {
    vi.stubEnv("HEALTHCHECK_TOKEN", TOKEN);
    expect((await llamar()).status).toBe(401);
    expect((await llamar("otro")).status).toBe(401);
    expect((await llamar(TOKEN + "x")).status).toBe(401);
    expect(getPool).not.toHaveBeenCalled();
  });

  it("sin credenciales de SQL responde 503 sin revelar nada de la configuración", async () => {
    vi.stubEnv("HEALTHCHECK_TOKEN", TOKEN);
    const r = await llamar(TOKEN);
    expect(r.status).toBe(503);
    const cuerpoJson = await r.json();
    expect(cuerpoJson.ok).toBe(false);
    expect(JSON.stringify(cuerpoJson)).not.toMatch(/DB_SERVER|DB_PASSWORD/);
  });

  describe("con configuración de SQL (ficticia)", () => {
    beforeEach(() => {
      vi.stubEnv("HEALTHCHECK_TOKEN", TOKEN);
      vi.stubEnv("DB_SERVER", "servidor.ficticio.test");
      vi.stubEnv("DB_NAME", "base_ficticia");
      vi.stubEnv("DB_USER", "usuario_ficticio");
      vi.stubEnv("DB_PASSWORD", "clave-ficticia-que-no-debe-salir");
    });

    it("informa esquema y catálogo, y nunca la contraseña", async () => {
      const r = await llamar(TOKEN);
      expect(r.status).toBe(200);
      const j = await r.json();
      expect(j.ok).toBe(true);
      expect(j.esquema).toMatchObject({ version: VERSION_ESQUEMA, requerida: VERSION_ESQUEMA, alDia: true });
      expect(j.catalogo).toMatchObject({ motivos: 3, problemas: 4, trabajos: 5, listo: true });
      expect(JSON.stringify(j)).not.toContain("clave-ficticia");
      expect(JSON.stringify(j)).not.toContain("usuario_ficticio");
    });

    it("avisa si el esquema está atrasado o el catálogo vacío", async () => {
      consultaFalsa.mockResolvedValue({ recordset: [{ motivos: 0, problemas: 0, trabajos: 0, esquema: VERSION_ESQUEMA - 1 }] });
      const j = await (await llamar(TOKEN)).json();
      expect(j.esquema.alDia).toBe(false);
      expect(j.esquema.aviso).toMatch(/aplica las migraciones/);
      expect(j.catalogo.listo).toBe(false);
      expect(j.catalogo.aviso).toMatch(/Catálogo vacío/);
    });

    it("si la base no responde, 503 con un mensaje genérico", async () => {
      consultaFalsa.mockRejectedValue(new Error("Login failed for user 'usuario_ficticio'"));
      const r = await llamar(TOKEN);
      expect(r.status).toBe(503);
      expect(JSON.stringify(await r.json())).not.toContain("Login failed");
    });
  });
});
