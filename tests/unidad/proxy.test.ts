import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "@/proxy";
import { COOKIE_EXPIRA, COOKIE_SESION, VIGENCIA_SESION, firmarToken } from "@/lib/session";
import { CSP_CABECERA } from "@/lib/csp";

const peticion = (ruta: string, cookies: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${ruta}`, {
    headers: Object.keys(cookies).length ? { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") } : {},
  });

const redirigeA = (r: Response) => (r.status >= 300 && r.status < 400 ? new URL(r.headers.get("location") ?? "").pathname : null);

describe("proxy: la puerta de entrada", () => {
  it("/login y el receptor de CSP son públicos y llevan la política con un nonce nuevo", async () => {
    const a = await proxy(peticion("/login"));
    const b = await proxy(peticion("/login"));
    expect(a.status).toBe(200);
    const cspA = a.headers.get(CSP_CABECERA) ?? "";
    const cspB = b.headers.get(CSP_CABECERA) ?? "";
    expect(cspA).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(cspA).not.toBe(cspB);
    expect((await proxy(peticion("/api/csp-reporte"))).status).toBe(200);
  });

  it("sin cookie, una página privada redirige al login y no deja rastro de sesión", async () => {
    const r = await proxy(peticion("/admin"));
    expect(redirigeA(r)).toBe("/login");
    const borradas = r.headers.getSetCookie().join(";");
    expect(borradas).toContain(COOKIE_SESION);
    expect(borradas).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
  });

  it("sin cookie, una llamada de API recibe 401 JSON (no una redirección)", async () => {
    const r = await proxy(peticion("/api/sesion"));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ ok: false });
  });

  it("una cookie inventada, alterada o vencida no pasa", async () => {
    expect(redirigeA(await proxy(peticion("/tecnico", { [COOKIE_SESION]: "cualquier-cosa" })))).toBe("/login");

    const valido = await firmarToken(5, 0);
    const [cuerpo, firma] = valido.split(".");
    const otroCuerpo = Buffer.from(JSON.stringify({ uid: 1, exp: 9_999_999_999, sv: 0 })).toString("base64url");
    expect(redirigeA(await proxy(peticion("/admin", { [COOKIE_SESION]: `${otroCuerpo}.${firma}` })))).toBe("/login");
    expect(cuerpo).toBeTruthy();

    const vencido = await firmarToken(5, 0, Date.now() - (VIGENCIA_SESION + 60) * 1000);
    expect(redirigeA(await proxy(peticion("/admin", { [COOKIE_SESION]: vencido })))).toBe("/login");
  });

  it("con un token válido deja pasar y publica la política de CSP", async () => {
    const token = await firmarToken(5, 0);
    const r = await proxy(peticion("/admin", { [COOKIE_SESION]: token, [COOKIE_EXPIRA]: String(Math.floor(Date.now() / 1000) + 60) }));
    expect(r.status).toBe(200);
    expect(r.headers.get("location")).toBeNull();
    expect(r.headers.get(CSP_CABECERA)).toContain("default-src 'self'");
  });

  it("si falta la cookie de vencimiento, la vuelve a poner (sesiones anteriores)", async () => {
    const token = await firmarToken(5, 0);
    const r = await proxy(peticion("/admin", { [COOKIE_SESION]: token }));
    const puestas = r.headers.getSetCookie().join(";");
    expect(puestas).toContain(`${COOKIE_SESION}=`);
    expect(puestas).toContain(`${COOKIE_EXPIRA}=`);
  });

  it("un token recién firmado y con cookie de vencimiento no se re-firma en cada clic", async () => {
    const token = await firmarToken(5, 0);
    const r = await proxy(peticion("/admin", { [COOKIE_SESION]: token, [COOKIE_EXPIRA]: "9999999999" }));
    expect(r.headers.getSetCookie()).toEqual([]);
  });

  it("un token con más de un minuto de antigüedad se renueva (la sesión es por inactividad)", async () => {
    const viejo = await firmarToken(5, 2, Date.now() - 5 * 60 * 1000);
    const r = await proxy(peticion("/admin", { [COOKIE_SESION]: viejo, [COOKIE_EXPIRA]: "9999999999" }));
    expect(r.headers.getSetCookie().some((c) => c.startsWith(`${COOKIE_SESION}=`))).toBe(true);
  });
});

describe("proxy: a qué rutas se aplica (config.matcher)", () => {
  const patron = new RegExp(`^${config.matcher[0].replace(/^\//, "\\/")}$`);
  const aplica = (ruta: string) => patron.test(ruta);

  it("cubre las páginas y las API de la aplicación", () => {
    for (const ruta of ["/", "/admin", "/admin/visitas/V-1", "/tecnico", "/api/sesion", "/api/visita/acta/V-1", "/login"]) {
      expect(aplica(ruta), ruta).toBe(true);
    }
  });

  it("excluye estáticos, imágenes y /api/salud (esa ruta se protege con su propio token)", () => {
    for (const ruta of ["/_next/static/chunk.js", "/_next/image", "/api/salud", "/favicon.ico", "/DMC-logo.png", "/x/y.svg"]) {
      expect(aplica(ruta), ruta).toBe(false);
    }
  });
});
