"use client";

import MaestroTable from "@/components/admin/MaestroTable";
import { usuarios, tecnicos, credencialesDemo, getTecnicoById } from "@/lib/mock/maestros";
import Tag from "@/components/Tag";
import type { Usuario } from "@/lib/types";

const ROL_LABEL: Record<string, string> = { ADMIN: "Administrador", COORDINADOR: "Coordinador", TECNICO: "Técnico" };
const SIN_TECNICO = "—";

export default function UsuariosPage() {
  return (
    <MaestroTable<Usuario>
      kicker="Maestros"
      title="Usuarios"
      addLabel="Nuevo usuario"
      editLabel="Editar usuario"
      dialogoKicker="Maestro · usuario"
      nota="Si el rol es TÉCNICO, hay que vincularlo con un técnico de la lista."
      phBusqueda="Buscar correo o rol…"
      initialRows={usuarios}
      searchKeys={(u) => `${u.email} ${u.rol} ${u.tecnicoId ? getTecnicoById(u.tecnicoId)?.nombreCompleto ?? "" : ""}`}
      columns={[
        { key: "email", label: "Correo" },
        {
          key: "rol",
          label: "Rol",
          render: (u) => (
            <Tag variant={u.rol === "ADMIN" ? "outline" : u.rol === "COORDINADOR" ? "accent" : "neutral"}>
              {ROL_LABEL[u.rol]}
            </Tag>
          ),
        },
        {
          key: "tecnico",
          label: "Técnico vinculado",
          render: (u) => (u.tecnicoId ? getTecnicoById(u.tecnicoId)?.nombreCompleto ?? SIN_TECNICO : SIN_TECNICO),
        },
        { key: "password", label: "Contraseña", render: () => <span className="opacity-45">••••••</span> },
        {
          key: "activo",
          label: "Estado",
          render: (u) => <Tag variant={u.activo ? "accent" : "neutral"}>{u.activo ? "Activo" : "Inactivo"}</Tag>,
        },
      ]}
      fields={[
        { k: "email", label: "Correo", span: 2, tipo: "email" },
        {
          k: "rol",
          label: "Rol",
          tipo: "select",
          opciones: [
            { v: "ADMIN", t: "Administrador" },
            { v: "COORDINADOR", t: "Coordinador" },
            { v: "TECNICO", t: "Técnico" },
          ],
        },
        {
          k: "tecnicoId",
          label: "Técnico vinculado",
          tipo: "select",
          opciones: [
            { v: "", t: SIN_TECNICO },
            ...tecnicos.map((t) => ({ v: String(t.id), t: t.nombreCompleto })),
          ],
        },
        {
          k: "password",
          label: "Contraseña",
          tipo: "password",
          ph: "Sin definir",
          ayuda: "Haz clic en el ojo para ver la contraseña actual.",
        },
        { k: "activo", label: "Estado", tipo: "toggle" },
      ]}
      validar={(f) => {
        if (!String(f.email).includes("@")) return "Escribe un correo válido";
        if (f.rol === "TECNICO" && !f.tecnicoId) return "Un usuario TÉCNICO necesita técnico vinculado";
        return null;
      }}
      toFormValues={(u) => ({
        email: u.email,
        rol: u.rol,
        tecnicoId: u.tecnicoId ? String(u.tecnicoId) : "",
        password: credencialesDemo[u.email] ?? "",
        activo: u.activo,
      })}
      fromFormValues={(f, id) => ({
        id,
        email: String(f.email),
        rol: f.rol as Usuario["rol"],
        tecnicoId: f.rol === "TECNICO" && f.tecnicoId ? Number(f.tecnicoId) : null,
        activo: f.activo !== false,
        ultimoAccesoEn: null,
      })}
      emptyRow={{ email: "", rol: "COORDINADOR", tecnicoId: "", password: "", activo: true }}
    />
  );
}
