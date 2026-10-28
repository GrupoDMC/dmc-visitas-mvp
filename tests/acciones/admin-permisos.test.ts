import { beforeEach, describe, expect, it, vi } from "vitest";

// Cada acción del panel es un endpoint HTTP: que el botón no se muestre no
// impide llamarla. Este archivo prueba, para TODAS, que la puerta de permisos
// se cierra y que se abre exactamente con el permiso que dice el catálogo.
vi.mock("@/lib/data/visitas");
vi.mock("@/lib/data/visitas-lote");
vi.mock("@/lib/data/avisos-problema");
vi.mock("@/lib/data/pendientes");
vi.mock("@/lib/data/problemas");
vi.mock("@/lib/data/catalogos");
vi.mock("@/lib/data/solicitudes-password");
vi.mock("@/lib/data/auditoria");
vi.mock("@/lib/data/maestros");
vi.mock("@/lib/data/ediciones");
vi.mock("@/lib/data/contactos");
vi.mock("@/lib/data/visitas-papel");
vi.mock("@/lib/data/personas-local");

import * as admin from "@/app/actions/admin";
import * as maestros from "@/app/actions/maestros";
import * as ediciones from "@/app/actions/ediciones";
import * as contactos from "@/app/actions/contactos";
import * as papel from "@/app/actions/visitas-papel";
import { TODOS_LOS_PERMISOS } from "@/lib/permisos";
import { entrarComo, salir } from "../helpers/sesion";

type Caso = {
  accion: string;
  /** Permisos que hacen falta (todos). */
  requiere: string[];
  llamar: () => Promise<unknown>;
};

const caso = (accion: string, requiere: string | string[], llamar: () => Promise<unknown>): Caso => ({
  accion,
  requiere: Array.isArray(requiere) ? requiere : [requiere],
  llamar,
});

// Argumentos a propósito inválidos (vacíos): si la puerta se abre, la acción
// responde con un error de validación; si no, con el rechazo por permiso. Así
// se distingue sin necesitar datos válidos ni tocar la base.
const A = admin as Record<string, (...a: unknown[]) => Promise<unknown>>;
const M = maestros as Record<string, (...a: unknown[]) => Promise<unknown>>;

const CASOS: Caso[] = [
  caso("crearVisitaAction", "visitas.crear", () => A.crearVisitaAction({})),
  caso("crearVisitasMasivasAction", "visitas.crear", () => A.crearVisitasMasivasAction([])),
  caso("editarVisitaAction", "visitas.editar", () => A.editarVisitaAction("V-1", {})),
  caso("reprogramarVisitaAction", "visitas.reprogramar", () => A.reprogramarVisitaAction({})),
  caso("cancelarVisitaAdminAction", "visitas.cancelar", () => A.cancelarVisitaAdminAction({})),
  caso("liberarVisitaAction", "visitas.liberar", () => A.liberarVisitaAction("V-1")),
  caso("eliminarVisitaAction", "visitas.eliminar", () => A.eliminarVisitaAction({})),
  caso("modificarVisitasAction", ["visitas.masivo", "visitas.editar"], () => A.modificarVisitasAction([])),
  caso("cancelarVisitasAdminAction", ["visitas.masivo", "visitas.cancelar"], () => A.cancelarVisitasAdminAction([])),
  caso("eliminarVisitasAction", ["visitas.masivo", "visitas.eliminar"], () => A.eliminarVisitasAction({})),
  caso("actualizarProblemaAction", "problemas.editar", () => A.actualizarProblemaAction({})),
  caso("marcarGestionPendienteAction", "reagendas.gestionar", () => A.marcarGestionPendienteAction({})),
  caso("marcarGestionProblemaAction", "problemas.editar", () => A.marcarGestionProblemaAction({})),
  caso("enviarActaAction", "visitas.enviar", () => A.enviarActaAction({})),
  caso("guardarChecklistAction", "checklist.editar", () => A.guardarChecklistAction({})),
  caso("guardarPlantillaChecklistAction", "checklist.editar", () => A.guardarPlantillaChecklistAction()),
  caso("reiniciarChecklistAction", "checklist.editar", () => A.reiniciarChecklistAction()),
  caso("atenderSolicitudPasswordAction", "usuarios.contrasenas", () => A.atenderSolicitudPasswordAction(0, "")),
  caso("descartarSolicitudPasswordAction", "usuarios.contrasenas", () => A.descartarSolicitudPasswordAction(0)),
  caso("guardarTiendasMallAction", "malls.editar", () => M.guardarTiendasMallAction(0, [])),
  caso("crearSucursalesLoteAction", "sucursales.crear", () => M.crearSucursalesLoteAction(0, [])),
  caso("guardarRolAction", "usuarios.roles", () => M.guardarRolAction(null, {})),
  caso("eliminarRolAction", "usuarios.roles", () => M.eliminarRolAction(0)),
  caso("guardarPermisosCelularAction", "usuarios.roles", () => M.guardarPermisosCelularAction([])),
  caso("editarActaAdminAction", "visitas.editarActa", () => ediciones.editarActaAdminAction({} as never)),
  caso("permitirEditarTecnicoAction", "visitas.editarActa", () => ediciones.permitirEditarTecnicoAction("V-1")),
  caso("crearVisitasPapelAction", "visitas.crear", () => papel.crearVisitasPapelAction({ informes: [] })),
  caso("guardarContactoAction (alta)", "contactos.crear", () => contactos.guardarContactoAction(null, {} as never)),
  caso("guardarContactoAction (edición)", "contactos.editar", () => contactos.guardarContactoAction(1, {} as never)),
];

/** La respuesta es un rechazo por falta de permiso. */
function esRechazoDePermiso(r: unknown): boolean {
  const o = r as { ok?: boolean; error?: string } | undefined;
  return o?.ok === false && /permiso/i.test(o.error ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  salir();
});

describe("permisos de las acciones del panel", () => {
  it("el catálogo de permisos usado acá existe de verdad (nadie escribió mal una clave)", () => {
    const usados = new Set(CASOS.flatMap((c) => c.requiere));
    for (const p of usados) expect(TODOS_LOS_PERMISOS, `permiso inexistente: ${p}`).toContain(p);
  });

  describe.each(CASOS)("$accion", ({ requiere, llamar }) => {
    it("sin sesión → rechazada", async () => {
      expect(esRechazoDePermiso(await llamar())).toBe(true);
    });

    it("un técnico (aunque tenga todos los permisos del celular) → rechazada", async () => {
      entrarComo("tecnico");
      expect(esRechazoDePermiso(await llamar())).toBe(true);
    });

    it("un coordinador con un rol vacío → rechazada", async () => {
      entrarComo("coordinador", { permisos: [] });
      expect(esRechazoDePermiso(await llamar())).toBe(true);
    });

    it("un coordinador con TODOS los permisos MENOS el necesario → rechazada", async () => {
      for (const quitado of requiere) {
        entrarComo("coordinador", { permisos: TODOS_LOS_PERMISOS.filter((p) => p !== quitado) });
        expect(esRechazoDePermiso(await llamar()), `sin ${quitado}`).toBe(true);
      }
    });

    it("con exactamente el permiso necesario la puerta se abre (falla después, por la validación)", async () => {
      entrarComo("coordinador", { permisos: requiere });
      expect(esRechazoDePermiso(await llamar())).toBe(false);
    });

    it("el administrador pasa la puerta", async () => {
      entrarComo("admin");
      expect(esRechazoDePermiso(await llamar())).toBe(false);
    });
  });

  it("un permiso de otro módulo no abre la puerta (visitas.ver no deja crear)", async () => {
    entrarComo("coordinador", { permisos: ["visitas.ver", "panel.ver"] });
    expect(esRechazoDePermiso(await A.crearVisitaAction({}))).toBe(true);
  });
});
