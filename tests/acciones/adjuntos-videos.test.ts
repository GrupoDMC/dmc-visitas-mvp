import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/adjuntos", async (importar) => {
  const real = await importar<typeof import("@/lib/data/adjuntos")>();
  return {
    ...real,
    abrirAdjunto: vi.fn(),
    cerrarAdjunto: vi.fn(),
    desactivarAdjunto: vi.fn(),
    getVisitaParaAdjunto: vi.fn(),
    pegarTrozoAdjunto: vi.fn(),
  };
});
vi.mock("@/lib/data/videos", async (importar) => {
  const real = await importar<typeof import("@/lib/data/videos")>();
  return {
    ...real,
    abrirVideo: vi.fn(),
    cerrarVideo: vi.fn(),
    desactivarVideo: vi.fn(),
    getVisitaParaVideo: vi.fn(),
    pegarTrozo: vi.fn(),
  };
});
vi.mock("@/lib/data/reservas");

import {
  abrirAdjuntoAction,
  borrarAdjuntoAction,
  cerrarAdjuntoAction,
  subirTrozoAdjuntoAction,
} from "@/app/actions/adjuntos";
import { abrirVideoAction, borrarVideoAction, cerrarVideoAction, subirTrozoVideoAction } from "@/app/actions/videos";
import { abrirAdjunto, cerrarAdjunto, desactivarAdjunto, getVisitaParaAdjunto, pegarTrozoAdjunto } from "@/lib/data/adjuntos";
import { abrirVideo, cerrarVideo, desactivarVideo, getVisitaParaVideo, pegarTrozo } from "@/lib/data/videos";
import { tomarReserva } from "@/lib/data/reservas";
import { TECNICO_PRUEBA, entrarComo, salir } from "../helpers/sesion";

const MIO = TECNICO_PRUEBA.id;
const foto = { tipo: "FOTO", mime: "image/jpeg", bytes: 200_000, nombre: "a.jpg" };
const video = { mime: "video/mp4", bytes: 5_000_000, duracionSeg: 30, ancho: 1280, alto: 720 };

beforeEach(() => {
  vi.resetAllMocks();
  salir();
});

describe("adjuntos del trabajo a realizar", () => {
  const visita = (extra: Record<string, unknown> = {}) =>
    ({ id: 100, estado: "PROGRAMADA", tecnicoId: MIO, tecnicoAyudanteId: null, creadaEnTerreno: true, ...extra }) as never;

  beforeEach(() => {
    vi.mocked(getVisitaParaAdjunto).mockResolvedValue(visita());
  });

  describe("quién puede adjuntar", () => {
    it("el panel, con «crear» o «editar», mientras la visita esté abierta", async () => {
      vi.mocked(abrirAdjunto).mockResolvedValue(5);
      for (const permiso of ["visitas.crear", "visitas.editar"]) {
        entrarComo("coordinador", { permisos: [permiso] });
        expect((await abrirAdjuntoAction("V-1", foto)).ok, permiso).toBe(true);
      }
    });

    it("el panel no puede si la visita ya está cerrada o cancelada", async () => {
      entrarComo("admin");
      for (const estado of ["COMPLETADA", "CANCELADA", "CANCELADA_ADMIN"]) {
        vi.mocked(getVisitaParaAdjunto).mockResolvedValue(visita({ estado }));
        expect((await abrirAdjuntoAction("V-1", foto)).error, estado).toBe("No puedes adjuntar archivos a esa visita.");
      }
    });

    it("quien solo puede mirar no adjunta", async () => {
      entrarComo("coordinador", { permisos: ["visitas.ver"] });
      expect((await abrirAdjuntoAction("V-1", foto)).ok).toBe(false);
    });

    it("el técnico, solo en una visita que él creó en terreno y sigue abierta", async () => {
      entrarComo("tecnico");
      vi.mocked(abrirAdjunto).mockResolvedValue(5);
      expect((await abrirAdjuntoAction("V-1", foto)).ok).toBe(true);

      vi.mocked(getVisitaParaAdjunto).mockResolvedValue(visita({ creadaEnTerreno: false }));
      expect((await abrirAdjuntoAction("V-1", foto)).ok).toBe(false);
      vi.mocked(getVisitaParaAdjunto).mockResolvedValue(visita({ estado: "COMPLETADA" }));
      expect((await abrirAdjuntoAction("V-1", foto)).ok).toBe(false);
      vi.mocked(getVisitaParaAdjunto).mockResolvedValue(visita({ tecnicoId: 999 }));
      expect((await abrirAdjuntoAction("V-1", foto)).ok).toBe(false);
    });

    it("el técnico sin el permiso «celular.crearVisita» no adjunta", async () => {
      entrarComo("tecnico", { permisos: ["celular.estado"] });
      expect((await abrirAdjuntoAction("V-1", foto)).ok).toBe(false);
    });

    it("sin sesión o con una visita inexistente, lo mismo", async () => {
      expect((await abrirAdjuntoAction("V-1", foto)).error).toBe("No puedes adjuntar archivos a esa visita.");
      entrarComo("admin");
      vi.mocked(getVisitaParaAdjunto).mockResolvedValue(null);
      expect((await abrirAdjuntoAction("V-1", foto)).error).toBe("No puedes adjuntar archivos a esa visita.");
    });
  });

  describe("subida en tres pasos", () => {
    beforeEach(() => entrarComo("admin"));

    it("abrir: reserva la fila y devuelve su id", async () => {
      vi.mocked(abrirAdjunto).mockResolvedValue(7);
      expect(await abrirAdjuntoAction("V-1", foto)).toEqual({ ok: true, adjuntoId: 7, recibidos: 0 });
      expect(abrirAdjunto).toHaveBeenCalledWith(100, expect.objectContaining({ tipo: "FOTO" }), 1);
    });

    it.each([
      ["una foto con formato no admitido", { ...foto, mime: "image/gif" }, /formato que no se puede guardar/],
      ["más de 25 MB", { ...foto, bytes: 30 * 1024 * 1024 }, /más de 25 MB/],
      ["un archivo vacío", { ...foto, bytes: 0 }, /más de 25 MB/],
      ["un video de más de un minuto", { tipo: "VIDEO", mime: "video/mp4", bytes: 1000, duracionSeg: 61 }, /sin recortar al minuto/],
    ])("rechaza %s", async (_n, datos, mensaje) => {
      expect((await abrirAdjuntoAction("V-1", datos)).error).toMatch(mensaje);
      expect(abrirAdjunto).not.toHaveBeenCalled();
    });

    it("rechaza una forma inválida antes de buscar la visita", async () => {
      expect((await abrirAdjuntoAction("V-1", { tipo: "DOC" })).error).toMatch(/formato que no se puede guardar/);
      expect((await abrirAdjuntoAction("", foto)).ok).toBe(false);
      expect(getVisitaParaAdjunto).not.toHaveBeenCalled();
    });

    it("al llegar al máximo de adjuntos por visita avisa", async () => {
      vi.mocked(abrirAdjunto).mockResolvedValue(null as never);
      expect((await abrirAdjuntoAction("V-1", foto)).error).toBe("Una visita admite hasta 12 adjuntos.");
    });

    it("subir un trozo: decodifica el base64 y devuelve cuánto lleva", async () => {
      vi.mocked(pegarTrozoAdjunto).mockResolvedValue({ ok: true, recibidos: 3 } as never);
      const r = await subirTrozoAdjuntoAction({ folio: "V-1", adjuntoId: 7, desde: 0, trozoBase64: Buffer.from("abc").toString("base64") });
      expect(r).toEqual({ ok: true, adjuntoId: 7, recibidos: 3 });
      expect(vi.mocked(pegarTrozoAdjunto).mock.calls[0][3].toString()).toBe("abc");
    });

    it("un trozo desalineado devuelve dónde reanudar", async () => {
      vi.mocked(pegarTrozoAdjunto).mockResolvedValue({ ok: false, error: "Posición distinta.", recibidos: 1000 } as never);
      expect(await subirTrozoAdjuntoAction({ folio: "V-1", adjuntoId: 7, desde: 5, trozoBase64: "YWJj" })).toEqual({
        ok: false,
        error: "Posición distinta.",
        recibidos: 1000,
      });
    });

    it("un trozo vacío o un folio vacío se rechaza como «dañado»", async () => {
      expect((await subirTrozoAdjuntoAction({ folio: "V-1", adjuntoId: 7, desde: 0, trozoBase64: "" })).error).toBe("Un trozo del archivo llegó dañado.");
      expect((await subirTrozoAdjuntoAction({ folio: "", adjuntoId: 7, desde: 0, trozoBase64: "YQ==" })).ok).toBe(false);
      expect(pegarTrozoAdjunto).not.toHaveBeenCalled();
    });

    it("cerrar: falla si el archivo no llegó completo", async () => {
      vi.mocked(cerrarAdjunto).mockResolvedValueOnce(false);
      expect((await cerrarAdjuntoAction("V-1", 7)).error).toBe("El archivo no llegó completo. Vuelve a subirlo.");
      vi.mocked(cerrarAdjunto).mockResolvedValueOnce(true);
      expect(await cerrarAdjuntoAction("V-1", 7)).toEqual({ ok: true, adjuntoId: 7 });
    });

    it("borrar: la fila queda inactiva", async () => {
      expect(await borrarAdjuntoAction("V-1", 7)).toEqual({ ok: true, adjuntoId: 7 });
      expect(desactivarAdjunto).toHaveBeenCalledWith(7, 100);
    });

    it("un fallo de la base en cualquier paso da un mensaje propio del paso", async () => {
      vi.mocked(abrirAdjunto).mockRejectedValueOnce(new Error("x"));
      expect((await abrirAdjuntoAction("V-1", foto)).error).toBe("No se pudo empezar a subir el archivo.");
      vi.mocked(pegarTrozoAdjunto).mockRejectedValueOnce(new Error("x"));
      expect((await subirTrozoAdjuntoAction({ folio: "V-1", adjuntoId: 7, desde: 0, trozoBase64: "YQ==" })).error).toBe("Se cortó la subida del archivo.");
      vi.mocked(cerrarAdjunto).mockRejectedValueOnce(new Error("x"));
      expect((await cerrarAdjuntoAction("V-1", 7)).error).toBe("No se pudo terminar de guardar el archivo.");
      vi.mocked(desactivarAdjunto).mockRejectedValueOnce(new Error("x"));
      expect((await borrarAdjuntoAction("V-1", 7)).error).toBe("No se pudo quitar el archivo.");
    });

    it("cada trozo vuelve a comprobar el permiso (la visita pudo cerrarse a mitad de la subida)", async () => {
      vi.mocked(getVisitaParaAdjunto).mockResolvedValue(visita({ estado: "COMPLETADA" }));
      const r = await subirTrozoAdjuntoAction({ folio: "V-1", adjuntoId: 7, desde: 0, trozoBase64: "YQ==" });
      expect(r.error).toBe("No puedes adjuntar archivos a esa visita.");
      expect(pegarTrozoAdjunto).not.toHaveBeenCalled();
    });
  });
});

describe("video del acta", () => {
  const visitaV = (extra: Record<string, unknown> = {}) =>
    ({ id: 200, estado: "EN_CURSO", tecnicoId: MIO, tecnicoAyudanteId: null, editablePorTecnico: false, ...extra }) as never;

  beforeEach(() => {
    vi.mocked(getVisitaParaVideo).mockResolvedValue(visitaV());
    vi.mocked(tomarReserva).mockResolvedValue({ ok: true } as never);
  });

  describe("quién puede subir", () => {
    it("el técnico de una visita abierta, tomando o renovando la reserva", async () => {
      entrarComo("tecnico");
      vi.mocked(abrirVideo).mockResolvedValue(9);
      expect(await abrirVideoAction("V-1", video as never)).toEqual({ ok: true, videoId: 9, recibidos: 0 });
      expect(tomarReserva).toHaveBeenCalledWith("V-1", { usuarioId: 3, tecnicoId: MIO });
    });

    it("sin el permiso «celular.video» no sube", async () => {
      entrarComo("tecnico", { permisos: ["celular.estado"] });
      expect((await abrirVideoAction("V-1", video as never)).error).toBe("Esa visita no está abierta para ti.");
    });

    it("una visita de otro técnico, o ya cerrada, no está abierta para él", async () => {
      entrarComo("tecnico");
      vi.mocked(getVisitaParaVideo).mockResolvedValue(visitaV({ tecnicoId: 999 }));
      expect((await abrirVideoAction("V-1", video as never)).ok).toBe(false);
      vi.mocked(getVisitaParaVideo).mockResolvedValue(visitaV({ estado: "COMPLETADA" }));
      expect((await abrirVideoAction("V-1", video as never)).ok).toBe(false);
    });

    it("si el otro técnico tiene la reserva, devuelve quién y no sube", async () => {
      entrarComo("tecnico");
      vi.mocked(tomarReserva).mockResolvedValue({ ok: false, motivo: "ajena", nombre: "Beto", desde: "10:00", liberaEnSeg: 300 } as never);
      const r = await abrirVideoAction("V-1", video as never);
      expect(r.ok).toBe(false);
      expect(r.reservaAjena).toEqual({ nombre: "Beto", desde: "10:00", liberaEnSeg: 300 });
      expect(abrirVideo).not.toHaveBeenCalled();
    });

    it("el panel solo puede sobre un acta COMPLETADA y con «editar el acta»", async () => {
      entrarComo("admin");
      expect((await abrirVideoAction("V-1", video as never)).ok).toBe(false); // EN_CURSO
      vi.mocked(getVisitaParaVideo).mockResolvedValue(visitaV({ estado: "COMPLETADA" }));
      vi.mocked(abrirVideo).mockResolvedValue(9);
      expect((await abrirVideoAction("V-1", video as never)).ok).toBe(true);
      entrarComo("coordinador", { permisos: ["visitas.ver", "visitas.crear"] });
      expect((await abrirVideoAction("V-1", video as never)).ok).toBe(false);
    });

    it("sin sesión no sube", async () => {
      expect((await abrirVideoAction("V-1", video as never)).error).toBe("Esa visita no está abierta para ti.");
    });
  });

  describe("límites del clip", () => {
    beforeEach(() => entrarComo("tecnico"));

    it("rechaza más de 25 MB, más de un minuto y formatos no admitidos", async () => {
      expect((await abrirVideoAction("V-1", { ...video, bytes: 30 * 1024 * 1024 } as never)).ok).toBe(false);
      expect((await abrirVideoAction("V-1", { ...video, duracionSeg: 75 } as never)).ok).toBe(false);
      expect((await abrirVideoAction("V-1", { ...video, mime: "video/x-msvideo" } as never)).ok).toBe(false);
      expect(abrirVideo).not.toHaveBeenCalled();
    });

    it("una forma inválida se rechaza como «formato»", async () => {
      expect((await abrirVideoAction("V-1", { mime: 5 } as never)).error).toBe("El video llegó en un formato que no se puede guardar.");
    });
  });

  describe("trozos (el string grande viaja dentro de un objeto)", () => {
    beforeEach(() => entrarComo("tecnico"));

    it("pega el trozo y devuelve cuánto lleva", async () => {
      vi.mocked(pegarTrozo).mockResolvedValue({ ok: true, recibidos: 3 } as never);
      const r = await subirTrozoVideoAction({ folio: "V-1", videoId: 9, desde: 0, trozoBase64: Buffer.from("abc").toString("base64") });
      expect(r).toEqual({ ok: true, videoId: 9, recibidos: 3 });
    });

    it("acepta un trozo de 1,5 MB (2 MB de base64), que es lo que sube el celular", async () => {
      vi.mocked(pegarTrozo).mockResolvedValue({ ok: true, recibidos: 1_572_864 } as never);
      const trozo = Buffer.alloc(1_572_864, 1).toString("base64");
      expect(trozo.length).toBeGreaterThan(2_000_000);
      expect((await subirTrozoVideoAction({ folio: "V-1", videoId: 9, desde: 0, trozoBase64: trozo })).ok).toBe(true);
    });

    it("rechaza un trozo absurdamente grande (más de 6 MB de texto)", async () => {
      const r = await subirTrozoVideoAction({ folio: "V-1", videoId: 9, desde: 0, trozoBase64: "A".repeat(6_000_001) });
      expect(r.ok).toBe(false);
      expect(pegarTrozo).not.toHaveBeenCalled();
    });

    it("renueva la reserva en cada trozo; si la perdió, no pega nada", async () => {
      vi.mocked(tomarReserva).mockResolvedValue({ ok: false, motivo: "ajena", nombre: "Beto", desde: "10:00", liberaEnSeg: 10 } as never);
      const r = await subirTrozoVideoAction({ folio: "V-1", videoId: 9, desde: 0, trozoBase64: "YQ==" });
      expect(r.reservaAjena).toBeDefined();
      expect(pegarTrozo).not.toHaveBeenCalled();
    });

    it("un fallo de la base se explica sin detalles", async () => {
      vi.mocked(pegarTrozo).mockRejectedValue(new Error("boom"));
      expect((await subirTrozoVideoAction({ folio: "V-1", videoId: 9, desde: 0, trozoBase64: "YQ==" })).error).toBe("Se cortó la subida del video.");
    });
  });

  describe("cerrar y borrar", () => {
    beforeEach(() => entrarComo("tecnico"));

    it("cerrar devuelve la ruta para reproducir el clip", async () => {
      vi.mocked(cerrarVideo).mockResolvedValue(true);
      expect(await cerrarVideoAction("V-1", 9)).toEqual({ ok: true, videoId: 9, archivoUrl: "/api/visita/video/9" });
      expect(desactivarVideo).not.toHaveBeenCalled();
    });

    it("cerrar falla si el clip no llegó completo", async () => {
      vi.mocked(cerrarVideo).mockResolvedValue(false);
      expect((await cerrarVideoAction("V-1", 9)).error).toBe("El video no llegó completo. Vuelve a subirlo.");
    });

    it("sobre un acta ya cerrada (edición), el clip queda inactivo hasta que se guarde la edición", async () => {
      vi.mocked(getVisitaParaVideo).mockResolvedValue(visitaV({ estado: "COMPLETADA", editablePorTecnico: true }));
      vi.mocked(cerrarVideo).mockResolvedValue(true);
      expect((await cerrarVideoAction("V-1", 9)).ok).toBe(true);
      expect(desactivarVideo).toHaveBeenCalledWith(9, 200);
      expect(tomarReserva).not.toHaveBeenCalled();
    });

    it("borrar un clip del acta en curso lo deja inactivo", async () => {
      expect(await borrarVideoAction("V-1", 9)).toEqual({ ok: true, videoId: 9 });
      expect(desactivarVideo).toHaveBeenCalledWith(9, 200);
    });

    it("sobre un acta cerrada los clips no se borran directo: solo guardando la edición", async () => {
      vi.mocked(getVisitaParaVideo).mockResolvedValue(visitaV({ estado: "COMPLETADA", editablePorTecnico: true }));
      expect((await borrarVideoAction("V-1", 9)).error).toBe("Esa visita no está abierta para ti.");
      expect(desactivarVideo).not.toHaveBeenCalled();
    });

    it("ids inválidos", async () => {
      expect((await cerrarVideoAction("V-1", 0)).error).toBe("Ese video no existe.");
      expect((await borrarVideoAction("V-1", -2)).error).toBe("Ese video no existe.");
    });
  });
});
