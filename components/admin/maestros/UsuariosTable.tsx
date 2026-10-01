"use client";

import MaestroTable from "@/components/admin/MaestroTable";
import Tag from "@/components/Tag";
import { guardarUsuarioAction } from "@/app/actions/maestros";
import type { Rol, RolUsuario, Tecnico, Usuario } from "@/lib/types";

const ROL_LABEL: Record<string, string> = { ADMIN: "Administrador", COORDINADOR: "Coordinador", TECNICO: "Técnico" };
/** En el formulario, un rol del panel viaja como "R:<id>" junto a ADMIN y TECNICO. */
const PREFIJO_ROL = "R:";
const SIN_TECNICO = "—";

export default function UsuariosTable({
  usuarios,
  tecnicos,
  roles,
  pestanas,
}: {
  usuarios: Usuario[];
  tecnicos: Tecnico[];
  /** Los roles del panel. Vacío si la base no tiene la migración 008. */
  roles: Rol[];
  pestanas?: React.ReactNode;
}) {
  const nombreRol = (u: Usuario) =>
    (u.rol === "COORDINADOR" ? roles.find((r) => r.id === u.rolId)?.nombre : null) ?? ROL_LABEL[u.rol];
  const opcionesRol = [
    { v: "ADMIN", t: "Administrador · acceso total" },
    ...(roles.length
      ? roles.map((r) => ({ v: `${PREFIJO_ROL}${r.id}`, t: r.nombre }))
      : [{ v: "COORDINADOR", t: "Coordinador" }]),
    { v: "TECNICO", t: "Técnico · entra por el celular" },
  ];
  /** "R:5" → { rol: COORDINADOR, rolId: 5 }; el resto va tal cual. */
  const leerRol = (valor: unknown): { rol: RolUsuario; rolId: number | null } => {
    const v = String(valor);
    return v.startsWith(PREFIJO_ROL)
      ? { rol: "COORDINADOR", rolId: Number(v.slice(PREFIJO_ROL.length)) }
      : { rol: v as RolUsuario, rolId: null };
  };
  const nombreTecnico = (id: number | null) =>
    id ? tecnicos.find((t) => t.id === id)?.nombreCompleto ?? SIN_TECNICO : SIN_TECNICO;

  return (
    <MaestroTable<Usuario>
      kicker="Maestros · quién entra al sistema"
      title="Usuarios"
      modulo="usuarios"
      pestanas={pestanas}
      addLabel="Nuevo usuario"
      editLabel="Editar usuario"
      dialogoKicker="Maestro · usuario"
      nota="El rol decide qué puede hacer la persona en el panel; se arma en la pestaña Roles y permisos. Si el rol es TÉCNICO, hay que vincularlo con un técnico de la lista. Las contraseñas se guardan cifradas: no se pueden consultar, solo reemplazar."
      phBusqueda="Buscar correo o rol…"
      rows={usuarios}
      searchKeys={(u) => `${u.email} ${u.rol} ${nombreRol(u)} ${nombreTecnico(u.tecnicoId)}`}
      columns={[
        { key: "email", label: "Correo" },
        {
          key: "rol",
          label: "Rol",
          render: (u) => (
            <Tag variant={u.rol === "ADMIN" ? "outline" : u.rol === "COORDINADOR" ? "accent" : "neutral"}>
              {nombreRol(u)}
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
          opciones: opcionesRol,
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
        rol: u.rol === "COORDINADOR" && u.rolId ? `${PREFIJO_ROL}${u.rolId}` : u.rol,
        tecnicoId: u.tecnicoId ? String(u.tecnicoId) : "",
        password: "",
        activo: u.activo,
      })}
      guardarAction={(id, f) =>
        guardarUsuarioAction(id, {
          email: String(f.email).trim().toLowerCase(),
          ...leerRol(f.rol),
          tecnicoId: f.rol === "TECNICO" && f.tecnicoId ? Number(f.tecnicoId) : null,
          activo: f.activo !== false,
          password: String(f.password),
        })
      }
      emptyRow={{ email: "", rol: roles[0] ? `${PREFIJO_ROL}${roles[0].id}` : "COORDINADOR", tecnicoId: "", password: "", activo: true }}
    />
  );
}
