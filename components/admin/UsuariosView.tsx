"use client";

import { useState } from "react";
import Pestanas from "@/components/admin/Pestanas";
import UsuariosTable from "@/components/admin/maestros/UsuariosTable";
import SolicitudesPasswordView from "@/components/admin/SolicitudesPasswordView";
import RolesView from "@/components/admin/RolesView";
import { puede, useReferencias } from "@/lib/ui/referencias";
import type { Rol, SolicitudPassword, Tecnico, Usuario } from "@/lib/types";

/**
 * Usuarios, con sus tres caras en la misma pantalla: las cuentas, las
 * contraseñas pedidas y los roles con sus permisos. Las dos últimas pestañas
 * solo aparecen si el rol de quien mira las puede usar.
 *
 * "Contraseñas pedidas" era una entrada suelta en Operación, lejos de donde se
 * administran las cuentas. Es parte de lo mismo —quién entra al sistema y con
 * qué clave—, así que vive acá, como una pestaña: se atiende la solicitud y se
 * salta a la ficha del usuario sin cambiar de sección.
 */

type Vista = "cuentas" | "contrasenas" | "roles";

export default function UsuariosView({
  usuarios,
  tecnicos,
  solicitudes,
  roles,
  vistaInicial = "cuentas",
}: {
  usuarios: Usuario[];
  tecnicos: Tecnico[];
  solicitudes: SolicitudPassword[];
  /** null si la base todavía no tiene la migración 008. */
  roles: Rol[] | null;
  vistaInicial?: Vista;
}) {
  const ref = useReferencias();
  const verContrasenas = puede(ref, "usuarios.contrasenas");
  const verRoles = puede(ref, "usuarios.roles");
  const [elegida, setVista] = useState<Vista>(vistaInicial);
  const vista: Vista =
    (elegida === "contrasenas" && !verContrasenas) || (elegida === "roles" && !verRoles) ? "cuentas" : elegida;
  const pendientes = solicitudes.filter((s) => s.estado === "PENDIENTE").length;

  const pestanas = (
    <Pestanas
      activa={vista}
      onCambiar={(v) => setVista(v as Vista)}
      pestanas={[
        { clave: "cuentas", label: "Cuentas", n: usuarios.length },
        ...(verContrasenas
          ? [{ clave: "contrasenas", label: "Contraseñas pedidas", n: pendientes, urgente: true }]
          : []),
        ...(verRoles ? [{ clave: "roles", label: "Roles y permisos", n: roles?.length }] : []),
      ]}
    />
  );

  return vista === "cuentas" ? (
    <UsuariosTable usuarios={usuarios} tecnicos={tecnicos} roles={roles ?? []} pestanas={pestanas} />
  ) : vista === "roles" ? (
    <RolesView roles={roles} pestanas={pestanas} />
  ) : (
    <SolicitudesPasswordView solicitudes={solicitudes} pestanas={pestanas} />
  );
}
