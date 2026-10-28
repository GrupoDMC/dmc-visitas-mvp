import { describe, expect, it } from "vitest";
import { agruparPorSeccion, hayAlgunaSeccion } from "@/lib/ui/secciones";
import { algunoPideHora, motivoPideHora, trabajosDelMotivo } from "@/lib/ui/motivos";
import { calibracionDeSucursal, formASiNo, mesesDeForm, siNoAForm } from "@/lib/ui/sino";

describe("agruparPorSeccion", () => {
  it("ordena las secciones por su orden y deja al final lo que no tiene", () => {
    const grupos = agruparPorSeccion([
      { id: 1, seccion: "B", seccionOrden: 2 },
      { id: 2, seccion: null },
      { id: 3, seccion: "A", seccionOrden: 1 },
      { id: 4, seccion: "B", seccionOrden: 2 },
    ]);
    expect(grupos.map((g) => g.nombre)).toEqual(["A", "B", null]);
    expect(grupos[1].items.map((i) => i.id)).toEqual([1, 4]);
  });

  it("sin secciones devuelve un solo grupo sin nombre", () => {
    const grupos = agruparPorSeccion([{ id: 1 }, { id: 2, seccion: "  " }]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].nombre).toBeNull();
    expect(hayAlgunaSeccion([{ seccion: undefined }, { seccion: " " }])).toBe(false);
    expect(hayAlgunaSeccion([{ seccion: "A" }])).toBe(true);
  });

  it("una lista vacía no genera grupos", () => {
    expect(agruparPorSeccion([])).toEqual([]);
  });
});

describe("motivoPideHora (solo las instalaciones piden hora)", () => {
  it.each([
    ["Instalación de las antenas", true],
    ["  INSTALACION de portillones", true],
    ["Instalación de contadores", true],
    ["Reinstalación de las antenas", false],
    ["Desinstalación de las antenas", false],
    ["Visita preventiva Antenas", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("%s → %s", (nombre, esperado) => {
    expect(motivoPideHora(nombre)).toBe(esperado);
  });

  it("manda el nombre del catálogo, no el código", () => {
    const catalogo = [
      { codigo: "INSTALACION", nombre: "Visita preventiva Antenas" },
      { codigo: "NUEVO", nombre: "Instalación de muebles" },
    ];
    expect(algunoPideHora(["INSTALACION"], catalogo)).toBe(false);
    expect(algunoPideHora(["INSTALACION", "NUEVO"], catalogo)).toBe(true);
    expect(algunoPideHora([], catalogo)).toBe(false);
    expect(algunoPideHora(["NO_EXISTE"], catalogo)).toBe(false);
  });
});

describe("trabajosDelMotivo", () => {
  const trabajos = [
    { codigo: "a", motivosCodigos: ["M1"], ordenEnMotivo: { M1: 2 }, orden: 1 },
    { codigo: "b", motivosCodigos: ["M1", "M2"], ordenEnMotivo: { M1: 1 }, orden: 9 },
    { codigo: "c", motivosCodigos: ["M2"], ordenEnMotivo: {}, orden: 3 },
    { codigo: "d", motivosCodigos: [], ordenEnMotivo: {}, orden: 0 },
  ];

  it("filtra por motivo y respeta el orden dentro del motivo", () => {
    expect(trabajosDelMotivo(trabajos, "M1").map((t) => t.codigo)).toEqual(["b", "a"]);
  });
  it("cae en el orden general si el motivo no define uno propio", () => {
    expect(trabajosDelMotivo(trabajos, "M2").map((t) => t.codigo)).toEqual(["c", "b"]);
  });
  it("un trabajo sin motivos no aparece en ninguno", () => {
    expect(trabajosDelMotivo(trabajos, "M3")).toEqual([]);
  });
});

describe("sí / no / sin indicar", () => {
  it("siNoAForm y formASiNo son inversas, con «sin indicar» = null", () => {
    expect([true, false, null, undefined].map(siNoAForm)).toEqual(["si", "no", "", ""]);
    expect(["si", "no", "", undefined, "x"].map(formASiNo)).toEqual([true, false, null, null, null]);
  });

  it("mesesDeForm: vacío = sin plazo; 1–240 enteros; el resto es inválido", () => {
    expect(mesesDeForm("")).toBeNull();
    expect(mesesDeForm("  ")).toBeNull();
    expect(mesesDeForm(undefined)).toBeNull();
    expect(mesesDeForm("12")).toBe(12);
    expect(mesesDeForm("1")).toBe(1);
    expect(mesesDeForm("240")).toBe(240);
    for (const malo of ["0", "241", "1.5", "-3", "abc"]) expect(mesesDeForm(malo)).toBeUndefined();
  });

  it("calibracionDeSucursal: si el cliente está en plan, la tienda también", () => {
    expect(calibracionDeSucursal({ planCalibracion: false }, { planCalibracion: true })).toEqual({ valor: true, porCliente: true });
    expect(calibracionDeSucursal({ planCalibracion: true }, { planCalibracion: false })).toEqual({ valor: true, porCliente: false });
    expect(calibracionDeSucursal({}, undefined)).toEqual({ valor: null, porCliente: false });
  });
});
