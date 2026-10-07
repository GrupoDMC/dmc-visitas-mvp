import "server-only";
import { consulta, consultaCon, enTransaccion, num, numONull, sql } from "@/lib/data/sql";
import {
  normalizarPermisos,
  normalizarPermisosCelular,
  PERMISOS_COORDINADOR,
  TODOS_LOS_PERMISOS,
  TODOS_LOS_PERMISOS_CELULAR,
} from "@/lib/permisos";
import type { Rol, Usuario } from "@/lib/types";

// Roles del panel y sus permisos: dmc.rol, dmc.rol_permiso y dmc.usuario.rol_id
// (migración 008).

/**
 * ¿El error es que la base todavía no tiene la migración 008?
 *
 * Mientras no se corra, el panel tiene que seguir funcionando como antes: los
 * coordinadores con sus permisos de siempre y sin roles que administrar.
 */
export function faltaMigracionRoles(err: unknown): boolean {
  const texto = err instanceof Error ? err.message : String(err);
  return /invalid (object|column) name '(dmc\.rol(_permiso)?|rol_id)'/i.test(texto);
}

export interface Acceso {
  permisos: string[];
  /** El nombre del rol, para mostrarlo bajo el nombre en el panel. */
  rolNombre: string;
}

/**
 * Qué puede hacer un usuario. El administrador puede todo y no depende de
 * ninguna tabla: nadie lo deja afuera quitándole permisos a un rol.
 */
export async function accesoDeUsuario(usuario: Usuario): Promise<Acceso> {
  if (usuario.rol === "ADMIN") return { permisos: TODOS_LOS_PERMISOS, rolNombre: "Administrador" };
  if (usuario.rol === "TECNICO") return { permisos: await permisosCelular(), rolNombre: "Técnico" };

  const sinRol: Acceso = { permisos: PERMISOS_COORDINADOR, rolNombre: "Coordinador" };
  try {
    const filas = await consultaCon<{ nombre: string | null; permiso: string | null }>(
      `SELECT r.nombre, rp.permiso
         FROM dmc.usuario u
         LEFT JOIN dmc.rol r          ON r.id = u.rol_id
         LEFT JOIN dmc.rol_permiso rp ON rp.rol_id = r.id
        WHERE u.id = @id`,
      [["id", sql.BigInt, usuario.id]]
    );
    const nombre = filas[0]?.nombre;
    // Un coordinador sin rol asignado conserva lo que podía hacer siempre.
    if (!nombre) return sinRol;
    return {
      permisos: normalizarPermisos(filas.map((f) => f.permiso ?? "")),
      rolNombre: nombre,
    };
  } catch (err) {
    if (faltaMigracionRoles(err)) return sinRol;
    throw err;
  }
}

/**
 * El rol «Técnico»: sus permisos de celular viven en dmc.rol_permiso como los de
 * cualquier rol, pero la fila se crea al guardarlos por primera vez (la app no
 * tiene DDL). Mientras no exista, el técnico conserva todo lo que ya podía hacer.
 */
export const ROL_TECNICO = "Técnico";

/** Los permisos de celular de los técnicos. */
export async function permisosCelular(): Promise<string[]> {
  try {
    const filas = await consultaCon<{ permiso: string | null }>(
      `SELECT rp.permiso
         FROM dmc.rol r
         LEFT JOIN dmc.rol_permiso rp ON rp.rol_id = r.id
        WHERE r.nombre = @nombre`,
      [["nombre", sql.NVarChar(60), ROL_TECNICO]]
    );
    if (filas.length === 0) return TODOS_LOS_PERMISOS_CELULAR;
    return normalizarPermisosCelular(filas.map((f) => f.permiso ?? ""));
  } catch (err) {
    if (faltaMigracionRoles(err)) return TODOS_LOS_PERMISOS_CELULAR;
    throw err;
  }
}

/** Deja los permisos de celular exactamente como vienen (pueden ser ninguno). */
export async function guardarPermisosCelular(permisos: string[]): Promise<void> {
  const limpios = normalizarPermisosCelular(permisos);
  await enTransaccion(async (ej) => {
    let [fila] = await ej.consulta<{ id: number }>(
      `SELECT id FROM dmc.rol WITH (UPDLOCK) WHERE nombre = @nombre`,
      [["nombre", sql.NVarChar(60), ROL_TECNICO]]
    );
    if (!fila) {
      [fila] = await ej.consulta<{ id: number }>(
        `INSERT INTO dmc.rol (nombre, descripcion, es_sistema) VALUES (@nombre, @descripcion, 1);
         SELECT CAST(SCOPE_IDENTITY() AS bigint) AS id;`,
        [
          ["nombre", sql.NVarChar(60), ROL_TECNICO],
          ["descripcion", sql.NVarChar(240), "Permisos del celular de los técnicos."],
        ]
      );
    }
    const rolId = num(fila.id);
    await ej.ejecutar(`DELETE FROM dmc.rol_permiso WHERE rol_id = @id`, [["id", sql.BigInt, rolId]]);
    for (const permiso of limpios) {
      await ej.ejecutar(`INSERT INTO dmc.rol_permiso (rol_id, permiso) VALUES (@id, @permiso)`, [
        ["id", sql.BigInt, rolId],
        ["permiso", sql.VarChar(60), permiso],
      ]);
    }
  });
}

/** Los roles del panel, o null si la base todavía no tiene la migración 008. */
export async function listarRoles(): Promise<Rol[] | null> {
  try {
    const [roles, permisos] = await Promise.all([
      consultaCon<{ id: number; nombre: string; descripcion: string | null; es_sistema: boolean; usuarios: number }>(
        `SELECT r.id, r.nombre, r.descripcion, r.es_sistema,
                (SELECT COUNT(*) FROM dmc.usuario u WHERE u.rol_id = r.id) AS usuarios
           FROM dmc.rol r
          WHERE r.nombre <> @tecnico
          ORDER BY r.es_sistema DESC, r.nombre`,
        [["tecnico", sql.NVarChar(60), ROL_TECNICO]]
      ),
      consulta<{ rol_id: number; permiso: string }>(`SELECT rol_id, permiso FROM dmc.rol_permiso`),
    ]);
    return roles.map((r) => ({
      id: num(r.id),
      nombre: r.nombre,
      descripcion: r.descripcion,
      esSistema: Boolean(r.es_sistema),
      usuarios: num(r.usuarios),
      permisos: normalizarPermisos(permisos.filter((p) => num(p.rol_id) === num(r.id)).map((p) => p.permiso)),
    }));
  } catch (err) {
    if (faltaMigracionRoles(err)) return null;
    throw err;
  }
}

/** El rol de cada usuario del panel, por id de usuario. Vacío sin la migración 008. */
export async function rolesDeUsuarios(): Promise<Map<number, number>> {
  try {
    const filas = await consulta<{ id: number; rol_id: number | null }>(
      `SELECT id, rol_id FROM dmc.usuario WHERE rol_id IS NOT NULL`
    );
    return new Map(filas.map((f) => [num(f.id), numONull(f.rol_id) ?? 0]));
  } catch (err) {
    if (faltaMigracionRoles(err)) return new Map();
    throw err;
  }
}

export interface DatosRol {
  nombre: string;
  descripcion: string | null;
  permisos: string[];
}

/** Crea o edita un rol y deja sus permisos exactamente como vienen. */
export async function guardarRol(id: number | null, d: DatosRol): Promise<number> {
  const permisos = normalizarPermisos(d.permisos);
  return enTransaccion(async (ej) => {
    let rolId = id;
    if (rolId === null) {
      // Sin OUTPUT: se relee por SCOPE_IDENTITY, igual que al crear una visita.
      const [fila] = await ej.consulta<{ id: number }>(
        `INSERT INTO dmc.rol (nombre, descripcion) VALUES (@nombre, @descripcion);
         SELECT CAST(SCOPE_IDENTITY() AS bigint) AS id;`,
        [
          ["nombre", sql.NVarChar(60), d.nombre.trim()],
          ["descripcion", sql.NVarChar(240), d.descripcion?.trim() || null],
        ]
      );
      rolId = num(fila.id);
    } else {
      await ej.ejecutar(
        `UPDATE dmc.rol
            SET nombre = @nombre, descripcion = @descripcion, actualizado_en = SYSDATETIME()
          WHERE id = @id`,
        [
          ["nombre", sql.NVarChar(60), d.nombre.trim()],
          ["descripcion", sql.NVarChar(240), d.descripcion?.trim() || null],
          ["id", sql.BigInt, rolId],
        ]
      );
      await ej.ejecutar(`DELETE FROM dmc.rol_permiso WHERE rol_id = @id`, [["id", sql.BigInt, rolId]]);
    }
    for (const permiso of permisos) {
      await ej.ejecutar(`INSERT INTO dmc.rol_permiso (rol_id, permiso) VALUES (@id, @permiso)`, [
        ["id", sql.BigInt, rolId],
        ["permiso", sql.VarChar(60), permiso],
      ]);
    }
    return rolId;
  });
}

/**
 * Borra un rol. No se puede con uno de sistema ni con uno que todavía tenga
 * usuarios: primero hay que pasarlos a otro rol. Devuelve el motivo si no se
 * pudo, o null si quedó borrado.
 */
export async function eliminarRol(id: number): Promise<string | null> {
  return enTransaccion(async (ej) => {
    const [rol] = await ej.consulta<{ es_sistema: boolean; usuarios: number }>(
      `SELECT r.es_sistema, (SELECT COUNT(*) FROM dmc.usuario u WHERE u.rol_id = r.id) AS usuarios
         FROM dmc.rol r WITH (UPDLOCK) WHERE r.id = @id`,
      [["id", sql.BigInt, id]]
    );
    if (!rol) return "Ese rol ya no existe.";
    if (rol.es_sistema) return "Ese rol es del sistema y no se puede eliminar.";
    if (num(rol.usuarios) > 0) {
      return `Ese rol todavía lo tienen ${num(rol.usuarios)} usuarios. Pásalos a otro rol antes de eliminarlo.`;
    }
    // dmc.rol_permiso se va con el ON DELETE CASCADE.
    await ej.ejecutar(`DELETE FROM dmc.rol WHERE id = @id`, [["id", sql.BigInt, id]]);
    return null;
  });
}
