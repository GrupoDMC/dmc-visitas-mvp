import { describe, expect, it } from "vitest";
import {
  errorDeActa,
  errorDeEdicion,
  motivoParaNoCerrar,
  motivoParaNoEditar,
  TOMADA_POR_OTRO,
  type EquipoVisita,
} from "@/lib/validacion/reglas-acta";
import type { ActaEntrada, EdicionActaEntrada } from "@/lib/contratos/acta";

const equipo = (cambios: Partial<EquipoVisita> = {}): EquipoVisita => ({
  estado: "PROGRAMADA",
  tecnicoId: 1,
  tecnicoAyudanteId: 2,
  tomadaPorTecnicoId: null,
  ...cambios,
});

const acta = (cambios: Partial<ActaEntrada> = {}): ActaEntrada =>
  ({
    folio: "V-1",
    responsableNombre: "Ana",
    motivosCodigos: ["CAL"],
    problemas: [],
    firma: { nombre: "Ana", rut: null, dataUrl: "data:image/png;base64," },
    ...cambios,
  }) as ActaEntrada;

describe("quién puede cerrar el acta", () => {
  it("el asignado o el ayudante, si está programada", () => {
    expect(motivoParaNoCerrar(equipo(), 1)).toBeNull();
    expect(motivoParaNoCerrar(equipo(), 2)).toBeNull();
    expect(motivoParaNoCerrar(equipo(), 3)).toMatch(/no está asignada/);
  });

  it("en curso, solo quien la inició", () => {
    expect(motivoParaNoCerrar(equipo({ estado: "EN_CURSO", tomadaPorTecnicoId: 2 }), 1)).toBe(TOMADA_POR_OTRO);
    expect(motivoParaNoCerrar(equipo({ estado: "EN_CURSO", tomadaPorTecnicoId: 2 }), 2)).toBeNull();
  });

  it("no se cierra dos veces ni una visita que ya salió de agenda", () => {
    expect(motivoParaNoCerrar(equipo({ estado: "COMPLETADA" }), 1)).toMatch(/ya quedó cerrada/);
    expect(motivoParaNoCerrar(equipo({ estado: "CANCELADA" }), 1)).toMatch(/ya no se puede cerrar/);
  });

  it("corregir desde el celular: solo el equipo de la visita", () => {
    expect(motivoParaNoEditar(equipo({ estado: "COMPLETADA" }), 2)).toBeNull();
    expect(motivoParaNoEditar(equipo({ estado: "COMPLETADA" }), 9)).toMatch(/no está asignada/);
  });
});

describe("lo que tiene que traer el acta", () => {
  it("completa, pasa", () => {
    expect(errorDeActa(acta())).toBeNull();
  });

  it("motivo, responsable y firma", () => {
    expect(errorDeActa(acta({ motivosCodigos: [""] }))).toMatch(/motivo/);
    expect(errorDeActa(acta({ responsableNombre: "  " }))).toMatch(/responsable/);
    expect(errorDeActa(acta({ firma: null }))).toMatch(/firma/);
  });

  it("un problema «Otro» necesita descripción", () => {
    const otro = { tipoCodigo: "OTRO", estado: "ABIERTO", descripcion: " ", solucion: null, items: [] };
    expect(errorDeActa(acta({ problemas: [otro] }))).toMatch(/Otro/);
  });

  it("una corrección dice por qué", () => {
    const base = { motivoEdicion: "Error de tipeo", motivosCodigos: ["CAL"], responsableNombre: "Ana", problemas: [] };
    expect(errorDeEdicion(base as unknown as EdicionActaEntrada)).toBeNull();
    expect(errorDeEdicion({ ...base, motivoEdicion: "ok" } as unknown as EdicionActaEntrada)).toMatch(/por qué/);
  });
});
