import Image from "next/image";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const sesion = await getSesion();
  if (sesion) {
    redirect(sesion.usuario.rol === "TECNICO" ? "/tecnico" : "/admin");
  }

  return (
    <div className="h-screen overflow-hidden flex justify-center bg-[#c9c7c6]">
      <div className="w-full max-w-[460px] min-w-0 bg-[var(--color-bg)] flex flex-col min-h-screen overflow-y-auto">
        <div className="flex flex-col min-h-screen px-[22px] pb-7">
          <div className="pt-[52px]">
            <Image src="/DMC-logo.png" alt="Grupo dMC — Ideas tecnológicas de seguridad" width={172} height={73} priority />
          </div>
          <div className="h-0.5 bg-[var(--color-text)] mt-[18px]" />
          <div className="text-[10px] tracking-[.16em] uppercase text-[var(--color-accent-active)] mt-[22px] mb-2">
            Sistema de técnicos
          </div>
          <h1 className="font-extrabold text-[40px] leading-[1.04] tracking-[-.03em] mb-2.5">
            Visitas
            <br />
            en terreno
          </h1>
          <p className="mb-[30px] text-sm opacity-60 max-w-[30ch]">
            Registro de mantención e instalación en tienda. Funciona sin señal: lo que guardes se envía solo.
          </p>

          <LoginForm />

          <div className="mt-auto pt-[34px]">
            <div className="h-px bg-[var(--color-divider-soft)] mb-3" />
            <p className="m-0 text-xs opacity-60">
              En paralelo al formulario en papel hasta el traspaso a DMC_Core.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
