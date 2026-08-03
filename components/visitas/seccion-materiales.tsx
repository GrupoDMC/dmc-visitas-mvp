"use client";

import { useActionState } from "react";
import {
  actualizarMaterialAccion,
  crearMaterialAccion,
  eliminarMaterialAccion,
} from "@/lib/acciones/visitas";
import { SIN_ERRORES } from "@/lib/acciones/formulario";
import { DIRECCIONES_MATERIAL } from "@/lib/catalogos";
import type { MaterialRow } from "@/lib/db/tipos";
import { Alerta } from "@/components/ui/alerta";
import { Boton, BotonGuardar } from "@/components/ui/boton";
import { Campo, Entrada, Selector } from "@/components/ui/campo";
import { FranjaBorrador } from "./franja-borrador";
import { useCamposConBorrador, useLimpiarBorradorAlGuardar } from "./usar-borrador";

const MATERIAL_EN_BLANCO = {
  descripcion: "",
  codigo_producto: "",
  cantidad: "",
  direccion: "",
  observacion: "",
};

/**
 * Cada fila es su propio `<form>`: en escritorio se apilan una sobre otra y
 * quedan alineadas por columna (grid con los mismos anchos en cada fila), en
 * móvil se leen como una tarjeta de arriba hacia abajo. Es la misma marca —
 * no hay dos layouts separados que puedan desincronizarse entre sí.
 */
function FilaMaterial({
  visitaId,
  material,
  soloLectura,
}: {
  visitaId: number;
  material: MaterialRow;
  soloLectura: boolean;
}) {
  const [estado, enviar, enviando] = useActionState(actualizarMaterialAccion, SIN_ERRORES);
  const [estadoBorrado, enviarBorrado, borrando] = useActionState(
    eliminarMaterialAccion,
    SIN_ERRORES,
  );

  const { valores, alCambiar, borrador, recuperar, descartar, limpiarBorrador } =
    useCamposConBorrador(`visita:${visitaId}:material:${material.id}`, {
      descripcion: material.descripcion,
      codigo_producto: material.codigo_producto ?? "",
      cantidad: String(material.cantidad),
      direccion: material.direccion,
      observacion: material.observacion ?? "",
    });

  useLimpiarBorradorAlGuardar(enviando, estado.error, limpiarBorrador);

  return (
    <li className="rounded-base border border-borde bg-superficie p-3.5 shadow-tarjeta">
      {borrador && !soloLectura ? (
        <div className="mb-3">
          <FranjaBorrador
            guardadoEn={borrador.guardadoEn}
            onRecuperar={recuperar}
            onDescartar={descartar}
          />
        </div>
      ) : null}

      {estadoBorrado.error ? (
        <div className="mb-3">
          <Alerta>{estadoBorrado.error}</Alerta>
        </div>
      ) : null}

      <form
        action={enviar}
        className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_6rem_5.5rem_7.5rem_2fr] sm:items-start sm:gap-2"
      >
        <input type="hidden" name="visita_id" value={visitaId} />
        <input type="hidden" name="material_id" value={material.id} />

        {estado.error ? (
          <div className="sm:col-span-5">
            <Alerta>{estado.error}</Alerta>
          </div>
        ) : null}

        <Campo htmlFor={`descripcion-${material.id}`} etiqueta="Descripción" error={estado.errores.descripcion}>
          <Entrada
            id={`descripcion-${material.id}`}
            name="descripcion"
            value={valores.descripcion}
            onChange={alCambiar("descripcion")}
            disabled={soloLectura}
            invalido={Boolean(estado.errores.descripcion)}
          />
        </Campo>

        <Campo
          htmlFor={`codigo-${material.id}`}
          etiqueta="Código"
          opcional
          error={estado.errores.codigo_producto}
        >
          <Entrada
            id={`codigo-${material.id}`}
            name="codigo_producto"
            value={valores.codigo_producto}
            onChange={alCambiar("codigo_producto")}
            disabled={soloLectura}
            invalido={Boolean(estado.errores.codigo_producto)}
          />
        </Campo>

        <Campo htmlFor={`cantidad-${material.id}`} etiqueta="Cantidad" error={estado.errores.cantidad}>
          <Entrada
            id={`cantidad-${material.id}`}
            name="cantidad"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={valores.cantidad}
            onChange={alCambiar("cantidad")}
            disabled={soloLectura}
            invalido={Boolean(estado.errores.cantidad)}
          />
        </Campo>

        <Campo htmlFor={`direccion-${material.id}`} etiqueta="Dirección" error={estado.errores.direccion}>
          <Selector
            id={`direccion-${material.id}`}
            name="direccion"
            value={valores.direccion}
            onChange={alCambiar("direccion")}
            disabled={soloLectura}
            invalido={Boolean(estado.errores.direccion)}
          >
            {DIRECCIONES_MATERIAL.map((d) => (
              <option key={d.codigo} value={d.codigo}>
                {d.nombre}
              </option>
            ))}
          </Selector>
        </Campo>

        <Campo
          htmlFor={`observacion-${material.id}`}
          etiqueta="Observación"
          opcional
          error={estado.errores.observacion}
        >
          <Entrada
            id={`observacion-${material.id}`}
            name="observacion"
            value={valores.observacion}
            onChange={alCambiar("observacion")}
            disabled={soloLectura}
            invalido={Boolean(estado.errores.observacion)}
          />
        </Campo>

        {!soloLectura ? (
          <div className="flex gap-2 sm:col-span-5 sm:justify-end">
            <BotonGuardar>Guardar</BotonGuardar>
          </div>
        ) : null}
      </form>

      {!soloLectura ? (
        <form action={enviarBorrado} className="mt-2 flex justify-end">
          <input type="hidden" name="visita_id" value={visitaId} />
          <input type="hidden" name="material_id" value={material.id} />
          <Boton type="submit" variante="texto" disabled={borrando}>
            {borrando ? "Quitando…" : "Quitar material"}
          </Boton>
        </form>
      ) : null}
    </li>
  );
}

function NuevoMaterial({ visitaId }: { visitaId: number }) {
  const [estado, enviar, enviando] = useActionState(crearMaterialAccion, SIN_ERRORES);

  const { valores, alCambiar, borrador, recuperar, descartar, reiniciar } =
    useCamposConBorrador(`visita:${visitaId}:material:nuevo`, MATERIAL_EN_BLANCO);

  useLimpiarBorradorAlGuardar(enviando, estado.error, reiniciar);

  return (
    <div className="rounded-base border border-dashed border-borde bg-superficie p-3.5">
      {borrador ? (
        <div className="mb-3">
          <FranjaBorrador
            guardadoEn={borrador.guardadoEn}
            onRecuperar={recuperar}
            onDescartar={descartar}
          />
        </div>
      ) : null}

      <form
        action={enviar}
        className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_6rem_5.5rem_7.5rem_2fr] sm:items-start sm:gap-2"
      >
        <input type="hidden" name="visita_id" value={visitaId} />

        {estado.error ? (
          <div className="sm:col-span-5">
            <Alerta>{estado.error}</Alerta>
          </div>
        ) : null}

        <Campo htmlFor="nuevo-descripcion-material" etiqueta="Descripción" error={estado.errores.descripcion}>
          <Entrada
            id="nuevo-descripcion-material"
            name="descripcion"
            placeholder="Nombre libre: todavía no hay inventario"
            value={valores.descripcion}
            onChange={alCambiar("descripcion")}
            invalido={Boolean(estado.errores.descripcion)}
          />
        </Campo>

        <Campo htmlFor="nuevo-codigo" etiqueta="Código" opcional error={estado.errores.codigo_producto}>
          <Entrada
            id="nuevo-codigo"
            name="codigo_producto"
            value={valores.codigo_producto}
            onChange={alCambiar("codigo_producto")}
            invalido={Boolean(estado.errores.codigo_producto)}
          />
        </Campo>

        <Campo htmlFor="nueva-cantidad" etiqueta="Cantidad" error={estado.errores.cantidad}>
          <Entrada
            id="nueva-cantidad"
            name="cantidad"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={valores.cantidad}
            onChange={alCambiar("cantidad")}
            invalido={Boolean(estado.errores.cantidad)}
          />
        </Campo>

        <Campo htmlFor="nueva-direccion" etiqueta="Dirección" error={estado.errores.direccion}>
          <Selector
            id="nueva-direccion"
            name="direccion"
            value={valores.direccion}
            onChange={alCambiar("direccion")}
            invalido={Boolean(estado.errores.direccion)}
          >
            <option value="">Elegí una opción</option>
            {DIRECCIONES_MATERIAL.map((d) => (
              <option key={d.codigo} value={d.codigo}>
                {d.nombre}
              </option>
            ))}
          </Selector>
        </Campo>

        <Campo htmlFor="nueva-observacion" etiqueta="Observación" opcional error={estado.errores.observacion}>
          <Entrada
            id="nueva-observacion"
            name="observacion"
            value={valores.observacion}
            onChange={alCambiar("observacion")}
            invalido={Boolean(estado.errores.observacion)}
          />
        </Campo>

        <div className="sm:col-span-5">
          <BotonGuardar enviando="Agregando…">Agregar material</BotonGuardar>
        </div>
      </form>
    </div>
  );
}

export function SeccionMateriales({
  visitaId,
  materiales,
  soloLectura,
}: {
  visitaId: number;
  materiales: MaterialRow[];
  soloLectura: boolean;
}) {
  return (
    <section
      aria-labelledby="seccion-materiales"
      className="rounded-base border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5"
    >
      <h2 id="seccion-materiales" className="text-sm font-medium text-texto">
        Materiales
        {materiales.length > 0 ? (
          <span className="ml-1.5 font-normal tabular-nums text-suave">
            ({materiales.length})
          </span>
        ) : null}
      </h2>

      {materiales.length === 0 ? (
        <p className="mt-2 text-sm text-suave">
          Todavía no cargaste materiales instalados ni retirados en esta visita.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {materiales.map((material) => (
            <FilaMaterial
              key={material.id}
              visitaId={visitaId}
              material={material}
              soloLectura={soloLectura}
            />
          ))}
        </ul>
      )}

      {!soloLectura ? (
        <div className="mt-4">
          <NuevoMaterial visitaId={visitaId} />
        </div>
      ) : null}
    </section>
  );
}
