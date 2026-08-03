"use client";

import { useActionState } from "react";
import {
  actualizarProblemaAccion,
  crearProblemaAccion,
} from "@/lib/acciones/visitas";
import { SIN_ERRORES } from "@/lib/acciones/formulario";
import { ESTADOS_PROBLEMA } from "@/lib/catalogos";
import type { ProblemaRow } from "@/lib/db/tipos";
import { Alerta } from "@/components/ui/alerta";
import { BotonGuardar } from "@/components/ui/boton";
import { AreaTexto, Campo, Selector } from "@/components/ui/campo";
import { TituloSeccion } from "@/components/ui/titulo-seccion";
import { FranjaBorrador } from "./franja-borrador";
import { useCamposConBorrador, useLimpiarBorradorAlGuardar } from "./usar-borrador";

const PROBLEMA_EN_BLANCO = { descripcion: "", solucion_sugerida: "", estado: "ABIERTO" };

function FilaProblema({
  visitaId,
  problema,
  soloLectura,
}: {
  visitaId: number;
  problema: ProblemaRow;
  soloLectura: boolean;
}) {
  const [estado, enviar, enviando] = useActionState(actualizarProblemaAccion, SIN_ERRORES);

  const { valores, alCambiar, borrador, recuperar, descartar, limpiarBorrador } =
    useCamposConBorrador(`visita:${visitaId}:problema:${problema.id}`, {
      descripcion: problema.descripcion,
      solucion_sugerida: problema.solucion_sugerida ?? "",
      estado: problema.estado,
    });

  useLimpiarBorradorAlGuardar(enviando, estado.error, limpiarBorrador);

  return (
    <li className="rounded-card border border-borde bg-superficie p-4 shadow-tarjeta">
      {borrador && !soloLectura ? (
        <div className="mb-3">
          <FranjaBorrador
            guardadoEn={borrador.guardadoEn}
            onRecuperar={recuperar}
            onDescartar={descartar}
          />
        </div>
      ) : null}

      <form action={enviar} className="flex flex-col gap-3">
        <input type="hidden" name="visita_id" value={visitaId} />
        <input type="hidden" name="problema_id" value={problema.id} />

        {estado.error ? <Alerta>{estado.error}</Alerta> : null}

        <Campo
          htmlFor={`descripcion-${problema.id}`}
          etiqueta="Descripción"
          error={estado.errores.descripcion}
        >
          <AreaTexto
            id={`descripcion-${problema.id}`}
            name="descripcion"
            rows={2}
            value={valores.descripcion}
            onChange={alCambiar("descripcion")}
            disabled={soloLectura}
            invalido={Boolean(estado.errores.descripcion)}
          />
        </Campo>

        <Campo
          htmlFor={`solucion-${problema.id}`}
          etiqueta="Solución sugerida"
          opcional
          error={estado.errores.solucion_sugerida}
        >
          <AreaTexto
            id={`solucion-${problema.id}`}
            name="solucion_sugerida"
            rows={2}
            value={valores.solucion_sugerida}
            onChange={alCambiar("solucion_sugerida")}
            disabled={soloLectura}
            invalido={Boolean(estado.errores.solucion_sugerida)}
          />
        </Campo>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Campo
              htmlFor={`estado-${problema.id}`}
              etiqueta="Estado"
              error={estado.errores.estado}
            >
              <Selector
                id={`estado-${problema.id}`}
                name="estado"
                value={valores.estado}
                onChange={alCambiar("estado")}
                disabled={soloLectura}
                invalido={Boolean(estado.errores.estado)}
              >
                {ESTADOS_PROBLEMA.map((e) => (
                  <option key={e.codigo} value={e.codigo}>
                    {e.nombre}
                  </option>
                ))}
              </Selector>
            </Campo>
          </div>

          {!soloLectura ? <BotonGuardar>Guardar</BotonGuardar> : null}
        </div>
      </form>
    </li>
  );
}

function NuevoProblema({ visitaId }: { visitaId: number }) {
  const [estado, enviar, enviando] = useActionState(crearProblemaAccion, SIN_ERRORES);

  const { valores, alCambiar, borrador, recuperar, descartar, reiniciar } =
    useCamposConBorrador(`visita:${visitaId}:problema:nuevo`, PROBLEMA_EN_BLANCO);

  useLimpiarBorradorAlGuardar(enviando, estado.error, reiniciar);

  return (
    <div className="rounded-card border border-dashed border-borde bg-superficie p-4">
      {borrador ? (
        <div className="mb-3">
          <FranjaBorrador
            guardadoEn={borrador.guardadoEn}
            onRecuperar={recuperar}
            onDescartar={descartar}
          />
        </div>
      ) : null}

      <form action={enviar} className="flex flex-col gap-3">
        <input type="hidden" name="visita_id" value={visitaId} />
        <input type="hidden" name="estado" value="ABIERTO" />

        {estado.error ? <Alerta>{estado.error}</Alerta> : null}

        <Campo
          htmlFor="nuevo-descripcion"
          etiqueta="Descripción del problema"
          error={estado.errores.descripcion}
        >
          <AreaTexto
            id="nuevo-descripcion"
            name="descripcion"
            rows={2}
            placeholder="Qué encontraste"
            value={valores.descripcion}
            onChange={alCambiar("descripcion")}
            invalido={Boolean(estado.errores.descripcion)}
          />
        </Campo>

        <Campo
          htmlFor="nuevo-solucion"
          etiqueta="Solución sugerida"
          opcional
          error={estado.errores.solucion_sugerida}
        >
          <AreaTexto
            id="nuevo-solucion"
            name="solucion_sugerida"
            rows={2}
            value={valores.solucion_sugerida}
            onChange={alCambiar("solucion_sugerida")}
            invalido={Boolean(estado.errores.solucion_sugerida)}
          />
        </Campo>

        <div>
          <BotonGuardar enviando="Agregando…">Agregar problema</BotonGuardar>
        </div>
      </form>
    </div>
  );
}

export function SeccionProblemas({
  visitaId,
  problemas,
  soloLectura,
}: {
  visitaId: number;
  problemas: ProblemaRow[];
  soloLectura: boolean;
}) {
  return (
    <section
      aria-labelledby="seccion-problemas"
      className="rounded-card border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <TituloSeccion
          numero={3}
          id="seccion-problemas"
          titulo="Problemas detectados"
          guardado={problemas.length > 0}
        />
        {problemas.length > 0 ? (
          <span className="font-normal tabular-nums text-xs text-suave">
            ({problemas.length})
          </span>
        ) : null}
      </div>

      {problemas.length === 0 ? (
        <p className="mt-2 text-sm text-suave">
          Todavía no cargaste ningún problema en esta visita.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {problemas.map((problema) => (
            <FilaProblema
              key={problema.id}
              visitaId={visitaId}
              problema={problema}
              soloLectura={soloLectura}
            />
          ))}
        </ul>
      )}

      {!soloLectura ? (
        <div className="mt-4">
          <NuevoProblema visitaId={visitaId} />
        </div>
      ) : null}
    </section>
  );
}
