"use client";

import { formatearRut, normalizarRut } from "@/lib/rut";
import { Campo, Entrada } from "@/components/ui/campo";

/**
 * RUT controlado desde afuera, para formularios que ya llevan su estado en
 * `useCamposConBorrador` (sección 1 de terreno, firma de tienda). A
 * diferencia de `components/maestros/campo-rut.tsx` no asume id/name fijos
 * ni que el campo sea obligatorio: acá puede ser el RUT opcional del
 * responsable de tienda.
 *
 * Igual que el otro: al salir del campo, si el RUT es válido se reescribe
 * con puntos. Si queda tal cual, algo está mal y se nota antes de guardar.
 */
export function CampoRutControlado({
  id,
  name,
  etiqueta,
  value,
  onChange,
  opcional,
  error,
  disabled,
}: {
  id: string;
  name: string;
  etiqueta: string;
  value: string;
  onChange: (valor: string) => void;
  opcional?: boolean;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <Campo
      htmlFor={id}
      etiqueta={etiqueta}
      opcional={opcional}
      ayuda="Con o sin puntos. Por ejemplo, 76.123.456-0."
      error={error}
    >
      <Entrada
        id={id}
        name={name}
        value={value}
        onChange={(evento) => onChange(evento.target.value)}
        onBlur={() => {
          const normalizado = normalizarRut(value);
          if (normalizado) onChange(formatearRut(normalizado));
        }}
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        required={!opcional}
        disabled={disabled}
        invalido={Boolean(error)}
        className="tabular-nums"
      />
    </Campo>
  );
}
