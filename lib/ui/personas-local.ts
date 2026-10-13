"use client";

import { useEffect, useState } from "react";
import { personasDelLocalAction } from "@/app/actions/personas-local";
import type { PersonaLocal } from "@/lib/types";

/**
 * Las personas que ya recibieron o firmaron en la tienda. Se piden al servidor
 * cada vez que cambia la tienda; mientras llegan, o si no hay ninguna, es una
 * lista vacía y el formulario queda como siempre.
 */
export function usePersonasLocal(sucursalId: string | number | null | undefined): PersonaLocal[] {
  const [lista, setLista] = useState<{ para: string; personas: PersonaLocal[] }>({ para: "", personas: [] });
  const clave = sucursalId ? String(sucursalId) : "";

  useEffect(() => {
    if (!clave) return;
    let vigente = true;
    personasDelLocalAction(Number(clave))
      .then((personas) => {
        if (vigente) setLista({ para: clave, personas });
      })
      .catch(() => {
        if (vigente) setLista({ para: clave, personas: [] });
      });
    return () => {
      vigente = false;
    };
  }, [clave]);

  // Lo que llegó para otra tienda no se muestra en esta.
  return lista.para === clave ? lista.personas : [];
}

/** "María Soto · Jefa de tienda · 12.345.678-5", sin lo que falte. */
export function etiquetaPersona(p: PersonaLocal): string {
  return [p.nombre, p.cargo, p.rut].filter(Boolean).join(" · ");
}
