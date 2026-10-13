import Link from "next/link";
import PantallaEstado, { CLASE_BOTON } from "@/components/ui/PantallaEstado";

export default function NotFound() {
  return (
    <PantallaEstado
      etiqueta="Error 404"
      titulo={
        <>
          Esta página
          <br />
          no existe
        </>
      }
      acciones={
        <Link href="/login" className={CLASE_BOTON}>
          Ir al inicio
        </Link>
      }
    >
      <p className="m-0">El enlace está mal escrito o el contenido ya no está disponible.</p>
    </PantallaEstado>
  );
}
