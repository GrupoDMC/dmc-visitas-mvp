"use client";

import AdminHeader from "@/components/admin/AdminHeader";
import Confirmar from "@/components/ui/Confirmar";
import { Toast } from "@/components/ui/Toast";
import { Introduccion, ListasSimples, PieGuardar, PlantillaPropia } from "@/components/admin/checklist/listas-simples";
import { ListaMotivos, ListaTiposProblema, ListaTrabajos } from "@/components/admin/checklist/listas";
import { useChecklistEditor } from "@/components/admin/checklist/useChecklistEditor";

/**
 * Editor de las listas del checklist.
 *
 * Trabaja sobre un borrador local: mover, renombrar, clonar y quitar solo tocan
 * la pantalla. Nada llega a SQL Server hasta que se aprieta "Guardar cambios" y
 * se confirma — antes esto guardaba en cada blur y era imposible saber qué
 * había quedado escrito y qué no.
 *
 * Quitar una entrada nunca borra la fila: la deja inactiva. Las visitas y las
 * actas ya registradas apuntan a ella por su código y tienen que seguir
 * mostrándose tal como se firmaron.
 *
 * El estado vive en useChecklistEditor; cada lista está en components/admin/checklist.
 */
export default function ChecklistEditor(props: Parameters<typeof useChecklistEditor>[0]) {
  const fv = useChecklistEditor(props);
  const { toast, confirmar, setConfirmar, guardando, soloLectura, sucio, pedirGuardar } = fv;
  return (
    <>
      <AdminHeader kicker="Maestros · listas que ve el técnico en terreno" title="Checklist">
        <button className="btn btn-primary" onClick={pedirGuardar} disabled={guardando || !sucio || soloLectura}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M4 12l5 5L20 6" />
          </svg>
          <span>
            {soloLectura ? "Solo lectura" : guardando ? "Guardando…" : sucio ? "Guardar cambios" : "Sin cambios"}
          </span>
        </button>
      </AdminHeader>

      <div className="px-4 md:px-7 pt-6 pb-12 animate-fade-in max-w-[1000px]">
        <Introduccion fv={fv} />
        <ListaMotivos fv={fv} />
        <ListaTiposProblema fv={fv} />
        <ListaTrabajos fv={fv} />
        <ListasSimples fv={fv} />
        <PlantillaPropia fv={fv} />
        <PieGuardar fv={fv} />
      </div>

      {confirmar ? <Confirmar cfg={confirmar} onCerrar={() => setConfirmar(null)} /> : null}
      <Toast texto={toast} variante="panel" />
    </>
  );
}
