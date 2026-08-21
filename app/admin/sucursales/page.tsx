"use client";

import MaestroTable from "@/components/admin/MaestroTable";
import { sucursales, clientes, getClienteById } from "@/lib/mock/maestros";
import Tag from "@/components/Tag";
import type { Sucursal } from "@/lib/types";

const REGIONES = ["Metropolitana", "Valparaíso", "Biobío", "Coquimbo", "Maule", "Antofagasta"];

export default function SucursalesPage() {
  return (
    <MaestroTable<Sucursal>
      kicker="Maestros"
      title="Sucursales"
      addLabel="Nueva sucursal"
      editLabel="Editar sucursal"
      dialogoKicker="Maestro · sucursal"
      nota="La sucursal siempre pertenece a un cliente y no se puede dejar sin él."
      phBusqueda="Buscar sucursal, comuna, código…"
      initialRows={sucursales}
      searchKeys={(s) =>
        `${s.nombre} ${s.codigo} ${s.comuna} ${s.direccion} ${getClienteById(s.clienteId)?.nombreFantasia ?? ""}`
      }
      columns={[
        { key: "nombre", label: "Sucursal" },
        { key: "cliente", label: "Cliente", render: (s) => getClienteById(s.clienteId)?.nombreFantasia ?? "—" },
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
      validar={(f) =>
        !String(f.nombre).trim() || !f.clienteId ? "Nombre y cliente son obligatorios" : null
      }
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
      fromFormValues={(f, id) => ({
        id,
        clienteId: Number(f.clienteId),
        nombre: String(f.nombre),
        codigo: String(f.codigo),
        direccion: String(f.direccion),
        comuna: String(f.comuna),
        region: String(f.region),
        telefono: String(f.telefono) || null,
        activo: f.activo !== false,
      })}
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
