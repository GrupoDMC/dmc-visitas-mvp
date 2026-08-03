/**
 * Encabezado de sección del formulario de terreno: número de orden + título
 * + indicador de si ya se guardó algo en esa sección. El número solo tiene
 * sentido acá porque el técnico completa estas secciones en orden; el resto
 * de la app no numera sus encabezados.
 */
export function TituloSeccion({
  numero,
  id,
  titulo,
  guardado,
}: {
  numero: number;
  id: string;
  titulo: string;
  guardado?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-acento-suave text-xs font-medium tabular-nums text-acento"
        aria-hidden
      >
        {numero}
      </span>
      <h2 id={id} className="font-heading text-sm font-semibold text-texto">
        {titulo}
      </h2>
      {guardado === undefined ? null : (
        <span
          className={[
            "inline-flex items-center gap-1.5 text-xs font-medium",
            guardado ? "text-realizada-texto" : "text-suave",
          ].join(" ")}
        >
          <span
            className={
              guardado
                ? "size-1.5 shrink-0 rounded-full bg-realizada"
                : "size-1.5 shrink-0 rounded-full border border-borde"
            }
            aria-hidden
          />
          {guardado ? "Guardado" : "Falta completar"}
        </span>
      )}
    </div>
  );
}
