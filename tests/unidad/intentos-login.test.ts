import { beforeEach, describe, expect, it, vi } from "vitest";

// La capa de datos va simulada: ningún test abre una conexión a SQL Server.
// La ventana de 15 minutos y el conteo de fallos viven en la consulta; acá se
// prueba lo que decide el código con lo que la consulta cuenta, y qué se pide
// a la base.
const consultaCon = vi.fn();
const ejecutar = vi.fn();

vi.mock("@/lib/data/sql", () => ({
  consultaCon: (...args: unknown[]) => consultaCon(...args),
  ejecutar: (...args: unknown[]) => ejecutar(...args),
  num: (v: unknown) => (typeof v === "number" ? v : Number(v)),
  sql: { NVarChar: () => "nvarchar", VarChar: () => "varchar", Bit: "bit" },
}));

import {
  MAX_FALLOS_IP,
  correoDeIntento,
  hayFreno,
  intentoBloqueado,
  registrarIntento,
} from "@/lib/data/intentos-login";

beforeEach(() => {
  vi.restoreAllMocks();
  consultaCon.mockReset();
  ejecutar.mockReset();
  ejecutar.mockResolvedValue(1);
});

describe("hayFreno", () => {
  it("frena cuando la cuenta cumple el tope de fallos", () => {
    expect(hayFreno({ cuenta: 1, fallos_ip: 0 })).toBe(true);
  });

  it("frena por origen al llegar al tope de IP, no antes", () => {
    expect(hayFreno({ cuenta: 0, fallos_ip: MAX_FALLOS_IP - 1 })).toBe(false);
    expect(hayFreno({ cuenta: 0, fallos_ip: MAX_FALLOS_IP })).toBe(true);
  });

  it("deja pasar si no hay nada que contar", () => {
    expect(hayFreno({ cuenta: 0, fallos_ip: 0 })).toBe(false);
    expect(hayFreno(undefined)).toBe(false);
  });

  it("entiende los números que tedious devuelve como texto", () => {
    expect(hayFreno({ cuenta: "1", fallos_ip: "0" })).toBe(true);
    expect(hayFreno({ cuenta: "0", fallos_ip: "31" })).toBe(true);
  });
});

describe("correoDeIntento", () => {
  it("normaliza y acota", () => {
    expect(correoDeIntento("  Ana@Example.COM ")).toBe("ana@example.com");
    expect(correoDeIntento("a".repeat(500))).toHaveLength(160);
  });
});

describe("intentoBloqueado", () => {
  it("consulta con el correo normalizado y la IP", async () => {
    consultaCon.mockResolvedValue([{ cuenta: 0, fallos_ip: 0 }]);
    expect(await intentoBloqueado(" ANA@example.com ", "10.0.0.1")).toBe(false);
    const [texto, params] = consultaCon.mock.calls[0];
    expect(texto).toContain("dmc.intento_login");
    expect(params.map((p: unknown[]) => [p[0], p[2]])).toEqual([
      ["email", "ana@example.com"],
      ["ip", "10.0.0.1"],
    ]);
  });

  it("bloquea según lo que cuenta la base", async () => {
    consultaCon.mockResolvedValueOnce([{ cuenta: 1, fallos_ip: 2 }]);
    expect(await intentoBloqueado("a@example.com", "10.0.0.1")).toBe(true);
    consultaCon.mockResolvedValueOnce([{ cuenta: 0, fallos_ip: 45 }]);
    expect(await intentoBloqueado("b@example.com", "10.0.0.2")).toBe(true);
  });

  it("sin filas no bloquea", async () => {
    consultaCon.mockResolvedValue([]);
    expect(await intentoBloqueado("a@example.com", null)).toBe(false);
  });

  it("si la base falla, el error sube (quien llama decide)", async () => {
    consultaCon.mockRejectedValue(new Error("sin conexión"));
    await expect(intentoBloqueado("a@example.com", null)).rejects.toThrow("sin conexión");
  });
});

describe("registrarIntento", () => {
  it("anota el correo normalizado, la IP y si acertó", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await registrarIntento(" Ana@Example.com", "10.0.0.1", false);
    expect(ejecutar).toHaveBeenCalledTimes(1);
    const [texto, params] = ejecutar.mock.calls[0];
    expect(texto).toContain("INSERT INTO dmc.intento_login");
    expect(params.map((p: unknown[]) => p[2])).toEqual(["ana@example.com", "10.0.0.1", false]);
  });

  it("de vez en cuando barre los intentos viejos", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    await registrarIntento("a@example.com", null, true);
    expect(ejecutar).toHaveBeenCalledTimes(2);
    expect(ejecutar.mock.calls[1][0]).toContain("DELETE TOP (1000) FROM dmc.intento_login");
  });

  it("si el barrido falla, no rompe el login", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    vi.spyOn(console, "error").mockImplementation(() => {});
    ejecutar.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error("lock"));
    await expect(registrarIntento("a@example.com", null, true)).resolves.toBeUndefined();
  });
});
