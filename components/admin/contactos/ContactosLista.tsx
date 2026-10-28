"use client";

import { useMemo, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import ContactoDialogo from "@/components/admin/contactos/ContactoDialogo";
import Tag from "@/components/Tag";
import { describirAlcance, type Contacto } from "@/lib/ui/contactos";
import { sinTildes } from "@/lib/ui/formato";
import { puede, useReferencias } from "@/lib/ui/referencias";

/** Todos los contactos con sus cargos y alcances. El alta y la edición son las mismas de las fichas. */
export default function ContactosLista({ contactos }: { contactos: Contacto[] }) {
  const ref = useReferencias();
  const [busqueda, setBusqueda] = useState("");
  const [dialogo, setDialogo] = useState<{ contacto: Contacto | null } | null>(null);

  const nombres = {
    cliente: (id: number) => ref.clientes.find((c) => c.id === id)?.nombreFantasia,
    marca: (id: number) => ref.marcas.find((m) => m.id === id)?.nombre,
    sucursal: (id: number) => ref.sucursales.find((s) => s.id === id)?.nombre,
  };

  const filtrados = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    if (!q) return contactos;
    return contactos.filter((c) =>
      sinTildes([c.nombre, c.email, c.telefono, ...c.cargos.map((g) => g.cargo)].filter(Boolean).join(" ")).includes(q)
    );
  }, [contactos, busqueda]);

  return (
    <>
      <AdminHeader kicker="Maestros" title="Contactos" />
      <div className="p-4 md:p-6">
        <div className="flex gap-3 flex-wrap items-center mb-4">
          <input
            className="input max-w-[360px]"
            placeholder="Buscar por nombre, correo o cargo…"
            aria-label="Buscar contactos"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {puede(ref, "contactos.crear") ? (
            <button type="button" className="btn btn-primary ml-auto" onClick={() => setDialogo({ contacto: null })}>
              Nuevo contacto
            </button>
          ) : null}
        </div>

        {filtrados.length === 0 ? (
          <p className="text-[13px] opacity-62">{contactos.length === 0 ? "Todavía no hay contactos." : "Ningún contacto coincide."}</p>
        ) : (
          <ul className="list-none m-0 p-0">
            {filtrados.map((c) => (
              <li key={c.id} className="flex items-start gap-3 py-3 border-b border-black/[.1]">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[14px]">
                    {c.nombre} {!c.activo ? <Tag variant="neutral">Inactivo</Tag> : null}
                  </div>
                  <div className="text-[12px] opacity-72 break-words">
                    {[c.email, c.telefono].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.cargos.map((g, i) => (
                      <Tag key={g.id ?? i} variant="outline">
                        {g.cargo} · {describirAlcance(g, nombres)}
                      </Tag>
                    ))}
                  </div>
                </div>
                {puede(ref, "contactos.editar") ? (
                  <button type="button" className="btn btn-ghost flex-none" onClick={() => setDialogo({ contacto: c })}>
                    Editar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      {dialogo ? <ContactoDialogo contacto={dialogo.contacto} onCerrar={() => setDialogo(null)} /> : null}
    </>
  );
}
