"use client";

import Tag from "@/components/Tag";
import { etiquetaEstadoProblema, tagEstadoProblema } from "@/lib/ui/estado";
import { useReferencias } from "@/lib/ui/referencias";

/**
 * La etiqueta del estado de un problema, con el nombre que tenga hoy en la
 * Lista 7 del Checklist. Los estados ya no son tres fijos, así que el nombre
 * sale del catálogo que baja el layout y no de una tabla escrita en el código.
 */
export default function EstadoProblemaTag({ estado, className }: { estado: string; className?: string }) {
  const { estadosProblema } = useReferencias();
  return (
    <Tag variant={tagEstadoProblema(estado)} className={className}>
      {etiquetaEstadoProblema(estado, estadosProblema)}
    </Tag>
  );
}
