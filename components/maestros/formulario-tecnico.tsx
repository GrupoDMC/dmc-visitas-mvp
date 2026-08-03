"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SIN_ERRORES, type EstadoFormulario } from "@/lib/acciones/formulario";
import type { TecnicoRow } from "@/lib/db/tipos";
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
 * Alta y edición de técnico. Mismo formulario para las dos.
 *
 * Campos controlados por la misma razón que en el de cliente: React 19 vacía
 * los no controlados al terminar la acción. Ver `usar-campos.ts`.
 */
export function FormularioTecnico({
  accion,
  tecnico,
  visitasAbiertas = 0,
}: {
  accion: Accion;
  tecnico?: TecnicoRow;
  visitasAbiertas?: number;
}) {
  const [estado, enviar] = useActionState(accion, SIN_ERRORES);
  const [activo, setActivo] = useState(tecnico?.activo ?? true);
  const { valores, alCambiar } = useCampos({
    nombres: tecnico?.nombres ?? "",
    apellidos: tecnico?.apellidos ?? "",
    telefono: tecnico?.telefono ?? "",
    email: tecnico?.email ?? "",
  });

  return (
    <form action={enviar} noValidate className="flex flex-col gap-5">
      {tecnico ? <input type="hidden" name="id" value={tecnico.id} /> : null}

      {estado.error ? <Alerta>{estado.error}</Alerta> : null}

      <div className="rounded-base border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
        <div className="flex flex-col gap-4">
          <CampoRut
            valorInicial={tecnico?.rut ?? ""}
            error={estado.errores.rut}
            autoFocus={!tecnico}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              htmlFor="nombres"
              etiqueta="Nombres"
              error={estado.errores.nombres}
            >
              <Entrada
                id="nombres"
                name="nombres"
                autoComplete="given-name"
                value={valores.nombres}
                onChange={alCambiar("nombres")}
                required
                invalido={Boolean(estado.errores.nombres)}
                aria-describedby={
                  estado.errores.nombres ? "nombres-error" : undefined
                }
              />
            </Campo>

            <Campo
              htmlFor="apellidos"
              etiqueta="Apellidos"
              error={estado.errores.apellidos}
            >
              <Entrada
                id="apellidos"
                name="apellidos"
                autoComplete="family-name"
                value={valores.apellidos}
                onChange={alCambiar("apellidos")}
                required
                invalido={Boolean(estado.errores.apellidos)}
                aria-describedby={
                  estado.errores.apellidos ? "apellidos-error" : undefined
                }
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              htmlFor="telefono"
              etiqueta="Teléfono"
              opcional
              ayuda="El celular con el que se lo ubica en terreno."
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
                aria-describedby="telefono-ayuda"
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
              eraActivo={tecnico?.activo ?? false}
              visitasAbiertas={visitasAbiertas}
              queEs="técnico"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Link
          href="/tecnicos"
          className="inline-flex min-h-11 items-center justify-center rounded-base border border-borde bg-superficie px-4 text-sm font-medium text-texto transition-colors hover:bg-fondo sm:min-h-10"
        >
          Cancelar
        </Link>
        <BotonGuardar>
          {tecnico ? "Guardar cambios" : "Crear técnico"}
        </BotonGuardar>
      </div>
    </form>
  );
}
