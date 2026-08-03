"use client";

import { useState, type ChangeEvent } from "react";

/**
 * Estado de los campos de texto de un formulario.
 *
 * Existe por un motivo concreto: React 19 **resetea los campos no controlados
 * cuando termina la acción del formulario**, y lo hace tanto si la acción salió
 * bien como si volvió con un error de validación. Sin esto, un usuario que se
 * equivoca en el RUT pierde la razón social, el teléfono y el correo que ya
 * había escrito, y tiene que tipear todo de nuevo para corregir un carácter.
 *
 * Es el mismo problema que el formulario de ingreso resolvió a mano con el
 * campo de correo (ver el comentario en `app/login/formulario-ingreso.tsx`);
 * acá está generalizado porque los maestros tienen cinco o seis campos y
 * perderlos duele mucho más.
 */
export function useCampos<T extends Record<string, string>>(iniciales: T) {
  const [valores, setValores] = useState<T>(iniciales);

  function alCambiar(campo: keyof T) {
    return (
      evento: ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => {
      const valor = evento.target.value;
      setValores((previos) => ({ ...previos, [campo]: valor }));
    };
  }

  /**
   * Escribir un campo desde código, no desde el teclado. Lo usa la cascada de
   * "Nueva visita" para sugerir el teléfono de la sucursal en el contacto.
   */
  function fijar(campo: keyof T, valor: string) {
    setValores((previos) => ({ ...previos, [campo]: valor }));
  }

  return { valores, alCambiar, fijar };
}
