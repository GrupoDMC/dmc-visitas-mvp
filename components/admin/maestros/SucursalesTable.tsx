"use client";

import MaestroTable from "@/components/admin/MaestroTable";
import Tag from "@/components/Tag";
import { guardarSucursalAction } from "@/app/actions/maestros";
import type { Cliente, Sucursal } from "@/lib/types";

// Las 16 regiones de Chile, de norte a sur.
const REGIONES = [
  "Arica y Parinacota",
  "Tarapacá",
  "Antofagasta",
  "Atacama",
  "Coquimbo",
  "Valparaíso",
  "Metropolitana",
  "Libertador General Bernardo O'Higgins",
  "Maule",
  "Ñuble",
  "Biobío",
  "La Araucanía",
  "Los Ríos",
  "Los Lagos",
  "Aysén del General Carlos Ibáñez del Campo",
  "Magallanes y de la Antártica Chilena",
];

export default function SucursalesTable({ sucursales, clientes }: { sucursales: Sucursal[]; clientes: Cliente[] }) {
  const nombreCliente = (id: number) => clientes.find((c) => c.id === id)?.nombreFantasia ?? "—";

  return (
    <MaestroTable<Sucursal>
      kicker="Maestros"
      title="Sucursales"
      addLabel="Nueva sucursal"
      editLabel="Editar sucursal"
      dialogoKicker="Maestro · sucursal"
      nota="La sucursal siempre pertenece a un cliente y no se puede dejar sin él."
      phBusqueda="Buscar sucursal, comuna, código…"
      rows={sucursales}
      searchKeys={(s) => `${s.nombre} ${s.codigo} ${s.comuna} ${s.direccion} ${nombreCliente(s.clienteId)}`}
      columns={[
        { key: "nombre", label: "Sucursal" },
        { key: "cliente", label: "Cliente", render: (s) => nombreCliente(s.clienteId) },
        { key: "codigo", label: "Código" },
        { key: "direccion", label: "Dirección" },
        { key: "comuna", label: "Comuna" },
        {
          key: "activo",
          label: "Estado",
          render: (s) => <Tag variant={s.activo ? "accent" : "neutral"}>{s.activo ? "Activa" : "Inactiva"}</Tag>,
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
        { k: "codigo", label: "Código interno", ph: "MS-118" },
        { k: "telefono", label: "Teléfono", tipo: "tel", ph: "+56 2 2299 4100" },
        { k: "direccion", label: "Dirección", span: 2 },
        { k: "comuna", label: "Comuna" },
        { k: "region", label: "Región", tipo: "select", opciones: REGIONES.map((r) => ({ v: r, t: r })) },
        { k: "activo", label: "Estado", tipo: "toggle" },
      ]}
      validar={(f) => (!String(f.nombre).trim() || !f.clienteId ? "Nombre y cliente son obligatorios" : null)}
      toFormValues={(s) => ({
        clienteId: String(s.clienteId),
        nombre: s.nombre,
        codigo: s.codigo,
        direccion: s.direccion,
        comuna: s.comuna,
        region: s.region,
        telefono: s.telefono ?? "",
        activo: s.activo,
      })}
      guardarAction={(id, f) =>
        guardarSucursalAction(id, {
          clienteId: Number(f.clienteId),
          nombre: String(f.nombre).trim(),
          codigo: String(f.codigo).trim(),
          direccion: String(f.direccion).trim(),
          comuna: String(f.comuna).trim(),
          region: String(f.region),
          telefono: String(f.telefono).trim() || null,
          activo: f.activo !== false,
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
      }}
    />
  );
}
