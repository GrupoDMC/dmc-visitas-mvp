import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSesion, nombreRol } from "@/lib/auth";
import { navegacionPara } from "@/lib/navegacion";
import { ShellApp } from "@/components/shell/shell-app";
import { Toast } from "@/components/ui/toast";

/**
 * Guardia real de la aplicación. El proxy hace un chequeo optimista sobre la
 * cookie; el permiso de verdad se decide acá, donde podemos leer el perfil.
 */
export default async function LayoutApp({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await getSesion();

  // Hay sesión en Supabase pero el perfil no existe o está apagado.
  // /salir borra la cookie y muestra el aviso en el ingreso.
  if (!sesion) redirect("/salir?motivo=deshabilitada");

  return (
    <ShellApp
      nombre={sesion.nombre}
      rol={nombreRol(sesion.rol)}
      items={navegacionPara(sesion.rol)}
    >
      {children}
      {/* Vive en el layout para que cualquier acción que redirija con `?ok=`
          muestre su confirmación sin que la pantalla tenga que saber nada.
          El Suspense es porque lee search params. */}
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
    </ShellApp>
  );
}
