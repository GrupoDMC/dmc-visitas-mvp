"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SIN_ERRORES, type EstadoFormulario } from "@/lib/acciones/formulario";
import { REGIONES } from "@/lib/regiones";
import type { SucursalRow } from "@/lib/db/tipos";
import { Alerta } from "@/components/ui/alerta";
import { BotonGuardar } from "@/components/ui/boton";
import { Campo, Casilla, Entrada, Selector } from "@/components/ui/campo";
import { useCampos } from "./usar-campos";

type Accion = (
  previo: EstadoFormulario,
  datos: FormData,
) => Promise<EstadoFormulario>;

/**
 * Alta y edición de sucursal. Siempre cuelga de un cliente: no hay forma de
 * llegar acá sin uno, y el cliente no se puede cambiar desde el formulario.
 *
 * Región es un select con las 16 de Chile; comuna es texto libre. En DMC_Core
 * las dos son FK a `core.comuna`, pero replicar las 346 comunas para un MVP de
 * seis semanas no se paga. La región sí está cerrada porque son 16 y porque es
 * lo que después permite mapear el resto.
 */
export function FormularioSucursal({
  accion,
  clienteId,
  volverA,
  sucursal,
}: {
  accion: Accion;
  clienteId: number;
  volverA: string;
  sucursal?: SucursalRow;
}) {
  const [estado, enviar] = useActionState(accion, SIN_ERRORES);
  // Controlados: React 19 vacía los campos no controlados cuando termina la
  // acción, así que un error de validación se llevaría puesta la dirección
  // entera. Ver `usar-campos.ts`.
  const [activa, setActiva] = useState(sucursal?.activo ?? true);
  const { valores, alCambiar } = useCampos({
    nombre: sucursal?.nombre ?? "",
    codigo_interno: sucursal?.codigo_interno ?? "",
    direccion: sucursal?.direccion ?? "",
    comuna: sucursal?.comuna ?? "",
    region: sucursal?.region ?? "",
    telefono: sucursal?.telefono ?? "",
  });

  return (
    <form action={enviar} noValidate className="flex flex-col gap-5">
      {sucursal ? (
        <input type="hidden" name="id" value={sucursal.id} />
      ) : (
        <input type="hidden" name="cliente_id" value={clienteId} />
      )}

      {estado.error ? <Alerta>{estado.error}</Alerta> : null}

      <div className="rounded-base border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              htmlFor="nombre"
              etiqueta="Nombre"
              ayuda="Como la nombra el cliente. Por ejemplo, Sucursal Providencia."
              error={estado.errores.nombre}
            >
              <Entrada
                id="nombre"
                name="nombre"
                value={valores.nombre}
                onChange={alCambiar("nombre")}
                autoFocus={!sucursal}
                required
                invalido={Boolean(estado.errores.nombre)}
                aria-describedby={
                  estado.errores.nombre ? "nombre-error" : "nombre-ayuda"
                }
              />
            </Campo>

            <Campo
              htmlFor="codigo_interno"
              etiqueta="Código interno"
              opcional
              ayuda="El código que usa el cliente para identificarla."
              error={estado.errores.codigo_interno}
            >
              <Entrada
                id="codigo_interno"
                name="codigo_interno"
                value={valores.codigo_interno}
                onChange={alCambiar("codigo_interno")}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                invalido={Boolean(estado.errores.codigo_interno)}
                aria-describedby="codigo_interno-ayuda"
              />
            </Campo>
          </div>

          <Campo
            htmlFor="direccion"
            etiqueta="Dirección"
            opcional
            ayuda="Calle y número. Es lo que el técnico va a leer en la calle."
            error={estado.errores.direccion}
          >
            <Entrada
              id="direccion"
              name="direccion"
              value={valores.direccion}
              onChange={alCambiar("direccion")}
              autoComplete="street-address"
              invalido={Boolean(estado.errores.direccion)}
              aria-describedby="direccion-ayuda"
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              htmlFor="comuna"
              etiqueta="Comuna"
              opcional
              error={estado.errores.comuna}
            >
              <Entrada
                id="comuna"
                name="comuna"
                value={valores.comuna}
                onChange={alCambiar("comuna")}
                autoComplete="address-level2"
                invalido={Boolean(estado.errores.comuna)}
              />
            </Campo>

            <Campo
              htmlFor="region"
              etiqueta="Región"
              opcional
              error={estado.errores.region}
            >
              <Selector
                id="region"
                name="region"
                value={valores.region}
                onChange={alCambiar("region")}
                invalido={Boolean(estado.errores.region)}
                aria-describedby={estado.errores.region ? "region-error" : undefined}
              >
                <option value="">Sin especificar</option>
                {REGIONES.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </Selector>
            </Campo>
          </div>

          <Campo
            htmlFor="telefono"
            etiqueta="Teléfono"
            opcional
            ayuda="Se sugiere como contacto al crear una visita en esta sucursal."
            error={estado.errores.telefono}
          >
            <Entrada
              id="telefono"
              name="telefono"
              type="tel"
              inputMode="tel"
              value={valores.telefono}
              onChange={alCambiar("telefono")}
              invalido={Boolean(estado.errores.telefono)}
              aria-describedby="telefono-ayuda"
            />
          </Campo>

          <div className="border-t border-borde pt-2">
            <Casilla
              id="activo"
              name="activo"
              etiqueta="Activa"
              descripcion="Una sucursal inactiva no aparece al crear visitas nuevas, pero sigue en las que ya existen."
              checked={activa}
              onChange={setActiva}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Link
          href={volverA}
          className="inline-flex min-h-11 items-center justify-center rounded-base border border-borde bg-superficie px-4 text-sm font-medium text-texto transition-colors hover:bg-fondo sm:min-h-10"
        >
          Cancelar
        </Link>
        <BotonGuardar>
          {sucursal ? "Guardar cambios" : "Crear sucursal"}
        </BotonGuardar>
      </div>
    </form>
  );
}
