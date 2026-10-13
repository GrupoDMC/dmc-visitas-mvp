import Image from "next/image";
import { redirect } from "next/navigation";
import { getSesion, getSesionPorCambiarPassword } from "@/lib/auth";
import { LARGO_MINIMO_PASSWORD } from "@/lib/password";
import CambiarPasswordForm from "./CambiarPasswordForm";

export const dynamic = "force-dynamic";

/**
 * Cambio obligatorio de clave. Se llega acá al entrar con una clave que puso
 * otra persona (alta, reseteo o solicitud atendida): mientras no la cambie,
 * getSesion no le reconoce la sesión en ninguna otra pantalla ni acción.
 */
export default async function CambiarPasswordPage() {
  const sesion = await getSesionPorCambiarPassword();
  if (!sesion) {
    const normal = await getSesion();
    redirect(normal ? (normal.usuario.rol === "TECNICO" ? "/tecnico" : "/admin") : "/login");
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
            Antes de seguir
          </div>
          <h1 className="font-extrabold text-[34px] leading-[1.06] tracking-[-.03em] mb-2.5">
            Elige tu
            <br />
            contraseña
          </h1>
          <p className="mb-[26px] text-sm opacity-60 max-w-[34ch]">
            Entraste con una clave que te entregaron. Cámbiala por una que solo sepas tú: mínimo{" "}
            {LARGO_MINIMO_PASSWORD} caracteres y distinta de tu correo.
          </p>
          <div className="text-[13px] mb-4 opacity-75 break-all">{sesion.usuario.email}</div>

          <CambiarPasswordForm />
        </div>
      </div>
    </div>
  );
}
