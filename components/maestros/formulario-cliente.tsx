"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SIN_ERRORES, type EstadoFormulario } from "@/lib/acciones/formulario";
import type { ClienteRow } from "@/lib/db/tipos";
import { Alerta } from "@/components/ui/alerta";
import { BotonGuardar } from "@/components/ui/boton";
import { Campo, Entrada } from "@/components/ui/campo";
import { CampoRut } from "./campo-rut";
import { CasillaActivo } from "./casilla-activo";
import { useCampos } from "./usar-campos";

type Accion = (
  previo: EstadoFormulario,
  datos: FormData,
) => Promise<EstadoFormulario>;

/**
 * Alta y edición de cliente. Es el mismo formulario para las dos cosas: lo que
 * cambia es la acción que recibe y si viene con datos cargados.
 *
 * `noValidate` apaga la validación del navegador para que los mensajes sean
 * los nuestros, en español y diciendo qué corregir. La validación real está en
 * la Server Action.
 *
 * Los campos van controlados: si no, React 19 los vacía al volver la acción y
 * un error en el RUT se lleva puesto todo lo demás. Ver `usar-campos.ts`.
 */
export function FormularioCliente({
  accion,
  cliente,
  visitasAbiertas = 0,
}: {
  accion: Accion;
  cliente?: ClienteRow;
  visitasAbiertas?: number;
}) {
  const [estado, enviar] = useActionState(accion, SIN_ERRORES);
  const [activo, setActivo] = useState(cliente?.activo ?? true);
  const { valores, alCambiar } = useCampos({
    razon_social: cliente?.razon_social ?? "",
    nombre_fantasia: cliente?.nombre_fantasia ?? "",
    telefono: cliente?.telefono ?? "",
    email: cliente?.email ?? "",
  });

  const volverA = cliente ? `/clientes/${cliente.id}` : "/clientes";

  return (
    <form action={enviar} noValidate className="flex flex-col gap-5">
      {cliente ? <input type="hidden" name="id" value={cliente.id} /> : null}

      {estado.error ? <Alerta>{estado.error}</Alerta> : null}

      <div className="rounded-card border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
        <div className="flex flex-col gap-4">
          <CampoRut
            valorInicial={cliente?.rut ?? ""}
            error={estado.errores.rut}
            autoFocus={!cliente}
          />

          <Campo
            htmlFor="razon_social"
            etiqueta="Razón social"
            error={estado.errores.razon_social}
          >
            <Entrada
              id="razon_social"
              name="razon_social"
              value={valores.razon_social}
              onChange={alCambiar("razon_social")}
              required
              invalido={Boolean(estado.errores.razon_social)}
              aria-describedby={
                estado.errores.razon_social ? "razon_social-error" : undefined
              }
            />
          </Campo>

          <Campo
            htmlFor="nombre_fantasia"
            etiqueta="Nombre de fantasía"
            opcional
            ayuda="Cómo se lo conoce en la calle, si no coincide con la razón social."
            error={estado.errores.nombre_fantasia}
          >
            <Entrada
              id="nombre_fantasia"
              name="nombre_fantasia"
              value={valores.nombre_fantasia}
              onChange={alCambiar("nombre_fantasia")}
              invalido={Boolean(estado.errores.nombre_fantasia)}
              aria-describedby="nombre_fantasia-ayuda"
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              htmlFor="telefono"
              etiqueta="Teléfono"
              opcional
              error={estado.errores.telefono}
            >
              <Entrada
                id="telefono"
                name="telefono"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={valores.telefono}
                onChange={alCambiar("telefono")}
                invalido={Boolean(estado.errores.telefono)}
              />
            </Campo>

            <Campo
              htmlFor="email"
              etiqueta="Correo"
              opcional
              error={estado.errores.email}
            >
              <Entrada
                id="email"
                name="email"
                type="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={valores.email}
                onChange={alCambiar("email")}
                invalido={Boolean(estado.errores.email)}
                aria-describedby={estado.errores.email ? "email-error" : undefined}
              />
            </Campo>
          </div>

          <div className="border-t border-borde pt-2">
            <CasillaActivo
              activo={activo}
              alCambiar={setActivo}
              eraActivo={cliente?.activo ?? false}
              visitasAbiertas={visitasAbiertas}
              queEs="cliente"
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
          {cliente ? "Guardar cambios" : "Crear cliente"}
        </BotonGuardar>
      </div>
    </form>
  );
}
