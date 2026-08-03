"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AVISOS, esClaveAviso } from "@/lib/avisos";

const DURACION_MS = 6000;

/**
 * Confirmación de "se guardó". Vive en el layout, así que cualquier acción que
 * redirija con `?ok=<clave>` la muestra sin cablear nada en la pantalla.
 *
 * Apenas aparece se saca el `ok` de la URL: si no, recargar o compartir el
 * link vuelve a mostrar un "Cliente creado" que ya pasó hace media hora.
 */
export function Toast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [mensaje, setMensaje] = useState<string | null>(null);

  const clave = params.get("ok") ?? "";
  const cadena = params.toString();

  // El mensaje se toma durante el render y no en un efecto: así no hay un
  // fotograma con el aviso todavía vacío. `clavePrevia` se actualiza también
  // cuando la clave se va a vacío, que es lo que permite que guardar dos veces
  // seguidas muestre el aviso las dos veces y no solo la primera.
  const [clavePrevia, setClavePrevia] = useState("");
  if (clave !== clavePrevia) {
    setClavePrevia(clave);
    if (esClaveAviso(clave)) setMensaje(AVISOS[clave]);
  }

  // Esto sí es un efecto de verdad: le habla al historial del navegador, que
  // es un sistema externo a React.
  useEffect(() => {
    if (!esClaveAviso(clave)) return;

    const limpios = new URLSearchParams(cadena);
    limpios.delete("ok");
    const resto = limpios.toString();
    router.replace(resto ? `${pathname}?${resto}` : pathname, { scroll: false });
  }, [clave, cadena, pathname, router]);

  // El temporizador va aparte: si compartiera efecto con el de arriba, la
  // limpieza de la URL lo reiniciaría y el aviso no se iría nunca.
  useEffect(() => {
    if (!mensaje) return;
    const id = setTimeout(() => setMensaje(null), DURACION_MS);
    return () => clearTimeout(id);
  }, [mensaje]);

  return (
    // La región viva existe siempre y vacía. Montarla junto con el texto hace
    // que algunos lectores de pantalla no lleguen a anunciarlo.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 sm:justify-end sm:p-4"
    >
      {mensaje ? (
        <div className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-borde bg-superficie px-3 py-2.5 shadow-drawer">
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 shrink-0 text-realizada"
            aria-hidden
          >
            <path d="M4 10.5l4 4 8-9" />
          </svg>
          <p className="flex-1 text-sm text-texto">{mensaje}</p>
          <button
            type="button"
            onClick={() => setMensaje(null)}
            aria-label="Cerrar el aviso"
            className="-mr-1 -mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-base text-suave hover:bg-fondo"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
