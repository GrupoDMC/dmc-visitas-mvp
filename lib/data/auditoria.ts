import "server-only";
import { ipDeLaPeticion } from "@/lib/auth";
import { ejecutar, sql } from "@/lib/data/sql";
import { log } from "@/lib/log";

// Registro de acciones sensibles — dmc.auditoria (migración 024).
//
// Qué se anota: quién (id y correo en el momento), qué, sobre qué id, cuándo e
// IP. El detalle lleva solo lo necesario para entender el cambio (por ejemplo,
// los permisos que se dieron o quitaron): nunca contraseñas, hashes ni datos
// personales de terceros.
//
// Es de mejor esfuerzo: si anotar falla, la acción que ya se hizo no se
// deshace; queda el error en el log del servidor.

export type AccionAuditoria =
  | "password.cambio"
  | "password.reseteo"
  | "usuario.alta"
  | "usuario.editar"
  | "usuario.desactivar"
  | "usuario.reactivar"
  | "usuario.rol"
  | "rol.alta"
  | "rol.editar"
  | "rol.eliminar"
  | "permisos_celular.editar"
  | "visita.eliminar"
  | "checklist.editar"
  | "checklist.plantilla_guardar"
  | "checklist.plantilla_aplicar";

export interface EventoAuditoria {
  accion: AccionAuditoria;
  /** Tipo de lo afectado: usuario, rol, visita, checklist… */
  entidad: string;
  /** id (o folio) de lo afectado. */
  entidadId?: number | string | null;
  detalle?: Record<string, unknown>;
}

export interface ActorAuditoria {
  usuario: { id: number; email: string };
}

const MAX_DETALLE = 1900;

/** El detalle como JSON que cabe en la columna, sin cortarlo a mitad de una cadena. */
export function detalleParaAuditoria(detalle: Record<string, unknown> | undefined): string | null {
  if (!detalle || Object.keys(detalle).length === 0) return null;
  let texto: string;
  try {
    texto = JSON.stringify(detalle);
  } catch {
    return JSON.stringify({ truncado: true });
  }
  if (texto.length <= MAX_DETALLE) return texto;
  return JSON.stringify({ truncado: true, inicio: texto.slice(0, 1500) });
}

/** Lo que quedó agregado y lo que quedó quitado entre dos listas. */
export function diferencia(antes: readonly string[], despues: readonly string[]) {
  const a = new Set(antes);
  const d = new Set(despues);
  return {
    agregados: despues.filter((x) => !a.has(x)),
    quitados: antes.filter((x) => !d.has(x)),
  };
}

export async function auditar(actor: ActorAuditoria | null, evento: EventoAuditoria): Promise<void> {
  try {
    const ip = await ipDeLaPeticion().catch(() => null);
    await ejecutar(
      `INSERT INTO dmc.auditoria (usuario_id, usuario_email, accion, entidad, entidad_id, detalle, ip)
       VALUES (@usuario, @email, @accion, @entidad, @entidadId, @detalle, @ip)`,
      [
        ["usuario", sql.BigInt, actor?.usuario.id ?? null],
        ["email", sql.NVarChar(160), actor?.usuario.email ?? null],
        ["accion", sql.VarChar(40), evento.accion],
        ["entidad", sql.VarChar(30), evento.entidad],
        ["entidadId", sql.NVarChar(40), evento.entidadId == null ? null : String(evento.entidadId).slice(0, 40)],
        ["detalle", sql.NVarChar(2000), detalleParaAuditoria(evento.detalle)],
        ["ip", sql.VarChar(45), ip],
      ]
    );
  } catch (err) {
    log.error("auditoria.registrar", { err, usuarioId: actor?.usuario.id, accion: evento.accion });
  }
}
