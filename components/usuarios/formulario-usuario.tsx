"use client";

import Link from "next/link";
import { useActionState } from "react";
import { crearUsuarioAccion } from "@/lib/acciones/usuarios";
import { SIN_USUARIO } from "@/lib/acciones/formulario";
import { Alerta } from "@/components/ui/alerta";
import { Boton, BotonGuardar } from "@/components/ui/boton";
import { Campo, Entrada, Selector } from "@/components/ui/campo";
import { useCampos } from "@/components/maestros/usar-campos";

type Tecnico = { id: number; nombres: string; apellidos: string };

/**
 * Alta de usuario. No tiene versión de edición: cambiar rol o técnico
 * vinculado no está pedido, y el correo no se puede cambiar sin tocar Auth.
 *
 * Al crear, el servidor genera una contraseña temporal y la devuelve en el
 * estado de la acción (nunca redirige — ver `EstadoUsuario`). Mientras esté
 * en pantalla, el formulario se reemplaza por el aviso con la contraseña.
 */
export function FormularioUsuario({ tecnicos }: { tecnicos: Tecnico[] }) {
  const [estado, enviar] = useActionState(crearUsuarioAccion, SIN_USUARIO);
  const { valores, alCambiar } = useCampos({
    nombre: "",
    correo: "",
    rol: "COORDINADOR",
    tecnico_id: "",
  });

  if (estado.creado) {
    return (
      <div className="flex flex-col gap-4 rounded-base border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
        <Alerta tono="aviso" titulo="Usuario creado. Contraseña temporal:">
          <p className="mt-2 select-all rounded-base border border-borde bg-superficie px-3 py-2.5 text-center font-mono text-lg tracking-wider text-texto">
            {estado.creado.claveTemporal}
          </p>
          <p className="mt-2">
            Se muestra una sola vez. Dictásela ahora a {estado.creado.correo}{" "}
            por teléfono — no se manda ningún correo de recuperación.
          </p>
        </Alerta>

        <Boton
          onClick={() => {
            window.location.href = "/usuarios";
          }}
        >
          Listo, ya se la dicté
        </Boton>
      </div>
    );
  }

  return (
    <form action={enviar} noValidate className="flex flex-col gap-5">
      {estado.error ? <Alerta>{estado.error}</Alerta> : null}

      <div className="rounded-base border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
        <div className="flex flex-col gap-4">
          <Campo htmlFor="nombre" etiqueta="Nombre" error={estado.errores.nombre}>
            <Entrada
              id="nombre"
              name="nombre"
              value={valores.nombre}
              onChange={alCambiar("nombre")}
              autoFocus
              required
              invalido={Boolean(estado.errores.nombre)}
              aria-describedby={estado.errores.nombre ? "nombre-error" : undefined}
            />
          </Campo>

          <Campo
            htmlFor="correo"
            etiqueta="Correo"
            ayuda="Es lo que va a usar para ingresar."
            error={estado.errores.correo}
          >
            <Entrada
              id="correo"
              name="correo"
              type="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={valores.correo}
              onChange={alCambiar("correo")}
              required
              invalido={Boolean(estado.errores.correo)}
              aria-describedby={estado.errores.correo ? "correo-error" : "correo-ayuda"}
            />
          </Campo>

          <Campo htmlFor="rol" etiqueta="Rol" error={estado.errores.rol}>
            <Selector
              id="rol"
              name="rol"
              value={valores.rol}
              onChange={alCambiar("rol")}
              invalido={Boolean(estado.errores.rol)}
            >
              <option value="ADMIN">Administración</option>
              <option value="COORDINADOR">Coordinación</option>
              <option value="TECNICO">Técnico</option>
            </Selector>
          </Campo>

          {valores.rol === "TECNICO" ? (
            <Campo
              htmlFor="tecnico_id"
              etiqueta="Técnico vinculado"
              ayuda="Con qué técnico se relaciona esta cuenta. Obligatorio para el rol Técnico."
              error={estado.errores.tecnico_id}
            >
              <Selector
                id="tecnico_id"
                name="tecnico_id"
                value={valores.tecnico_id}
                onChange={alCambiar("tecnico_id")}
                required
                invalido={Boolean(estado.errores.tecnico_id)}
              >
                <option value="">Elegí un técnico</option>
                {tecnicos.map((tecnico) => (
                  <option key={tecnico.id} value={tecnico.id}>
                    {tecnico.apellidos}, {tecnico.nombres}
                  </option>
                ))}
              </Selector>
            </Campo>
          ) : (
            <input type="hidden" name="tecnico_id" value="" />
          )}
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Link
          href="/usuarios"
          className="inline-flex min-h-11 items-center justify-center rounded-base border border-borde bg-superficie px-4 text-sm font-medium text-texto transition-colors hover:bg-fondo sm:min-h-10"
        >
          Cancelar
        </Link>
        <BotonGuardar>Crear usuario</BotonGuardar>
      </div>
    </form>
  );
}
