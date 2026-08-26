import "server-only";
import { consultaCon, ejecutar, num, sql, F_TS } from "@/lib/data/sql";

/**
 * Respaldo del acta a medio llenar — dmc.visita_borrador.
 *
 * La copia que de verdad protege al técnico es la del propio celular
 * (lib/ui/borrador), porque funciona sin señal. Esta es la de arriba: cuando
 * hay cobertura se sube lo escrito cada tanto, así que si el celular se pierde,
 * se rompe o alguien borra los datos de la app, lo que llevaba escrito no se va
 * con él.
 *
 * Las fotos NO se suben acá: pesan megabytes y esto se guarda cada pocos
 * segundos. Se deja anotado cuántas había, para poder avisar que la copia del
 * servidor viene sin ellas.
 */

export interface BorradorGuardado {
  payload: string;
  guardadoEn: string;
}

const LIMITE_PAYLOAD = 400_000;

/** Guarda (o reemplaza) el borrador de esa visita para ese usuario. */
export async function guardarBorrador(folio: string, usuarioId: number, payload: string): Promise<boolean> {
  if (payload.length > LIMITE_PAYLOAD) return false;

  const [visita] = await consultaCon<{ id: number }>(
    `SELECT id FROM dmc.visita WHERE folio = @folio AND activo = 1`,
    [["folio", sql.VarChar(16), folio]]
  );
  if (!visita) return false;

  // uq_borrador (visita_id, usuario_id): uno por técnico y visita, se pisa.
  await ejecutar(
    `UPDATE dmc.visita_borrador
        SET payload = @payload, guardado_en = SYSDATETIME()
      WHERE visita_id = @visita AND usuario_id = @usuario;

     IF @@ROWCOUNT = 0
       INSERT INTO dmc.visita_borrador (visita_id, usuario_id, payload)
       VALUES (@visita, @usuario, @payload);`,
    [
      ["visita", sql.BigInt, num(visita.id)],
      ["usuario", sql.BigInt, usuarioId],
      ["payload", sql.NVarChar(sql.MAX), payload],
    ]
  );
  return true;
}

export async function leerBorrador(folio: string, usuarioId: number): Promise<BorradorGuardado | null> {
  const [fila] = await consultaCon<{ payload: string; guardado_en: string }>(
    `SELECT b.payload, ${F_TS("b.guardado_en")} AS guardado_en
       FROM dmc.visita_borrador b
       JOIN dmc.visita v ON v.id = b.visita_id
      WHERE v.folio = @folio AND b.usuario_id = @usuario`,
    [
      ["folio", sql.VarChar(16), folio],
      ["usuario", sql.BigInt, usuarioId],
    ]
  );
  return fila ? { payload: fila.payload, guardadoEn: fila.guardado_en } : null;
}

/** Al cerrar el acta el borrador ya no sirve: lo escrito quedó en las tablas. */
export async function borrarBorrador(folio: string, usuarioId: number | null): Promise<void> {
  await ejecutar(
    `DELETE b FROM dmc.visita_borrador b
       JOIN dmc.visita v ON v.id = b.visita_id
      WHERE v.folio = @folio AND (@usuario IS NULL OR b.usuario_id = @usuario)`,
    [
      ["folio", sql.VarChar(16), folio],
      ["usuario", sql.BigInt, usuarioId],
    ]
  );
}
