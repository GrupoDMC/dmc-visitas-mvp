"use server";

import { redirect } from "next/navigation";
import { clienteAuth } from "@/lib/supabase/server";
import { obtenerPerfil } from "@/lib/db/perfil";

export type EstadoIngreso = { error: string | null };

const CUENTA_DESHABILITADA =
  "Tu cuenta no está habilitada. Contactá a administración.";

/**
 * Traduce el error de Supabase a algo que el usuario pueda accionar.
 * Nunca mostramos códigos ni "Error 400".
 */
function mensajeDeError(codigo: string | undefined, mensaje: string): string {
  const texto = `${codigo ?? ""} ${mensaje}`.toLowerCase();

  if (texto.includes("invalid login credentials") || texto.includes("invalid_credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  if (texto.includes("email not confirmed") || texto.includes("email_not_confirmed")) {
    return "Tu correo todavía no está confirmado. Contactá a administración.";
  }
  if (texto.includes("rate") || texto.includes("too many")) {
    return "Demasiados intentos seguidos. Esperá un minuto y volvé a probar.";
  }
  return "No pudimos iniciar tu sesión. Volvé a intentar en unos segundos.";
}

/** Solo aceptamos rutas internas: evita que nos usen de redirector abierto. */
function destinoSeguro(valor: FormDataEntryValue | null): string {
  const ruta = typeof valor === "string" ? valor : "";
  if (ruta.startsWith("/") && !ruta.startsWith("//")) return ruta;
  return "/";
}

export async function ingresar(
  _previo: EstadoIngreso,
  datos: FormData,
): Promise<EstadoIngreso> {
  const correo = String(datos.get("correo") ?? "").trim();
  const contrasena = String(datos.get("contrasena") ?? "");
  const volverA = destinoSeguro(datos.get("volverA"));

  if (!correo || !contrasena) {
    return { error: "Escribí tu correo y tu contraseña para entrar." };
  }

  const supabase = await clienteAuth();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: correo,
    password: contrasena,
  });

  if (error || !data.user) {
    return { error: mensajeDeError(error?.code, error?.message ?? "") };
  }

  // Autenticó contra Supabase, pero eso no alcanza: sin perfil activo no entra.
  const perfil = await obtenerPerfil(data.user.id);

  if (!perfil || !perfil.activo) {
    await supabase.auth.signOut();
    return { error: CUENTA_DESHABILITADA };
  }

  // redirect() lanza una excepción de control: va fuera de todo try/catch.
  redirect(volverA);
}

export async function salir() {
  const supabase = await clienteAuth();
  await supabase.auth.signOut();
  redirect("/login");
}
