"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

type Variante = "primario" | "secundario" | "texto";

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-base px-4 " +
  "text-sm font-medium transition-colors disabled:cursor-not-allowed " +
  "disabled:opacity-60 sm:min-h-10";

const VARIANTES: Record<Variante, string> = {
  primario:
    "bg-acento text-white hover:bg-acento-hover disabled:hover:bg-acento",
  secundario:
    "border border-borde bg-superficie text-texto hover:bg-fondo",
  texto: "text-acento hover:bg-acento-suave",
};

/**
 * El alto mínimo es 44px en móvil (min-h-11) y baja a 40px recién en sm,
 * para no achicar el objetivo táctil donde importa.
 */
export function Boton({
  variante = "primario",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      {...props}
      className={[BASE, VARIANTES[variante], className].join(" ")}
    />
  );
}

/**
 * Botón de envío que se apaga y avisa mientras la acción corre.
 *
 * `useFormStatus` solo funciona en un componente que esté DENTRO del `<form>`,
 * no en el que lo declara. Por eso es un componente aparte y no un prop del
 * formulario.
 */
export function BotonGuardar({
  children,
  enviando = "Guardando…",
  className,
}: {
  children: React.ReactNode;
  enviando?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Boton type="submit" disabled={pending} className={className}>
      {pending ? enviando : children}
    </Boton>
  );
}
