"use client";

import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { Toast } from "@/components/ui/Toast";
import { BarraGuardar, DialogosPapel, EncabezadoPapel, RecuadrosTecnicos } from "@/components/admin/papel/carga";
import { useVisitasPapel } from "@/components/admin/papel/useVisitasPapel";

/**
 * "Visitas en papel": transcribir los informes que se hicieron a mano en años
 * anteriores, lo más rápido posible.
 *
 * Arriba va el año. Después se agregan técnicos, cada uno en su recuadro, y
 * dentro de cada técnico sus clientes; en cada cliente se filtra por mall si
 * hace falta y se van agregando sus tiendas. Cada tienda lleva sus informes
 * —uno o varios en el año— y cada informe pide solo lo suyo: mes, día, motivo,
 * quién firmó y la descripción. Un informe nuevo copia el mes y el motivo del
 * anterior del mismo cliente, para escribir solo lo que cambia.
 *
 * Lo escrito se guarda en el navegador mientras tanto: cerrar la pestaña no
 * pierde nada. Al guardar, lo completo entra como visita completada y sale de
 * la lista; lo incompleto se queda marcado con lo que le falta.
 */
export default function VisitasPapel() {
  const fv = useVisitasPapel();
  const { toast } = fv;
  return (
    <>
      <AdminHeader kicker="Operación · visitas" title="Visitas en papel">
        <Link href="/admin/visitas" className="btn btn-secondary">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          <span>Volver a visitas</span>
        </Link>
      </AdminHeader>

      <div className="px-4 md:px-7 py-5 pb-32 max-w-[1200px]">
        <EncabezadoPapel fv={fv} />
        <RecuadrosTecnicos fv={fv} />
      </div>

      <BarraGuardar fv={fv} />
      <DialogosPapel fv={fv} />

      <Toast texto={toast} variante="panel" />
    </>
  );
}
