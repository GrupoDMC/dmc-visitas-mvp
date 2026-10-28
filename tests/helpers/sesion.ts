import type { Tecnico, Usuario } from "@/lib/types";
import { PERMISOS_COORDINADOR, TODOS_LOS_PERMISOS, TODOS_LOS_PERMISOS_CELULAR } from "@/lib/permisos";

// Estado de la sesión simulada para los tests de Server Actions y rutas API.
// tests/setup/acciones.ts enchufa estas funciones en las capas bajas (cookie,
// token, lectura del usuario y de su rol), de modo que getSesion/sesionCon de
// lib/auth corren de verdad y lo único falso es la base de datos.

export type Perfil = "admin" | "coordinador" | "tecnico";

interface Estado {
  token: { uid: number; sv: number } | null;
  registro: unknown;
  acceso: { permisos: string[]; rolNombre: string };
}

export const estado: Estado = {
  token: null,
  registro: null,
  acceso: { permisos: [], rolNombre: "" },
};

export const cookiesEscritas: { nombre: string; valor: string }[] = [];
export const cookiesBorradas: string[] = [];

export const TECNICO_PRUEBA: Tecnico = {
  id: 11,
  rut: "11.111.111-1",
  nombres: "Tecnica",
  apellidoPaterno: "Prueba",
  apellidoMaterno: null,
  nombreCompleto: "Tecnica Prueba",
  email: "tecnica@example.com",
  telefono: null,
  activo: true,
};

export interface OpcionesSesion {
  /** Permisos exactos; si no se pasan, los del perfil. */
  permisos?: string[];
  id?: number;
  debeCambiarPassword?: boolean;
  sesionVersion?: number;
}

/** Deja iniciada la sesión de un perfil ficticio. */
export function entrarComo(perfil: Perfil, opciones: OpcionesSesion = {}) {
  const id = opciones.id ?? (perfil === "admin" ? 1 : perfil === "coordinador" ? 2 : 3);
  const usuario: Usuario = {
    id,
    email: `${perfil}@example.com`,
    rol: perfil === "admin" ? "ADMIN" : perfil === "coordinador" ? "COORDINADOR" : "TECNICO",
    rolId: perfil === "coordinador" ? 5 : null,
    tecnicoId: perfil === "tecnico" ? TECNICO_PRUEBA.id : null,
    activo: true,
    ultimoAccesoEn: null,
  };
  const porDefecto =
    perfil === "admin" ? TODOS_LOS_PERMISOS : perfil === "coordinador" ? PERMISOS_COORDINADOR : TODOS_LOS_PERMISOS_CELULAR;
  estado.token = { uid: id, sv: opciones.sesionVersion ?? 0 };
  estado.registro = {
    usuario,
    tecnico: perfil === "tecnico" ? TECNICO_PRUEBA : null,
    passwordHash: "",
    sesionVersion: opciones.sesionVersion ?? 0,
    debeCambiarPassword: opciones.debeCambiarPassword ?? false,
  };
  estado.acceso = {
    permisos: opciones.permisos ?? porDefecto,
    rolNombre: perfil === "admin" ? "Administrador" : perfil === "coordinador" ? "Coordinador" : "Técnico",
  };
}

/** Nadie ha iniciado sesión (sin cookie válida). */
export function salir() {
  estado.token = null;
  estado.registro = null;
  estado.acceso = { permisos: [], rolNombre: "" };
  cookiesEscritas.length = 0;
  cookiesBorradas.length = 0;
}

/** Un FormData a partir de un objeto plano. */
export function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

/** Lo que lanza redirect() en los tests: se atrapa con `await expect(...).rejects`. */
export class RedirectFalso extends Error {
  constructor(public destino: string) {
    super(`NEXT_REDIRECT:${destino}`);
  }
}

/** Ejecuta una acción que termina en redirect() y devuelve el destino. */
export async function destinoDeRedirect(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    if (err instanceof RedirectFalso) return err.destino;
    throw err;
  }
}
