"use client";

import MaestroTable from "@/components/admin/MaestroTable";
import { clientes, sucursales } from "@/lib/mock/maestros";
import Tag from "@/components/Tag";
import type { Cliente } from "@/lib/types";

function nSucursales(clienteId: number) {
  return sucursales.filter((s) => s.clienteId === clienteId).length;
}

export default function ClientesPage() {
  return (
    <MaestroTable<Cliente>
      kicker="Maestros"
      title="Clientes"
      addLabel="Nuevo cliente"
      editLabel="Editar cliente"
      dialogoKicker="Maestro · cliente"
      nota="El RUT no se puede repetir."
      phBusqueda="Buscar cliente o RUT…"
      initialRows={clientes}
      searchKeys={(c) => `${c.nombreFantasia} ${c.razonSocial} ${c.rut}`}
      columns={[
        { key: "razonSocial", label: "Razón social" },
        { key: "rut", label: "RUT" },
        { key: "nombreFantasia", label: "Nombre fantasía" },
        { key: "sucursales", label: "Sucursales", align: "right", render: (c) => nSucursales(c.id) },
        {
          key: "activo",
          label: "Estado",
          render: (c) => <Tag variant={c.activo ? "accent" : "neutral"}>{c.activo ? "Activo" : "Inactivo"}</Tag>,
        },
      ]}
      fields={[
        { k: "razonSocial", label: "Razón social", span: 2 },
        { k: "rut", label: "RUT", ph: "76.123.456-7" },
        { k: "nombreFantasia", label: "Nombre fantasía" },
        { k: "activo", label: "Estado", tipo: "toggle" },
      ]}
      validar={(f) =>
        !String(f.razonSocial).trim() || !String(f.rut).trim() ? "Razón social y RUT son obligatorios" : null
      }
      toFormValues={(c) => ({
        nombreFantasia: c.nombreFantasia,
        razonSocial: c.razonSocial,
        rut: c.rut,
        activo: c.activo,
      })}
      fromFormValues={(f, id) => ({
        id,
        nombreFantasia: String(f.nombreFantasia),
        razonSocial: String(f.razonSocial),
        rut: String(f.rut),
        activo: f.activo !== false,
      })}
      emptyRow={{ nombreFantasia: "", razonSocial: "", rut: "", activo: true }}
    />
  );
}
