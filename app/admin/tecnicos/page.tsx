"use client";

import MaestroTable from "@/components/admin/MaestroTable";
import { tecnicos } from "@/lib/mock/maestros";
import Tag from "@/components/Tag";
import type { Tecnico } from "@/lib/types";

export default function TecnicosPage() {
  return (
    <MaestroTable<Tecnico>
      kicker="Maestros"
      title="Técnicos"
      addLabel="Nuevo técnico"
      editLabel="Editar técnico"
      dialogoKicker="Maestro · técnico"
      nota="El RUT y el correo no se pueden repetir. Todos los técnicos salen desde la oficina central, así que no se asigna zona."
      phBusqueda="Buscar técnico, RUT, correo…"
      initialRows={tecnicos}
      searchKeys={(t) => `${t.nombreCompleto} ${t.rut} ${t.email} ${t.telefono ?? ""}`}
      columns={[
        { key: "nombreCompleto", label: "Nombre" },
        { key: "rut", label: "RUT" },
        { key: "email", label: "Correo" },
        { key: "telefono", label: "Teléfono" },
        {
          key: "activo",
          label: "Estado",
          render: (t) => <Tag variant={t.activo ? "accent" : "neutral"}>{t.activo ? "Activo" : "Inactivo"}</Tag>,
        },
      ]}
      fields={[
        { k: "nombres", label: "Nombres" },
        { k: "rut", label: "RUT", ph: "11.111.111-1" },
        { k: "apellidoPaterno", label: "Apellido paterno" },
        { k: "apellidoMaterno", label: "Apellido materno" },
        { k: "email", label: "Correo", tipo: "email" },
        { k: "telefono", label: "Teléfono", tipo: "tel", ph: "+56 9" },
        { k: "activo", label: "Estado", span: 2, tipo: "toggle" },
      ]}
      validar={(f) =>
        !String(f.nombres).trim() || !String(f.rut).trim() || !String(f.email).trim()
          ? "Nombre, RUT y correo son obligatorios"
          : null
      }
      toFormValues={(t) => ({
        nombres: t.nombres,
        apellidoPaterno: t.apellidoPaterno,
        apellidoMaterno: t.apellidoMaterno ?? "",
        rut: t.rut,
        email: t.email,
        telefono: t.telefono ?? "",
        activo: t.activo,
      })}
      fromFormValues={(f, id) => ({
        id,
        nombres: String(f.nombres),
        apellidoPaterno: String(f.apellidoPaterno),
        apellidoMaterno: String(f.apellidoMaterno) || null,
        nombreCompleto: `${f.nombres} ${f.apellidoPaterno}`.trim(),
        rut: String(f.rut),
        email: String(f.email),
        telefono: String(f.telefono) || null,
        activo: f.activo !== false,
      })}
      emptyRow={{
        nombres: "",
        apellidoPaterno: "",
        apellidoMaterno: "",
        rut: "",
        email: "",
        telefono: "",
        activo: true,
      }}
    />
  );
}
