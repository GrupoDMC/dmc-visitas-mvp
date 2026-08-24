"use client";

import { useState } from "react";
import Pestanas from "@/components/admin/Pestanas";
import UsuariosTable from "@/components/admin/maestros/UsuariosTable";
import SolicitudesPasswordView from "@/components/admin/SolicitudesPasswordView";
import type { SolicitudPassword, Tecnico, Usuario } from "@/lib/types";

/**
 * Usuarios, con sus dos caras en la misma pantalla.
 *
 * "Contraseñas pedidas" era una entrada suelta en Operación, lejos de donde se
 * administran las cuentas. Es parte de lo mismo —quién entra al sistema y con
 * qué clave—, así que vive acá, como una pestaña: se atiende la solicitud y se
 * salta a la ficha del usuario sin cambiar de sección.
 */

type Vista = "cuentas" | "contrasenas";

export default function UsuariosView({
  usuarios,
  tecnicos,
  solicitudes,
  vistaInicial = "cuentas",
}: {
  usuarios: Usuario[];
  tecnicos: Tecnico[];
  solicitudes: SolicitudPassword[];
  vistaInicial?: Vista;
}) {
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const pendientes = solicitudes.filter((s) => s.estado === "PENDIENTE").length;

  const pestanas = (
    <Pestanas
      activa={vista}
      onCambiar={(v) => setVista(v as Vista)}
      pestanas={[
        { clave: "cuentas", label: "Cuentas", n: usuarios.length },
        { clave: "contrasenas", label: "Contraseñas pedidas", n: pendientes, urgente: true },
      ]}
    />
  );

  return vista === "cuentas" ? (
    <UsuariosTable usuarios={usuarios} tecnicos={tecnicos} pestanas={pestanas} />
  ) : (
    <SolicitudesPasswordView solicitudes={solicitudes} pestanas={pestanas} />
  );
}
