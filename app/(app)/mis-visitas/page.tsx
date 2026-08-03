import { redirect } from "next/navigation";

/**
 * `/mis-visitas` fue el marcador de la fase 1. Desde la fase 3 el listado del
 * técnico vive en `/visitas`, que muestra una pantalla u otra según el rol.
 *
 * La ruta queda como redirección y no se borra porque puede estar guardada en
 * el celular de alguien: un 404 en el acceso directo del técnico es un llamado
 * telefónico un lunes a las 8 de la mañana.
 */
export default function PaginaMisVisitas() {
  redirect("/visitas");
}
