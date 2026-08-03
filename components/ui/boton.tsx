import type { ButtonHTMLAttributes } from "react";

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
