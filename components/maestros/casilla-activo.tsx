"use client";

import { Alerta } from "@/components/ui/alerta";
import { Casilla } from "@/components/ui/campo";

/**
 * La casilla "Activo" de los formularios de cliente y técnico.
 *
 * Cuando se desmarca sobre un registro que hoy está activo y tiene visitas sin
 * cerrar, aparece el aviso con la cuenta y una confirmación obligatoria. Es el
 * mismo resguardo que el botón "Desactivar" de la ficha, acá para que no se
 * pueda esquivar apagando la casilla y guardando.
 *
 * El servidor lo vuelve a chequear igual: esto es comodidad, no la barrera.
 */
export function CasillaActivo({
  activo,
  alCambiar,
  eraActivo,
  visitasAbiertas,
  queEs,
}: {
  activo: boolean;
  alCambiar: (valor: boolean) => void;
  eraActivo: boolean;
  visitasAbiertas: number;
  queEs: string;
}) {
  const desactivando = eraActivo && !activo;
  const pideConfirmar = desactivando && visitasAbiertas > 0;
  const frase =
    visitasAbiertas === 1 ? "1 visita abierta" : `${visitasAbiertas} visitas abiertas`;

  return (
    <div className="flex flex-col gap-2">
      <Casilla
        id="activo"
        name="activo"
        etiqueta="Activo"
        descripcion={`Un ${queEs} inactivo no aparece al crear visitas nuevas, pero sigue en los listados y en las visitas ya registradas.`}
        checked={activo}
        onChange={alCambiar}
      />

      {pideConfirmar ? (
        <Alerta tono="aviso" titulo={`Tiene ${frase}.`}>
          <p>
            Se quedan como están, sin cerrar. Desactivarlo no las cancela ni las
            reasigna.
          </p>
          <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2.5 text-texto">
            <input
              type="checkbox"
              name="confirmar_desactivar"
              value="si"
              required
              className="size-4 shrink-0 accent-acento"
            />
            <span className="text-sm">Entiendo, desactivalo igual</span>
          </label>
        </Alerta>
      ) : null}
    </div>
  );
}
