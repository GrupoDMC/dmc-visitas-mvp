import { afterEach, describe, expect, it, vi } from "vitest";
import { TEXTO_CALLE, problemaDeUbicacion, textoMall } from "@/lib/ui/ubicacion";
import { DISPOSITIVO_PAPEL, esInformePapel } from "@/lib/ui/papel";
import { REGIONES } from "@/lib/ui/regiones";
import { REFERENCIAS_VACIAS, nombreProblema, nombreTrabajo, puede, trabajoVaConMotivo } from "@/lib/ui/referencias";
import { mb, mimeAceptado, mimeBase, reloj, tipoGrabacion } from "@/lib/ui/video";
import { pesoAproximado, pesoDeFotos, ajustarFotos, comprimirFoto, PRESUPUESTO_FOTOS_BYTES } from "@/lib/ui/imagen";

describe("ubicación de la sucursal", () => {
  it("sin mall se muestra «Calle»", () => {
    expect(textoMall(null)).toBe(TEXTO_CALLE);
    expect(textoMall({ nombre: "  " })).toBe(TEXTO_CALLE);
    expect(textoMall({ nombre: "Mall Plaza" })).toBe("Mall Plaza");
  });

  it("a la calle exige dirección; en un mall no", () => {
    expect(problemaDeUbicacion({ mallId: 3, direccion: "" })).toBeNull();
    expect(problemaDeUbicacion({ mallId: null, direccion: "Los Leones 45" })).toBeNull();
    expect(problemaDeUbicacion({ mallId: null, direccion: "   " })).toMatch(/necesita su dirección/);
  });
});

describe("informes en papel", () => {
  it("se reconocen por el dispositivo del acta", () => {
    expect(esInformePapel({ dispositivo: DISPOSITIVO_PAPEL })).toBe(true);
    expect(esInformePapel({ dispositivo: "iPhone" })).toBe(false);
    expect(esInformePapel(null)).toBe(false);
    expect(esInformePapel(undefined)).toBe(false);
  });
});

describe("regiones", () => {
  it("son las 16 de Chile, sin repetir y con la Metropolitana", () => {
    expect(REGIONES).toHaveLength(16);
    expect(new Set(REGIONES).size).toBe(16);
    expect(REGIONES).toContain("Metropolitana");
  });
});

describe("referencias del checklist", () => {
  it("puede() mira la lista de permisos", () => {
    const ref = { ...REFERENCIAS_VACIAS, permisos: ["visitas.crear"] };
    expect(puede(ref, "visitas.crear")).toBe(true);
    expect(puede(ref, "visitas.eliminar")).toBe(false);
    expect(puede(REFERENCIAS_VACIAS, "visitas.crear")).toBe(false);
  });

  it("los nombres caen en el código si ya no están en el catálogo", () => {
    expect(nombreProblema([{ codigo: "A", nombre: "Antena" } as never], "A")).toBe("Antena");
    expect(nombreProblema([], "A")).toBe("A");
    expect(nombreTrabajo([{ codigo: "T", nombre: "Cambio" } as never], "T")).toBe("Cambio");
    expect(nombreTrabajo([], "T")).toBe("T");
  });

  it("un trabajo va con un motivo solo si el checklist se lo puso", () => {
    const t = { motivosCodigos: ["M1"] } as never;
    expect(trabajoVaConMotivo(t, "M1")).toBe(true);
    expect(trabajoVaConMotivo(t, "M2")).toBe(false);
  });
});

describe("video: utilidades de formato", () => {
  it("mimeBase quita los codecs; mimeAceptado solo deja mp4, webm y quicktime", () => {
    expect(mimeBase("Video/WebM;codecs=vp9,opus")).toBe("video/webm");
    expect(mimeAceptado("video/mp4;codecs=avc1")).toBe(true);
    expect(mimeAceptado("video/quicktime")).toBe(true);
    expect(mimeAceptado("video/x-matroska")).toBe(false);
    expect(mimeAceptado("image/png")).toBe(false);
  });

  it("mb usa coma decimal", () => {
    expect(mb(11.4 * 1024 * 1024)).toBe("11,4 MB");
    expect(mb(0)).toBe("0,0 MB");
  });

  it("reloj muestra m:ss y no baja de cero", () => {
    expect(reloj(65)).toBe("1:05");
    expect(reloj(0)).toBe("0:00");
    expect(reloj(-5)).toBe("0:00");
    expect(reloj(59.6)).toBe("1:00");
  });

  describe("tipoGrabacion", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("sin MediaRecorder no hay grabación", () => {
      vi.stubGlobal("MediaRecorder", undefined);
      expect(tipoGrabacion()).toBeNull();
    });

    it("elige el primer contenedor soportado en orden de preferencia", () => {
      vi.stubGlobal("MediaRecorder", { isTypeSupported: (t: string) => t === "video/webm" || t === "video/mp4" });
      expect(tipoGrabacion()).toBe("video/mp4");
    });

    it("si ninguno se soporta devuelve null", () => {
      vi.stubGlobal("MediaRecorder", { isTypeSupported: () => false });
      expect(tipoGrabacion()).toBeNull();
    });
  });
});

describe("fotos: peso y presupuesto del request", () => {
  const dataUrl = (bytes: number) => `data:image/jpeg;base64,${"A".repeat(Math.ceil((bytes * 4) / 3))}`;

  it("pesoAproximado decodifica el tamaño del base64", () => {
    expect(pesoAproximado("data:image/jpeg;base64,AAAA")).toBe(3);
    expect(pesoAproximado(dataUrl(3000))).toBeGreaterThanOrEqual(2999);
  });

  it("pesoDeFotos cuenta solo las que viajan en el request (data:)", () => {
    const fotos = [{ src: dataUrl(900) }, { src: "/api/visita/foto/5" }, { src: dataUrl(300) }];
    expect(pesoDeFotos(fotos)).toBeGreaterThanOrEqual(1198);
    expect(pesoDeFotos([{ src: "/api/visita/foto/5" }])).toBe(0);
  });

  it("si las fotos ya caben, ajustarFotos no toca nada", async () => {
    const fotos = [{ id: 1, src: dataUrl(1000) }];
    expect(await ajustarFotos(fotos)).toBe(fotos);
  });

  it("si pasan el presupuesto y no se puede recomprimir (sin DOM), devuelve la misma lista", async () => {
    const fotos = [{ id: 1, src: dataUrl(PRESUPUESTO_FOTOS_BYTES + 10_000) }];
    expect(await ajustarFotos(fotos)).toBe(fotos);
  });

  it("comprimirFoto devuelve la original cuando el entorno no puede dibujar", async () => {
    const original = dataUrl(500);
    expect(await comprimirFoto(original)).toBe(original);
  });
});
