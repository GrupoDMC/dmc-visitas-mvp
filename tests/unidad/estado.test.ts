import { describe, expect, it } from "vitest";
import {
  ESTADOS_CANCELADOS,
  ESTADOS_PROBLEMA_BASE,
  ESTADO_VISITA_BARRA,
  ESTADO_VISITA_COLOR,
  ESTADO_VISITA_LABEL,
  ESTADO_VISITA_TAG,
  estaCancelada,
  etiquetaEstadoProblema,
  nombreDeQuienLaTomo,
  participaEnVisita,
  tagEstadoProblema,
  textoMotivos,
  textoMotivosReales,
  tomadaPorOtro,
} from "@/lib/ui/estado";
import { cargoVigente } from "@/lib/ui/cargos";
import { etiquetaPersona } from "@/lib/ui/personas-local";

const ESTADOS = ["PROGRAMADA", "EN_CURSO", "COMPLETADA", "PENDIENTE", "REAGENDADA", "CANCELADA", "CANCELADA_ADMIN"] as const;

describe("estados de la visita", () => {
  it("todos los estados tienen etiqueta, variante de tag y colores", () => {
    for (const e of ESTADOS) {
      expect(ESTADO_VISITA_LABEL[e]).toBeTruthy();
      expect(ESTADO_VISITA_TAG[e]).toBeTruthy();
      expect(ESTADO_VISITA_COLOR[e]).toMatch(/^var\(--color-/);
      expect(ESTADO_VISITA_BARRA[e]).toMatch(/^var\(--color-/);
    }
  });

  it("solo CANCELADA y CANCELADA_ADMIN cuentan como canceladas", () => {
    expect(ESTADOS.filter(estaCancelada)).toEqual(["CANCELADA", "CANCELADA_ADMIN"]);
    expect(ESTADOS_CANCELADOS).toEqual(["CANCELADA", "CANCELADA_ADMIN"]);
  });
});

describe("equipo de la visita", () => {
  const visita = {
    estado: "EN_CURSO" as const,
    tecnicoId: 1,
    tecnicoAyudanteId: 2,
    tomadaPorTecnicoId: 2,
    tecnico: { nombreCompleto: "Ana Principal" },
    tecnicoAyudante: { nombreCompleto: "Beto Ayudante" },
  };

  it("participa quien va asignado o de ayudante", () => {
    expect(participaEnVisita(visita, 1)).toBe(true);
    expect(participaEnVisita(visita, 2)).toBe(true);
    expect(participaEnVisita(visita, 3)).toBe(false);
  });

  it("«tomada por otro» solo aplica EN_CURSO y cuando la tiene el otro técnico", () => {
    expect(tomadaPorOtro(visita, 1)).toBe(true);
    expect(tomadaPorOtro(visita, 2)).toBe(false);
    expect(tomadaPorOtro({ ...visita, estado: "PROGRAMADA" as const }, 1)).toBe(false);
  });

  it("nombra a quien la tomó, sea el principal o el ayudante", () => {
    expect(nombreDeQuienLaTomo(visita)).toBe("Beto Ayudante");
    expect(nombreDeQuienLaTomo({ ...visita, tomadaPorTecnicoId: 1 })).toBe("Ana Principal");
    expect(nombreDeQuienLaTomo({ ...visita, tomadaPorTecnicoId: null })).toBeNull();
  });
});

describe("estados del problema", () => {
  const catalogo = [{ id: 1, codigo: "ABIERTO", nombre: "Pendiente de revisar", orden: 1, activo: true }];

  it("usa el nombre editado en el checklist, y si no, el de siempre, y si no, el código", () => {
    expect(etiquetaEstadoProblema("ABIERTO", catalogo)).toBe("Pendiente de revisar");
    expect(etiquetaEstadoProblema("RESUELTO", catalogo)).toBe("Resuelto");
    expect(etiquetaEstadoProblema("RARO", catalogo)).toBe("RARO");
    expect(ESTADOS_PROBLEMA_BASE.map((e) => e.codigo)).toEqual(["ABIERTO", "AGENDADO", "PENDIENTE", "RESUELTO"]);
  });

  it("abierto resalta, resuelto va oscuro y los intermedios en contorno", () => {
    expect(tagEstadoProblema("ABIERTO")).toBe("accent");
    expect(tagEstadoProblema("RESUELTO")).toBe("dark");
    expect(tagEstadoProblema("AGENDADO")).toBe("outline");
    expect(tagEstadoProblema("LO_QUE_SEA")).toBe("outline");
  });
});

describe("textoMotivos / textoMotivosReales", () => {
  it("junta todos los motivos de la visita", () => {
    expect(textoMotivos({ motivosNombres: ["Instalación", "", "Calibración"] })).toBe("Instalación · Calibración");
  });
  it("cae en el motivo principal, luego en el código, luego en la raya", () => {
    expect(textoMotivos({ motivo: { nombre: "Visita" } })).toBe("Visita");
    expect(textoMotivos({ motivoCodigo: "VISITA" })).toBe("VISITA");
    expect(textoMotivos({})).toBe("—");
  });
  it("los reales mandan sobre los agendados, traducidos a su nombre", () => {
    const v = {
      motivosCodigos: ["INSTALACION", "CALIBRACION"],
      motivosNombres: ["Instalación", "Calibración"],
      ejecucion: { motivosRealesCodigos: ["CALIBRACION", "OTRO"] },
    };
    expect(textoMotivosReales(v)).toBe("Calibración · OTRO");
    expect(textoMotivosReales({ ...v, ejecucion: { motivosRealesCodigos: [] } })).toBe("Instalación · Calibración");
    expect(textoMotivosReales({ ...v, ejecucion: undefined })).toBe("Instalación · Calibración");
  });
});

describe("cargoVigente / etiquetaPersona", () => {
  const cargos = [{ id: 1, nombre: "Jefa de tienda" }] as never;

  it("el cargo solo vale si sigue en el checklist (sin importar mayúsculas)", () => {
    expect(cargoVigente(cargos, " jefa DE tienda ")).toBe("Jefa de tienda");
    expect(cargoVigente(cargos, "Bodeguero")).toBe("");
    expect(cargoVigente(cargos, null)).toBe("");
    expect(cargoVigente(cargos, "  ")).toBe("");
  });

  it("la etiqueta de una persona omite lo que falte", () => {
    expect(etiquetaPersona({ nombre: "María Soto", cargo: "Jefa de tienda", rut: "11.111.111-1" } as never)).toBe(
      "María Soto · Jefa de tienda · 11.111.111-1"
    );
    expect(etiquetaPersona({ nombre: "María Soto", cargo: null, rut: null } as never)).toBe("María Soto");
  });
});
