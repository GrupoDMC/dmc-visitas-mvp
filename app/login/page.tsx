import type { Metadata } from "next";
import { FormularioIngreso } from "./formulario-ingreso";

export const metadata: Metadata = {
  title: "Entrar · Visitas técnicas",
};

/** En Next.js 16 searchParams es una promesa: hay que esperarla. */
export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ volverA?: string; motivo?: string }>;
}) {
  const { volverA, motivo } = await searchParams;
  const destino = volverA?.startsWith("/") && !volverA.startsWith("//") ? volverA : "/";

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-texto">Visitas técnicas</h1>
          <p className="mt-1 text-sm text-suave">
            Entrá con tu correo institucional para registrar y consultar
            visitas.
          </p>
        </div>

        {motivo === "deshabilitada" ? (
          <p
            role="alert"
            className="mb-4 rounded-base border border-error/30 bg-error-fondo px-3 py-2 text-sm text-error"
          >
            Tu cuenta no está habilitada. Contactá a administración.
          </p>
        ) : null}

        <div className="rounded-base border border-borde bg-superficie p-5 shadow-tarjeta">
          <FormularioIngreso volverA={destino} />
        </div>

        <p className="mt-4 text-xs text-suave">
          ¿No podés entrar? Escribile a administración para que revise tu
          cuenta.
        </p>
      </div>
    </main>
  );
}
