"use client"

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"
import { ingresar, type EstadoIngreso } from "@/lib/acciones/sesion"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

const ESTADO_INICIAL: EstadoIngreso = { error: null }

const estiloCampo = cn(
  "h-11 border-white/15 bg-white/5 text-white placeholder:text-white/35",
  "focus-visible:border-purple-400 focus-visible:ring-purple-400/40",
  "aria-invalid:border-red-400/60 aria-invalid:ring-red-400/20",
  "autofill:shadow-[inset_0_0_0px_1000px_var(--color-zinc-900)] autofill:[-webkit-text-fill-color:white]"
)

function BotonEntrar() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-11 w-full bg-purple-600 text-white hover:bg-purple-500"
    >
      {pending ? "Entrando…" : "Entrar"}
    </Button>
  )
}

export function LoginForm({
  volverA,
  className,
  ...props
}: Omit<React.ComponentProps<"form">, "action"> & { volverA: string }) {
  const [estado, accion] = useActionState(ingresar, ESTADO_INICIAL)

  // React 19 limpia solo los campos no controlados cuando termina la acción.
  // Para el correo no queremos eso: si la contraseña estaba mal, hacerlo
  // reescribir el correo es puro castigo. La contraseña sí se limpia.
  const [correo, setCorreo] = useState("")

  return (
    <form
      action={accion}
      noValidate
      className={cn("flex flex-col gap-6", className)}
      {...props}
    >
      <input type="hidden" name="volverA" value={volverA} />

      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold text-white">
            Bienvenid@ de regreso
          </h1>
          <p className="text-sm text-white/60">
            Escribí tu correo y tu contraseña para entrar
          </p>
        </div>

        <Field>
          <FieldLabel htmlFor="correo" className="text-white/80">
            Correo electrónico
          </FieldLabel>
          <Input
            id="correo"
            name="correo"
            type="email"
            value={correo}
            onChange={(evento) => setCorreo(evento.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="nombre@empresa.com"
            required
            aria-invalid={Boolean(estado.error)}
            aria-describedby={estado.error ? "error-ingreso" : undefined}
            className={estiloCampo}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="contrasena" className="text-white/80">
            Contraseña
          </FieldLabel>
          <Input
            id="contrasena"
            name="contrasena"
            type="password"
            placeholder="********"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(estado.error)}
            aria-describedby={estado.error ? "error-ingreso" : undefined}
            className={estiloCampo}
          />
        </Field>

        {estado.error ? (
          <p
            id="error-ingreso"
            role="alert"
            className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
          >
            {estado.error}
          </p>
        ) : null}

        <BotonEntrar />

        <p className="text-center text-xs leading-relaxed text-white">
          ¿No podés entrar? Contactá a soporte para que revise tu cuenta.
        </p>
      </FieldGroup>
    </form>
  )
}
