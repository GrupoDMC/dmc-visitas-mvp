import { describe, expect, it } from "vitest";
import { DIAS_POR_VENCER, enGarantia, garantiaDe, resumenGarantia, sumarMeses } from "@/lib/ui/garantia";

describe("sumarMeses", () => {
  it("suma meses y cruza el año", () => {
    expect(sumarMeses("2026-03-10", 12)).toBe("2027-03-10");
    expect(sumarMeses("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("si el día no existe en el mes de llegada, queda el último día", () => {
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(sumarMeses("2027-12-31", 2)).toBe("2028-02-29"); // 2028 es bisiesto
  });

  it("rechaza una fecha mal escrita", () => {
    expect(() => sumarMeses("10/03/2026", 1)).toThrow();
  });
});

describe("garantiaDe — duración y precedencia", () => {
  const hoy = "2026-06-01";

  it("manda la duración de la sucursal sobre el plan del cliente", () => {
    const g = garantiaDe({ fechaInstalacion: "2026-01-01", garantiaMeses: 6 }, { garantiaMeses: 24 }, hoy);
    expect(g.origen).toBe("SUCURSAL");
    expect(g.meses).toBe(6);
    expect(g.vence).toBe("2026-07-01");
  });

  it("sin duración propia aplica el plan del cliente", () => {
    const g = garantiaDe({ fechaInstalacion: "2026-01-01", garantiaMeses: null }, { garantiaMeses: 24 }, hoy);
    expect(g.origen).toBe("CLIENTE");
    expect(g.vence).toBe("2028-01-01");
    expect(g.estado).toBe("VIGENTE");
  });

  it("una sucursal con garantía propia más corta vence aunque el cliente siga cubierto", () => {
    const g = garantiaDe({ fechaInstalacion: "2025-01-01", garantiaMeses: 12 }, { garantiaMeses: 60 }, hoy);
    expect(g.estado).toBe("VENCIDA");
    expect(g.origen).toBe("SUCURSAL");
  });

  it("sin duración en ninguno, no hay garantía definida", () => {
    const g = garantiaDe({ fechaInstalacion: "2026-01-01" }, {}, hoy);
    expect(g).toMatchObject({ estado: "SIN_GARANTIA", origen: null, vence: null });
    expect(garantiaDe({ fechaInstalacion: "2026-01-01" }, undefined, hoy).estado).toBe("SIN_GARANTIA");
  });

  it("con duración pero sin fecha de instalación no hay vencimiento", () => {
    const g = garantiaDe({ fechaInstalacion: null, garantiaMeses: 12 }, undefined, hoy);
    expect(g).toMatchObject({ estado: "SIN_FECHA", origen: "SUCURSAL", meses: 12, vence: null });
  });
});

describe("garantiaDe — estado", () => {
  const sucursal = { fechaInstalacion: "2026-01-01", garantiaMeses: 6 }; // vence el 2026-07-01

  it("vigente cuando falta más que el umbral", () => {
    expect(garantiaDe(sucursal, undefined, "2026-05-01").estado).toBe("VIGENTE");
  });

  it("por vencer dentro del umbral, incluido el día exacto", () => {
    const limite = `2026-06-${String(31 - DIAS_POR_VENCER).padStart(2, "0")}`; // 30 días antes del 2026-07-01
    expect(garantiaDe(sucursal, undefined, limite)).toMatchObject({ estado: "POR_VENCER", diasRestantes: DIAS_POR_VENCER });
    expect(garantiaDe(sucursal, undefined, "2026-06-30").estado).toBe("POR_VENCER");
  });

  it("el día del vencimiento todavía cubre; al día siguiente ya no", () => {
    expect(garantiaDe(sucursal, undefined, "2026-07-01")).toMatchObject({ estado: "POR_VENCER", diasRestantes: 0 });
    expect(garantiaDe(sucursal, undefined, "2026-07-02")).toMatchObject({ estado: "VENCIDA", diasRestantes: -1 });
  });

  it("enGarantia solo es cierto para vigente y por vencer", () => {
    expect(enGarantia(garantiaDe(sucursal, undefined, "2026-05-01"))).toBe(true);
    expect(enGarantia(garantiaDe(sucursal, undefined, "2026-06-30"))).toBe(true);
    expect(enGarantia(garantiaDe(sucursal, undefined, "2026-08-01"))).toBe(false);
    expect(enGarantia(garantiaDe({}, undefined, "2026-08-01"))).toBe(false);
  });
});

describe("resumenGarantia", () => {
  it("dice de quién es la duración y cuándo vence", () => {
    const g = garantiaDe({ fechaInstalacion: "2026-01-01" }, { garantiaMeses: 12 }, "2026-12-01");
    expect(resumenGarantia(g)).toBe("12 meses · plan del cliente · vence el 2027-01-01 (vence en 31 días)");
  });

  it("avisa cuando falta la fecha o cuando ya venció", () => {
    expect(resumenGarantia(garantiaDe({ garantiaMeses: 1 }, undefined, "2026-01-01"))).toBe(
      "1 mes · propia de la sucursal · falta la fecha de instalación"
    );
    expect(resumenGarantia(garantiaDe({ fechaInstalacion: "2025-01-01", garantiaMeses: 6 }, undefined, "2026-01-01"))).toContain(
      "venció hace"
    );
  });
});
