"use client";

import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Boton } from "@/components/ui/boton";

export type PasoAsistente = {
  id: string;
  titulo: string;
  completo: boolean;
  contenido: ReactNode;
};

/**
 * Formulario de la visita partido en pasos. `completo` (calculado en el
 * servidor a partir de los datos guardados) solo decide en qué paso arranca
 * el asistente al abrir la página — no marca nada como "listo" por sí solo.
 * Un paso se marca listo (verde), y recién ahí se avanza, únicamente cuando
 * el usuario aprieta "Siguiente" en esta sesión: ni guardar un campo en el
 * servidor ni tener datos previos alcanza para pintarlo de verde.
 */
export function AsistenteFormularioVisita({ pasos }: { pasos: PasoAsistente[] }) {
  const [pasoActual, setPasoActual] = useState(() => {
    const primeraIncompleta = pasos.findIndex((paso) => !paso.completo);
    return primeraIncompleta === -1 ? pasos.length - 1 : primeraIncompleta;
  });

  // Pasos que el usuario ya dejó atrás con "Siguiente" en esta sesión.
  // Arranca vacío: que un paso ya tenga datos guardados de antes no alcanza
  // para pintarlo de verde, tiene que confirmarlo el usuario.
  const [confirmados, setConfirmados] = useState<Set<number>>(() => new Set());

  function irAlSiguiente() {
    setConfirmados((previo) => {
      const siguiente = new Set(previo);
      siguiente.add(pasoActual);
      return siguiente;
    });
    setPasoActual((actual) => Math.min(pasos.length - 1, actual + 1));
  }

  const pasoVigente = pasos[pasoActual];

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-2">
        {/* Barra segmentada: en pantallas angostas no entran 6 títulos, así
            que el progreso se ve acá y el título del paso activo se lee
            aparte, debajo. */}
        <ol className="flex gap-1">
          {pasos.map((paso, indice) => (
            <li key={paso.id} className="flex-1">
              <button
                type="button"
                onClick={() => setPasoActual(indice)}
                aria-current={indice === pasoActual ? "step" : undefined}
                aria-label={paso.titulo}
                className="block w-full py-2"
              >
                <span
                  className={[
                    "block rounded-full transition-colors",
                    confirmados.has(indice)
                      ? "h-1.5 bg-realizada"
                      : indice === pasoActual
                        ? "h-2 bg-acento"
                        : "h-1.5 bg-borde",
                  ].join(" ")}
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ol>

        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs font-semibold tabular-nums text-acento">
            Paso {pasoActual + 1} de {pasos.length}
          </span>
          <span className="h-3 w-px shrink-0 bg-borde" aria-hidden />
          <h2 className="min-w-0 truncate font-heading text-sm font-semibold text-texto">
            {pasoVigente.titulo}
          </h2>
          {confirmados.has(pasoActual) ? (
            <Check className="size-4 shrink-0 text-realizada" aria-label="Paso completo" />
          ) : null}
        </div>
      </div>

      {pasos.map((paso, indice) => (
        <div key={paso.id} hidden={indice !== pasoActual} className="flex flex-col gap-4">
          {paso.contenido}
        </div>
      ))}

      <div className="flex gap-3">
        {pasoActual > 0 ? (
          <Boton
            type="button"
            variante="secundario"
            onClick={() => setPasoActual((actual) => Math.max(0, actual - 1))}
            className="flex-1 sm:flex-none"
          >
            Anterior
          </Boton>
        ) : null}
        {pasoActual < pasos.length - 1 ? (
          <Boton type="button" onClick={irAlSiguiente} className="flex-1 sm:flex-none">
            Siguiente
          </Boton>
        ) : null}
      </div>
    </div>
  );
}
