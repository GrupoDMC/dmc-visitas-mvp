import { z } from "zod";
import {
  emailOpcional,
  regionOpcional,
  rut,
  telefonoOpcional,
  textoOpcional,
  textoRequerido,
} from "./campos";

/**
 * Los esquemas viven acá y no dentro de cada Server Action para que el
 * formulario del cliente y la acción del servidor no puedan divergir: la
 * validación que manda es esta, y corre en el servidor siempre.
 */

export const esquemaCliente = z.object({
  rut,
  razon_social: textoRequerido(
    200,
    "Escribí la razón social del cliente.",
    "La razón social no puede pasar de 200 caracteres.",
  ),
  nombre_fantasia: textoOpcional(
    200,
    "El nombre de fantasía no puede pasar de 200 caracteres.",
  ),
  telefono: telefonoOpcional,
  email: emailOpcional,
  activo: z.boolean(),
});

export const esquemaSucursal = z.object({
  nombre: textoRequerido(
    150,
    "Escribí el nombre de la sucursal.",
    "El nombre no puede pasar de 150 caracteres.",
  ),
  codigo_interno: textoOpcional(
    50,
    "El código interno no puede pasar de 50 caracteres.",
  ),
  direccion: textoOpcional(200, "La dirección no puede pasar de 200 caracteres."),
  comuna: textoOpcional(100, "La comuna no puede pasar de 100 caracteres."),
  region: regionOpcional,
  telefono: telefonoOpcional,
  activo: z.boolean(),
});

export const esquemaTecnico = z.object({
  rut,
  nombres: textoRequerido(
    100,
    "Escribí el nombre del técnico.",
    "El nombre no puede pasar de 100 caracteres.",
  ),
  apellidos: textoRequerido(
    100,
    "Escribí los apellidos del técnico.",
    "Los apellidos no pueden pasar de 100 caracteres.",
  ),
  telefono: telefonoOpcional,
  email: emailOpcional,
  activo: z.boolean(),
});

export type DatosClienteValidados = z.output<typeof esquemaCliente>;
export type DatosSucursalValidados = z.output<typeof esquemaSucursal>;
export type DatosTecnicoValidados = z.output<typeof esquemaTecnico>;
