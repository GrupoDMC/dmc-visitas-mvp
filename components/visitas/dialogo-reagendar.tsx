"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { reagendarVisitaAccion } from "@/lib/acciones/visitas";
import { SIN_REAGENDAMIENTO, type EstadoReagendamiento } from "@/lib/acciones/formulario";
import { Alerta } from "@/components/ui/alerta";
import { Boton, BotonGuardar } from "@/components/ui/boton";
import { AreaTexto, Campo, Entrada } from "@/components/ui/campo";

/**
 * Modal de reagendamiento. Lo usan el técnico y coordinación/administración
 * desde /visitas/[id] (variante "boton", junto a "Marcar como pendiente"), y
 * coordinación además como acción rápida en el listado (variante "enlace") —
 * mismo componente en los dos lugares, mismo patrón de cierre que "Asignar
 * técnico" en tabla-visitas.tsx: la acción no redirige, así que el modal se
 * cierra solo cuando el estado vuelve con éxito.
 *
 * `useId()` arma ids únicos para los campos y para `aria-labelledby`: en el
 * listado se monta una instancia de este componente por fila, y dos ids
 * iguales en el DOM rompen la asociación de las etiquetas.
 */
export function DialogoReagendar({
  visitaId,
  variante = "boton",
  etiqueta = "Reagendar visita",
  alExito,
}: {
  visitaId: number;
  variante?: "boton" | "enlace";
  etiqueta?: string;
  alExito?: (mensaje: string) => void;
}) {
  const idBase = useId();
  const dialogo = useRef<HTMLDialogElement>(null);
  const avisado = useRef(false);
  const [estado, enviar] = useActionState<EstadoReagendamiento, FormData>(
    reagendarVisitaAccion,
    SIN_REAGENDAMIENTO,
  );
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (estado.error && !dialogo.current?.open) dialogo.current?.showModal();
  }, [estado.error]);

  // El `avisado` evita un bucle: `alExito` es una función nueva en cada
  // render del padre (ver el mismo comentario en DialogoAsignar), así que sin
  // esta guarda el efecto se volvería a disparar cada vez que el padre
  // renderiza después de avisar.
  useEffect(() => {
    if (!estado.exito || avisado.current) return;
    avisado.current = true;
    alExito?.(estado.exito);
    dialogo.current?.close();
    setMotivo("");
  }, [estado.exito, alExito]);

  function abrir() {
    avisado.current = false;
    dialogo.current?.showModal();
  }

  const tituloId = `${idBase}-titulo`;
  const fechaId = `${idBase}-fecha`;
  const horaId = `${idBase}-hora`;
  const motivoId = `${idBase}-motivo`;

  return (
    <>
      {variante === "enlace" ? (
        <button
          type="button"
          onClick={abrir}
          className="text-xs text-acento hover:underline"
        >
          {etiqueta}
        </button>
      ) : (
        <Boton type="button" variante="secundario" onClick={abrir}>
          {etiqueta}
        </Boton>
      )}

      <dialog
        ref={dialogo}
        aria-labelledby={tituloId}
        className="m-auto w-[calc(100vw-1.5rem)] max-w-md rounded-base border border-borde bg-superficie p-0 shadow-drawer backdrop:bg-texto/30"
      >
        <form action={enviar} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="visita_id" value={visitaId} />

          <div>
            <h2 id={tituloId} className="text-base font-semibold text-texto">
              Reagendar visita
            </h2>
            <p className="mt-1 text-sm text-suave">
              No toca nada de lo ya cargado en el formulario — solo cambia la
              fecha y queda como REAGENDADA.
            </p>
          </div>

          {estado.error ? <Alerta>{estado.error}</Alerta> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              htmlFor={fechaId}
              etiqueta="Fecha nueva"
              error={estado.errores.fecha_nueva}
            >
              <Entrada
                id={fechaId}
                name="fecha_nueva"
                type="date"
                required
                autoFocus
                invalido={Boolean(estado.errores.fecha_nueva)}
              />
            </Campo>

            <Campo
              htmlFor={horaId}
              etiqueta="Hora nueva"
              opcional
              error={estado.errores.hora_nueva}
            >
              <Entrada
                id={horaId}
                name="hora_nueva"
                type="time"
                invalido={Boolean(estado.errores.hora_nueva)}
              />
            </Campo>
          </div>

          <Campo htmlFor={motivoId} etiqueta="Motivo" error={estado.errores.motivo}>
            <AreaTexto
              id={motivoId}
              name="motivo"
              rows={3}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              invalido={Boolean(estado.errores.motivo)}
            />
          </Campo>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Boton
              type="button"
              variante="secundario"
              onClick={() => dialogo.current?.close()}
            >
              Cancelar
            </Boton>
            <BotonGuardar enviando="Reagendando…">Reagendar</BotonGuardar>
          </div>
        </form>
      </dialog>
    </>
  );
}
