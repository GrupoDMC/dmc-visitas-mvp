"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { restablecerClaveAccion } from "@/lib/acciones/usuarios";
import { SIN_CLAVE } from "@/lib/acciones/formulario";
import { Alerta } from "@/components/ui/alerta";
import { Boton, BotonGuardar } from "@/components/ui/boton";

/**
 * "Restablecer contraseña". Dos fases en el mismo diálogo:
 *
 * 1. Confirmar — un POST normal, puede volver con error.
 * 2. Mostrar la contraseña nueva — una sola vez, para dictarla por teléfono.
 *
 * La fase se controla con estado propio (`fase`) y no leyendo directo
 * `estado.claveTemporal`: `useActionState` no se reinicia solo, así que sin
 * esto, cerrar el diálogo después de ver la contraseña y volver a abrirlo
 * (para restablecerla de nuevo más adelante) mostraría la clave vieja en vez
 * del formulario de confirmación.
 */
export function DialogoRestablecerClave({
  id,
  nombre,
}: {
  id: string;
  nombre: string;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [estado, enviar] = useActionState(restablecerClaveAccion, SIN_CLAVE);
  const [fase, setFase] = useState<"confirmar" | "mostrando">("confirmar");
  const [copiado, setCopiado] = useState(false);
  const claveVista = useRef<string | null>(null);

  useEffect(() => {
    if (estado.claveTemporal && estado.claveTemporal !== claveVista.current) {
      claveVista.current = estado.claveTemporal;
      setFase("mostrando");
    } else if (estado.error && !dialogo.current?.open) {
      dialogo.current?.showModal();
    }
  }, [estado.claveTemporal, estado.error]);

  function abrir() {
    setFase("confirmar");
    setCopiado(false);
    dialogo.current?.showModal();
  }

  async function copiar() {
    if (!estado.claveTemporal) return;
    await navigator.clipboard.writeText(estado.claveTemporal);
    setCopiado(true);
  }

  return (
    <>
      <Boton type="button" variante="secundario" onClick={abrir}>
        Restablecer contraseña
      </Boton>

      <dialog
        ref={dialogo}
        aria-labelledby="titulo-restablecer"
        className="m-auto w-[calc(100vw-1.5rem)] max-w-md rounded-card border border-borde bg-superficie p-0 shadow-drawer backdrop:bg-texto/30"
      >
        {fase === "mostrando" && estado.claveTemporal ? (
          <div className="flex flex-col gap-4 p-5">
            <div>
              <h2
                id="titulo-restablecer"
                className="text-base font-semibold text-texto"
              >
                Nueva contraseña de {nombre}
              </h2>
              <p className="mt-1 text-sm text-suave">
                Se muestra una sola vez. Dictásela ahora por teléfono — no se
                manda ningún correo.
              </p>
            </div>

            <p className="select-all rounded-base border border-borde bg-fondo px-3 py-2.5 text-center font-mono text-lg tracking-wider text-texto">
              {estado.claveTemporal}
            </p>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Boton type="button" variante="secundario" onClick={copiar}>
                {copiado ? "Copiada" : "Copiar"}
              </Boton>
              <Boton type="button" onClick={() => dialogo.current?.close()}>
                Listo, ya se la dicté
              </Boton>
            </div>
          </div>
        ) : (
          <form action={enviar} className="flex flex-col gap-4 p-5">
            <input type="hidden" name="id" value={id} />

            <div>
              <h2
                id="titulo-restablecer"
                className="text-base font-semibold text-texto"
              >
                ¿Restablecer la contraseña de {nombre}?
              </h2>
              <p className="mt-1 text-sm text-suave">
                Se genera una contraseña temporal y se muestra en pantalla una
                sola vez, para dictarla por teléfono. La actual deja de
                servir al instante.
              </p>
            </div>

            {estado.error ? <Alerta>{estado.error}</Alerta> : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Boton
                type="button"
                variante="secundario"
                onClick={() => dialogo.current?.close()}
              >
                Cancelar
              </Boton>
              <BotonGuardar enviando="Restableciendo…">
                Restablecer
              </BotonGuardar>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
