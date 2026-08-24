"use client";

import MaestroTable from "@/components/admin/MaestroTable";
import Tag from "@/components/Tag";
import { guardarClienteAction } from "@/app/actions/maestros";
import { mensajeRut } from "@/lib/ui/formato";
import type { Cliente, Sucursal } from "@/lib/types";

export default function ClientesTable({ clientes, sucursales }: { clientes: Cliente[]; sucursales: Sucursal[] }) {
  const nSucursales = (clienteId: number) => sucursales.filter((s) => s.clienteId === clienteId).length;

  return (
    <MaestroTable<Cliente>
      kicker="Maestros"
      title="Clientes"
      addLabel="Nuevo cliente"
      editLabel="Editar cliente"
      dialogoKicker="Maestro · cliente"
      nota="El RUT no se puede repetir."
      phBusqueda="Buscar cliente o RUT…"
      rows={clientes}
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
        { k: "rut", label: "RUT", tipo: "rut", ph: "76.123.456-7" },
        { k: "nombreFantasia", label: "Nombre fantasía" },
        { k: "activo", label: "Estado", tipo: "toggle" },
      ]}
      validar={(f) => {
        if (!String(f.razonSocial).trim() || !String(f.rut).trim()) return "Razón social y RUT son obligatorios";
        // El dígito verificador se valida al crear: un RUT mal tecleado deja al
        // cliente duplicado y sin forma de cruzarlo con la facturación.
        return mensajeRut(String(f.rut));
      }}
      toFormValues={(c) => ({
        nombreFantasia: c.nombreFantasia,
        razonSocial: c.razonSocial,
        rut: c.rut,
        activo: c.activo,
      })}
      guardarAction={(id, f) =>
        guardarClienteAction(id, {
          rut: String(f.rut).trim(),
          razonSocial: String(f.razonSocial).trim(),
          nombreFantasia: String(f.nombreFantasia).trim() || String(f.razonSocial).trim(),
          activo: f.activo !== false,
        })
      }
      emptyRow={{ nombreFantasia: "", razonSocial: "", rut: "", activo: true }}
    />
  );
}
