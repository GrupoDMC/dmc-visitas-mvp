import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/visitas");

import { GET as getMedios } from "@/app/api/visita/medios/[folio]/route";
import { getVisitaCompletaPorFolio } from "@/lib/data/visitas";
import { TECNICO_PRUEBA, entrarComo, salir } from "../helpers/sesion";

const params = (folio: string) => ({ params: Promise.resolve({ folio }) });
const peticion = () => new Request("http://localhost/api/visita/medios/V-1");

describe("GET /api/visita/medios/[folio] (lista de multimedia para el .zip)", () => {
  const visita = (extra: Record<string, unknown> = {}) => ({
    folio: "V-1",
    tecnicoId: TECNICO_PRUEBA.id,
    tecnicoAyudanteId: null,
    sucursal: { nombre: "Tienda Ñandú" },
    cliente: { razonSocial: "Comercial Peña SpA", nombreFantasia: "Cliente Uno" },
    fotos: [
      { id: 1, interno: false, archivoUrl: "/api/visita/foto/1" },
      { id: 2, interno: true, archivoUrl: "/api/visita/foto/2" },
    ],
    videos: [{ id: 5, interno: false, archivoUrl: "/api/visita/video/5", mime: "video/mp4", bytes: 10 }],
    adjuntos: [],
    ...extra,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    salir();
    entrarComo("admin");
    vi.mocked(getVisitaCompletaPorFolio).mockResolvedValue(visita() as never);
  });

  it("sin sesión → 401", async () => {
    salir();
    expect((await getMedios(peticion(), params("V-1"))).status).toBe(401);
  });

  it("acta inexistente → 404", async () => {
    vi.mocked(getVisitaCompletaPorFolio).mockResolvedValue(null as never);
    expect((await getMedios(peticion(), params("V-1"))).status).toBe(404);
  });

  it("devuelve la carpeta «Multimedia razón social local» y los medios sin los internos", async () => {
    const r = await getMedios(peticion(), params("V-1"));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    const cuerpo = (await r.json()) as { carpeta: string; medios: { nombre: string }[] };
    expect(cuerpo.carpeta).toBe("Multimedia Comercial Peña SpA Tienda Ñandú");
    expect(cuerpo.medios.map((m) => m.nombre)).toEqual(["Foto 1.jpg", "Video 1.mp4"]);
  });

  it("sin razón social ni sucursal no deja «undefined»", async () => {
    vi.mocked(getVisitaCompletaPorFolio).mockResolvedValue(visita({ cliente: undefined, sucursal: undefined }) as never);
    const cuerpo = (await (await getMedios(peticion(), params("V-1"))).json()) as { carpeta: string };
    expect(cuerpo.carpeta).toBe("Multimedia V-1");
  });
});
