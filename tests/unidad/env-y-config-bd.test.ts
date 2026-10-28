import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `enProduccion` se evalúa al importar el módulo: para probar los dos modos se
// vuelve a importar con NODE_ENV distinto.
async function cargar(nodeEnv: "production" | "test") {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  const env = await import("@/lib/env");
  const config = await import("@/lib/db/config");
  return { env, config };
}

const base = { DB_SERVER: "srv.ficticio.test", DB_NAME: "base_ficticia", DB_USER: "u", DB_PASSWORD: "p" };

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(base)) vi.stubEnv(k, v);
});
afterEach(() => vi.unstubAllEnvs());

describe("lib/env", () => {
  it("env recorta y trata vacío como ausente", async () => {
    const { env } = await cargar("test");
    vi.stubEnv("X_VACIA", "   ");
    vi.stubEnv("X_LLENA", "  hola  ");
    expect(env.env("X_VACIA")).toBeUndefined();
    expect(env.env("X_LLENA")).toBe("hola");
    expect(env.env("X_NO_EXISTE")).toBeUndefined();
  });

  it("envObligatoria explica qué falta", async () => {
    const { env } = await cargar("test");
    expect(() => env.envObligatoria("X_NO_EXISTE", "Defínela.")).toThrow(/Falta la variable de entorno X_NO_EXISTE\. Defínela\./);
  });

  it("envBooleana: true/1 son verdaderos; el resto falso; ausente usa el valor por defecto", async () => {
    const { env } = await cargar("test");
    vi.stubEnv("B1", "TRUE");
    vi.stubEnv("B2", "1");
    vi.stubEnv("B3", "no");
    expect(env.envBooleana("B1", false)).toBe(true);
    expect(env.envBooleana("B2", false)).toBe(true);
    expect(env.envBooleana("B3", true)).toBe(false);
    expect(env.envBooleana("B_AUSENTE", true)).toBe(true);
  });

  it("envNumero: positivo o error; ausente usa el valor por defecto", async () => {
    const { env } = await cargar("test");
    vi.stubEnv("N_OK", "250");
    vi.stubEnv("N_MALO", "abc");
    vi.stubEnv("N_CERO", "0");
    expect(env.envNumero("N_OK", 1)).toBe(250);
    expect(env.envNumero("N_AUSENTE", 7)).toBe(7);
    expect(() => env.envNumero("N_MALO", 1)).toThrow(/debe ser un número positivo/);
    expect(() => env.envNumero("N_CERO", 1)).toThrow(/debe ser un número positivo/);
  });

  it("hayConexionSql exige las cuatro variables; exigirConexionSql lo dice en español", async () => {
    const { env } = await cargar("test");
    expect(env.hayConexionSql()).toBe(true);
    vi.stubEnv("DB_PASSWORD", "");
    expect(env.hayConexionSql()).toBe(false);
    expect(() => env.exigirConexionSql()).toThrow(/Faltan las credenciales de SQL Server/);
  });
});

describe("lib/db/config: configuración del driver", () => {
  it("arma la configuración con valores por defecto seguros", async () => {
    const { config } = await cargar("test");
    const c = config.getSqlConfig();
    expect(c).toMatchObject({
      server: "srv.ficticio.test",
      database: "base_ficticia",
      user: "u",
      password: "p",
      port: 1433,
      options: { encrypt: true, trustServerCertificate: false },
      connectionTimeout: 15_000,
      requestTimeout: 15_000,
      pool: { max: 4, min: 0 },
    });
  });

  it("respeta puerto y pool configurados", async () => {
    const { config } = await cargar("test");
    vi.stubEnv("DB_PORT", "14330");
    vi.stubEnv("DB_POOL_MAX", "2");
    expect(config.getSqlConfig()).toMatchObject({ port: 14330, pool: { max: 2 } });
  });

  it("falla con el nombre de la variable que falta", async () => {
    const { config } = await cargar("test");
    for (const faltante of ["DB_NAME", "DB_USER", "DB_PASSWORD", "DB_SERVER"]) {
      vi.stubEnv(faltante, "");
      expect(() => config.getSqlConfig(), faltante).toThrow(new RegExp(faltante));
      vi.stubEnv(faltante, (base as Record<string, string>)[faltante]);
    }
  });

  it("rechaza la autenticación integrada de Windows (tedious no la soporta)", async () => {
    const { config } = await cargar("test");
    vi.stubEnv("DB_TRUSTED_CONNECTION", "true");
    expect(() => config.getSqlConfig()).toThrow(/DB_TRUSTED_CONNECTION=true no está soportado/);
  });

  it("en producción NO permite desactivar el cifrado", async () => {
    const { config } = await cargar("production");
    vi.stubEnv("DB_ENCRYPT", "false");
    expect(() => config.getSqlConfig()).toThrow(/DB_ENCRYPT=false en producción/);
  });

  it("fuera de producción sí permite desactivarlo", async () => {
    const { config } = await cargar("test");
    vi.stubEnv("DB_ENCRYPT", "false");
    expect(config.getSqlConfig().options?.encrypt).toBe(false);
  });

  it("en producción, confiar en el certificado avisa pero no bloquea el despliegue", async () => {
    const { config } = await cargar("production");
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("DB_TRUST_SERVER_CERT", "true");
    expect(config.getSqlConfig().options?.trustServerCertificate).toBe(true);
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining("DB_TRUST_SERVER_CERT=true en producción"));
    aviso.mockRestore();
  });

  it("describirDestinoSql no incluye usuario ni contraseña", async () => {
    const { config } = await cargar("test");
    vi.stubEnv("DB_PORT", "14330");
    const destino = config.describirDestinoSql();
    expect(destino).toBe("srv.ficticio.test:14330/base_ficticia");
    expect(destino).not.toMatch(/\bu\b|\bp\b/);
  });
});
