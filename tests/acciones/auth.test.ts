import bcrypt from "bcryptjs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/intentos-login", () => ({
  intentoBloqueado: vi.fn(),
  registrarIntento: vi.fn(),
}));
vi.mock("@/lib/data/solicitudes-password", () => ({ crearSolicitudPassword: vi.fn() }));
vi.mock("@/lib/data/auditoria", () => ({ auditar: vi.fn() }));
vi.mock("@/lib/data/reservas", () => ({ liberarReservasDelUsuario: vi.fn() }));

import { cambiarPasswordAction, loginAction, logoutAction, solicitarPasswordAction } from "@/app/actions/auth";
import { intentoBloqueado, registrarIntento } from "@/lib/data/intentos-login";
import { crearSolicitudPassword } from "@/lib/data/solicitudes-password";
import { auditar } from "@/lib/data/auditoria";
import { liberarReservasDelUsuario } from "@/lib/data/reservas";
import { cambiarPasswordPropia, getUsuarioPorEmail, registrarAcceso } from "@/lib/data/usuarios";
import {
  TECNICO_PRUEBA,
  cookiesBorradas,
  cookiesEscritas,
  destinoDeRedirect,
  entrarComo,
  formulario,
  salir,
} from "../helpers/sesion";

const CLAVE = "Clave-Segura-123";
let hash = "";

function registro(rol: "ADMIN" | "COORDINADOR" | "TECNICO", extra: { usuario?: object; tecnico?: unknown; debeCambiarPassword?: boolean } = {}) {
  return {
    usuario: {
      id: 7,
      email: "alguien@example.com",
      rol,
      rolId: null,
      tecnicoId: rol === "TECNICO" ? TECNICO_PRUEBA.id : null,
      activo: true,
      ultimoAccesoEn: null,
      ...extra.usuario,
    },
    tecnico: "tecnico" in extra ? extra.tecnico : rol === "TECNICO" ? TECNICO_PRUEBA : null,
    passwordHash: hash,
    sesionVersion: 3,
    debeCambiarPassword: extra.debeCambiarPassword ?? false,
  };
}

beforeAll(async () => {
  hash = await bcrypt.hash(CLAVE, 4);
});

beforeEach(() => {
  vi.clearAllMocks();
  salir();
  vi.mocked(intentoBloqueado).mockResolvedValue(false);
  vi.mocked(getUsuarioPorEmail).mockResolvedValue(null);
});

const entrar = (email: string, password: string) => formulario({ email, password });
const VACIO = { error: null };

describe("loginAction", () => {
  it("sin correo o sin clave pide ambos y no consulta nada", async () => {
    expect(await loginAction(VACIO, entrar("", ""))).toEqual({ error: "Ingresa tu correo y contraseña." });
    expect(await loginAction(VACIO, entrar("a@b.cl", ""))).toEqual({ error: "Ingresa tu correo y contraseña." });
    expect(getUsuarioPorEmail).not.toHaveBeenCalled();
  });

  it("un correo o clave de largo absurdo se rechaza sin tocar la base ni gastar un hash", async () => {
    const r = await loginAction(VACIO, entrar("a".repeat(500) + "@b.cl", CLAVE));
    expect(r.error).toBe("Correo o contraseña incorrectos.");
    expect(getUsuarioPorEmail).not.toHaveBeenCalled();
    expect(intentoBloqueado).not.toHaveBeenCalled();
  });

  it("correo inexistente y clave mala dan exactamente el mismo mensaje", async () => {
    const inexistente = await loginAction(VACIO, entrar("nadie@example.com", CLAVE));

    vi.mocked(getUsuarioPorEmail).mockResolvedValue(registro("ADMIN") as never);
    const claveMala = await loginAction(VACIO, entrar("alguien@example.com", "otra-clave-cualquiera"));

    expect(inexistente).toEqual({ error: "Correo o contraseña incorrectos." });
    expect(claveMala).toEqual(inexistente);
    expect(cookiesEscritas).toEqual([]);
    expect(registrarAcceso).not.toHaveBeenCalled();
    // Cada intento fallido queda anotado.
    expect(registrarIntento).toHaveBeenCalledTimes(2);
    expect(vi.mocked(registrarIntento).mock.calls.every((c) => c[2] === false)).toBe(true);
  });

  it("una cuenta desactivada no entra aunque la clave sea buena (y no se distingue)", async () => {
    vi.mocked(getUsuarioPorEmail).mockResolvedValue(registro("ADMIN", { usuario: { activo: false } }) as never);
    const r = await loginAction(VACIO, entrar("alguien@example.com", CLAVE));
    expect(r.error).toBe("Correo o contraseña incorrectos.");
    expect(cookiesEscritas).toEqual([]);
  });

  it("un técnico cuya ficha de técnico está inactiva tampoco entra", async () => {
    vi.mocked(getUsuarioPorEmail).mockResolvedValue(
      registro("TECNICO", { tecnico: { ...TECNICO_PRUEBA, activo: false } }) as never
    );
    const r = await loginAction(VACIO, entrar("alguien@example.com", CLAVE));
    expect(r.error).toBe("Correo o contraseña incorrectos.");
  });

  it("con demasiados intentos avisa de la espera y ni siquiera mira el correo", async () => {
    vi.mocked(intentoBloqueado).mockResolvedValue(true);
    const r = await loginAction(VACIO, entrar("alguien@example.com", CLAVE));
    expect(r.error).toMatch(/Demasiados intentos seguidos/);
    expect(getUsuarioPorEmail).not.toHaveBeenCalled();
    expect(cookiesEscritas).toEqual([]);
  });

  it("el correo se normaliza (minúsculas, sin espacios) y se pasa la IP real del proxy", async () => {
    await loginAction(VACIO, entrar("  Alguien@Example.COM ", "x"));
    expect(getUsuarioPorEmail).toHaveBeenCalledWith("alguien@example.com");
    expect(intentoBloqueado).toHaveBeenCalledWith("alguien@example.com", "203.0.113.9");
  });

  it.each([
    ["ADMIN", "/admin"],
    ["COORDINADOR", "/admin"],
    ["TECNICO", "/tecnico"],
  ] as const)("%s con clave buena abre sesión y va a %s", async (rol, destino) => {
    vi.mocked(getUsuarioPorEmail).mockResolvedValue(registro(rol) as never);
    expect(await destinoDeRedirect(() => loginAction(VACIO, entrar("alguien@example.com", CLAVE)))).toBe(destino);

    expect(cookiesEscritas.map((c) => c.nombre).sort()).toEqual(["dmc_exp", "dmc_session"]);
    expect(registrarAcceso).toHaveBeenCalledWith(7);
    expect(vi.mocked(registrarIntento).mock.calls[0][2]).toBe(true);
  });

  it("quien debe cambiar su clave va a /cambiar-password", async () => {
    vi.mocked(getUsuarioPorEmail).mockResolvedValue(registro("ADMIN", { debeCambiarPassword: true }) as never);
    expect(await destinoDeRedirect(() => loginAction(VACIO, entrar("alguien@example.com", CLAVE)))).toBe("/cambiar-password");
  });

  it("si la base falla no filtra el detalle al usuario", async () => {
    vi.mocked(getUsuarioPorEmail).mockRejectedValue(new Error("Login failed for user 'sa' at 10.0.0.5"));
    const r = await loginAction(VACIO, entrar("alguien@example.com", CLAVE));
    expect(r.error).toBe("No se pudo validar el acceso. Avisa al administrador del sistema.");
    expect(JSON.stringify(r)).not.toMatch(/10\.0\.0\.5|'sa'/);
  });
});

describe("solicitarPasswordAction (olvidé mi contraseña)", () => {
  it("valida el correo", async () => {
    const r = await solicitarPasswordAction({ ok: false, error: null }, formulario({ email: "x" }));
    expect(r.ok).toBe(false);
    expect(crearSolicitudPassword).not.toHaveBeenCalled();
  });

  it("registra la solicitud con el mensaje y la IP, y responde igual exista o no la cuenta", async () => {
    const r = await solicitarPasswordAction(
      { ok: false, error: null },
      formulario({ email: "cualquiera@example.com", mensaje: "No recuerdo mi clave" })
    );
    expect(r).toEqual({ ok: true, error: null });
    expect(crearSolicitudPassword).toHaveBeenCalledWith("cualquiera@example.com", "No recuerdo mi clave", "203.0.113.9");
  });

  it("si falla al guardar, lo dice sin detalles", async () => {
    vi.mocked(crearSolicitudPassword).mockRejectedValue(new Error("deadlock"));
    const r = await solicitarPasswordAction({ ok: false, error: null }, formulario({ email: "a@example.com" }));
    expect(r.ok).toBe(false);
    expect(r.error).not.toMatch(/deadlock/);
  });
});

describe("cambiarPasswordAction (cambio obligatorio)", () => {
  const cambio = (nueva: string, repetida: string) => formulario({ nueva, repetida });

  it("sin sesión de «debe cambiar clave» manda al login", async () => {
    expect(await destinoDeRedirect(() => cambiarPasswordAction(VACIO, cambio("x", "x")))).toBe("/login");
    entrarComo("admin"); // sesión normal: tampoco corresponde a este flujo
    expect(await destinoDeRedirect(() => cambiarPasswordAction(VACIO, cambio("x", "x")))).toBe("/login");
  });

  describe("con el cambio pendiente", () => {
    beforeEach(() => entrarComo("admin", { debeCambiarPassword: true }));

    it("rechaza claves distintas, cortas o iguales al correo", async () => {
      expect((await cambiarPasswordAction(VACIO, cambio("Clave-Nueva-1234", "Clave-Nueva-9999"))).error).toBe(
        "Las dos contraseñas no coinciden."
      );
      expect((await cambiarPasswordAction(VACIO, cambio("corta", "corta"))).error).toBeTruthy();
      expect((await cambiarPasswordAction(VACIO, cambio("admin@example.com", "admin@example.com"))).error).toBeTruthy();
      expect(cambiarPasswordPropia).not.toHaveBeenCalled();
    });

    it("si la nueva es igual a la temporal, lo avisa", async () => {
      vi.mocked(cambiarPasswordPropia).mockResolvedValue(null);
      const r = await cambiarPasswordAction(VACIO, cambio("Clave-Nueva-1234", "Clave-Nueva-1234"));
      expect(r.error).toMatch(/distinta de la que te entregaron/);
    });

    it("con una clave válida cambia, re-firma la sesión, audita y entra al panel", async () => {
      vi.mocked(cambiarPasswordPropia).mockResolvedValue(4);
      const destino = await destinoDeRedirect(() => cambiarPasswordAction(VACIO, cambio("Clave-Nueva-1234", "Clave-Nueva-1234")));
      expect(destino).toBe("/admin");
      expect(cambiarPasswordPropia).toHaveBeenCalledWith(1, "Clave-Nueva-1234");
      expect(cookiesEscritas.map((c) => c.nombre)).toContain("dmc_session");
      expect(auditar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accion: "password.cambio" }));
    });

    it("la contraseña no se recorta: se guarda con sus espacios", async () => {
      await destinoDeRedirect(() => cambiarPasswordAction(VACIO, cambio("  Clave-Nueva-1234  ", "  Clave-Nueva-1234  ")));
      expect(cambiarPasswordPropia).toHaveBeenCalledWith(1, "  Clave-Nueva-1234  ");
    });

    it("un error de la base no se muestra tal cual", async () => {
      vi.mocked(cambiarPasswordPropia).mockRejectedValue(new Error("timeout conexion 10.0.0.5"));
      const r = await cambiarPasswordAction(VACIO, cambio("Clave-Nueva-1234", "Clave-Nueva-1234"));
      expect(r.error).not.toMatch(/10\.0\.0\.5/);
    });
  });
});

describe("logoutAction", () => {
  it("suelta las reservas del técnico, borra las cookies y va al login", async () => {
    entrarComo("tecnico");
    expect(await destinoDeRedirect(logoutAction)).toBe("/login");
    expect(liberarReservasDelUsuario).toHaveBeenCalledWith(3);
    expect(cookiesBorradas).toEqual(expect.arrayContaining(["dmc_session", "dmc_exp"]));
  });

  it("un administrador no tiene reservas que soltar", async () => {
    entrarComo("admin");
    await destinoDeRedirect(logoutAction);
    expect(liberarReservasDelUsuario).not.toHaveBeenCalled();
  });

  it("sin sesión igual cierra y redirige", async () => {
    expect(await destinoDeRedirect(logoutAction)).toBe("/login");
  });
});
