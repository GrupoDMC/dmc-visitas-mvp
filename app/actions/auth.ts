"use server";

import { redirect } from "next/navigation";
import { autenticar, crearSesion, cerrarSesion } from "@/lib/auth";

export interface LoginState {
  error: string | null;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Ingresa tu correo y contraseña." };
  }

  const usuario = autenticar(email, password);
  if (!usuario) {
    return { error: "Correo o contraseña incorrectos." };
  }

  await crearSesion(usuario.id);
  redirect(usuario.rol === "TECNICO" ? "/tecnico" : "/admin");
}

export async function logoutAction() {
  await cerrarSesion();
  redirect("/login");
}
