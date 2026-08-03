"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ingresar, type EstadoIngreso } from "@/lib/acciones/sesion";
import { Boton } from "@/components/ui/boton";
import { Campo, Entrada } from "@/components/ui/campo";

const INICIAL: EstadoIngreso = { error: null };

function BotonEntrar() {
  const { pending } = useFormStatus();

  return (
    <Boton type="submit" className="w-full" disabled={pending}>
      {pending ? "Entrando…" : "Entrar"}
    </Boton>
  );
}

export function FormularioIngreso({ volverA }: { volverA: string }) {
  const [estado, accion] = useActionState(ingresar, INICIAL);

  // React 19 limpia solo los campos no controlados cuando termina la acción.
  // Para el correo no queremos eso: si la contraseña estaba mal, hacerlo
  // reescribir el correo es puro castigo. La contraseña sí se limpia.
  const [correo, setCorreo] = useState("");

  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="volverA" value={volverA} />

      <Campo htmlFor="correo" etiqueta="Correo">
        <Entrada
          id="correo"
          name="correo"
          type="email"
          value={correo}
          onChange={(evento) => setCorreo(evento.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          invalido={Boolean(estado.error)}
          aria-describedby={estado.error ? "error-ingreso" : undefined}
        />
      </Campo>

      <Campo htmlFor="contrasena" etiqueta="Contraseña">
        <Entrada
          id="contrasena"
          name="contrasena"
          type="password"
          autoComplete="current-password"
          required
          invalido={Boolean(estado.error)}
          aria-describedby={estado.error ? "error-ingreso" : undefined}
        />
      </Campo>

      {estado.error ? (
        <p
          id="error-ingreso"
          role="alert"
          className="rounded-base border border-error/30 bg-error-fondo px-3 py-2 text-sm text-error"
        >
          {estado.error}
        </p>
      ) : null}

      <BotonEntrar />
    </form>
  );
}
