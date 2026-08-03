import type { ReactNode } from "react";

type Tono = "error" | "aviso";

const TONOS: Record<Tono, string> = {
  error: "border-error/30 bg-error-fondo text-error",
  // Ámbar: no impide guardar, pide leer antes de seguir.
  aviso: "border-encurso/30 bg-encurso/5 text-encurso",
};

/**
 * Mensaje a nivel de formulario o de pantalla. Los errores de un campo puntual
 * NO van acá — van debajo del campo, que es donde se corrigen.
 */
export function Alerta({
  tono = "error",
  titulo,
  children,
}: {
  tono?: Tono;
  titulo?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={`rounded-base border px-3 py-2.5 text-sm ${TONOS[tono]}`}
    >
      {titulo ? <p className="font-medium">{titulo}</p> : null}
      <div className={titulo ? "mt-0.5" : ""}>{children}</div>
    </div>
  );
}
