"use client";

import { useState } from "react";
import ContactoDialogo from "@/components/admin/contactos/ContactoDialogo";
import Tag from "@/components/Tag";
import { puede, useReferencias } from "@/lib/ui/referencias";
import type { CargoContacto, Contacto } from "@/lib/ui/contactos";

/** Una línea de la lista: un contacto, el cargo por el que figura y de dónde viene. */
export interface FilaContacto {
  contactoId: number;
  cargo: string;
  /** «Propio de la sucursal», «Heredado de la marca Volcom», «Marca Volcom»… */
  origen: string;
  heredado: boolean;
}

/**
 * Los contactos de una ficha (sucursal o cliente), con el botón para agregar
 * uno nuevo y el lápiz para corregirlo. `contactos` trae a cada contacto con
 * todos sus cargos, para editarlo entero aunque aquí figure por uno solo.
 */
export default function ContactosSeccion({
  titulo,
  vacio,
  filas,
  contactos,
  cargoInicial,
}: {
  titulo: string;
  vacio: string;
  filas: FilaContacto[];
  contactos: Contacto[];
  /** El alcance con que arranca un contacto nuevo: la sucursal o el cliente de la ficha. */
  cargoInicial: Pick<CargoContacto, "alcanceTipo" | "alcanceId" | "alcanceTexto">;
}) {
  const ref = useReferencias();
  const [dialogo, setDialogo] = useState<{ contacto: Contacto | null } | null>(null);
  const porId = new Map(contactos.map((c) => [c.id, c]));

  return (
    <div className="p-4 md:p-6 border-b border-black/[.12]">
      <div className="flex items-center gap-2.5 flex-wrap">
        <h2 className="font-extrabold text-[17px] m-0">{titulo}</h2>
        <span className="text-[11px] tracking-[.08em] uppercase opacity-60">{filas.length}</span>
        {puede(ref, "contactos.crear") ? (
          <button type="button" className="btn btn-secondary ml-auto" onClick={() => setDialogo({ contacto: null })}>
            Agregar contacto
          </button>
        ) : null}
      </div>

      {filas.length === 0 ? (
        <p className="mt-3 mb-0 text-[13px] opacity-62">{vacio}</p>
      ) : (
        <ul className="list-none m-0 mt-2 p-0">
          {filas.map((f, i) => {
            const c = porId.get(f.contactoId);
            if (!c) return null;
            return (
              <li key={`${f.contactoId}-${i}`} className="flex items-start gap-3 py-2.5 border-b border-black/[.1]">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[14px]">
                    {c.nombre} <span className="font-normal opacity-72">· {f.cargo}</span>
                  </div>
                  <div className="text-[12px] opacity-72 mt-0.5 break-words">
                    {[c.email, c.telefono].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                  </div>
                  <div className="mt-1">
                    <Tag variant={f.heredado ? "outline" : "accent"}>{f.origen}</Tag>
                  </div>
                </div>
                {puede(ref, "contactos.editar") ? (
                  <button type="button" className="btn btn-ghost flex-none" onClick={() => setDialogo({ contacto: c })}>
                    Editar
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {dialogo ? (
        <ContactoDialogo contacto={dialogo.contacto} cargoInicial={cargoInicial} onCerrar={() => setDialogo(null)} />
      ) : null}
    </div>
  );
}
