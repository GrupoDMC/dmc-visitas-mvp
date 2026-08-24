"use server";

import { redirect } from "next/navigation";
import { autenticar, cerrarSesion, crearSesion } from "@/lib/auth";

export interface LoginState {
  error: string | null;
}

// Mensaje único para credenciales malas: no distingue entre correo inexistente,
// contraseña incorrecta y cuenta desactivada, para no confirmar qué correos
// están dados de alta.
const CREDENCIALES_INVALIDAS = "Correo o contraseña incorrectos.";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Ingresa tu correo y contraseña." };
  }

  let esTecnico: boolean;

  try {
    const usuario = await autenticar(email, password);
    if (!usuario) return { error: CREDENCIALES_INVALIDAS };
    // Firmar la cookie también puede fallar (SESSION_SECRET sin definir), así
    // que entra en el mismo try.
    await crearSesion(usuario.id);
    esTecnico = usuario.rol === "TECNICO";
  } catch (err) {
    // Entorno mal configurado o base de datos inalcanzable. El detalle va al
    // log del servidor; al usuario solo se le dice que avise, sin filtrar
    // hosts, nombres de base de datos ni credenciales.
    console.error("[dmc] fallo al autenticar:", err);
    return { error: "No se pudo validar el acceso. Avisa al administrador del sistema." };
  }

  // redirect() lanza por dentro: tiene que quedar fuera del try/catch.
  redirect(esTecnico ? "/tecnico" : "/admin");
}

export async function logoutAction() {
  await cerrarSesion();
  redirect("/login");
}
