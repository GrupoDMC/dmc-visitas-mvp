"use client";

import { useActionState } from "react";
import { guardarTrabajoRealizadoAccion } from "@/lib/acciones/visitas";
import { SIN_ERRORES } from "@/lib/acciones/formulario";
import { Alerta } from "@/components/ui/alerta";
import { BotonGuardar } from "@/components/ui/boton";
import { AreaTexto, Campo, Casilla } from "@/components/ui/campo";
import { TituloSeccion } from "@/components/ui/titulo-seccion";
import { FranjaBorrador } from "./franja-borrador";
import { useCamposConBorrador, useLimpiarBorradorAlGuardar } from "./usar-borrador";

export type VisitaParaTrabajo = {
  id: number;
  trabajo_realizado: string | null;
  observaciones: string | null;
  requiere_seguimiento: boolean;
};

/** Sección 2 · Trabajo realizado. */
export function SeccionTrabajoRealizado({
  visita,
  soloLectura,
}: {
  visita: VisitaParaTrabajo;
  soloLectura: boolean;
}) {
  const [estado, enviar, enviando] = useActionState(
    guardarTrabajoRealizadoAccion,
    SIN_ERRORES,
  );

  const { valores, alCambiar, fijar, borrador, recuperar, descartar, limpiarBorrador } =
    useCamposConBorrador(`visita:${visita.id}:trabajo`, {
      trabajo_realizado: visita.trabajo_realizado ?? "",
      observaciones: visita.observaciones ?? "",
      requiere_seguimiento: visita.requiere_seguimiento ? "si" : "",
    });

  useLimpiarBorradorAlGuardar(enviando, estado.error, limpiarBorrador);

  return (
    <section
      aria-labelledby="seccion-trabajo"
      className="rounded-card border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5"
    >
      <TituloSeccion
        numero={2}
        id="seccion-trabajo"
        titulo="Trabajo realizado"
        guardado={visita.trabajo_realizado !== null}
      />

      {borrador && !soloLectura ? (
        <div className="mt-3">
          <FranjaBorrador
            guardadoEn={borrador.guardadoEn}
            onRecuperar={recuperar}
            onDescartar={descartar}
          />
        </div>
      ) : null}

      <form action={enviar} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="visita_id" value={visita.id} />

        {estado.error ? <Alerta>{estado.error}</Alerta> : null}

        <Campo
          htmlFor="trabajo_realizado"
          etiqueta="Qué se hizo"
          ayuda="Obligatorio para poder cerrar la visita."
          error={estado.errores.trabajo_realizado}
        >
          <AreaTexto
            id="trabajo_realizado"
            name="trabajo_realizado"
            rows={5}
            value={valores.trabajo_realizado}
            onChange={alCambiar("trabajo_realizado")}
            disabled={soloLectura}
            invalido={Boolean(estado.errores.trabajo_realizado)}
          />
        </Campo>

        <Campo
          htmlFor="observaciones"
          etiqueta="Observaciones"
          opcional
          error={estado.errores.observaciones}
        >
          <AreaTexto
            id="observaciones"
            name="observaciones"
            rows={3}
            value={valores.observaciones}
            onChange={alCambiar("observaciones")}
            disabled={soloLectura}
            invalido={Boolean(estado.errores.observaciones)}
          />
        </Campo>

        <Casilla
          id="requiere_seguimiento"
          name="requiere_seguimiento"
          etiqueta="Requiere seguimiento"
          descripcion="Marcalo si esto necesita que alguien vuelva o le haga seguimiento después."
          checked={valores.requiere_seguimiento === "si"}
          onChange={(marcada) => fijar("requiere_seguimiento", marcada ? "si" : "")}
          disabled={soloLectura}
        />

        {!soloLectura ? (
          <div>
            <BotonGuardar>Guardar trabajo realizado</BotonGuardar>
          </div>
        ) : null}
      </form>
    </section>
  );
}
