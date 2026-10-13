import "server-only";
import { consulta, consultaCon, ejecutar, enTransaccion, num, numONull, paramIds, sql, subIds, F_FECHA, F_TS } from "@/lib/data/sql";
import { hashearPassword } from "@/lib/password";
import { leerCuenta, leerRol, permisosDelPanel, type Cuenta } from "@/lib/data/roles";
import { fmtRut, rutLimpio } from "@/lib/ui/formato";
import type { Cliente, Mall, RolUsuario, Sucursal, Tecnico, Usuario } from "@/lib/types";

// Maestros: dmc.cliente, dmc.mall, dmc.sucursal, dmc.tecnico y dmc.usuario.
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
// `tabla` se interpola en el texto: es una unión cerrada de literales, nunca entrada del usuario.
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

/** Un bit que admite «no se sabe»: null sigue siendo null. */
const bitONull = (v: boolean | number | null | undefined) => (v === null || v === undefined ? null : Boolean(v));

interface FilaCliente {
  id: number;
  rut: string;
  razon_social: string;
  nombre_fantasia: string;
  activo: boolean;
  motivo_inactivo: string | null;
  notas: string | null;
  plan_calibracion: boolean | null;
}

/** Todos los clientes, o solo los de `ids`. */
export async function listarClientes(filtro: { ids?: number[] } = {}): Promise<Cliente[]> {
  const filas = await consultaCon<FilaCliente>(
    `SELECT id, rut, razon_social, nombre_fantasia, activo, motivo_inactivo, notas, plan_calibracion
       FROM dmc.cliente
      ${filtro.ids ? `WHERE id IN ${subIds("ids")}` : ""}
      ORDER BY nombre_fantasia`,
    filtro.ids ? [paramIds("ids", filtro.ids)] : []
  );
  return filas.map((f) => ({
    id: num(f.id),
    rut: f.rut,
    razonSocial: f.razon_social,
    nombreFantasia: f.nombre_fantasia,
    activo: Boolean(f.activo),
    motivoInactivo: f.motivo_inactivo,
    notas: f.notas,
    planCalibracion: bitONull(f.plan_calibracion),
  }));
}

export async function getCliente(id: number): Promise<Cliente | undefined> {
  const [cliente] = await listarClientes({ ids: [id] });
  return cliente;
}

export interface DatosCliente {
  rut: string;
  razonSocial: string;
  nombreFantasia: string;
  activo: boolean;
  /** Obligatorio cuando `activo` es false. */
  motivoInactivo: string | null;
  notas: string | null;
  /** null = no se sabe. */
  planCalibracion: boolean | null;
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
    ["plan", sql.Bit, d.planCalibracion],
  ];
  if (id === null) {
    const [fila] = await consultaCon<{ id: number }>(
      `INSERT INTO dmc.cliente (rut, razon_social, nombre_fantasia, activo, motivo_inactivo, notas, plan_calibracion)
       OUTPUT INSERTED.id AS id
       VALUES (@rut, @razon, @fantasia, @activo, @motivo, @notas, @plan)`,
      params
    );
    return num(fila.id);
  }
  await ejecutar(
    `UPDATE dmc.cliente
        SET rut = @rut, razon_social = @razon, nombre_fantasia = @fantasia, activo = @activo,
            motivo_inactivo = @motivo, notas = @notas, plan_calibracion = @plan
      WHERE id = @id`,
    [...params, ["id", sql.BigInt, id]]
  );
  return id;
}

// ── Malls ───────────────────────────────────────────────────────────────────

interface FilaMall {
  id: number;
  nombre: string;
  direccion: string;
  comuna: string | null;
  region: string | null;
  activo: boolean;
}

/** Todos los malls, o solo los de `ids`. */
export async function listarMalls(filtro: { ids?: number[] } = {}): Promise<Mall[]> {
  const filas = await consultaCon<FilaMall>(
    `SELECT id, nombre, direccion, comuna, region, activo FROM dmc.mall
      ${filtro.ids ? `WHERE id IN ${subIds("ids")}` : ""}
      ORDER BY nombre`,
    filtro.ids ? [paramIds("ids", filtro.ids)] : []
  );
  return filas.map((f) => ({
    id: num(f.id),
    nombre: f.nombre,
    direccion: f.direccion,
    comuna: f.comuna ?? "",
    region: f.region ?? "",
    activo: Boolean(f.activo),
  }));
}

export async function getMall(id: number): Promise<Mall | undefined> {
  const [mall] = await listarMalls({ ids: [id] });
  return mall;
}

export interface DatosMall {
  nombre: string;
  direccion: string;
  comuna: string;
  region: string;
  activo: boolean;
}

export async function guardarMall(id: number | null, d: DatosMall): Promise<number> {
  const params: Parametros = [
    ["nombre", sql.NVarChar(120), d.nombre],
    ["direccion", sql.NVarChar(180), d.direccion],
    ["comuna", sql.NVarChar(80), d.comuna],
    ["region", sql.NVarChar(80), d.region],
    ["activo", sql.Bit, d.activo],
  ];
  if (id === null) {
    const [fila] = await consultaCon<{ id: number }>(
      `INSERT INTO dmc.mall (nombre, direccion, comuna, region, activo)
       OUTPUT INSERTED.id AS id
       VALUES (@nombre, @direccion, @comuna, @region, @activo)`,
      params
    );
    return num(fila.id);
  }
  await ejecutar(
    `UPDATE dmc.mall
        SET nombre = @nombre, direccion = @direccion, comuna = @comuna, region = @region, activo = @activo
      WHERE id = @id`,
    [...params, ["id", sql.BigInt, id]]
  );
  return id;
}

/** Una sucursal está en un solo mall: no se saca de uno por agregarla a otro. */
export class TiendaEnOtroMall extends Error {
  constructor(public readonly tiendas: string[]) {
    super(`Sucursales que ya están en otro mall: ${tiendas.join(", ")}`);
    this.name = "TiendaEnOtroMall";
  }
}

/**
 * Deja en el mall exactamente esas tiendas: las que ya no vienen se sueltan y
 * las que vienen quedan en él. Si alguna ya está en otro mall no se guarda nada.
 */
export async function ponerTiendasDeMall(mallId: number, sucursalIds: number[]): Promise<void> {
  // Los ids van como JSON: la lista no tiene largo fijo y así sigue siendo un parámetro.
  const params: Parameters<typeof ejecutar>[1] = [
    ["mall", sql.BigInt, mallId],
    ["ids", sql.NVarChar(sql.MAX), JSON.stringify(sucursalIds)],
  ];
  const ajenas = await consultaCon<{ nombre: string; mall: string }>(
    `SELECT s.nombre, m.nombre AS mall
       FROM dmc.sucursal s
       JOIN (SELECT CAST([value] AS bigint) AS id FROM OPENJSON(@ids)) t ON t.id = s.id
       JOIN dmc.mall m ON m.id = s.mall_id
      WHERE s.mall_id <> @mall
      ORDER BY s.nombre`,
    params
  );
  if (ajenas.length) throw new TiendaEnOtroMall(ajenas.map((a) => `${a.nombre} (${a.mall})`));
  // Solo entran las que están sin mall: si otro la tomó entre medio, no se le quita.
  await ejecutar(
    `UPDATE s
        SET mall_id = CASE WHEN t.id IS NULL THEN NULL ELSE @mall END
       FROM dmc.sucursal s
       LEFT JOIN (SELECT CAST([value] AS bigint) AS id FROM OPENJSON(@ids)) t ON t.id = s.id
      WHERE (s.mall_id = @mall AND t.id IS NULL)
         OR (t.id IS NOT NULL AND s.mall_id IS NULL)`,
    params
  );
}

// ── Sucursales ──────────────────────────────────────────────────────────────

interface FilaSucursal {
  id: number;
  cliente_id: number;
  mall_id: number | null;
  nombre: string;
  codigo: string | null;
  direccion: string;
  comuna: string;
  region: string;
  telefono: string | null;
  activo: boolean;
  motivo_inactivo: string | null;
  notas: string | null;
  fecha_instalacion: string | null;
  remota: boolean | null;
  en_garantia: boolean | null;
  plan_calibracion: boolean | null;
}

/** Todas las sucursales, o solo la de `id`, las de un cliente o las de un mall. */
export async function listarSucursales(
  filtro: { id?: number; clienteId?: number; mallId?: number } = {}
): Promise<Sucursal[]> {
  const donde: string[] = [];
  const params: Parametros = [];
  if (filtro.id !== undefined) {
    donde.push("id = @id");
    params.push(["id", sql.BigInt, filtro.id]);
  }
  if (filtro.clienteId !== undefined) {
    donde.push("cliente_id = @cliente");
    params.push(["cliente", sql.BigInt, filtro.clienteId]);
  }
  if (filtro.mallId !== undefined) {
    donde.push("mall_id = @mall");
    params.push(["mall", sql.BigInt, filtro.mallId]);
  }
  const filas = await consultaCon<FilaSucursal>(
    `SELECT id, cliente_id, mall_id, nombre, codigo, direccion, comuna, region, telefono, activo,
            motivo_inactivo, notas, ${F_FECHA("fecha_instalacion")} AS fecha_instalacion, remota, en_garantia,
            plan_calibracion
       FROM dmc.sucursal
      ${donde.length ? `WHERE ${donde.join(" AND ")}` : ""}
      ORDER BY nombre`,
    params
  );
  return filas.map((f) => ({
    id: num(f.id),
    clienteId: num(f.cliente_id),
    mallId: numONull(f.mall_id),
    nombre: f.nombre,
    codigo: f.codigo,
    direccion: f.direccion,
    comuna: f.comuna,
    region: f.region,
    telefono: f.telefono,
    activo: Boolean(f.activo),
    motivoInactivo: f.motivo_inactivo,
    notas: f.notas,
    fechaInstalacion: f.fecha_instalacion,
    remota: bitONull(f.remota),
    enGarantia: bitONull(f.en_garantia),
    planCalibracion: bitONull(f.plan_calibracion),
  }));
}

export async function getSucursal(id: number): Promise<Sucursal | undefined> {
  const [sucursal] = await listarSucursales({ id });
  return sucursal;
}

export interface DatosSucursal {
  clienteId: number;
  /** El mall en el que queda la tienda. null = no está en ningún mall. */
  mallId: number | null;
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
  /** YYYY-MM-DD. Este y los dos siguientes: null = no se sabe. */
  fechaInstalacion: string | null;
  remota: boolean | null;
  enGarantia: boolean | null;
  /**
   * La de la tienda por su cuenta. Si el cliente está en plan,
   * la tienda lo está igual: esto solo cuenta cuando el cliente no lo está.
   */
  planCalibracion: boolean | null;
}

export async function guardarSucursal(id: number | null, d: DatosSucursal): Promise<number> {
  const params: Parametros = [
    ["cliente", sql.BigInt, d.clienteId],
    ["mall", sql.BigInt, d.mallId],
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
    ["instalacion", sql.Date, d.fechaInstalacion || null],
    ["remota", sql.Bit, d.remota],
    ["garantia", sql.Bit, d.enGarantia],
    ["plan", sql.Bit, d.planCalibracion],
  ];
  if (id === null) {
    const [fila] = await consultaCon<{ id: number }>(
      `INSERT INTO dmc.sucursal (cliente_id, mall_id, nombre, codigo, direccion, comuna, region, telefono, activo,
                                 motivo_inactivo, notas, fecha_instalacion, remota, en_garantia, plan_calibracion)
       OUTPUT INSERTED.id AS id
       VALUES (@cliente, @mall, @nombre, @codigo, @direccion, @comuna, @region, @telefono, @activo, @motivo, @notas,
               @instalacion, @remota, @garantia, @plan)`,
      params
    );
    return num(fila.id);
  }
  await ejecutar(
    `UPDATE dmc.sucursal
        SET cliente_id = @cliente, mall_id = @mall, nombre = @nombre, codigo = @codigo, direccion = @direccion,
            comuna = @comuna, region = @region, telefono = @telefono, activo = @activo,
            motivo_inactivo = @motivo, notas = @notas, fecha_instalacion = @instalacion, remota = @remota,
            en_garantia = @garantia, plan_calibracion = @plan
      WHERE id = @id`,
    [...params, ["id", sql.BigInt, id]]
  );
  return id;
}

/** Una sucursal nueva dentro de un alta masiva. */
export interface DatosSucursalLote {
  mallId: number | null;
  nombre: string;
  codigo: string | null;
  direccion: string;
  comuna: string;
  region: string;
}

/**
 * Crea todas las sucursales de un cliente en un solo INSERT: o entran todas o
 * ninguna. Las filas viajan como JSON, igual que en `ponerTiendasDeMall`.
 */
export async function crearSucursalesLote(clienteId: number, filas: DatosSucursalLote[]): Promise<number> {
  const json = JSON.stringify(
    filas.map((f) => ({
      mall: f.mallId,
      nombre: f.nombre,
      codigo: f.codigo?.trim() || null,
      direccion: f.direccion,
      comuna: f.comuna,
      region: f.region,
    }))
  );
  return ejecutar(
    `INSERT INTO dmc.sucursal (cliente_id, mall_id, nombre, codigo, direccion, comuna, region, activo)
     SELECT @cliente, j.mall, j.nombre, j.codigo, j.direccion, j.comuna, j.region, 1
       FROM OPENJSON(@filas)
            WITH (mall bigint '$.mall', nombre nvarchar(120) '$.nombre', codigo varchar(20) '$.codigo',
                  direccion nvarchar(180) '$.direccion', comuna nvarchar(80) '$.comuna', region nvarchar(80) '$.region') j`,
    [
      ["cliente", sql.BigInt, clienteId],
      ["filas", sql.NVarChar(sql.MAX), json],
    ]
  );
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
  rol_id: number | null;
  tecnico_id: number | null;
  activo: boolean;
  ultimo_acceso_en: string | null;
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const filas = await consulta<FilaUsuarioLista>(
    `SELECT id, email, rol, rol_id, tecnico_id, activo, ${F_TS("ultimo_acceso_en")} AS ultimo_acceso_en
       FROM dmc.usuario ORDER BY email`
  );
  return filas.map((f) => ({
    id: num(f.id),
    email: f.email,
    rol: f.rol,
    rolId: numONull(f.rol_id),
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

/** La cuenta no se puede guardar así: el mensaje es para quien guarda. */
export class CuentaNoPermitida extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "CuentaNoPermitida";
  }
}

export interface ControlUsuario {
  /** Quien guarda. Si pone una clave en una cuenta ajena, el dueño tendrá que cambiarla al entrar. */
  actorId: number;
  /**
   * El último control, ya con la fila de la cuenta tomada: recibe cómo está
   * (null en un alta) y cómo quedaría. Devuelve el motivo si no se puede.
   */
  autorizar: (actual: Cuenta | null, nueva: { rol: RolUsuario; rolId: number | null; permisos: string[] }) => string | null;
}

/**
 * Alta o edición de un usuario, con rol, datos y contraseña en una sola
 * transacción. Devuelve el id y su versión de sesión, que sube —y cierra sus
 * sesiones abiertas— si cambia la clave, el rol o se desactiva.
 *
 * `d.password` vacía al editar = deja la que tenía. No se recorta nunca.
 */
export async function guardarUsuario(
  id: number | null,
  d: DatosUsuario,
  control: ControlUsuario
): Promise<{ id: number; sesionVersion: number }> {
  const email = d.email.trim().toLowerCase();
  // ck_usuario_tecnico: TECNICO exige tecnico_id, el resto lo exige nulo.
  const tecnicoId = d.rol === "TECNICO" ? d.tecnicoId : null;
  // ck_usuario_rol_id: solo las cuentas del panel llevan rol.
  const rolId = d.rol === "COORDINADOR" ? d.rolId ?? null : null;
  // bcrypt tarda: va antes de abrir la transacción, no con las filas tomadas.
  const hash = id === null || d.password !== "" ? await hashearPassword(d.password) : null;
  // La clave que pone otra persona es temporal: el dueño la cambia al entrar.
  const debeCambiar = id === null || id !== control.actorId;

  return enTransaccion(async (ej) => {
    const actual = id === null ? null : await leerCuenta(id, ej, true);
    if (id !== null && !actual) throw new CuentaNoPermitida("Esa cuenta ya no existe. Recarga la página.");

    const rol = rolId === null ? null : await leerRol(rolId, ej);
    if (rolId !== null && !rol) throw new CuentaNoPermitida("Ese rol ya no existe. Recarga la página y elige otro.");
    const motivo = control.autorizar(actual, {
      rol: d.rol,
      rolId,
      permisos: permisosDelPanel(d.rol, rolId, rol?.permisos ?? []),
    });
    if (motivo) throw new CuentaNoPermitida(motivo);

    if (actual === null) {
      const [fila] = await ej.consulta<{ id: number }>(
        `INSERT INTO dmc.usuario (email, password_hash, rol, rol_id, tecnico_id, activo, debe_cambiar_password)
         VALUES (@email, @hash, @rol, @rolId, @tecnico, @activo, @debe);
         SELECT CAST(SCOPE_IDENTITY() AS bigint) AS id;`,
        [
          ["email", sql.NVarChar(160), email],
          ["hash", sql.NVarChar(200), hash],
          ["rol", sql.VarChar(12), d.rol],
          ["rolId", sql.BigInt, rolId],
          ["tecnico", sql.BigInt, tecnicoId],
          ["activo", sql.Bit, d.activo],
          ["debe", sql.Bit, debeCambiar],
        ]
      );
      return { id: num(fila.id), sesionVersion: 0 };
    }

    const revoca = hash !== null || actual.rol !== d.rol || actual.rolId !== rolId || (actual.activo && !d.activo);
    // Sin OUTPUT: dmc.usuario tiene trigger de actualización. La versión se
    // relee en el mismo lote.
    const [fila] = await ej.consulta<{ sesion_version: number }>(
      `UPDATE dmc.usuario
          SET email = @email, rol = @rol, rol_id = @rolId, tecnico_id = @tecnico, activo = @activo,
              password_hash = COALESCE(@hash, password_hash),
              debe_cambiar_password = CASE WHEN @hash IS NULL THEN debe_cambiar_password ELSE @debe END,
              sesion_version = sesion_version + @revoca
        WHERE id = @id;
       SELECT sesion_version FROM dmc.usuario WHERE id = @id;`,
      [
        ["email", sql.NVarChar(160), email],
        ["rol", sql.VarChar(12), d.rol],
        ["rolId", sql.BigInt, rolId],
        ["tecnico", sql.BigInt, tecnicoId],
        ["activo", sql.Bit, d.activo],
        ["hash", sql.NVarChar(200), hash],
        ["debe", sql.Bit, debeCambiar],
        ["revoca", sql.Int, revoca ? 1 : 0],
        ["id", sql.BigInt, actual.id],
      ]
    );
    return { id: actual.id, sesionVersion: num(fila.sesion_version) };
  });
}

type Parametros = Parameters<typeof consultaCon>[1];
