"use client";

import { useEffect, useState } from "react";
import { Boton } from "@/components/ui/boton";

const ACTUALIZA_CADA_MS = 30_000;

function haceCuanto(guardadoEn: number, ahora: number): string {
  const minutos = Math.max(0, Math.round((ahora - guardadoEn) / 60_000));
  if (minutos < 1) return "hace un momento";
  if (minutos === 1) return "hace 1 minuto";
  return `hace ${minutos} minutos`;
}

/**
 * Franja discreta que ofrece recuperar o descartar un borrador local más
 * nuevo que lo último guardado en el servidor. Nunca aplica el borrador
 * sola: quien decide es el técnico, apretando uno de los dos botones.
 */
export function FranjaBorrador({
  guardadoEn,
  onRecuperar,
  onDescartar,
}: {
  guardadoEn: number;
  onRecuperar: () => void;
  onDescartar: () => void;
}) {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), ACTUALIZA_CADA_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-base border border-encurso/30 bg-encurso/5 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-texto">
        Tenés cambios sin guardar de {haceCuanto(guardadoEn, ahora)}.
      </p>
      <div className="flex shrink-0 gap-2">
        <Boton type="button" variante="secundario" onClick={onDescartar}>
          Descartar
        </Boton>
        <Boton type="button" variante="primario" onClick={onRecuperar}>
          Recuperar
        </Boton>
      </div>
    </div>
  );
}
