import "server-only";
import { consultaCon, ejecutar, num, sql, F_TS } from "@/lib/data/sql";
import type { PersonaLocal } from "@/lib/types";

// Quienes han recibido o firmado en cada tienda (dmc.persona_local, migración
// 021). Es una ayuda para no reescribir datos: si la tabla no existe todavía o
// la escritura falla, la visita se agenda y el acta se cierra igual.

export interface DatosPersona {
  nombre: string | null | undefined;
  rut?: string | null;
  telefono?: string | null;
  cargo?: string | null;
}

/** Si el técnico tiene (o tuvo) una visita en la sucursal, como titular o ayudante. */
export async function tecnicoTieneVisitaEn(tecnicoId: number, sucursalId: number): Promise<boolean> {
  const [fila] = await consultaCon<{ n: number }>(
    `SELECT TOP 1 1 AS n FROM dmc.visita
      WHERE sucursal_id = @sucursal AND activo = 1
        AND (tecnico_id = @tecnico OR tecnico_ayudante_id = @tecnico)`,
    [
      ["sucursal", sql.BigInt, sucursalId],
      ["tecnico", sql.BigInt, tecnicoId],
    ]
  );
  return Boolean(fila);
}

/** Las personas de una tienda, la más reciente primero. Vacío si falta la migración. */
export async function listarPersonasLocal(sucursalId: number): Promise<PersonaLocal[]> {
  try {
    const filas = await consultaCon<{
      id: number;
      nombre: string;
      rut: string | null;
      telefono: string | null;
      cargo: string | null;
      ultima_vez: string;
    }>(
      `SELECT id, nombre, rut, telefono, cargo, ${F_TS("ultima_vez")} AS ultima_vez
         FROM dmc.persona_local
        WHERE sucursal_id = @sucursal
        ORDER BY dmc.persona_local.ultima_vez DESC, id DESC`,
      [["sucursal", sql.BigInt, sucursalId]]
    );
    return filas.map((f) => ({
      id: num(f.id),
      nombre: f.nombre,
      rut: f.rut,
      telefono: f.telefono,
      cargo: f.cargo,
      ultimaVez: f.ultima_vez,
    }));
  } catch (err) {
    console.error("[dmc] listarPersonasLocal:", err);
    return [];
  }
}

/**
 * Deja a la persona en la lista de la tienda: la actualiza si ya estaba (por
 * RUT, o por nombre cuando no tiene) o la agrega. Un dato nuevo pisa al viejo;
 * uno vacío no borra el que había. Nunca lanza.
 */
export async function registrarPersonaLocal(sucursalId: number, persona: DatosPersona): Promise<void> {
  const nombre = persona.nombre?.trim();
  if (!sucursalId || !nombre || nombre === "Por registrar") return;
  try {
    await ejecutar(
      `DECLARE @n int = 0;

       IF @rut IS NOT NULL
         UPDATE dmc.persona_local
            SET nombre = @nombre, telefono = COALESCE(@telefono, telefono),
                cargo = COALESCE(@cargo, cargo), ultima_vez = SYSDATETIME()
          WHERE sucursal_id = @sucursal AND rut = @rut;
       ELSE
         UPDATE dmc.persona_local
            SET telefono = COALESCE(@telefono, telefono),
                cargo = COALESCE(@cargo, cargo), ultima_vez = SYSDATETIME()
          WHERE sucursal_id = @sucursal AND rut IS NULL AND nombre = @nombre;
       SET @n = @@ROWCOUNT;

       IF @n = 0
         INSERT INTO dmc.persona_local (sucursal_id, nombre, rut, telefono, cargo)
         VALUES (@sucursal, @nombre, @rut, @telefono, @cargo);`,
      [
        ["sucursal", sql.BigInt, sucursalId],
        ["nombre", sql.NVarChar(120), nombre],
        ["rut", sql.VarChar(12), persona.rut?.trim() || null],
        ["telefono", sql.VarChar(30), persona.telefono?.trim() || null],
        ["cargo", sql.NVarChar(80), persona.cargo?.trim() || null],
      ]
    );
  } catch (err) {
    console.error("[dmc] registrarPersonaLocal:", err);
  }
}
