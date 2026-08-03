import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * Campo de formulario. La etiqueta va SIEMPRE arriba del control: el
 * placeholder no es una etiqueta, desaparece justo cuando hace falta.
 */
export function Campo({
  htmlFor,
  etiqueta,
  ayuda,
  error,
  children,
}: {
  htmlFor: string;
  etiqueta: string;
  ayuda?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-texto">
        {etiqueta}
      </label>
      {ayuda ? (
        <p id={`${htmlFor}-ayuda`} className="text-xs text-suave">
          {ayuda}
        </p>
      ) : null}
      {children}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          className="text-xs text-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Input de 40px de alto, como manda la densidad definida. */
export function Entrada({
  invalido,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalido || undefined}
      className={[
        "h-10 w-full rounded-base border bg-superficie px-3 text-base text-texto",
        "placeholder:text-suave",
        invalido ? "border-error" : "border-borde",
        "focus:border-acento focus:outline-none focus-visible:outline-2",
        "focus-visible:outline-offset-2 focus-visible:outline-acento",
        "disabled:cursor-not-allowed disabled:bg-fondo disabled:text-suave",
        className,
      ].join(" ")}
    />
  );
}
