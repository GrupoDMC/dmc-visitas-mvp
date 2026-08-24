import "server-only";
import { consulta, consultaCon, ejecutar, num, numONull, sql, F_TS } from "@/lib/data/sql";
import { hashearPassword } from "@/lib/password";
import type { EstadoSolicitudPassword, RolUsuario, SolicitudPassword } from "@/lib/types";

// "Olvidé mi contraseña" — dmc.solicitud_password.
//
// No hay servidor de correo contratado, así que el flujo no manda ningún enlace:
// la persona deja la solicitud desde el login y el administrador la ve en el
// panel, donde le asigna una clave temporal y se la entrega por el canal que
// corresponda.
//
// La solicitud se guarda SIEMPRE, exista o no el correo. Si solo se guardaran
// las de correos dados de alta, el tiempo de respuesta del login delataría qué
// correos existen — que es justo lo que evita el mensaje único de autenticar().

const MAX_POR_HORA = 5;

export interface ResultadoSolicitud {
  ok: boolean;
  /** true cuando se descartó por exceso de intentos, sin decírselo a quien pide. */
  limitada?: boolean;
}

/** Registra la solicitud. El correo se guarda tal cual, en minúsculas. */
export async function crearSolicitudPassword(email: string, mensaje: string | null): Promise<ResultadoSolicitud> {
  const normalizado = email.trim().toLowerCase();

  // Freno simple contra el spam: cinco solicitudes por correo y por hora.
  const [reciente] = await consultaCon<{ n: number }>(
    `SELECT COUNT(*) AS n FROM dmc.solicitud_password
      WHERE email = @email AND creado_en > DATEADD(hour, -1, SYSDATETIME())`,
    [["email", sql.NVarChar(160), normalizado]]
  );
  if (num(reciente?.n ?? 0) >= MAX_POR_HORA) return { ok: true, limitada: true };

  await ejecutar(
    `INSERT INTO dmc.solicitud_password (email, usuario_id, mensaje)
     VALUES (@email, (SELECT TOP 1 id FROM dmc.usuario WHERE email = @email), @mensaje)`,
    [
      ["email", sql.NVarChar(160), normalizado],
      ["mensaje", sql.NVarChar(400), mensaje?.trim().slice(0, 400) || null],
    ]
  );
  return { ok: true };
}

interface FilaSolicitud {
  id: number;
  email: string;
  usuario_id: number | null;
  mensaje: string | null;
  estado: EstadoSolicitudPassword;
  atendido_por: number | null;
  atendido_en: string | null;
  creado_en: string;
  u_rol: RolUsuario | null;
  u_activo: boolean | null;
}

export async function listarSolicitudesPassword(): Promise<SolicitudPassword[]> {
  const filas = await consulta<FilaSolicitud>(
    `SELECT s.id, s.email, s.usuario_id, s.mensaje, s.estado, s.atendido_por,
            ${F_TS("s.atendido_en")} AS atendido_en,
            ${F_TS("s.creado_en")}   AS creado_en,
            u.rol AS u_rol, u.activo AS u_activo
       FROM dmc.solicitud_password s
       LEFT JOIN dmc.usuario u ON u.id = s.usuario_id
      ORDER BY CASE s.estado WHEN 'PENDIENTE' THEN 0 ELSE 1 END, s.creado_en DESC`
  );

  return filas.map((f) => ({
    id: num(f.id),
    email: f.email,
    usuarioId: numONull(f.usuario_id),
    mensaje: f.mensaje,
    estado: f.estado,
    atendidoPor: numONull(f.atendido_por),
    atendidoEn: f.atendido_en,
    creadoEn: f.creado_en,
    usuarioRol: f.u_rol,
    usuarioActivo: f.u_activo === null ? null : Boolean(f.u_activo),
  }));
}

export async function contarSolicitudesPendientes(): Promise<number> {
  const [fila] = await consulta<{ n: number }>(
    `SELECT COUNT(*) AS n FROM dmc.solicitud_password WHERE estado = 'PENDIENTE'`
  );
  return num(fila?.n ?? 0);
}

/**
 * Le pone la clave temporal al usuario de la solicitud y la marca atendida.
 *
 * Devuelve false si la solicitud no existe o si su correo no corresponde a
 * ningún usuario: en ese caso lo que hay que hacer es crear la cuenta desde
 * Maestros › Usuarios, no asignarle una clave a nadie.
 */
export async function atenderSolicitudPassword(
  id: number,
  passwordTemporal: string,
  usuarioAdminId: number
): Promise<boolean> {
  const [solicitud] = await consultaCon<{ usuario_id: number | null; estado: EstadoSolicitudPassword }>(
    `SELECT usuario_id, estado FROM dmc.solicitud_password WHERE id = @id`,
    [["id", sql.BigInt, id]]
  );
  if (!solicitud?.usuario_id) return false;

  const hash = await hashearPassword(passwordTemporal);
  await ejecutar(`UPDATE dmc.usuario SET password_hash = @hash WHERE id = @usuario`, [
    ["hash", sql.NVarChar(200), hash],
    ["usuario", sql.BigInt, num(solicitud.usuario_id)],
  ]);

  await ejecutar(
    `UPDATE dmc.solicitud_password
        SET estado = 'ATENDIDA', atendido_por = @admin, atendido_en = SYSDATETIME()
      WHERE id = @id`,
    [
      ["admin", sql.BigInt, usuarioAdminId],
      ["id", sql.BigInt, id],
    ]
  );
  return true;
}

/** Cierra la solicitud sin tocar ninguna clave. */
export async function descartarSolicitudPassword(id: number, usuarioAdminId: number): Promise<boolean> {
  const filas = await ejecutar(
    `UPDATE dmc.solicitud_password
        SET estado = 'DESCARTADA', atendido_por = @admin, atendido_en = SYSDATETIME()
      WHERE id = @id AND estado = 'PENDIENTE'`,
    [
      ["admin", sql.BigInt, usuarioAdminId],
      ["id", sql.BigInt, id],
    ]
  );
  return filas > 0;
}
