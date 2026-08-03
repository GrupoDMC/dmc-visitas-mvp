"use client";

import { useActionState, useEffect, useRef } from "react";
import { SIN_ERRORES, type EstadoFormulario } from "@/lib/acciones/formulario";
import { Alerta } from "./alerta";
import { Boton, BotonGuardar } from "./boton";

type Accion = (
  previo: EstadoFormulario,
  datos: FormData,
) => Promise<EstadoFormulario>;

/**
 * Confirmación antes de desactivar un cliente o un técnico.
 *
 * La cuenta de visitas abiertas llega ya calculada desde el servidor que
 * renderizó la página: al abrir el diálogo no hay que ir a buscar nada, el
 * aviso aparece de una. La acción igual vuelve a contarlas antes de escribir
 * —el número pudo cambiar mientras el diálogo estaba abierto, y la acción es
 * un POST que se puede llamar sin pasar por acá.
 */
export function DialogoDesactivar({
  accion,
  id,
  titulo,
  nombre,
  visitasAbiertas,
  descripcion,
}: {
  accion: Accion;
  id: number | string;
  titulo: string;
  nombre: string;
  visitasAbiertas: number;
  descripcion?: string;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [estado, enviar] = useActionState(accion, SIN_ERRORES);

  // Si la acción vuelve con error, el diálogo tiene que seguir abierto para
  // mostrarlo. Cuando sale bien no vuelve nunca: hace redirect.
  //
  // El `.open` no es decorativo: llamar a showModal() sobre un diálogo que ya
  // está abierto es no-op en la especificación actual pero tiraba
  // InvalidStateError en versiones anteriores, y acá el caso normal es
  // justamente que siga abierto.
  useEffect(() => {
    if (estado.error && !dialogo.current?.open) dialogo.current?.showModal();
  }, [estado.error]);

  const hayAbiertas = visitasAbiertas > 0;
  const frase =
    visitasAbiertas === 1 ? "1 visita abierta" : `${visitasAbiertas} visitas abiertas`;

  return (
    <>
      <Boton
        type="button"
        variante="secundario"
        onClick={() => dialogo.current?.showModal()}
      >
        Desactivar
      </Boton>

      <dialog
        ref={dialogo}
        aria-labelledby="titulo-desactivar"
        className="m-auto w-[calc(100vw-1.5rem)] max-w-md rounded-base border border-borde bg-superficie p-0 shadow-drawer backdrop:bg-texto/30"
      >
        <form action={enviar} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="id" value={id} />
          {/* Ausente = desactivar. Está acá para dejarlo explícito. */}

          <div>
            <h2 id="titulo-desactivar" className="text-base font-semibold text-texto">
              {titulo}
            </h2>
            <p className="mt-1 text-sm text-suave">
              {descripcion ??
                `${nombre} deja de aparecer para crear visitas nuevas. No se borra
              nada: las visitas que ya existen se mantienen tal cual, y podés
              reactivarlo cuando quieras.`}
            </p>
          </div>

          {hayAbiertas ? (
            <Alerta tono="aviso" titulo={`Tiene ${frase}.`}>
              <p>
                Se quedan como están, asignadas y sin cerrar. Alguien las va a
                tener que atender igual.
              </p>
              <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2.5 text-texto">
                <input
                  type="checkbox"
                  name="confirmado"
                  value="si"
                  required
                  className="size-4 shrink-0 accent-acento"
                />
                <span className="text-sm">Entiendo, desactivalo igual</span>
              </label>
            </Alerta>
          ) : null}

          {estado.error ? <Alerta>{estado.error}</Alerta> : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Boton
              type="button"
              variante="secundario"
              onClick={() => dialogo.current?.close()}
            >
              Cancelar
            </Boton>
            <BotonGuardar enviando="Desactivando…">Desactivar</BotonGuardar>
          </div>
        </form>
      </dialog>
    </>
  );
}

/**
 * Reactivar no necesita confirmación: no destruye nada y se deshace con un
 * clic. Es un botón suelto que llama a la misma acción con `activar`.
 */
export function BotonReactivar({
  accion,
  id,
}: {
  accion: Accion;
  id: number | string;
}) {
  const [, enviar] = useActionState(accion, SIN_ERRORES);

  return (
    <form action={enviar}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activar" value="si" />
      <BotonGuardar enviando="Reactivando…">Reactivar</BotonGuardar>
    </form>
  );
}
