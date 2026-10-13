"use client";

import Link from "next/link";
import PantallaEstado, { CLASE_BOTON, CLASE_BOTON_SECUNDARIO } from "@/components/ui/PantallaEstado";

// Pantalla de error de cada segmento. No muestra el detalle técnico: el mensaje
// de un error de servidor puede traer consultas o rutas internas. Solo se deja
// el código de referencia (`digest`) que Next calcula para ubicar el mismo
// error en el log del servidor.

export default function ErrorPantalla({
  error,
  reintentar,
  inicio,
  compacta = false,
}: {
  error: Error & { digest?: string };
  reintentar: () => void;
  inicio: string;
  compacta?: boolean;
}) {
  return (
    <PantallaEstado
      compacta={compacta}
      etiqueta="Algo salió mal"
      titulo={
        <>
          No pudimos
          <br />
          completar esto
        </>
      }
      acciones={
        <>
          <button type="button" onClick={reintentar} className={CLASE_BOTON}>
            Reintentar
          </button>
          <Link href={inicio} className={CLASE_BOTON_SECUNDARIO}>
            Ir al inicio
          </Link>
        </>
      }
    >
      <p className="m-0">
        Ocurrió un error inesperado. Lo que ya habías guardado no se perdió. Si se repite, avisa a coordinación
        {error.digest ? (
          <>
            {" "}
            con este código: <span className="font-mono">{error.digest}</span>
          </>
        ) : null}
        .
      </p>
    </PantallaEstado>
  );
}
