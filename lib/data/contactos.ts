import "server-only";
import { consultaCon, enTransaccion, num, numONull, paramIds, sql, subIds, type Parametro } from "@/lib/data/sql";
import type { CargoContacto, Contacto, UbicacionTienda } from "@/lib/ui/contactos";

// Contactos y sus cargos (migración 029): dmc.contacto y dmc.contacto_cargo.
//
// El alcance de un cargo apunta a la tabla que corresponda según su tipo
// (cliente, marca o sucursal por id; la región por texto). No hay FK, así que
// `guardarContacto` comprueba dentro de la transacción que exista.

interface FilaContacto {
  id: number;
  nombre: string;
  email: string | null;
  telefono: string | null;
  activo: boolean;
}

interface FilaCargo {
  id: number;
  contacto_id: number;
  cargo: string;
  alcance_tipo: CargoContacto["alcanceTipo"];
  alcance_id: number | null;
  alcance_texto: string | null;
}

/** Todos los contactos con sus cargos, o solo los de `ids`. */
export async function listarContactos(filtro: { ids?: number[] } = {}): Promise<Contacto[]> {
  const params: Parametro[] = filtro.ids ? [paramIds("ids", filtro.ids)] : [];
  const [contactos, cargos] = await Promise.all([
    consultaCon<FilaContacto>(
      `SELECT id, nombre, email, telefono, activo FROM dmc.contacto
        ${filtro.ids ? `WHERE id IN ${subIds("ids")}` : ""}
        ORDER BY nombre`,
      params
    ),
    consultaCon<FilaCargo>(
      `SELECT id, contacto_id, cargo, alcance_tipo, alcance_id, alcance_texto FROM dmc.contacto_cargo
        ${filtro.ids ? `WHERE contacto_id IN ${subIds("ids")}` : ""}
        ORDER BY id`,
      params
    ),
  ]);
  const porContacto = new Map<number, CargoContacto[]>();
  for (const c of cargos) {
    const lista = porContacto.get(num(c.contacto_id)) ?? [];
    lista.push({
      id: num(c.id),
      cargo: c.cargo,
      alcanceTipo: c.alcance_tipo,
      alcanceId: numONull(c.alcance_id),
      alcanceTexto: c.alcance_texto,
    });
    porContacto.set(num(c.contacto_id), lista);
  }
  return contactos.map((c) => ({
    id: num(c.id),
    nombre: c.nombre,
    email: c.email,
    telefono: c.telefono,
    activo: Boolean(c.activo),
    cargos: porContacto.get(num(c.id)) ?? [],
  }));
}

export async function getContacto(id: number): Promise<Contacto | undefined> {
  const [contacto] = await listarContactos({ ids: [id] });
  return contacto;
}

/** Ids de los contactos con algún cargo cuyo alcance cumple `condicion` (sobre `cc`). */
async function idsDeContactos(condicion: string, params: Parametro[]): Promise<number[]> {
  const filas = await consultaCon<{ contacto_id: number }>(
    `SELECT DISTINCT cc.contacto_id FROM dmc.contacto_cargo cc WHERE ${condicion}`,
    params
  );
  return filas.map((f) => num(f.contacto_id));
}

/**
 * Los contactos que pueden aplicar a una tienda: los que tienen algún cargo con
 * alcance en ella, su marca, su región o su cliente. Con todos sus cargos, para
 * poder editarlos; quién aplica por cuál lo decide `contactosDeTienda`.
 */
export async function contactosCandidatos(t: UbicacionTienda): Promise<Contacto[]> {
  const ids = await idsDeContactos(
    `(cc.alcance_tipo = 'SUCURSAL' AND cc.alcance_id = @sucursal)
      OR (cc.alcance_tipo = 'MARCA' AND cc.alcance_id = @marca)
      OR (cc.alcance_tipo = 'CLIENTE' AND cc.alcance_id = @cliente)
      OR (cc.alcance_tipo = 'REGION' AND cc.alcance_texto = @region COLLATE Latin1_General_CI_AI)`,
    [
      ["sucursal", sql.BigInt, t.id],
      ["marca", sql.BigInt, t.marcaId],
      ["cliente", sql.BigInt, t.clienteId],
      ["region", sql.NVarChar(80), t.region],
    ]
  );
  return ids.length ? listarContactos({ ids }) : [];
}

/**
 * Los contactos ligados a un cliente: con algún cargo en el cliente, en una de
 * sus marcas o en una de sus sucursales.
 */
export async function contactosDeCliente(clienteId: number): Promise<Contacto[]> {
  const ids = await idsDeContactos(
    `(cc.alcance_tipo = 'CLIENTE' AND cc.alcance_id = @cliente)
      OR (cc.alcance_tipo = 'MARCA' AND cc.alcance_id IN (SELECT id FROM dmc.marca WHERE cliente_id = @cliente))
      OR (cc.alcance_tipo = 'SUCURSAL' AND cc.alcance_id IN (SELECT id FROM dmc.sucursal WHERE cliente_id = @cliente))`,
    [["cliente", sql.BigInt, clienteId]]
  );
  return ids.length ? listarContactos({ ids }) : [];
}

export interface DatosContacto {
  nombre: string;
  email: string | null;
  telefono: string | null;
  activo: boolean;
  cargos: Omit<CargoContacto, "id">[];
}

/** Un cargo apunta a un cliente, marca o sucursal que no existe. */
export class AlcanceInexistente extends Error {
  constructor(public readonly cual: string) {
    super(`Alcance inexistente: ${cual}`);
    this.name = "AlcanceInexistente";
  }
}

const TABLA_DE_ALCANCE = { CLIENTE: "cliente", MARCA: "marca", SUCURSAL: "sucursal" } as const;

/**
 * Crea o actualiza un contacto y deja exactamente esos cargos, todo en una
 * transacción. Devuelve su id. El cargo viaja como JSON, igual que las
 * sucursales de una carga masiva: la lista no tiene largo fijo.
 */
export async function guardarContacto(id: number | null, d: DatosContacto): Promise<number> {
  return enTransaccion(async (ej) => {
    // Cada alcance que apunta a una fila tiene que existir.
    for (const tipo of ["CLIENTE", "MARCA", "SUCURSAL"] as const) {
      const ids = [...new Set(d.cargos.filter((c) => c.alcanceTipo === tipo).map((c) => c.alcanceId))];
      if (ids.length === 0) continue;
      const [fila] = await ej.consulta<{ n: number }>(
        `SELECT COUNT(*) AS n FROM dmc.${TABLA_DE_ALCANCE[tipo]} WHERE id IN ${subIds("ids")}`,
        [paramIds("ids", ids as number[])]
      );
      if (num(fila.n) !== ids.length) throw new AlcanceInexistente(tipo.toLowerCase());
    }

    const params: Parametro[] = [
      ["nombre", sql.NVarChar(120), d.nombre],
      ["email", sql.NVarChar(160), d.email],
      ["telefono", sql.VarChar(30), d.telefono],
      ["activo", sql.Bit, d.activo],
    ];
    let contactoId: number;
    if (id === null) {
      // Se recoge el id en una tabla de paso: OUTPUT sin INTO falla en tablas con triggers.
      const [fila] = await ej.consulta<{ id: number }>(
        `DECLARE @nuevo TABLE (id bigint);
         INSERT INTO dmc.contacto (nombre, email, telefono, activo)
         OUTPUT INSERTED.id INTO @nuevo
         VALUES (@nombre, @email, @telefono, @activo);
         SELECT id FROM @nuevo;`,
        params
      );
      contactoId = num(fila.id);
    } else {
      contactoId = id;
      const tocadas = await ej.ejecutar(
        `UPDATE dmc.contacto SET nombre = @nombre, email = @email, telefono = @telefono, activo = @activo WHERE id = @id`,
        [...params, ["id", sql.BigInt, id]]
      );
      if (tocadas === 0) throw new AlcanceInexistente("contacto");
    }

    await ej.ejecutar(`DELETE FROM dmc.contacto_cargo WHERE contacto_id = @id`, [["id", sql.BigInt, contactoId]]);
    if (d.cargos.length) {
      await ej.ejecutar(
        `INSERT INTO dmc.contacto_cargo (contacto_id, cargo, alcance_tipo, alcance_id, alcance_texto)
         SELECT @id, j.cargo, j.tipo, j.alcance_id, j.texto
           FROM OPENJSON(@cargos)
                WITH (cargo nvarchar(80) '$.cargo', tipo varchar(10) '$.tipo',
                      alcance_id bigint '$.alcanceId', texto nvarchar(80) '$.texto') j`,
        [
          ["id", sql.BigInt, contactoId],
          [
            "cargos",
            sql.NVarChar(sql.MAX),
            JSON.stringify(
              d.cargos.map((c) => ({ cargo: c.cargo.trim(), tipo: c.alcanceTipo, alcanceId: c.alcanceId, texto: c.alcanceTexto }))
            ),
          ],
        ]
      );
    }
    return contactoId;
  });
}
