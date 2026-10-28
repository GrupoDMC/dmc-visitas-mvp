import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RENOVAR_CADA, VIGENCIA_SESION, firmarToken, tocaRenovar, verificarToken } from "@/lib/session";

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const SECRETO = "s".repeat(40);

function base64Url(texto: string): string {
  return btoa(texto).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

beforeAll(() => {
  process.env.SESSION_SECRET = SECRETO;
});

afterEach(() => {
  process.env.SESSION_SECRET = SECRETO;
});

describe("token de sesión", () => {
  it("firma y verifica: devuelve uid, versión y vencimiento", async () => {
    const token = await firmarToken(7, 3, T0);
    const carga = await verificarToken(token, T0 + 1000);
    expect(carga).toEqual({ uid: 7, sv: 3, exp: Math.floor(T0 / 1000) + VIGENCIA_SESION });
  });

  it("conserva la versión de sesión 0", async () => {
    const carga = await verificarToken(await firmarToken(1, 0, T0), T0);
    expect(carga?.sv).toBe(0);
    expect(carga?.sinVersion).toBeUndefined();
  });

  it("rechaza un token sin valor o mal formado", async () => {
    expect(await verificarToken(undefined)).toBeNull();
    expect(await verificarToken("")).toBeNull();
    expect(await verificarToken("sinpunto")).toBeNull();
    expect(await verificarToken(".firma")).toBeNull();
    expect(await verificarToken("%%%.%%%")).toBeNull();
  });

  it("rechaza el cuerpo alterado (otro uid con la misma firma)", async () => {
    const token = await firmarToken(7, 1, T0);
    const firma = token.split(".")[1];
    const falso = base64Url(JSON.stringify({ uid: 1, exp: Math.floor(T0 / 1000) + 999999, sv: 1 }));
    expect(await verificarToken(`${falso}.${firma}`, T0)).toBeNull();
  });

  it("rechaza la firma alterada", async () => {
    const token = await firmarToken(7, 1, T0);
    const alterado = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
    expect(await verificarToken(alterado, T0)).toBeNull();
  });

  it("rechaza un token firmado con otro secreto", async () => {
    const token = await firmarToken(7, 1, T0);
    process.env.SESSION_SECRET = "x".repeat(40);
    // La clave importada se cachea por módulo: se reimporta limpio.
    vi.resetModules();
    const otro = await import("@/lib/session");
    expect(await otro.verificarToken(token, T0)).toBeNull();
  });

  it("vence: vigente justo antes y vencido en el instante de exp", async () => {
    const token = await firmarToken(7, 1, T0);
    expect(await verificarToken(token, T0 + (VIGENCIA_SESION - 1) * 1000)).not.toBeNull();
    expect(await verificarToken(token, T0 + VIGENCIA_SESION * 1000)).toBeNull();
    expect(await verificarToken(token, T0 + VIGENCIA_SESION * 1000 + 5000)).toBeNull();
  });

  it("un token anterior a la versión de sesión vale como versión 0 y se marca", async () => {
    const cuerpo = base64Url(JSON.stringify({ uid: 9, exp: Math.floor(T0 / 1000) + 600 }));
    const clave = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRETO),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(cuerpo)));
    let binario = "";
    for (const b of bytes) binario += String.fromCharCode(b);
    expect(await verificarToken(`${cuerpo}.${base64Url(binario)}`, T0)).toEqual({
      uid: 9,
      exp: Math.floor(T0 / 1000) + 600,
      sv: 0,
      sinVersion: true,
    });
  });

  it("sin SESSION_SECRET válido, firmar lanza y verificar devuelve null", async () => {
    process.env.SESSION_SECRET = "corto";
    vi.resetModules();
    const otro = await import("@/lib/session");
    await expect(otro.firmarToken(1, 0, T0)).rejects.toThrow(/SESSION_SECRET/);
    expect(await otro.verificarToken("a.b", T0)).toBeNull();
  });
});

describe("tocaRenovar", () => {
  it("no renueva un token recién firmado y sí uno con más de RENOVAR_CADA segundos", () => {
    const exp = Math.floor(T0 / 1000) + VIGENCIA_SESION;
    expect(tocaRenovar({ uid: 1, sv: 0, exp }, T0 + 1000)).toBe(false);
    expect(tocaRenovar({ uid: 1, sv: 0, exp }, T0 + (RENOVAR_CADA + 1) * 1000)).toBe(true);
  });
});
