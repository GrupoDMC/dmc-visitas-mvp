import { z } from "zod";
import { correo, idPositivo, texto } from "./comun";

// Formularios de sesión. Llegan como FormData: los esquemas miran los strings
// ya extraídos, sobre todo para no gastar un bcrypt en una contraseña absurda.

/** Tope de largo, no de política: la política (mínimo, comunes) es validarPasswordNueva. */
const PASSWORD_MAX = 256;

export const entradaLogin = z.object({
  email: correo,
  password: z.string().max(PASSWORD_MAX),
});

export const entradaSolicitudPassword = z.object({
  email: correo,
  mensaje: texto(400),
});

export const entradaCambioPassword = z.object({
  nueva: z.string().max(PASSWORD_MAX, "La contraseña es demasiado larga (máximo 72 caracteres)."),
  repetida: z.string().max(PASSWORD_MAX),
});

export const entradaAtenderSolicitud = z.object({
  id: idPositivo,
  passwordTemporal: z.string().max(PASSWORD_MAX, "La contraseña es demasiado larga (máximo 72 caracteres)."),
});

export const entradaDescartarSolicitud = idPositivo;
