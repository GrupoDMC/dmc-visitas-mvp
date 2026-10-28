import { describe, expect, it, vi } from "vitest";

// La capa de datos corre contra un ejecutor simulado: ningún test abre SQL Server.
vi.mock("@/lib/data/sql", () => ({
  consultaCon: vi.fn(),
  num: Number,
  F_TS: (col: string) => col,
  paramIds: (nombre: string, ids: number[]) => [nombre, "json", JSON.stringify(ids)],
  subIds: (nombre: string) => `(OPENJSON(@${nombre}))`,
  sql: new Proxy({}, { get: (_, k) => (k === "MAX" ? -1 : () => String(k)) }),
}));

import {
  ELEGIDO_AJENO,
  FALTA_ELEGIR,
  FALTA_RESOLUCION,
  FALTA_RESPUESTA,
  PROBLEMA_NUEVO,
  revisarAviso,
  revisarResoluciones,
} from "@/lib/validacion/aviso-problemas";
import { ErrorDeAviso, prepararResolucionesEn, registrarAvisoEn } from "@/lib/data/avisos-problema";
import { datosVisita } from "@/lib/validacion/visitas";
import { actaEntrada } from "@/lib/validacion/actas";
import type { Ejecutor, Parametro } from "@/lib/data/sql";
import type { AvisoProblemas } from "@/lib/contratos/visitas";

const resuelve = (avisados: number[], elegidos: number[]): AvisoProblemas => ({
  respuesta: "RESUELVE",
  avisados,
  elegidos,
});
const otraCosa = (avisados: number[]): AvisoProblemas => ({ respuesta: "OTRA_COSA", avisados, elegidos: [] });

describe("aviso al agendar: reglas", () => {
  it("sucursal sin problemas: no se exige nada y no se registra", () => {
    expect(revisarAviso([], null)).toEqual({ ok: true, registrar: false, vinculos: [] });
    // Si alcanzaron a resolverse mientras se agendaba, la respuesta vieja no estorba.
    expect(revisarAviso([], resuelve([4], [4]))).toEqual({ ok: true, registrar: false, vinculos: [] });
  });

  it("sucursal con problemas: sin respuesta no se guarda", () => {
    expect(revisarAviso([1, 2], null)).toEqual({ ok: false, error: FALTA_RESPUESTA });
    expect(revisarAviso([1, 2], undefined)).toEqual({ ok: false, error: FALTA_RESPUESTA });
  });

  it("«resuelve» vincula solo los elegidos", () => {
    expect(revisarAviso([1, 2, 3], resuelve([1, 2, 3], [2, 3, 3]))).toEqual({
      ok: true,
      registrar: true,
      vinculos: [2, 3],
    });
  });

  it("«resuelve» sin elegir ninguno no sirve", () => {
    expect(revisarAviso([1], resuelve([1], []))).toEqual({ ok: false, error: FALTA_ELEGIR });
  });

  it("no se puede elegir un problema que no está sin resolver en la sucursal", () => {
    expect(revisarAviso([1], resuelve([1, 9], [9]))).toEqual({ ok: false, error: ELEGIDO_AJENO });
  });

  it("«otra cosa» no vincula nada, pero queda registrado", () => {
    expect(revisarAviso([1, 2], otraCosa([1, 2]))).toEqual({ ok: true, registrar: true, vinculos: [] });
  });

  it("si apareció un problema que el aviso no mostró, hay que volver a responder", () => {
    expect(revisarAviso([1, 2], otraCosa([1]))).toEqual({ ok: false, error: PROBLEMA_NUEVO });
    expect(revisarAviso([1, 2], resuelve([1], [1]))).toEqual({ ok: false, error: PROBLEMA_NUEVO });
  });
});

describe("acta: ¿quedó solucionado?", () => {
  it("sin problemas por resolver no pide nada", () => {
    expect(revisarResoluciones([], undefined)).toEqual({ ok: true, resueltos: [], noResueltos: [] });
  });

  it("cada problema por resolver necesita su respuesta", () => {
    expect(revisarResoluciones([1, 2], [{ problemaId: 1, resuelto: true }])).toEqual({
      ok: false,
      error: FALTA_RESOLUCION,
    });
    expect(revisarResoluciones([1], undefined)).toEqual({ ok: false, error: FALTA_RESOLUCION });
  });

  it("separa los solucionados de los que no, e ignora respuestas ajenas", () => {
    expect(
      revisarResoluciones(
        [1, 2],
        [
          { problemaId: 1, resuelto: true },
          { problemaId: 2, resuelto: false },
          { problemaId: 7, resuelto: true },
        ]
      )
    ).toEqual({ ok: true, resueltos: [1], noResueltos: [2] });
  });
});

/** Un ejecutor que anota lo que se escribe y responde lo justo. */
function ejecutorFalso(abiertos: number[], estadoActual = "ABIERTO") {
  const escrito: { texto: string; params: Parametro[] }[] = [];
  const ej: Ejecutor = {
    async consulta<T>(texto: string, params: Parametro[] = []): Promise<T[]> {
      if (/INSERT INTO dmc\.visita_aviso_problema \(/.test(texto)) {
        escrito.push({ texto, params });
        return [{ id: 99 }] as T[];
      }
      if (/SELECT estado FROM dmc\.problema/.test(texto)) return [{ estado: estadoActual }] as T[];
      if (/FROM dmc\.problema_visita_resolucion r\s+JOIN dmc\.problema p/.test(texto)) {
        return abiertos.map((id) => ({ id })) as T[];
      }
      if (/SELECT p\.id FROM dmc\.problema p JOIN dmc\.visita v/.test(texto)) {
        return abiertos.map((id) => ({ id })) as T[];
      }
      return [];
    },
    async ejecutar(texto: string, params: Parametro[] = []) {
      escrito.push({ texto, params });
      return 1;
    },
  };
  const valor = (p: Parametro[], nombre: string) => p.find((x) => x[0] === nombre)?.[2];
  return {
    ej,
    escrito,
    vinculados: () =>
      escrito
        .filter((e) => /INSERT INTO dmc\.problema_visita_resolucion/.test(e.texto))
        .map((e) => valor(e.params, "problema")),
    estados: () =>
      escrito
        .filter((e) => /UPDATE dmc\.problema\s+SET estado/.test(e.texto))
        .map((e) => [valor(e.params, "id"), valor(e.params, "estado")]),
    respuesta: () => {
      const aviso = escrito.find((e) => /INSERT INTO dmc\.visita_aviso_problema \(/.test(e.texto));
      return aviso ? valor(aviso.params, "respuesta") : undefined;
    },
  };
}

const base = { visitaId: 10, folio: "V-10", sucursalId: 5, ocasion: "AGENDAR" as const, usuarioId: 3 };

describe("aviso al agendar: lo que se escribe", () => {
  it("sucursal sin problemas: no escribe nada", async () => {
    const f = ejecutorFalso([]);
    await registrarAvisoEn(f.ej, { ...base, aviso: null });
    expect(f.escrito).toEqual([]);
  });

  it("sucursal con problemas y sin respuesta: lanza y no escribe", async () => {
    const f = ejecutorFalso([1]);
    await expect(registrarAvisoEn(f.ej, { ...base, aviso: null })).rejects.toBeInstanceOf(ErrorDeAviso);
    expect(f.escrito).toEqual([]);
  });

  it("«resuelve»: registra el aviso, vincula los elegidos y los pasa a AGENDADO", async () => {
    const f = ejecutorFalso([1, 2]);
    await registrarAvisoEn(f.ej, { ...base, aviso: resuelve([1, 2], [2]) });
    expect(f.respuesta()).toBe("RESUELVE");
    expect(f.vinculados()).toEqual([2]);
    expect(f.estados()).toEqual([[2, "AGENDADO"]]);
  });

  it("«otra cosa»: registra el aviso y no vincula ni cambia nada", async () => {
    const f = ejecutorFalso([1, 2]);
    await registrarAvisoEn(f.ej, { ...base, aviso: otraCosa([1, 2]) });
    expect(f.respuesta()).toBe("OTRA_COSA");
    expect(f.escrito.some((e) => /visita_aviso_problema_detalle/.test(e.texto))).toBe(true);
    expect(f.vinculados()).toEqual([]);
    expect(f.estados()).toEqual([]);
  });
});

describe("acta: lo que se escribe", () => {
  it("solucionado pasa a RESUELTO; no solucionado vuelve a ABIERTO", async () => {
    const f = ejecutorFalso([1, 2], "AGENDADO");
    const r = await prepararResolucionesEn(f.ej, 10, [
      { problemaId: 1, resuelto: true },
      { problemaId: 2, resuelto: false },
    ]);
    if ("error" in r) throw new Error(r.error);
    await r.aplicar("V-10", 3);
    expect(f.estados()).toEqual([
      [1, "RESUELTO"],
      [2, "ABIERTO"],
    ]);
  });

  it("sin todas las respuestas no escribe nada", async () => {
    const f = ejecutorFalso([1, 2], "AGENDADO");
    const r = await prepararResolucionesEn(f.ej, 10, [{ problemaId: 1, resuelto: true }]);
    expect(r).toEqual({ error: FALTA_RESOLUCION });
    expect(f.escrito).toEqual([]);
  });
});

describe("forma de lo que llega", () => {
  const visita = {
    clienteId: 1,
    sucursalId: 2,
    tecnicoId: 3,
    motivoCodigo: "CAL",
    fechaProgramada: "2026-11-02",
    horaProgramada: null,
    trabajoSolicitado: "Calibrar",
    indicacionesAcceso: null,
    responsableNombre: null,
    responsableRut: null,
    responsableTelefono: null,
  };

  it("la visita acepta la respuesta al aviso y rechaza una respuesta inventada", () => {
    expect(datosVisita.safeParse({ ...visita, avisoProblemas: otraCosa([1]) }).success).toBe(true);
    expect(
      datosVisita.safeParse({ ...visita, avisoProblemas: { respuesta: "QUIZAS", avisados: [], elegidos: [] } }).success
    ).toBe(false);
  });

  it("el acta acepta las resoluciones", () => {
    const acta = {
      folio: "V-1",
      responsableNombre: "Responsable",
      responsableRut: null,
      responsableTelefono: null,
      motivosCodigos: ["CAL"],
      observaciones: null,
      comentarioInterno: null,
      trabajos: [],
      problemas: [],
      fotos: [],
      firma: null,
      dispositivo: null,
    };
    expect(actaEntrada.safeParse({ ...acta, resoluciones: [{ problemaId: 1, resuelto: true }] }).success).toBe(true);
    expect(actaEntrada.safeParse({ ...acta, resoluciones: [{ problemaId: 0, resuelto: true }] }).success).toBe(false);
  });
});
