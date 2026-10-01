"use client";

import MaestroTable from "@/components/admin/MaestroTable";
import Tag from "@/components/Tag";
import { guardarClienteAction } from "@/app/actions/maestros";
import { mensajeRut, rutLimpio } from "@/lib/ui/formato";
import type { Cliente, Sucursal } from "@/lib/types";

export default function ClientesTable({ clientes, sucursales }: { clientes: Cliente[]; sucursales: Sucursal[] }) {
  const nSucursales = (clienteId: number) => sucursales.filter((s) => s.clienteId === clienteId).length;

  return (
    <MaestroTable<Cliente>
      kicker="Maestros"
      title="Clientes"
      modulo="clientes"
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
          render: (c) => (
            <>
              <Tag variant={c.activo ? "accent" : "neutral"}>{c.activo ? "Activo" : "Inactivo"}</Tag>
              {!c.activo && c.motivoInactivo ? (
                <div className="text-[11px] leading-[1.4] opacity-66 mt-1 max-w-[260px]">{c.motivoInactivo}</div>
              ) : null}
            </>
          ),
        },
      ]}
      fields={[
        { k: "razonSocial", label: "Razón social", span: 2 },
        { k: "rut", label: "RUT", tipo: "rut", ph: "76.123.456-7" },
        { k: "nombreFantasia", label: "Nombre fantasía" },
        { k: "activo", label: "Estado", tipo: "toggle", span: 2 },
        {
          k: "motivoInactivo",
          label: "¿Por qué se desactiva?",
          tipo: "area",
          span: 2,
          ph: "Término de contrato, deuda, cierre de la empresa…",
          ayuda: "Obligatorio para dejar al cliente inactivo. Se borra si se reactiva.",
          visible: (f) => f.activo === false,
        },
        { k: "notas", label: "Notas", tipo: "area", span: 2, ph: "Lo que conviene saber de este cliente" },
      ]}
      validar={(f, id) => {
        if (!String(f.razonSocial).trim() || !String(f.rut).trim()) return "Razón social y RUT son obligatorios";
        if (f.activo === false && !String(f.motivoInactivo ?? "").trim()) {
          return "Explica por qué se desactiva el cliente";
        }
        // El dígito verificador se valida al crear: un RUT mal tecleado deja al
        // cliente duplicado y sin forma de cruzarlo con la facturación.
        const error = mensajeRut(String(f.rut));
        if (error) return error;
        // El RUT es único entre empresas. Se avisa acá, con la lista que ya
        // está en pantalla, para no hacer el viaje al servidor solo para eso.
        const limpio = rutLimpio(String(f.rut));
        const repetido = clientes.find((c) => c.id !== id && rutLimpio(c.rut) === limpio);
        return repetido
          ? `Ese RUT ya es de «${repetido.nombreFantasia || repetido.razonSocial}». El RUT es único entre empresas.`
          : null;
      }}
      toFormValues={(c) => ({
        nombreFantasia: c.nombreFantasia,
        razonSocial: c.razonSocial,
        rut: c.rut,
        activo: c.activo,
        motivoInactivo: c.motivoInactivo ?? "",
        notas: c.notas ?? "",
      })}
      guardarAction={(id, f) =>
        guardarClienteAction(id, {
          rut: String(f.rut).trim(),
          razonSocial: String(f.razonSocial).trim(),
          nombreFantasia: String(f.nombreFantasia).trim() || String(f.razonSocial).trim(),
          activo: f.activo !== false,
          motivoInactivo: String(f.motivoInactivo ?? "").trim() || null,
          notas: String(f.notas ?? "").trim() || null,
        })
      }
      emptyRow={{ nombreFantasia: "", razonSocial: "", rut: "", activo: true, motivoInactivo: "", notas: "" }}
    />
  );
}
