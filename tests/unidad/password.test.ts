import { describe, expect, it } from "vitest";
import {
  LARGO_MINIMO_PASSWORD,
  esHashBcrypt,
  hashearPassword,
  validarPasswordNueva,
  verificarPassword,
} from "@/lib/password";

const EMAIL = "ana.perez@example.com";

describe("validarPasswordNueva", () => {
  it("acepta una contraseña razonable", () => {
    expect(validarPasswordNueva("Cielo-Azul-4821", EMAIL)).toBeNull();
  });

  it("rechaza vacía o solo espacios", () => {
    expect(validarPasswordNueva("", EMAIL)).toMatch(/vacía/);
    expect(validarPasswordNueva("     ", EMAIL)).toMatch(/vacía/);
  });

  it("exige el largo mínimo", () => {
    expect(validarPasswordNueva("Ab1-Cd2-E", EMAIL)).toMatch(/al menos/);
    expect(validarPasswordNueva("Ab1-Cd2-Ef", EMAIL)).toBeNull();
    expect(LARGO_MINIMO_PASSWORD).toBe(10);
  });

  it("rechaza más de 72 bytes (límite de bcrypt), contando los acentos", () => {
    expect(validarPasswordNueva("Ab1-" + "xyz".repeat(22) + "w", EMAIL)).toBeNull(); // 71 bytes
    expect(validarPasswordNueva("Ab1-" + "xyz".repeat(23), EMAIL)).toMatch(/demasiado larga/); // 73
    expect(validarPasswordNueva("ñ".repeat(37), EMAIL)).toMatch(/demasiado larga/); // 74 bytes, 37 caracteres
  });

  it("no deja usar el correo ni su parte local", () => {
    expect(validarPasswordNueva("Ana.Perez@Example.com", EMAIL)).toMatch(/correo/);
    expect(validarPasswordNueva("ana.perez.2026", "ana.perez.2026@example.com")).toMatch(/correo/);
  });

  it("rechaza las comunes y las de casi un solo carácter", () => {
    expect(validarPasswordNueva("Password123", EMAIL)).toMatch(/fácil/);
    expect(validarPasswordNueva("GrupoDMC2026", EMAIL)).toMatch(/fácil/);
    expect(validarPasswordNueva("ababababab", EMAIL)).toMatch(/fácil/);
  });
});

describe("hash bcrypt", () => {
  it("reconoce el formato", () => {
    expect(esHashBcrypt("$2b$12$abc")).toBe(true);
    expect(esHashBcrypt("$2a$10$abc")).toBe(true);
    expect(esHashBcrypt("0x1234")).toBe(false);
    expect(esHashBcrypt("")).toBe(false);
  });

  it("hashea y verifica; una clave distinta o un hash vacío o ajeno no pasan", async () => {
    const hash = await hashearPassword("Cielo-Azul-4821");
    expect(esHashBcrypt(hash)).toBe(true);
    expect(await verificarPassword("Cielo-Azul-4821", hash)).toBe(true);
    expect(await verificarPassword("otra-clave-1234", hash)).toBe(false);
    expect(await verificarPassword("x", "")).toBe(false);
    expect(await verificarPassword("x", "texto-sin-formato")).toBe(false);
  }, 20_000);
});
