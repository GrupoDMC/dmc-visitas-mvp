import { vi } from "vitest";

// Entorno de Next simulado para Server Actions y rutas API. La sesión es falsa
// solo en sus capas bajas (ver tests/helpers/sesion.ts): `getSesion` y
// `sesionCon` de lib/auth se ejecutan de verdad.

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("next/navigation", async () => {
  const { RedirectFalso } = await import("../helpers/sesion");
  return {
    redirect: (destino: string) => {
      throw new RedirectFalso(destino);
    },
    notFound: () => {
      throw new Error("NEXT_NOT_FOUND");
    },
  };
});

vi.mock("next/headers", async () => {
  const { estado, cookiesEscritas, cookiesBorradas } = await import("../helpers/sesion");
  const almacen = {
    get: (nombre: string) => (nombre === "dmc_session" && estado.token ? { name: nombre, value: "token-falso" } : undefined),
    set: (nombre: string, valor: string) => {
      cookiesEscritas.push({ nombre, valor });
    },
    delete: (nombre: string) => {
      cookiesBorradas.push(nombre);
    },
  };
  return {
    cookies: async () => almacen,
    headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }),
  };
});

vi.mock("@/lib/session", async (importar) => {
  const real = await importar<typeof import("@/lib/session")>();
  const { estado } = await import("../helpers/sesion");
  return { ...real, verificarToken: async () => estado.token, firmarToken: async () => "token-firmado-falso" };
});

vi.mock("@/lib/data/roles", async (importar) => {
  const real = await importar<typeof import("@/lib/data/roles")>();
  const { estado } = await import("../helpers/sesion");
  return { ...real, accesoDeUsuario: async () => estado.acceso };
});

vi.mock("@/lib/data/usuarios", async (importar) => {
  const real = await importar<typeof import("@/lib/data/usuarios")>();
  const { estado } = await import("../helpers/sesion");
  return {
    ...real,
    getUsuarioPorId: vi.fn(async () => estado.registro),
    getUsuarioPorEmail: vi.fn(async () => null),
    registrarAcceso: vi.fn(async () => undefined),
    cambiarPasswordPropia: vi.fn(async () => 1),
  };
});

// El log estructurado se silencia (y se puede inspeccionar): los tests de
// error provocan fallos a propósito y no deben ensuciar la salida.
vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
