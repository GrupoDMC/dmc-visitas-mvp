"use client";

import { useFormStatus } from "react-dom";
import { salir } from "@/lib/acciones/sesion";

function Boton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-11 shrink-0 items-center rounded-base border border-borde bg-superficie px-3 text-sm text-texto transition-colors hover:bg-fondo disabled:opacity-60 sm:min-h-10"
    >
      {pending ? "Saliendo…" : "Salir"}
    </button>
  );
}

export function BotonSalir() {
  return (
    <form action={salir}>
      <Boton />
    </form>
  );
}
