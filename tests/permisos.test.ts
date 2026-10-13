import { describe, expect, it } from "vitest";
import {
  PERMISOS_COORDINADOR,
  TODOS_LOS_PERMISOS,
  motivoCuentaAjena,
  normalizarPermisos,
  normalizarPermisosCelular,
  puedeAdministrarCuenta,
  tiene,
} from "@/lib/permisos";

describe("catálogo", () => {
  it("cada permiso es <módulo>.<acción> sin repetidos", () => {
    expect(new Set(TODOS_LOS_PERMISOS).size).toBe(TODOS_LOS_PERMISOS.length);
    for (const p of TODOS_LOS_PERMISOS) expect(p).toMatch(/^[a-z]+\.[A-Za-z]+$/);
  });

  it("el coordinador no tiene lo exclusivo del administrador", () => {
    for (const p of ["visitas.eliminar", "visitas.cancelar", "usuarios.roles", "visitas.editarActa"]) {
      expect(PERMISOS_COORDINADOR).not.toContain(p);
    }
    expect(PERMISOS_COORDINADOR).toContain("visitas.crear");
  });
});

describe("tiene", () => {
  it("mira el permiso exacto", () => {
    expect(tiene(["visitas.ver"], "visitas.ver")).toBe(true);
    expect(tiene(["visitas.ver"], "visitas.crear")).toBe(false);
  });
});

describe("normalizarPermisos", () => {
  it("descarta los que no existen", () => {
    expect(normalizarPermisos(["panel.ver", "inventado.x", "visitas"])).toEqual(["panel.ver"]);
  });

  it("agrega el «ver» del módulo cuando hay otra acción", () => {
    expect(normalizarPermisos(["visitas.eliminar"])).toEqual(["visitas.ver", "visitas.eliminar"]);
  });

  it("devuelve el orden del catálogo y sin duplicados", () => {
    expect(normalizarPermisos(["usuarios.crear", "panel.ver", "panel.ver"])).toEqual([
      "panel.ver",
      "usuarios.ver",
      "usuarios.crear",
    ]);
  });
});

describe("normalizarPermisosCelular", () => {
  it("deja solo los del celular, en orden del catálogo", () => {
    expect(normalizarPermisosCelular(["celular.video", "visitas.ver", "celular.crearVisita"])).toEqual([
      "celular.crearVisita",
      "celular.video",
    ]);
  });
});

describe("puedeAdministrarCuenta", () => {
  const admin = { usuario: { rol: "ADMIN" }, permisos: [] as string[] };
  const coord = (permisos: string[]) => ({ usuario: { rol: "COORDINADOR" }, permisos });

  it("el administrador puede con cualquiera", () => {
    expect(puedeAdministrarCuenta(admin, { rol: "ADMIN", permisos: TODOS_LOS_PERMISOS })).toBe(true);
  });

  it("un coordinador nunca toca a un administrador", () => {
    expect(puedeAdministrarCuenta(coord(TODOS_LOS_PERMISOS), { rol: "ADMIN", permisos: [] })).toBe(false);
  });

  it("un técnico no administra nada", () => {
    const tecnico = { usuario: { rol: "TECNICO" }, permisos: TODOS_LOS_PERMISOS };
    expect(puedeAdministrarCuenta(tecnico, { rol: "TECNICO", permisos: [] })).toBe(false);
  });

  it("un coordinador solo toca cuentas que no pueden más que él", () => {
    const actor = coord(["visitas.ver", "visitas.crear"]);
    expect(puedeAdministrarCuenta(actor, { rol: "COORDINADOR", permisos: ["visitas.ver"] })).toBe(true);
    expect(puedeAdministrarCuenta(actor, { rol: "COORDINADOR", permisos: ["visitas.ver", "visitas.eliminar"] })).toBe(
      false
    );
  });

  it("una cuenta sin permisos (técnico) queda al alcance de un coordinador", () => {
    expect(puedeAdministrarCuenta(coord([]), { rol: "TECNICO", permisos: [] })).toBe(true);
  });

  it("sirve también para un rol sin `rol` propio", () => {
    expect(puedeAdministrarCuenta(coord(["panel.ver"]), { permisos: ["panel.ver"] })).toBe(true);
    expect(puedeAdministrarCuenta(coord(["panel.ver"]), { permisos: ["usuarios.roles"] })).toBe(false);
  });
});

describe("motivoCuentaAjena", () => {
  it("distingue administrador de permisos de más", () => {
    expect(motivoCuentaAjena({ rol: "ADMIN" })).toMatch(/administrador/);
    expect(motivoCuentaAjena({ rol: "COORDINADOR" })).toMatch(/permisos/);
  });
});
