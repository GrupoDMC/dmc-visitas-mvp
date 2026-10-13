import { z } from "zod";
import { arreglo, correo, fechaOVacia, idPositivo, rutEscrito, telefono, texto, textoLibre } from "./comun";

// Maestros: clientes, malls, sucursales, técnicos, usuarios y roles.

/** `id` null = alta. */
const idOAlta = idPositivo.nullable();

const MOTIVO_INACTIVO = texto(400);

export const entradaCliente = z.object({
  id: idOAlta,
  datos: z.object({
    rut: rutEscrito,
    razonSocial: texto(160),
    nombreFantasia: texto(80),
    activo: z.boolean(),
    motivoInactivo: MOTIVO_INACTIVO.nullable().default(null),
    notas: textoLibre.nullable().default(null),
    planCalibracion: z.boolean().nullable(),
  }),
});

export const entradaMall = z.object({
  id: idOAlta,
  datos: z.object({
    nombre: texto(120),
    direccion: texto(180),
    comuna: texto(80),
    region: texto(80),
    activo: z.boolean(),
  }),
});

/** Un mall con cientos de tiendas ya sería raro; 2.000 deja margen. */
export const entradaTiendasMall = z.object({
  mallId: idPositivo,
  sucursalIds: z.array(idPositivo).max(2000, "Son demasiadas tiendas para un mall."),
});

export const entradaSucursal = z.object({
  id: idOAlta,
  datos: z.object({
    clienteId: idPositivo,
    mallId: idPositivo.nullable(),
    nombre: texto(120),
    codigo: texto(20).nullable(),
    direccion: texto(180),
    comuna: texto(80),
    region: texto(80),
    telefono: telefono.nullable(),
    activo: z.boolean(),
    motivoInactivo: MOTIVO_INACTIVO.nullable().default(null),
    notas: textoLibre.nullable().default(null),
    fechaInstalacion: fechaOVacia.nullable(),
    remota: z.boolean().nullable(),
    enGarantia: z.boolean().nullable(),
    planCalibracion: z.boolean().nullable(),
  }),
});

export const entradaSucursalesLote = z.object({
  clienteId: idPositivo,
  filas: arreglo(
    z.object({
      mallId: idPositivo.nullable(),
      nombre: texto(120),
      codigo: texto(20).nullable(),
      direccion: texto(180),
      comuna: texto(80),
      region: texto(80),
    }),
    1000
  ),
});

export const entradaTecnico = z.object({
  id: idOAlta,
  datos: z.object({
    rut: rutEscrito,
    nombres: texto(80),
    apellidoPaterno: texto(80),
    apellidoMaterno: texto(80).nullable(),
    email: correo,
    telefono: telefono.nullable(),
    activo: z.boolean(),
  }),
});

export const entradaUsuario = z.object({
  id: idOAlta,
  datos: z.object({
    email: correo,
    rol: z.enum(["ADMIN", "COORDINADOR", "TECNICO"]),
    rolId: idPositivo.nullable().optional(),
    // Un select vacío manda 0: la acción lo trata como «sin técnico».
    tecnicoId: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    activo: z.boolean(),
    // Sin recortar y con tope: bcrypt solo mira 72 bytes y validarPasswordNueva
    // pone el mensaje; esto solo corta lo absurdo.
    password: z.string().max(256, "La contraseña es demasiado larga (máximo 72 caracteres)."),
  }),
});

const permiso = z.string().max(60);

export const entradaRol = z.object({
  id: idOAlta,
  datos: z.object({
    nombre: texto(60),
    descripcion: texto(240).nullable(),
    permisos: arreglo(permiso, 300),
  }),
});

export const entradaPermisosCelular = arreglo(permiso, 300);
