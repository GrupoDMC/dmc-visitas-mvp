import "server-only";
import { consulta, consultaCon, ejecutar, num, numONull, sql, F_TS } from "@/lib/data/sql";
import { hashearPassword } from "@/lib/password";
import { fmtRut, rutLimpio } from "@/lib/ui/formato";
import type { Cliente, RolUsuario, Sucursal, Tecnico, Usuario } from "@/lib/types";

// Maestros: dmc.cliente, dmc.sucursal, dmc.tecnico y dmc.usuario.
// Lectura para las tablas del panel y escritura para sus diálogos de alta/edición.

/** El RUT no distingue de quién es: una empresa o una persona, pero uno solo. */
export class RutRepetido extends Error {
  constructor(public readonly donde: "cliente" | "tecnico", public readonly rut: string) {
    super(`RUT repetido en ${donde}: ${rut}`);
    this.name = "RutRepetido";
  }
}

/**
 * ¿Ese RUT ya está tomado en la tabla?
 *
 * Se compara sin puntos ni guion y en mayúsculas: "12345678-9", "12.345.678-9"
 * y "123456789" son el mismo RUT, y la UNIQUE de la base los daba por
 * distintos, así que el mismo cliente entraba dos veces con solo escribirlo de
 * otra forma. Al guardar se normaliza además el formato, para que las filas
 * viejas y las nuevas se vean igual.
 */
async function rutTomado(tabla: "cliente" | "tecnico", rut: string, idPropio: number | null): Promise<boolean> {
  const limpio = rutLimpio(rut);
  if (!limpio) return false;
  const filas = await consultaCon<{ id: number }>(
    `SELECT TOP 1 id FROM dmc.${tabla}
      WHERE REPLACE(REPLACE(UPPER(rut), '.', ''), '-', '') = @rut
        AND (@id IS NULL OR id <> @id)`,
    [
      ["rut", sql.VarChar(12), limpio],
      ["id", sql.BigInt, idPropio],
    ]
  );
  return filas.length > 0;
}

// ── Clientes ────────────────────────────────────────────────────────────────

interface FilaCliente {
  id: number;
  rut: string;
  razon_social: string;
  nombre_fantasia: string;
  activo: boolean;
}

export async function listarClientes(): Promise<Cliente[]> {
  const filas = await consulta<FilaCliente>(
    `SELECT id, rut, razon_social, nombre_fantasia, activo
       FROM dmc.cliente ORDER BY nombre_fantasia`
  );
  return filas.map((f) => ({
    id: num(f.id),
    rut: f.rut,
    razonSocial: f.razon_social,
    nombreFantasia: f.nombre_fantasia,
    activo: Boolean(f.activo),
  }));
}

export interface DatosCliente {
  rut: string;
  razonSocial: string;
  nombreFantasia: string;
  activo: boolean;
}

export async function guardarCliente(id: number | null, d: DatosCliente): Promise<number> {
  const rut = fmtRut(d.rut);
  if (await rutTomado("cliente", rut, id)) throw new RutRepetido("cliente", rut);

  const params: Parametros = [
    ["rut", sql.VarChar(12), rut],
    ["razon", sql.NVarChar(160), d.razonSocial],
    ["fantasia", sql.NVarChar(80), d.nombreFantasia],
    ["activo", sql.Bit, d.activo],
  ];
  if (id === null) {
    const [fila] = await consultaCon<{ id: number }>(
      `INSERT INTO dmc.cliente (rut, razon_social, nombre_fantasia, activo)
       OUTPUT INSERTED.id AS id
       VALUES (@rut, @razon, @fantasia, @activo)`,
      params
    );
    return num(fila.id);
  }
  await ejecutar(
    `UPDATE dmc.cliente
        SET rut = @rut, razon_social = @razon, nombre_fantasia = @fantasia, activo = @activo
      WHERE id = @id`,
    [...params, ["id", sql.BigInt, id]]
  );
  return id;
}

// ── Sucursales ──────────────────────────────────────────────────────────────

interface FilaSucursal {
  id: number;
  cliente_id: number;
  nombre: string;
  codigo: string;
  direccion: string;
  comuna: string;
  region: string;
  telefono: string | null;
  activo: boolean;
}

export async function listarSucursales(): Promise<Sucursal[]> {
  const filas = await consulta<FilaSucursal>(
    `SELECT id, cliente_id, nombre, codigo, direccion, comuna, region, telefono, activo
       FROM dmc.sucursal ORDER BY nombre`
  );
  return filas.map((f) => ({
    id: num(f.id),
    clienteId: num(f.cliente_id),
    nombre: f.nombre,
    codigo: f.codigo,
    direccion: f.direccion,
    comuna: f.comuna,
    region: f.region,
    telefono: f.telefono,
    activo: Boolean(f.activo),
  }));
}

export interface DatosSucursal {
  clienteId: number;
  nombre: string;
  codigo: string;
  direccion: string;
  comuna: string;
  region: string;
  telefono: string | null;
  activo: boolean;
}

export async function guardarSucursal(id: number | null, d: DatosSucursal): Promise<number> {
  const params: Parametros = [
    ["cliente", sql.BigInt, d.clienteId],
    ["nombre", sql.NVarChar(120), d.nombre],
    ["codigo", sql.VarChar(20), d.codigo],
    ["direccion", sql.NVarChar(180), d.direccion],
    ["comuna", sql.NVarChar(80), d.comuna],
    ["region", sql.NVarChar(80), d.region],
    ["telefono", sql.VarChar(30), d.telefono],
    ["activo", sql.Bit, d.activo],
  ];
  if (id === null) {
    const [fila] = await consultaCon<{ id: number }>(
      `INSERT INTO dmc.sucursal (cliente_id, nombre, codigo, direccion, comuna, region, telefono, activo)
       OUTPUT INSERTED.id AS id
       VALUES (@cliente, @nombre, @codigo, @direccion, @comuna, @region, @telefono, @activo)`,
      params
    );
    return num(fila.id);
  }
  await ejecutar(
    `UPDATE dmc.sucursal
        SET cliente_id = @cliente, nombre = @nombre, codigo = @codigo, direccion = @direccion,
            comuna = @comuna, region = @region, telefono = @telefono, activo = @activo
      WHERE id = @id`,
    [...params, ["id", sql.BigInt, id]]
  );
  return id;
}

// ── Técnicos ────────────────────────────────────────────────────────────────

interface FilaTecnico {
  id: number;
  rut: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  nombre_completo: string;
  email: string;
  telefono: string | null;
  activo: boolean;
}

export function mapearTecnico(f: FilaTecnico): Tecnico {
  return {
    id: num(f.id),
    rut: f.rut,
    nombres: f.nombres,
    apellidoPaterno: f.apellido_paterno,
    apellidoMaterno: f.apellido_materno,
    nombreCompleto: f.nombre_completo,
    email: f.email,
    telefono: f.telefono,
    activo: Boolean(f.activo),
  };
}

export async function listarTecnicos(): Promise<Tecnico[]> {
  const filas = await consulta<FilaTecnico>(
    `SELECT id, rut, nombres, apellido_paterno, apellido_materno, nombre_completo, email, telefono, activo
       FROM dmc.tecnico ORDER BY nombre_completo`
  );
  return filas.map(mapearTecnico);
}

export interface DatosTecnico {
  rut: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  email: string;
  telefono: string | null;
  activo: boolean;
}

export async function guardarTecnico(id: number | null, d: DatosTecnico): Promise<number> {
  const rut = fmtRut(d.rut);
  if (await rutTomado("tecnico", rut, id)) throw new RutRepetido("tecnico", rut);

  // nombre_completo es una columna calculada: no se inserta ni se actualiza.
  const params: Parametros = [
    ["rut", sql.VarChar(12), rut],
    ["nombres", sql.NVarChar(80), d.nombres],
    ["paterno", sql.NVarChar(80), d.apellidoPaterno],
    ["materno", sql.NVarChar(80), d.apellidoMaterno],
    ["email", sql.NVarChar(160), d.email],
    ["telefono", sql.VarChar(30), d.telefono],
    ["activo", sql.Bit, d.activo],
  ];
  if (id === null) {
    const [fila] = await consultaCon<{ id: number }>(
      `INSERT INTO dmc.tecnico (rut, nombres, apellido_paterno, apellido_materno, email, telefono, activo)
       OUTPUT INSERTED.id AS id
       VALUES (@rut, @nombres, @paterno, @materno, @email, @telefono, @activo)`,
      params
    );
    return num(fila.id);
  }
  await ejecutar(
    `UPDATE dmc.tecnico
        SET rut = @rut, nombres = @nombres, apellido_paterno = @paterno, apellido_materno = @materno,
            email = @email, telefono = @telefono, activo = @activo
      WHERE id = @id`,
    [...params, ["id", sql.BigInt, id]]
  );
  return id;
}

// ── Usuarios ────────────────────────────────────────────────────────────────

interface FilaUsuarioLista {
  id: number;
  email: string;
  rol: RolUsuario;
  tecnico_id: number | null;
  activo: boolean;
  ultimo_acceso_en: string | null;
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const filas = await consulta<FilaUsuarioLista>(
    `SELECT id, email, rol, tecnico_id, activo, ${F_TS("ultimo_acceso_en")} AS ultimo_acceso_en
       FROM dmc.usuario ORDER BY email`
  );
  return filas.map((f) => ({
    id: num(f.id),
    email: f.email,
    rol: f.rol,
    tecnicoId: numONull(f.tecnico_id),
    activo: Boolean(f.activo),
    ultimoAccesoEn: f.ultimo_acceso_en,
  }));
}

export interface DatosUsuario {
  email: string;
  rol: RolUsuario;
  tecnicoId: number | null;
  activo: boolean;
  /** Vacía al editar = deja la contraseña que ya tenía. */
  password: string;
}

export async function guardarUsuario(id: number | null, d: DatosUsuario): Promise<number> {
  const email = d.email.trim().toLowerCase();
  // ck_usuario_tecnico: TECNICO exige tecnico_id, el resto lo exige nulo.
  const tecnicoId = d.rol === "TECNICO" ? d.tecnicoId : null;

  if (id === null) {
    const [fila] = await consultaCon<{ id: number }>(
      `INSERT INTO dmc.usuario (email, password_hash, rol, tecnico_id, activo)
       OUTPUT INSERTED.id AS id
       VALUES (@email, @hash, @rol, @tecnico, @activo)`,
      [
        ["email", sql.NVarChar(160), email],
        ["hash", sql.NVarChar(200), await hashearPassword(d.password)],
        ["rol", sql.VarChar(12), d.rol],
        ["tecnico", sql.BigInt, tecnicoId],
        ["activo", sql.Bit, d.activo],
      ]
    );
    return num(fila.id);
  }

  await ejecutar(
    `UPDATE dmc.usuario
        SET email = @email, rol = @rol, tecnico_id = @tecnico, activo = @activo
      WHERE id = @id`,
    [
      ["email", sql.NVarChar(160), email],
      ["rol", sql.VarChar(12), d.rol],
      ["tecnico", sql.BigInt, tecnicoId],
      ["activo", sql.Bit, d.activo],
      ["id", sql.BigInt, id],
    ]
  );

  // La contraseña se toca solo si escribieron una nueva: el formulario llega
  // vacío cuando no se quiso cambiar, y sobrescribir con eso dejaría al usuario
  // sin poder entrar.
  if (d.password.trim()) {
    await ejecutar(`UPDATE dmc.usuario SET password_hash = @hash WHERE id = @id`, [
      ["hash", sql.NVarChar(200), await hashearPassword(d.password)],
      ["id", sql.BigInt, id],
    ]);
  }
  return id;
}

type Parametros = Parameters<typeof consultaCon>[1];
