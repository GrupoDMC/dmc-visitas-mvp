"use client";

import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { Toast } from "@/components/ui/Toast";
import {
  Indice,
  SeccionFirma,
  SeccionFotos,
  SeccionGuardar,
  SeccionInterno,
} from "@/components/admin/editar-acta/secciones-evidencia";
import {
  Encabezado,
  SeccionProblemas,
  SeccionResponsable,
  SeccionTrabajo,
} from "@/components/admin/editar-acta/secciones";
import { useEditarActa } from "@/components/admin/editar-acta/useEditarActa";

/**
 * Editar un acta ya cerrada, desde el panel.
 *
 * Es el acta entera puesta en campos, cada dato en su sección: responsable,
 * motivos y trabajos, problemas, comentario interno, fotos y videos. Parte de
 * lo que quedó guardado y no escribe nada hasta "Guardar cambios", que pide el
 * motivo. La firma de la tienda se muestra, pero no se toca.
 *
 * Qué cambió no lo decide esta pantalla: el servidor compara contra lo guardado
 * y deja el registro (ver lib/data/ediciones).
 */
export default function EditarActa(props: Parameters<typeof useEditarActa>[0]) {
  const fv = useEditarActa(props);
  const { visita, toast, guardando, hrefActa, guardar, conCambios, hayCambios } = fv;
  return (
    <div className="pb-16 animate-fade-in">
      <AdminHeader kicker={`Visitas · ${visita.folio}`} title="Editar acta">
        <span className="text-[13px] opacity-66 tabular-nums max-sm:hidden">
          {hayCambios
            ? `${conCambios.length} ${conCambios.length === 1 ? "sección con cambios" : "secciones con cambios"}`
            : "Sin cambios todavía"}
        </span>
        <Link href={hrefActa} className="btn btn-secondary min-h-10 px-3.5">
          Cancelar
        </Link>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando || !hayCambios}
          className="btn btn-primary min-h-10 px-4"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M4 12l5 5L20 6" />
          </svg>
          <span>{guardando ? "Guardando…" : "Guardar cambios"}</span>
        </button>
      </AdminHeader>

      <div className="px-4 md:px-7 pt-6 grid grid-cols-1 xl:grid-cols-[minmax(0,860px)_264px] gap-x-8 items-start">
        <div className="min-w-0 flex flex-col gap-6">
          <Encabezado fv={fv} />
          <SeccionResponsable fv={fv} />
          <SeccionTrabajo fv={fv} />
          <SeccionProblemas fv={fv} />
          <SeccionInterno fv={fv} />
          <SeccionFotos fv={fv} />
          <SeccionFirma fv={fv} />
          <SeccionGuardar fv={fv} />
        </div>

        <Indice fv={fv} />
      </div>

      <Toast texto={toast} variante="panel" />
    </div>
  );
}
