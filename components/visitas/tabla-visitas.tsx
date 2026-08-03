"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { asignarTecnicoAccion } from "@/lib/acciones/visitas";
import {
  SIN_ASIGNACION,
  type EstadoAsignacion,
} from "@/lib/acciones/formulario";
import { nombreTipoTrabajo } from "@/lib/catalogos";
import { fechaCorta, horaCorta } from "@/lib/fechas";
import type { VisitaEnListado } from "@/lib/db/visitas";
import { Alerta } from "@/components/ui/alerta";
import { BadgeEstado } from "@/components/ui/badge-estado";
import { Boton, BotonGuardar } from "@/components/ui/boton";
import { Fila, SinDato, Tabla, Td, Th } from "@/components/ui/tabla";

type Tecnico = { id: number; nombres: string; apellidos: string };

/**
 * Tabla del listado de coordinación, con selección y asignación.
 *
 * Es un componente de cliente porque la selección múltiple es estado: hay que
 * saber qué filas están marcadas para poder asignarlas todas de una. Los datos
 * llegan ya leídos desde el servidor — acá no se consulta nada.
 */
export function TablaVisitas({
  visitas,
  tecnicos,
}: {
  visitas: VisitaEnListado[];
  tecnicos: Tecnico[];
}) {
  const [marcadas, setMarcadas] = useState<number[]>([]);
  const [aAsignar, setAAsignar] = useState<number[] | null>(null);
  // La asignación no redirige, así que su confirmación no puede viajar en la
  // URL como el resto de los avisos de la app. Vive acá, arriba de la tabla,
  // donde se ve el resultado del cambio.
  const [confirmacion, setConfirmacion] = useState<string | null>(null);

  // Si cambia la página o el filtro, lo marcado ya no corresponde a lo que se
  // ve. Se ajusta durante el render y no en un efecto para que no exista un
  // fotograma con "3 seleccionadas" sobre filas que son otras.
  const firma = visitas.map((v) => v.id).join(",");
  const [firmaPrevia, setFirmaPrevia] = useState(firma);
  if (firma !== firmaPrevia) {
    setFirmaPrevia(firma);
    setMarcadas((previas) => {
      const siguen = previas.filter((id) => visitas.some((v) => v.id === id));
      // Devolver el mismo arreglo cuando no cambió nada: uno nuevo con el mismo
      // contenido igual dispara otro render.
      return siguen.length === previas.length ? previas : siguen;
    });
  }

  const todas = visitas.length > 0 && marcadas.length === visitas.length;

  function alternar(id: number) {
    setMarcadas((previas) =>
      previas.includes(id) ? previas.filter((x) => x !== id) : [...previas, id],
    );
  }

  function alternarTodas() {
    setMarcadas(todas ? [] : visitas.map((v) => v.id));
  }

  function abrir(ids: number[]) {
    // La confirmación de la asignación anterior no tiene nada que ver con la
    // que se está por hacer.
    setConfirmacion(null);
    setAAsignar(ids);
  }

  return (
    <>
      {/* La región viva existe siempre, aunque esté vacía: montarla junto con el
          texto hace que algunos lectores de pantalla no lleguen a anunciarlo. */}
      <div role="status" aria-live="polite">
        {confirmacion ? (
          <p className="mb-3 rounded-base border border-realizada/30 bg-realizada/5 px-3 py-2 text-sm text-realizada">
            Asignado: {confirmacion}
          </p>
        ) : null}
      </div>

      <Tabla
        cabecera={
          <>
            <Th>
              <input
                type="checkbox"
                checked={todas}
                onChange={alternarTodas}
                aria-label="Seleccionar todas las visitas de esta página"
                className="size-4 accent-acento"
              />
            </Th>
            <Th>Folio</Th>
            <Th>Fecha</Th>
            <Th>Cliente</Th>
            <Th soloAncha>Sucursal</Th>
            <Th soloAncha>Comuna</Th>
            <Th soloAncha>Trabajo</Th>
            <Th>Técnico</Th>
            <Th>Estado</Th>
          </>
        }
      >
        {visitas.map((visita) => {
          const sinTecnico = visita.tecnico_id === null;
          const fecha = fechaCorta(visita.fecha_programada);
          const hora = horaCorta(visita.hora_programada);

          return (
            <Fila
              key={visita.id}
              // La fila sin técnico se marca con una barra ámbar a la izquierda,
              // no con el fondo entero: el fondo compite con el hover y con el
              // badge de estado. Además la columna dice "Sin asignar", así que
              // el color no es el único que lleva la información.
              className={sinTecnico ? "border-l-2 border-l-encurso" : ""}
            >
              <Td>
                <input
                  type="checkbox"
                  checked={marcadas.includes(visita.id)}
                  onChange={() => alternar(visita.id)}
                  aria-label={`Seleccionar la visita ${visita.folio}`}
                  className="size-4 accent-acento"
                />
              </Td>
              <Td numerica>
                <Link
                  href={`/visitas/${visita.id}`}
                  className="font-medium text-acento hover:underline"
                >
                  {visita.folio}
                </Link>
              </Td>
              <Td numerica>
                {fecha ? (
                  <>
                    {fecha}
                    {hora ? (
                      <span className="block text-xs text-suave">{hora}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-xs text-suave">En terreno</span>
                )}
              </Td>
              <Td className="max-w-[14rem] truncate">
                {visita.cliente?.razon_social ?? <SinDato />}
              </Td>
              <Td soloAncha className="max-w-[12rem] truncate">
                {visita.sucursal?.nombre ?? <SinDato />}
              </Td>
              <Td soloAncha>{visita.sucursal?.comuna ?? <SinDato />}</Td>
              <Td soloAncha>
                {nombreTipoTrabajo(visita.tipo_trabajo) ?? <SinDato />}
              </Td>
              <Td>
                {visita.tecnico ? (
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="truncate">
                      {visita.tecnico.apellidos}, {visita.tecnico.nombres}
                    </span>
                    <button
                      type="button"
                      onClick={() => abrir([visita.id])}
                      className="text-xs text-acento hover:underline"
                    >
                      Reasignar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => abrir([visita.id])}
                    className="text-sm font-medium text-acento hover:underline"
                  >
                    Asignar técnico
                  </button>
                )}
              </Td>
              <Td>
                <BadgeEstado estado={visita.estado} />
              </Td>
            </Fila>
          );
        })}
      </Tabla>

      {marcadas.length > 0 ? (
        <BarraSeleccion
          cantidad={marcadas.length}
          alAsignar={() => abrir(marcadas)}
          alLimpiar={() => setMarcadas([])}
        />
      ) : null}

      {aAsignar ? (
        <DialogoAsignar
          ids={aAsignar}
          tecnicos={tecnicos}
          alCerrar={() => setAAsignar(null)}
          alTerminar={(mensaje) => {
            setConfirmacion(mensaje);
            setMarcadas([]);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Barra de acción en lote. Fija abajo para que no haya que subir a buscarla
 * después de marcar la fila 20 — que es exactamente el caso de uso: repartir el
 * trabajo de la semana un lunes a la mañana.
 */
function BarraSeleccion({
  cantidad,
  alAsignar,
  alLimpiar,
}: {
  cantidad: number;
  alAsignar: () => void;
  alLimpiar: () => void;
}) {
  return (
    <div className="sticky bottom-3 z-20 mt-3 flex flex-wrap items-center gap-3 rounded-base border border-borde bg-superficie px-3 py-2.5 shadow-drawer">
      <p className="flex-1 text-sm text-texto">
        <span className="tabular-nums font-medium">{cantidad}</span>{" "}
        {cantidad === 1 ? "visita seleccionada" : "visitas seleccionadas"}
      </p>
      <Boton type="button" variante="secundario" onClick={alLimpiar}>
        Deseleccionar
      </Boton>
      <Boton type="button" onClick={alAsignar}>
        Asignar técnico
      </Boton>
    </div>
  );
}

/**
 * Modal de asignación. El mismo para una fila y para veinte: lo único que
 * cambia es cuántos ids viajan.
 *
 * La acción no redirige (ver `lib/acciones/visitas.ts`), así que el cierre lo
 * decide este componente cuando el estado vuelve con éxito. A cambio, el
 * coordinador se queda en el listado que venía filtrando y la tabla ya llega
 * actualizada en la misma respuesta.
 */
function DialogoAsignar({
  ids,
  tecnicos,
  alCerrar,
  alTerminar,
}: {
  ids: number[];
  tecnicos: Tecnico[];
  alCerrar: () => void;
  alTerminar: (mensaje: string) => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const avisado = useRef(false);
  const [estado, enviar] = useActionState<EstadoAsignacion, FormData>(
    asignarTecnicoAccion,
    SIN_ASIGNACION,
  );

  useEffect(() => {
    if (!dialogo.current?.open) dialogo.current?.showModal();
  }, []);

  // El aviso de "listo" se muestra en el listado y no acá adentro: el modal se
  // va justo cuando aparece. La tabla que hay detrás ya llegó actualizada en la
  // misma respuesta de la acción, gracias al revalidatePath.
  //
  // El `avisado` evita un bucle: `alTerminar` es una función nueva en cada
  // render del padre, así que el efecto se vuelve a correr cada vez, y avisar
  // otra vez haría renderizar al padre otra vez. El evento `close` que
  // desmonta este diálogo llega en un turno posterior, así que no alcanza a
  // frenarlo por sí solo.
  useEffect(() => {
    if (!estado.exito || avisado.current) return;
    avisado.current = true;
    alTerminar(estado.exito);
    dialogo.current?.close();
  }, [estado.exito, alTerminar]);

  const varias = ids.length > 1;

  return (
    <dialog
      ref={dialogo}
      onClose={alCerrar}
      aria-labelledby="titulo-asignar"
      className="m-auto w-[calc(100vw-1.5rem)] max-w-md rounded-base border border-borde bg-superficie p-0 shadow-drawer backdrop:bg-texto/30"
    >
      <form action={enviar} className="flex flex-col gap-4 p-5">
        {ids.map((id) => (
          <input key={id} type="hidden" name="ids" value={id} />
        ))}

        <div>
          <h2 id="titulo-asignar" className="text-base font-semibold text-texto">
            {varias ? `Asignar ${ids.length} visitas` : "Asignar técnico"}
          </h2>
          <p className="mt-1 text-sm text-suave">
            {varias
              ? "Las seleccionadas quedan todas a nombre del mismo técnico. Las que ya tenían uno se reasignan."
              : "Podés cambiarlo después las veces que haga falta."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="tecnico_id" className="text-sm font-medium text-texto">
            Técnico
          </label>
          <select
            id="tecnico_id"
            name="tecnico_id"
            required
            autoFocus
            defaultValue=""
            aria-invalid={Boolean(estado.errores.tecnico_id) || undefined}
            className={[
              "h-10 w-full rounded-base border bg-superficie px-3 text-base text-texto",
              estado.errores.tecnico_id ? "border-error" : "border-borde",
              "focus:border-acento focus:outline-none focus-visible:outline-2",
              "focus-visible:outline-offset-2 focus-visible:outline-acento",
            ].join(" ")}
          >
            <option value="">Elegí un técnico</option>
            {tecnicos.map((tecnico) => (
              <option key={tecnico.id} value={tecnico.id}>
                {tecnico.apellidos}, {tecnico.nombres}
              </option>
            ))}
          </select>
          {estado.errores.tecnico_id ? (
            <p className="text-xs text-error" role="alert">
              {estado.errores.tecnico_id}
            </p>
          ) : null}
        </div>

        {tecnicos.length === 0 ? (
          <Alerta tono="aviso">
            No hay técnicos activos para asignar. Cargá uno en{" "}
            <Link href="/tecnicos" className="underline">
              Técnicos
            </Link>
            .
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
          <BotonGuardar enviando="Asignando…">Asignar</BotonGuardar>
        </div>
      </form>
    </dialog>
  );
}
