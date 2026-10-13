"use server";

import { redirect } from "next/navigation";
import {
  autenticar,
  cerrarSesion,
  crearSesion,
  getSesionPorCambiarPassword,
  ipDeLaPeticion,
} from "@/lib/auth";
import { crearSolicitudPassword } from "@/lib/data/solicitudes-password";
import { auditar } from "@/lib/data/auditoria";
import { log } from "@/lib/log";
import { cambiarPasswordPropia } from "@/lib/data/usuarios";
import { validarPasswordNueva } from "@/lib/password";
import { validar } from "@/lib/validacion/comun";
import { entradaCambioPassword, entradaLogin, entradaSolicitudPassword } from "@/lib/validacion/auth";

export interface LoginState {
  error: string | null;
}

// Mensaje único para credenciales malas: no distingue entre correo inexistente,
// contraseña incorrecta y cuenta desactivada, para no confirmar qué correos
// están dados de alta.
const CREDENCIALES_INVALIDAS = "Correo o contraseña incorrectos.";
// Sale igual exista o no el correo: el freno corre para cualquiera.
const DEMASIADOS_INTENTOS = "Demasiados intentos seguidos. Espera 15 minutos y vuelve a intentarlo.";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData?.get?.("email") ?? "").trim();
  const password = String(formData?.get?.("password") ?? "");

  if (!email || !password) {
    return { error: "Ingresa tu correo y contraseña." };
  }
  // Un correo o una clave de largo absurdo no pueden ser de nadie: se rechazan
  // sin consultar la base ni gastar un hash.
  if (!validar(entradaLogin, { email, password }, "login").ok) return { error: CREDENCIALES_INVALIDAS };

  let destino: string;

  try {
    const resultado = await autenticar(email, password, await ipDeLaPeticion());
    if (!resultado.ok) return { error: resultado.bloqueado ? DEMASIADOS_INTENTOS : CREDENCIALES_INVALIDAS };
    const { usuario, sesionVersion, debeCambiarPassword } = resultado.registro;
    // Firmar la cookie también puede fallar (SESSION_SECRET sin definir), así
    // que entra en el mismo try.
    await crearSesion(usuario.id, sesionVersion);
    destino = debeCambiarPassword ? "/cambiar-password" : usuario.rol === "TECNICO" ? "/tecnico" : "/admin";
  } catch (err) {
    // Entorno mal configurado o base de datos inalcanzable. El detalle va al
    // log del servidor; al usuario solo se le dice que avise, sin filtrar
    // hosts, nombres de base de datos ni credenciales.
    log.error("login", { err });
    return { error: "No se pudo validar el acceso. Avisa al administrador del sistema." };
  }

  // redirect() lanza por dentro: tiene que quedar fuera del try/catch.
  redirect(destino);
}

export interface SolicitudState {
  ok: boolean;
  error: string | null;
}

/**
 * "Olvidé mi contraseña". No manda ningún correo — no hay servidor de correo —:
 * deja la solicitud registrada para que el administrador la vea en el panel y
 * entregue una clave temporal.
 *
 * La respuesta es siempre la misma exista o no la cuenta: si dijera "ese correo
 * no está registrado", cualquiera podría averiguar qué correos tienen acceso.
 */
export async function solicitarPasswordAction(
  _prev: SolicitudState,
  formData: FormData
): Promise<SolicitudState> {
  const email = String(formData?.get?.("email") ?? "").trim();
  const mensaje = String(formData?.get?.("mensaje") ?? "").trim();

  if (!email.includes("@") || email.length < 5) {
    return { ok: false, error: "Escribe el correo con el que entras al sistema." };
  }
  const valida = validar(entradaSolicitudPassword, { email, mensaje }, "solicitarPassword");
  if (!valida.ok) return { ok: false, error: valida.error };

  try {
    await crearSolicitudPassword(email, mensaje || null, await ipDeLaPeticion());
  } catch (err) {
    log.error("solicitarPassword", { err });
    return { ok: false, error: "No se pudo registrar la solicitud. Inténtalo otra vez en un momento." };
  }

  return { ok: true, error: null };
}

export interface CambioPasswordState {
  error: string | null;
}

/**
 * El cambio obligatorio después de una clave que puso otra persona. Cierra las
 * demás sesiones de la cuenta y le firma a esta una con la versión nueva.
 */
export async function cambiarPasswordAction(
  _prev: CambioPasswordState,
  formData: FormData
): Promise<CambioPasswordState> {
  const sesion = await getSesionPorCambiarPassword();
  if (!sesion) redirect("/login");

  // La contraseña no se recorta: se guarda tal como se escribió.
  const nueva = String(formData?.get?.("nueva") ?? "");
  const repetida = String(formData?.get?.("repetida") ?? "");
  const valida = validar(entradaCambioPassword, { nueva, repetida }, "cambiarPassword");
  if (!valida.ok) return { error: valida.error };
  if (nueva !== repetida) return { error: "Las dos contraseñas no coinciden." };
  const fallo = validarPasswordNueva(nueva, sesion.usuario.email);
  if (fallo) return { error: fallo };

  try {
    const version = await cambiarPasswordPropia(sesion.usuario.id, nueva);
    if (version === null) return { error: "La contraseña nueva tiene que ser distinta de la que te entregaron." };
    await crearSesion(sesion.usuario.id, version);
    await auditar(sesion, { accion: "password.cambio", entidad: "usuario", entidadId: sesion.usuario.id });
  } catch (err) {
    log.error("cambiarPassword", { err, usuarioId: sesion.usuario.id });
    return { error: "No se pudo guardar la contraseña. Inténtalo otra vez en un momento." };
  }

  redirect(sesion.usuario.rol === "TECNICO" ? "/tecnico" : "/admin");
}

export async function logoutAction() {
  await cerrarSesion();
  redirect("/login");
}
