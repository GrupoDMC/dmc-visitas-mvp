import { describe, expect, it } from "vitest";
import {
  diaDeVisita,
  fechaHoraLegible,
  hoyISO,
  inicioMes,
  inicioSemana,
  sumarDias,
  textoFechaVisita,
} from "@/lib/ui/fecha";

describe("hoyISO (siempre en hora de Chile)", () => {
  it("de noche en Chile no salta al día siguiente aunque el servidor esté en UTC", () => {
    // 2026-07-15 02:30 UTC = 14-jul 22:30 en Chile (UTC-4 en invierno).
    expect(hoyISO(new Date("2026-07-15T02:30:00Z"))).toBe("2026-07-14");
  });

  it("en verano el huso es UTC-3", () => {
    // 2026-01-10 02:30 UTC = 9-ene 23:30 (UTC-3).
    expect(hoyISO(new Date("2026-01-10T02:30:00Z"))).toBe("2026-01-09");
    expect(hoyISO(new Date("2026-01-10T03:30:00Z"))).toBe("2026-01-10");
  });
});

describe("inicioSemana / sumarDias / inicioMes", () => {
  it("el lunes es el inicio; el domingo pertenece a la semana que termina", () => {
    expect(inicioSemana("2026-10-26")).toBe("2026-10-26"); // lunes
    expect(inicioSemana("2026-10-28")).toBe("2026-10-26"); // miércoles
    expect(inicioSemana("2026-11-01")).toBe("2026-10-26"); // domingo
    expect(inicioSemana("2026-11-02")).toBe("2026-11-02");
  });

  it("cruza meses y años sin salirse del calendario", () => {
    expect(inicioSemana("2027-01-01")).toBe("2026-12-28");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29"); // bisiesto
    expect(sumarDias("2026-10-28", 0)).toBe("2026-10-28");
  });

  it("inicioMes devuelve el día 1", () => {
    expect(inicioMes("2026-10-28")).toBe("2026-10-01");
  });
});

describe("fechaHoraLegible", () => {
  it("formatea sin interpretar el huso", () => {
    expect(fechaHoraLegible("2026-08-24T14:35:10")).toBe("24 ago 2026 · 14:35");
    expect(fechaHoraLegible("2026-01-05 09:05:00")).toBe("5 ene 2026 · 09:05");
  });
  it("vacío → raya; texto raro → tal cual", () => {
    expect(fechaHoraLegible(null)).toBe("—");
    expect(fechaHoraLegible(undefined)).toBe("—");
    expect(fechaHoraLegible("")).toBe("—");
    expect(fechaHoraLegible("ayer")).toBe("ayer");
  });
});

describe("diaDeVisita (visitas con margen de días)", () => {
  const v = { fechaProgramada: "2026-10-26", fechaHasta: "2026-10-30", estado: "PROGRAMADA" };

  it("sin margen, o aún no empieza, es su día", () => {
    expect(diaDeVisita({ fechaProgramada: "2026-10-26", estado: "PROGRAMADA" }, "2026-10-28")).toBe("2026-10-26");
    expect(diaDeVisita(v, "2026-10-25")).toBe("2026-10-26");
    expect(diaDeVisita(v, "2026-10-26")).toBe("2026-10-26");
  });

  it("abierta y dentro del margen se corre a «hoy»", () => {
    expect(diaDeVisita(v, "2026-10-28")).toBe("2026-10-28");
    expect(diaDeVisita({ ...v, estado: "EN_CURSO" }, "2026-10-29")).toBe("2026-10-29");
  });

  it("pasado el margen se queda en el último día", () => {
    expect(diaDeVisita(v, "2026-11-03")).toBe("2026-10-30");
  });

  it("cerrada o cancelada no se corre", () => {
    expect(diaDeVisita({ ...v, estado: "COMPLETADA" }, "2026-10-28")).toBe("2026-10-26");
    expect(diaDeVisita({ ...v, estado: "CANCELADA" }, "2026-10-28")).toBe("2026-10-26");
  });
});

describe("textoFechaVisita", () => {
  it("muestra el rango solo si hay margen", () => {
    expect(textoFechaVisita({ fechaProgramada: "2026-10-26" })).toBe("2026-10-26");
    expect(textoFechaVisita({ fechaProgramada: "2026-10-26", fechaHasta: "2026-10-30" })).toBe("2026-10-26 → 2026-10-30");
  });
});
