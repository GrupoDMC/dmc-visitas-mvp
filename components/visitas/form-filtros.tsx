"use client";

import Form from "next/form";
import { useEffect, useRef, type ChangeEvent, type ReactNode } from "react";

/**
 * Sin botón "Filtrar": cada cambio manda el form solo. El buscador de texto
 * lleva demora porque dispara `onChange` en cada tecla — el resto (selects,
 * fechas) ya cambia de a un valor completo por vez, así que va inmediato.
 */
const DEMORA_BUSQUEDA_MS = 400;

export function FormFiltros({
  action,
  formKey,
  className,
  children,
}: {
  action: string;
  formKey: string;
  className?: string;
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const demoraRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (demoraRef.current) clearTimeout(demoraRef.current);
    },
    [],
  );

  function manejarCambio(evento: ChangeEvent<HTMLFormElement>) {
    if (demoraRef.current) clearTimeout(demoraRef.current);

    const esBusqueda =
      evento.target instanceof HTMLInputElement && evento.target.type === "search";

    if (esBusqueda) {
      demoraRef.current = setTimeout(() => {
        formRef.current?.requestSubmit();
      }, DEMORA_BUSQUEDA_MS);
    } else {
      formRef.current?.requestSubmit();
    }
  }

  return (
    <Form
      ref={formRef}
      action={action}
      key={formKey}
      className={className}
      onChange={manejarCambio}
    >
      {children}
    </Form>
  );
}
