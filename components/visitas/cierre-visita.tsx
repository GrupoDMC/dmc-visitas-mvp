"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  cerrarVisitaAccion,
  marcarPendienteAccion,
  reabrirVisitaAccion,
} from "@/lib/acciones/visitas";
import { SIN_ERRORES } from "@/lib/acciones/formulario";
import type { EstadoVisita } from "@/lib/db/tipos";
import { Alerta } from "@/components/ui/alerta";
import { Boton, BotonGuardar } from "@/components/ui/boton";
import { AreaTexto, Campo } from "@/components/ui/campo";
import { TituloSeccion } from "@/components/ui/titulo-seccion";
import { DialogoReagendar } from "./dialogo-reagendar";

/**
 * "Marcar como pendiente" pide un motivo obligatorio y no exige firma: es la
 * salida para cuando el trabajo quedó a medias y hay que volver otro día.
 */
function DialogoPendiente({ visitaId }: { visitaId: number }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [estado, enviar] = useActionState(marcarPendienteAccion, SIN_ERRORES);
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (estado.error && !dialogo.current?.open) dialogo.current?.showModal();
  }, [estado.error]);

  return (
    <>
      <Boton
        type="button"
        variante="secundario"
        onClick={() => dialogo.current?.showModal()}
      >
        Marcar como pendiente
      </Boton>

      <dialog
        ref={dialogo}
        aria-labelledby="titulo-pendiente"
        className="m-auto w-[calc(100vw-1.5rem)] max-w-md rounded-card border border-borde bg-superficie p-0 shadow-drawer backdrop:bg-texto/30"
      >
        <form action={enviar} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="visita_id" value={visitaId} />

          <div>
            <h2 id="titulo-pendiente" className="text-base font-semibold text-texto">
              Marcar como pendiente
            </h2>
            <p className="mt-1 text-sm text-suave">
              La visita queda sin cerrar y sin exigir firma. Contá por qué,
              para que quien la retome sepa qué falta.
            </p>
          </div>

          {estado.error ? <Alerta>{estado.error}</Alerta> : null}

          <Campo
            htmlFor="motivo_pendiente"
            etiqueta="Motivo"
            error={estado.errores.motivo_pendiente}
          >
            <AreaTexto
              id="motivo_pendiente"
              name="motivo_pendiente"
              rows={3}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              invalido={Boolean(estado.errores.motivo_pendiente)}
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
            <BotonGuardar enviando="Guardando…">Marcar como pendiente</BotonGuardar>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Reabrir es cosa de COORDINADOR/ADMIN, con confirmación explícita. */
function DialogoReabrir({ visitaId }: { visitaId: number }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [estado, enviar] = useActionState(reabrirVisitaAccion, SIN_ERRORES);

  useEffect(() => {
    if (estado.error && !dialogo.current?.open) dialogo.current?.showModal();
  }, [estado.error]);

  return (
    <>
      <Boton
        type="button"
        variante="secundario"
        onClick={() => dialogo.current?.showModal()}
      >
        Reabrir visita
      </Boton>

      <dialog
        ref={dialogo}
        aria-labelledby="titulo-reabrir"
        className="m-auto w-[calc(100vw-1.5rem)] max-w-md rounded-card border border-borde bg-superficie p-0 shadow-drawer backdrop:bg-texto/30"
      >
        <form action={enviar} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="visita_id" value={visitaId} />

          <div>
            <h2 id="titulo-reabrir" className="text-base font-semibold text-texto">
              Reabrir visita
            </h2>
            <p className="mt-1 text-sm text-suave">
              Vuelve a quedar en curso y editable para el técnico. Usalo solo
              si hace falta corregir algo.
            </p>
          </div>

          {estado.error ? <Alerta>{estado.error}</Alerta> : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Boton
              type="button"
              variante="secundario"
              onClick={() => dialogo.current?.close()}
            >
              Cancelar
            </Boton>
            <BotonGuardar enviando="Reabriendo…">Reabrir</BotonGuardar>
          </div>
        </form>
      </dialog>
    </>
  );
}

/**
 * Al pie del formulario de terreno: dos acciones para cerrar el trabajo, y
 * una tercera —reabrir— que solo ve coordinación o administración, y solo
 * cuando ya está cerrada.
 *
 * "Cerrar visita" no manda datos nuevos: la Server Action valida lo que ya
 * está guardado (trabajo realizado + firma del técnico) y devuelve
 * exactamente qué falta si no alcanza, en vez de cerrar a medias.
 */
export function CierreVisita({
  visitaId,
  estado,
  puedeGestionar,
}: {
  visitaId: number;
  estado: EstadoVisita;
  puedeGestionar: boolean;
}) {
  const [estadoCierre, enviarCierre] = useActionState(cerrarVisitaAccion, SIN_ERRORES);

  const puedeCerrar = estado !== "REALIZADA" && estado !== "CANCELADA";
  const puedeReabrir = estado === "REALIZADA" && puedeGestionar;
  // Única regla: una visita REALIZADA no se reagenda. Ni técnico ni
  // coordinación/administración, y sin excepción por estado CANCELADA (que
  // hoy ningún flujo llega a poner).
  const puedeReagendar = estado !== "REALIZADA";

  if (!puedeCerrar && !puedeReabrir && !puedeReagendar) return null;

  return (
    <section
      aria-labelledby="cierre-visita"
      className="rounded-card border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5"
    >
      <TituloSeccion
        numero={6}
        id="cierre-visita"
        titulo="Cierre de la visita"
        guardado={estado !== "PROGRAMADA" && estado !== "EN_CURSO"}
      />

      {puedeCerrar ? (
        <>
          {estadoCierre.error ? (
            <div className="mt-3">
              <Alerta>{estadoCierre.error}</Alerta>
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <form action={enviarCierre}>
              <input type="hidden" name="visita_id" value={visitaId} />
              <BotonGuardar enviando="Cerrando…">Cerrar visita</BotonGuardar>
            </form>

            <DialogoPendiente visitaId={visitaId} />
            {puedeReagendar ? <DialogoReagendar visitaId={visitaId} /> : null}
          </div>
        </>
      ) : puedeReagendar ? (
        <div className="mt-4">
          <DialogoReagendar visitaId={visitaId} />
        </div>
      ) : null}

      {puedeReabrir ? (
        <div className={puedeCerrar ? "mt-4 border-t border-borde pt-4" : "mt-3"}>
          <p className="text-sm text-suave">Esta visita ya está cerrada.</p>
          <div className="mt-2">
            <DialogoReabrir visitaId={visitaId} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
