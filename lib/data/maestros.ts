import "server-only";
import { consulta, consultaCon, ejecutar, num, numONull, sql, F_TS } from "@/lib/data/sql";
import { hashearPassword } from "@/lib/password";
import { faltaMigracionRoles, rolesDeUsuarios } from "@/lib/data/roles";
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

/**
 * ¿El error es que la base todavía no tiene la migración 009?
 *
 * Las listas de clientes y sucursales las lee toda la app, el celular del
 * técnico incluido: sin la migración tienen que seguir saliendo, solo que sin
 * notas ni motivo.
 */
export function faltaMigracionNotas(err: unknown): boolean {
  const texto = err instanceof Error ? err.message : String(err);
  return /invalid column name '(notas|motivo_inactivo)'/i.test(texto);
}

/** Lee con las columnas de la 009 y, si la base no las tiene, sin ellas. */
async function consultaConNotas<T>(armar: (extra: string) => string, extra: string): Promise<T[]> {
  try {
    return await consulta<T>(armar(extra));
  } catch (err) {
    if (!faltaMigracionNotas(err)) throw err;
    return consulta<T>(armar(""));
  }
}

interface FilaCliente {
  id: number;
  rut: string;
  razon_social: string;
  nombre_fantasia: string;
  activo: boolean;
  motivo_inactivo?: string | null;
  notas?: string | null;
}

export async function listarClientes(): Promise<Cliente[]> {
  const filas = await consultaConNotas<FilaCliente>(
    (extra) =>
      `SELECT id, rut, razon_social, nombre_fantasia, activo${extra}
         FROM dmc.cliente ORDER BY nombre_fantasia`,
    ", motivo_inactivo, notas"
  );
  return filas.map((f) => ({
    id: num(f.id),
    rut: f.rut,
    razonSocial: f.razon_social,
    nombreFantasia: f.nombre_fantasia,
    activo: Boolean(f.activo),
    motivoInactivo: f.motivo_inactivo ?? null,
    notas: f.notas ?? null,
  }));
}

export interface DatosCliente {
  rut: string;
  razonSocial: string;
  nombreFantasia: string;
  activo: boolean;
  /** Obligatorio cuando `activo` es false. */
  motivoInactivo: string | null;
  notas: string | null;
}

export async function guardarCliente(id: number | null, d: DatosCliente): Promise<number> {
  const rut = fmtRut(d.rut);
  if (await rutTomado("cliente", rut, id)) throw new RutRepetido("cliente", rut);

  const params: Parametros = [
    ["rut", sql.VarChar(12), rut],
    ["razon", sql.NVarChar(160), d.razonSocial],
    ["fantasia", sql.NVarChar(80), d.nombreFantasia],
    ["activo", sql.Bit, d.activo],
    // El motivo es del estado inactivo: al reactivar se borra.
    ["motivo", sql.NVarChar(400), d.activo ? null : d.motivoInactivo?.trim() || null],
    ["notas", sql.NVarChar(sql.MAX), d.notas?.trim() || null],
  ];
  if (id === null) {
    const [fila] = await consultaCon<{ id: number }>(
      `INSERT INTO dmc.cliente (rut, razon_social, nombre_fantasia, activo, motivo_inactivo, notas)
       OUTPUT INSERTED.id AS id
       VALUES (@rut, @razon, @fantasia, @activo, @motivo, @notas)`,
      params
    );
    return num(fila.id);
  }
  await ejecutar(
    `UPDATE dmc.cliente
        SET rut = @rut, razon_social = @razon, nombre_fantasia = @fantasia, activo = @activo,
            motivo_inactivo = @motivo, notas = @notas
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
  codigo: string | null;
  direccion: string;
  comuna: string;
  region: string;
  telefono: string | null;
  activo: boolean;
  motivo_inactivo?: string | null;
  notas?: string | null;
}

export async function listarSucursales(): Promise<Sucursal[]> {
  const filas = await consultaConNotas<FilaSucursal>(
    (extra) =>
      `SELECT id, cliente_id, nombre, codigo, direccion, comuna, region, telefono, activo${extra}
         FROM dmc.sucursal ORDER BY nombre`,
    ", motivo_inactivo, notas"
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
    motivoInactivo: f.motivo_inactivo ?? null,
    notas: f.notas ?? null,
  }));
}

export interface DatosSucursal {
  clienteId: number;
  nombre: string;
  /** Opcional: null o vacío se guarda como "sin código". */
  codigo: string | null;
  direccion: string;
  comuna: string;
  region: string;
  telefono: string | null;
  activo: boolean;
  /** Obligatorio cuando `activo` es false. */
  motivoInactivo: string | null;
  notas: string | null;
}

export async function guardarSucursal(id: number | null, d: DatosSucursal): Promise<number> {
  const params: Parametros = [
    ["cliente", sql.BigInt, d.clienteId],
    ["nombre", sql.NVarChar(120), d.nombre],
    ["codigo", sql.VarChar(20), d.codigo?.trim() || null],
    ["direccion", sql.NVarChar(180), d.direccion],
    ["comuna", sql.NVarChar(80), d.comuna],
    ["region", sql.NVarChar(80), d.region],
    ["telefono", sql.VarChar(30), d.telefono],
    ["activo", sql.Bit, d.activo],
    // El motivo es del estado inactivo: al reactivar se borra.
    ["motivo", sql.NVarChar(400), d.activo ? null : d.motivoInactivo?.trim() || null],
    ["notas", sql.NVarChar(sql.MAX), d.notas?.trim() || null],
  ];
  if (id === null) {
    const [fila] = await consultaCon<{ id: number }>(
      `INSERT INTO dmc.sucursal (cliente_id, nombre, codigo, direccion, comuna, region, telefono, activo,
                                 motivo_inactivo, notas)
       OUTPUT INSERTED.id AS id
       VALUES (@cliente, @nombre, @codigo, @direccion, @comuna, @region, @telefono, @activo, @motivo, @notas)`,
      params
    );
    return num(fila.id);
  }
  await ejecutar(
    `UPDATE dmc.sucursal
        SET cliente_id = @cliente, nombre = @nombre, codigo = @codigo, direccion = @direccion,
            comuna = @comuna, region = @region, telefono = @telefono, activo = @activo,
            motivo_inactivo = @motivo, notas = @notas
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
  // El rol del panel va en una consulta aparte: así la lista sigue saliendo en
  // una base que todavía no tiene la migración 008.
  const [filas, roles] = await Promise.all([
    consulta<FilaUsuarioLista>(
      `SELECT id, email, rol, tecnico_id, activo, ${F_TS("ultimo_acceso_en")} AS ultimo_acceso_en
         FROM dmc.usuario ORDER BY email`
    ),
    rolesDeUsuarios(),
  ]);
  return filas.map((f) => ({
    id: num(f.id),
    email: f.email,
    rol: f.rol,
    rolId: roles.get(num(f.id)) ?? null,
    tecnicoId: numONull(f.tecnico_id),
    activo: Boolean(f.activo),
    ultimoAccesoEn: f.ultimo_acceso_en,
  }));
}

export interface DatosUsuario {
  email: string;
  rol: RolUsuario;
  /** El rol del panel (dmc.rol). Solo cuenta si `rol` es COORDINADOR. */
  rolId?: number | null;
  tecnicoId: number | null;
  activo: boolean;
  /** Vacía al editar = deja la contraseña que ya tenía. */
  password: string;
}

export async function guardarUsuario(id: number | null, d: DatosUsuario): Promise<number> {
  // ck_usuario_rol_id: solo las cuentas del panel llevan rol. Si la cuenta deja
  // de ser del panel, el rol se suelta antes de cambiarle el tipo.
  const rolId = d.rol === "COORDINADOR" ? d.rolId ?? null : null;
  if (id !== null && rolId === null) await ponerRol(id, null);
  const usuarioId = await guardarUsuarioBase(id, d);
  if (rolId !== null) await ponerRol(usuarioId, rolId);
  return usuarioId;
}

async function ponerRol(usuarioId: number, rolId: number | null): Promise<void> {
  try {
    await ejecutar(`UPDATE dmc.usuario SET rol_id = @rol WHERE id = @id`, [
      ["rol", sql.BigInt, rolId],
      ["id", sql.BigInt, usuarioId],
    ]);
  } catch (err) {
    // Sin la migración 008 no hay columna: el usuario se guarda igual.
    if (!faltaMigracionRoles(err)) throw err;
  }
}

async function guardarUsuarioBase(id: number | null, d: DatosUsuario): Promise<number> {
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
