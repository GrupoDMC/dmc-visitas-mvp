"use client";

import MaestroTable from "@/components/admin/MaestroTable";
import Tag from "@/components/Tag";
import { guardarSucursalAction } from "@/app/actions/maestros";
import { REGIONES } from "@/lib/ui/regiones";
import type { Cliente, Mall, Sucursal } from "@/lib/types";

export default function SucursalesTable({
  sucursales,
  clientes,
  malls,
}: {
  sucursales: Sucursal[];
  clientes: Cliente[];
  malls: Mall[];
}) {
  const nombreCliente = (id: number) => clientes.find((c) => c.id === id)?.nombreFantasia ?? "—";
  const nombreMall = (id?: number | null) => malls.find((m) => m.id === id)?.nombre ?? "";

  return (
    <MaestroTable<Sucursal>
      kicker="Maestros"
      title="Sucursales"
      modulo="sucursales"
      addLabel="Nueva sucursal"
      editLabel="Editar sucursal"
      dialogoKicker="Maestro · sucursal"
      nota="La sucursal siempre pertenece a un cliente y no se puede dejar sin él. El mall se asigna desde Maestros › Malls."
      phBusqueda="Buscar sucursal, comuna, mall, código…"
      rows={sucursales}
      searchKeys={(s) => `${s.nombre} ${s.codigo ?? ""} ${s.comuna} ${s.direccion} ${nombreCliente(s.clienteId)} ${nombreMall(s.mallId)}`}
      columns={[
        { key: "nombre", label: "Sucursal" },
        { key: "cliente", label: "Cliente", render: (s) => nombreCliente(s.clienteId) },
        { key: "mall", label: "Mall", render: (s) => nombreMall(s.mallId) || "—" },
        { key: "codigo", label: "Código", render: (s) => s.codigo ?? "—" },
        { key: "direccion", label: "Dirección" },
        { key: "comuna", label: "Comuna" },
        {
          key: "activo",
          label: "Estado",
          render: (s) => (
            <>
              <Tag variant={s.activo ? "accent" : "neutral"}>{s.activo ? "Activa" : "Inactiva"}</Tag>
              {!s.activo && s.motivoInactivo ? (
                <div className="text-[11px] leading-[1.4] opacity-66 mt-1 max-w-[260px]">{s.motivoInactivo}</div>
              ) : null}
            </>
          ),
        },
      ]}
      fields={[
        {
          k: "clienteId",
          label: "Cliente",
          tipo: "select",
          opciones: clientes.map((c) => ({ v: String(c.id), t: c.nombreFantasia })),
        },
        { k: "nombre", label: "Nombre de la sucursal" },
        { k: "codigo", label: "Código interno (opcional)", ph: "MS-118" },
        { k: "telefono", label: "Teléfono", tipo: "tel", ph: "+56 2 2299 4100" },
        { k: "direccion", label: "Dirección", span: 2 },
        { k: "comuna", label: "Comuna" },
        { k: "region", label: "Región", tipo: "select", opciones: REGIONES.map((r) => ({ v: r, t: r })) },
        { k: "activo", label: "Estado", tipo: "toggle" },
        {
          k: "motivoInactivo",
          label: "¿Por qué se desactiva?",
          tipo: "area",
          span: 2,
          ph: "Cierre de la tienda, cambio de local, término de contrato…",
          ayuda: "Obligatorio para dejar la sucursal inactiva. Se borra si se reactiva.",
          visible: (f) => f.activo === false,
        },
        { k: "notas", label: "Notas", tipo: "area", span: 2, ph: "Lo que conviene saber de esta tienda" },
      ]}
      validar={(f) => {
        if (!String(f.nombre).trim() || !f.clienteId) return "Nombre y cliente son obligatorios";
        if (f.activo === false && !String(f.motivoInactivo ?? "").trim()) {
          return "Explica por qué se desactiva la sucursal";
        }
        return null;
      }}
      toFormValues={(s) => ({
        clienteId: String(s.clienteId),
        nombre: s.nombre,
        codigo: s.codigo ?? "",
        direccion: s.direccion,
        comuna: s.comuna,
        region: s.region,
        telefono: s.telefono ?? "",
        activo: s.activo,
        motivoInactivo: s.motivoInactivo ?? "",
        notas: s.notas ?? "",
      })}
      guardarAction={(id, f) =>
        guardarSucursalAction(id, {
          clienteId: Number(f.clienteId),
          nombre: String(f.nombre).trim(),
          codigo: String(f.codigo ?? "").trim() || null,
          direccion: String(f.direccion).trim(),
          comuna: String(f.comuna).trim(),
          region: String(f.region),
          telefono: String(f.telefono).trim() || null,
          activo: f.activo !== false,
          motivoInactivo: String(f.motivoInactivo ?? "").trim() || null,
          notas: String(f.notas ?? "").trim() || null,
        })
      }
      emptyRow={{
        clienteId: String(clientes[0]?.id ?? ""),
        nombre: "",
        codigo: "",
        direccion: "",
        comuna: "",
        region: REGIONES[0],
        telefono: "",
        activo: true,
        motivoInactivo: "",
        notas: "",
      }}
    />
  );
}
