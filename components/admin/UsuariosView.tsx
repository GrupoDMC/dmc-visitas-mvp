"use client";

import { useState } from "react";
import Pestanas from "@/components/admin/Pestanas";
import UsuariosTable from "@/components/admin/maestros/UsuariosTable";
import SolicitudesPasswordView from "@/components/admin/SolicitudesPasswordView";
import RolesView from "@/components/admin/RolesView";
import TecnicosTable from "@/components/admin/maestros/TecnicosTable";
import { puede, useReferencias } from "@/lib/ui/referencias";
import type { Rol, SolicitudPassword, Tecnico, Usuario } from "@/lib/types";

/**
 * Usuarios, con sus cuatro caras en la misma pantalla: las cuentas, los
 * técnicos, las contraseñas pedidas y los roles con sus permisos. Cada pestaña
 * aparece solo si el rol de quien mira la puede usar.
 *
 * «Técnicos» era un maestro suelto en el menú, lejos de las cuentas que lo
 * usan (cada cuenta de técnico se vincula a uno de esta lista).
 *
 * "Contraseñas pedidas" era una entrada suelta en Operación, lejos de donde se
 * administran las cuentas. Es parte de lo mismo —quién entra al sistema y con
 * qué clave—, así que vive acá, como una pestaña: se atiende la solicitud y se
 * salta a la ficha del usuario sin cambiar de sección.
 */

type Vista = "cuentas" | "tecnicos" | "contrasenas" | "roles";

export default function UsuariosView({
  usuarios,
  tecnicos,
  solicitudes,
  roles,
  permisosCelular,
  vistaInicial = "cuentas",
}: {
  usuarios: Usuario[];
  tecnicos: Tecnico[];
  solicitudes: SolicitudPassword[];
  /** null si la base todavía no tiene la migración 008. */
  roles: Rol[] | null;
  /** Lo que pueden hacer los técnicos desde el celular. */
  permisosCelular: string[];
  vistaInicial?: Vista;
}) {
  const ref = useReferencias();
  const verContrasenas = puede(ref, "usuarios.contrasenas");
  const verRoles = puede(ref, "usuarios.roles");
  const verCuentas = puede(ref, "usuarios.ver");
  const verTecnicos = puede(ref, "tecnicos.ver");
  const [elegida, setVista] = useState<Vista>(vistaInicial);
  const permitida = (v: Vista) =>
    v === "cuentas" ? verCuentas : v === "tecnicos" ? verTecnicos : v === "contrasenas" ? verContrasenas : verRoles;
  // Si la pestaña pedida no se puede abrir, cae en la primera que sí.
  const vista: Vista = permitida(elegida)
    ? elegida
    : (["cuentas", "tecnicos", "contrasenas", "roles"] as Vista[]).find(permitida) ?? "cuentas";
  const pendientes = solicitudes.filter((s) => s.estado === "PENDIENTE").length;

  const pestanas = (
    <Pestanas
      activa={vista}
      onCambiar={(v) => setVista(v as Vista)}
      pestanas={[
        ...(verCuentas ? [{ clave: "cuentas", label: "Cuentas", n: usuarios.length }] : []),
        ...(verTecnicos ? [{ clave: "tecnicos", label: "Técnicos", n: tecnicos.length }] : []),
        ...(verContrasenas
          ? [{ clave: "contrasenas", label: "Contraseñas pedidas", n: pendientes, urgente: true }]
          : []),
        ...(verRoles ? [{ clave: "roles", label: "Roles y permisos", n: roles?.length }] : []),
      ]}
    />
  );

  return vista === "cuentas" ? (
    <UsuariosTable usuarios={usuarios} tecnicos={tecnicos} roles={roles ?? []} pestanas={pestanas} />
  ) : vista === "tecnicos" ? (
    <TecnicosTable tecnicos={tecnicos} pestanas={pestanas} />
  ) : vista === "roles" ? (
    <RolesView roles={roles} permisosCelular={permisosCelular} tecnicos={tecnicos.length} pestanas={pestanas} />
  ) : (
    <SolicitudesPasswordView solicitudes={solicitudes} pestanas={pestanas} />
  );
}
