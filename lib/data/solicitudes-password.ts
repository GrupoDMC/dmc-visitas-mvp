import "server-only";
import { consulta, consultaCon, enTransaccion, ejecutar, num, numONull, sql, F_TS } from "@/lib/data/sql";
import { hashearPassword, validarPasswordNueva } from "@/lib/password";
import { leerCuenta, leerCuentas } from "@/lib/data/roles";
import { motivoCuentaAjena, puedeAdministrarCuenta } from "@/lib/permisos";
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

// Frenos contra el spam, todos silenciosos (quien pide ve siempre lo mismo):
/** Solicitudes por correo y por hora. */
const MAX_POR_HORA = 5;
/** Solicitudes por IP y por hora, sea cual sea el correo. */
const MAX_POR_IP_HORA = 10;
/** Pendientes en total: más que esto ya no es alguien que olvidó su clave. */
const MAX_PENDIENTES = 100;

export interface ResultadoSolicitud {
  ok: boolean;
  /** true cuando se descartó por exceso de intentos, sin decírselo a quien pide. */
  limitada?: boolean;
}

/** Registra la solicitud. El correo se guarda tal cual, en minúsculas. */
export async function crearSolicitudPassword(
  email: string,
  mensaje: string | null,
  ip: string | null
): Promise<ResultadoSolicitud> {
  const normalizado = email.trim().toLowerCase().slice(0, 160);

  const [conteo] = await consultaCon<{ por_correo: number; por_ip: number; pendientes: number }>(
    `SELECT (SELECT COUNT(*) FROM dmc.solicitud_password
              WHERE email = @email AND creado_en > DATEADD(hour, -1, SYSDATETIME())) AS por_correo,
            (SELECT COUNT(*) FROM dmc.solicitud_password
              WHERE @ip IS NOT NULL AND ip = @ip AND creado_en > DATEADD(hour, -1, SYSDATETIME())) AS por_ip,
            (SELECT COUNT(*) FROM dmc.solicitud_password WHERE estado = 'PENDIENTE') AS pendientes`,
    [
      ["email", sql.NVarChar(160), normalizado],
      ["ip", sql.VarChar(45), ip],
    ]
  );
  if (
    num(conteo?.por_correo ?? 0) >= MAX_POR_HORA ||
    num(conteo?.por_ip ?? 0) >= MAX_POR_IP_HORA ||
    num(conteo?.pendientes ?? 0) >= MAX_PENDIENTES
  ) {
    return { ok: true, limitada: true };
  }

  await ejecutar(
    `INSERT INTO dmc.solicitud_password (email, usuario_id, mensaje, ip)
     VALUES (@email, (SELECT TOP 1 id FROM dmc.usuario WHERE email = @email), @mensaje, @ip)`,
    [
      ["email", sql.NVarChar(160), normalizado],
      ["mensaje", sql.NVarChar(400), mensaje?.trim().slice(0, 400) || null],
      ["ip", sql.VarChar(45), ip],
    ]
  );
  return { ok: true };
}

/** Quien atiende: lo justo para decidir sobre qué cuentas puede. */
export interface ActorSolicitud {
  usuario: { id: number; rol: RolUsuario };
  permisos: readonly string[];
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

/** Las solicitudes, con `administrable` según quién las mira. */
export async function listarSolicitudesPassword(actor: ActorSolicitud): Promise<SolicitudPassword[]> {
  const filas = await consulta<FilaSolicitud>(
    `SELECT s.id, s.email, s.usuario_id, s.mensaje, s.estado, s.atendido_por,
            ${F_TS("s.atendido_en")} AS atendido_en,
            ${F_TS("s.creado_en")}   AS creado_en,
            u.rol AS u_rol, u.activo AS u_activo
       FROM dmc.solicitud_password s
       LEFT JOIN dmc.usuario u ON u.id = s.usuario_id
      ORDER BY CASE s.estado WHEN 'PENDIENTE' THEN 0 ELSE 1 END, s.creado_en DESC`
  );

  const cuentas = await leerCuentas(filas.flatMap((f) => (f.usuario_id === null ? [] : [num(f.usuario_id)])));

  return filas.map((f) => {
    const cuenta = f.usuario_id === null ? undefined : cuentas.get(num(f.usuario_id));
    return {
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
      administrable: !!cuenta && cuenta.id !== actor.usuario.id && puedeAdministrarCuenta(actor, cuenta),
    };
  });
}

/**
 * Le pone la clave temporal al usuario de la solicitud y la marca atendida, en
 * una transacción y con la solicitud y la cuenta tomadas. La cuenta queda con
 * el cambio de clave pendiente y sus sesiones abiertas, cerradas.
 *
 * Devuelve por qué no se pudo, o null si quedó hecho. No se puede si la
 * solicitud ya no está pendiente, si su correo no corresponde a ninguna cuenta
 * (lo que hay que hacer es crearla desde Maestros › Usuarios), si es la cuenta
 * de quien atiende, si es una cuenta que puede más que él o si la clave no
 * cumple la política (validarPasswordNueva).
 */
export async function atenderSolicitudPassword(
  id: number,
  passwordTemporal: string,
  actor: ActorSolicitud
): Promise<{ error: string } | { usuarioId: number }> {
  // bcrypt tarda: va antes de abrir la transacción, no con las filas tomadas.
  const hash = await hashearPassword(passwordTemporal);

  return enTransaccion(async (ej) => {
    const [solicitud] = await ej.consulta<{ usuario_id: number | null; estado: EstadoSolicitudPassword }>(
      `SELECT usuario_id, estado FROM dmc.solicitud_password WITH (UPDLOCK, HOLDLOCK) WHERE id = @id`,
      [["id", sql.BigInt, id]]
    );
    if (!solicitud) return { error: "Esa solicitud ya no existe. Recarga la página." };
    if (solicitud.estado !== "PENDIENTE") return { error: "Esa solicitud ya estaba cerrada." };
    if (solicitud.usuario_id === null) {
      return { error: "Ese correo no tiene ninguna cuenta. Créala en Maestros › Usuarios antes de asignarle una clave." };
    }

    const cuenta = await leerCuenta(num(solicitud.usuario_id), ej, true);
    if (!cuenta) return { error: "Esa cuenta ya no existe." };
    if (cuenta.id === actor.usuario.id) return { error: "Tu propia contraseña no se cambia desde acá." };
    if (!puedeAdministrarCuenta(actor, cuenta)) return { error: motivoCuentaAjena(cuenta) };
    const fallo = validarPasswordNueva(passwordTemporal, cuenta.email);
    if (fallo) return { error: fallo };

    await ej.ejecutar(
      `UPDATE dmc.usuario
          SET password_hash = @hash, debe_cambiar_password = 1, sesion_version = sesion_version + 1
        WHERE id = @usuario`,
      [
        ["hash", sql.NVarChar(200), hash],
        ["usuario", sql.BigInt, cuenta.id],
      ]
    );
    await ej.ejecutar(
      `UPDATE dmc.solicitud_password
          SET estado = 'ATENDIDA', atendido_por = @admin, atendido_en = SYSDATETIME()
        WHERE id = @id AND estado = 'PENDIENTE'`,
      [
        ["admin", sql.BigInt, actor.usuario.id],
        ["id", sql.BigInt, id],
      ]
    );
    return { usuarioId: cuenta.id };
  });
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
