"use client";

import MaestroTable from "@/components/admin/MaestroTable";
import Tag from "@/components/Tag";
import { guardarUsuarioAction } from "@/app/actions/maestros";
import type { RolUsuario, Tecnico, Usuario } from "@/lib/types";

const ROL_LABEL: Record<string, string> = { ADMIN: "Administrador", COORDINADOR: "Coordinador", TECNICO: "Técnico" };
const SIN_TECNICO = "—";

export default function UsuariosTable({
  usuarios,
  tecnicos,
  pestanas,
}: {
  usuarios: Usuario[];
  tecnicos: Tecnico[];
  pestanas?: React.ReactNode;
}) {
  const nombreTecnico = (id: number | null) =>
    id ? tecnicos.find((t) => t.id === id)?.nombreCompleto ?? SIN_TECNICO : SIN_TECNICO;

  return (
    <MaestroTable<Usuario>
      kicker="Maestros · quién entra al sistema"
      title="Usuarios"
      pestanas={pestanas}
      addLabel="Nuevo usuario"
      editLabel="Editar usuario"
      dialogoKicker="Maestro · usuario"
      nota="Si el rol es TÉCNICO, hay que vincularlo con un técnico de la lista. Las contraseñas se guardan cifradas: no se pueden consultar, solo reemplazar."
      phBusqueda="Buscar correo o rol…"
      rows={usuarios}
      searchKeys={(u) => `${u.email} ${u.rol} ${nombreTecnico(u.tecnicoId)}`}
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
        { key: "tecnico", label: "Técnico vinculado", render: (u) => nombreTecnico(u.tecnicoId) },
        {
          key: "ultimoAcceso",
          label: "Último acceso",
          render: (u) =>
            u.ultimoAccesoEn ? (
              <span className="tabular-nums opacity-75">{u.ultimoAccesoEn.slice(0, 16).replace("T", " ")}</span>
            ) : (
              <span className="opacity-45">Nunca</span>
            ),
        },
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
            ...tecnicos.filter((t) => t.activo).map((t) => ({ v: String(t.id), t: t.nombreCompleto })),
          ],
          visible: (f) => f.rol === "TECNICO",
        },
        {
          k: "password",
          label: "Contraseña",
          tipo: "password",
          span: 2,
          ph: "Mínimo 8 caracteres",
          // El hash de bcrypt no se puede revertir: la contraseña actual no se
          // muestra nunca, solo se reemplaza.
          ayuda: "Al editar, déjala vacía para no cambiarla. No hay forma de consultar la contraseña actual.",
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
        password: "",
        activo: u.activo,
      })}
      guardarAction={(id, f) =>
        guardarUsuarioAction(id, {
          email: String(f.email).trim().toLowerCase(),
          rol: f.rol as RolUsuario,
          tecnicoId: f.rol === "TECNICO" && f.tecnicoId ? Number(f.tecnicoId) : null,
          activo: f.activo !== false,
          password: String(f.password),
        })
      }
      emptyRow={{ email: "", rol: "COORDINADOR", tecnicoId: "", password: "", activo: true }}
    />
  );
}
