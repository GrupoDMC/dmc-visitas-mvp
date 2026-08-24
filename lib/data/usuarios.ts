import "server-only";
import sql from "mssql";
import { getPool } from "@/lib/db/pool";
import type { RolUsuario, Tecnico, Usuario } from "@/lib/types";

// Consultas contra dmc.usuario / dmc.tecnico para el inicio de sesión.
// El maestro de usuarios que edita el panel vive en lib/data/maestros.

export interface UsuarioConHash {
  usuario: Usuario;
  tecnico: Tecnico | null;
  passwordHash: string;
}

interface FilaUsuario {
  id: number;
  email: string;
  password_hash: string;
  rol: RolUsuario;
  tecnico_id: number | null;
  activo: boolean;
  ultimo_acceso_en: Date | null;
  t_id: number | null;
  t_rut: string | null;
  t_nombres: string | null;
  t_apellido_paterno: string | null;
  t_apellido_materno: string | null;
  t_nombre_completo: string | null;
  t_email: string | null;
  t_telefono: string | null;
  t_activo: boolean | null;
}

const SELECT_USUARIO = `
  SELECT u.id, u.email, u.password_hash, u.rol, u.tecnico_id, u.activo, u.ultimo_acceso_en,
         t.id               AS t_id,
         t.rut              AS t_rut,
         t.nombres          AS t_nombres,
         t.apellido_paterno AS t_apellido_paterno,
         t.apellido_materno AS t_apellido_materno,
         t.nombre_completo  AS t_nombre_completo,
         t.email            AS t_email,
         t.telefono         AS t_telefono,
         t.activo           AS t_activo
  FROM dmc.usuario u
  LEFT JOIN dmc.tecnico t ON t.id = u.tecnico_id
`;

function mapear(fila: FilaUsuario): UsuarioConHash {
  const usuario: Usuario = {
    id: Number(fila.id),
    email: fila.email,
    rol: fila.rol,
    tecnicoId: fila.tecnico_id === null ? null : Number(fila.tecnico_id),
    activo: Boolean(fila.activo),
    ultimoAccesoEn: fila.ultimo_acceso_en ? fila.ultimo_acceso_en.toISOString() : null,
  };

  const tecnico: Tecnico | null =
    fila.t_id === null
      ? null
      : {
          id: Number(fila.t_id),
          rut: fila.t_rut ?? "",
          nombres: fila.t_nombres ?? "",
          apellidoPaterno: fila.t_apellido_paterno ?? "",
          apellidoMaterno: fila.t_apellido_materno,
          nombreCompleto: fila.t_nombre_completo ?? "",
          email: fila.t_email ?? "",
          telefono: fila.t_telefono,
          activo: Boolean(fila.t_activo),
        };

  return { usuario, tecnico, passwordHash: fila.password_hash };
}

export async function getUsuarioPorEmail(email: string): Promise<UsuarioConHash | null> {
  const pool = await getPool();
  const resultado = await pool
    .request()
    .input("email", sql.NVarChar(160), email)
    .query<FilaUsuario>(`${SELECT_USUARIO} WHERE u.email = @email`);
  const fila = resultado.recordset[0];
  return fila ? mapear(fila) : null;
}

export async function getUsuarioPorId(id: number): Promise<UsuarioConHash | null> {
  const pool = await getPool();
  const resultado = await pool
    .request()
    .input("id", sql.BigInt, id)
    .query<FilaUsuario>(`${SELECT_USUARIO} WHERE u.id = @id`);
  const fila = resultado.recordset[0];
  return fila ? mapear(fila) : null;
}

/**
 * Reescribe el hash de un usuario. Se usa para migrar a bcrypt los hashes
 * heredados del DDL de ejemplo la primera vez que el usuario acierta su clave.
 * Un fallo aquí no debe tumbar el login: se reintenta en el siguiente.
 */
export async function actualizarPasswordHash(usuarioId: number, hash: string): Promise<void> {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.BigInt, usuarioId)
      .input("hash", sql.NVarChar(200), hash)
      .query("UPDATE dmc.usuario SET password_hash = @hash WHERE id = @id");
  } catch (err) {
    console.error("[dmc] no se pudo migrar el password_hash a bcrypt:", err);
  }
}

/** Sella el último acceso. Un fallo aquí no debe tumbar el login. */
export async function registrarAcceso(usuarioId: number): Promise<void> {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.BigInt, usuarioId)
      .query("UPDATE dmc.usuario SET ultimo_acceso_en = SYSDATETIME() WHERE id = @id");
  } catch (err) {
    console.error("[dmc] no se pudo registrar el último acceso:", err);
  }
}
