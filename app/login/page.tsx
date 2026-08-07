import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Entrar · Visitas técnicas",
};

const AVISO_DESHABILITADA =
  "Tu cuenta no está habilitada. Contactá a administración.";

/** En Next.js 16 searchParams es una promesa: hay que esperarla. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ volverA?: string; motivo?: string }>;
}) {
  const { volverA, motivo } = await searchParams;
  const destino =
    volverA?.startsWith("/") && !volverA.startsWith("//") ? volverA : "/";

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* LADO IZQUIERDO */}
      <div className="relative flex flex-col gap-6 overflow-hidden bg-linear-to-br from-[#241a29] via-[#180f1d] to-[#120b16] p-6 text-white md:p-10">
        {/* Glow morado (brand) */}
        <div className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-100 w-100 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#6B0F8F]/25 blur-3xl" />

        {/* Logo */}
        <div className="flex justify-center">
          <div className="rounded-xl bg-white/95 px-4 py-2 shadow-sm">
            <Image
              src="/DMC-log.png.png"
              alt="DMC logo"
              width={200}
              height={85}
              priority
              className="h-auto w-40"
            />
          </div>
        </div>

        {/* Formulario */}
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            {motivo === "deshabilitada" ? (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
              >
                {AVISO_DESHABILITADA}
              </p>
            ) : null}

            <div className="rounded-xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-md">
              <LoginForm volverA={destino} />
            </div>
          </div>
        </div>
      </div>

      {/* LADO DERECHO */}
      <div className="relative hidden lg:block">
        <Image
          src="/login-image.webp"
          alt="Sistema de seguridad retail"
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 0vw"
          className="object-cover"
        />

        {/* Overlay oscuro + tono morado */}
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/60 to-[#6B0F8F]/40" />

        {/* Texto */}
        <div className="absolute bottom-10 left-10 max-w-md text-white">
          <h2 className="mb-2 text-2xl font-semibold">
            Seguridad inteligente para retail
          </h2>
          <p className="text-sm text-zinc-300">
            Controla antenas, monitoreo y mantenimiento desde una sola
            plataforma.
          </p>
        </div>
      </div>
    </div>
  );
}
