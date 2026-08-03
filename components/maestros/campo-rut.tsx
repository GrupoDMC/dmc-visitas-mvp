"use client";

import { useState } from "react";
import { formatearRut, normalizarRut } from "@/lib/rut";
import { Campo, Entrada } from "@/components/ui/campo";

/**
 * Campo de RUT compartido por clientes y técnicos.
 *
 * Al salir del campo, si el RUT es válido se reescribe con puntos. Es la
 * confirmación más barata de que el dígito verificador está bien: si el texto
 * se acomoda solo, está bien; si queda tal cual como lo tipeaste, hay algo mal
 * y lo vas a saber antes de apretar Guardar.
 *
 * Lo que se manda al servidor es este mismo texto con puntos — la Server
 * Action lo normaliza de nuevo. Formatear acá es cortesía, no validación.
 */
export function CampoRut({
  valorInicial,
  error,
  autoFocus,
}: {
  valorInicial: string;
  error?: string;
  autoFocus?: boolean;
}) {
  const [valor, setValor] = useState(
    valorInicial ? formatearRut(valorInicial) : "",
  );

  return (
    <Campo
      htmlFor="rut"
      etiqueta="RUT"
      ayuda="Con o sin puntos. Por ejemplo, 76.123.456-0."
      error={error}
    >
      <Entrada
        id="rut"
        name="rut"
        value={valor}
        onChange={(evento) => setValor(evento.target.value)}
        onBlur={() => {
          const normalizado = normalizarRut(valor);
          if (normalizado) setValor(formatearRut(normalizado));
        }}
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        required
        invalido={Boolean(error)}
        aria-describedby={error ? "rut-error" : "rut-ayuda"}
        className="tabular-nums"
      />
    </Campo>
  );
}
