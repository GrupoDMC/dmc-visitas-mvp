import AdminHeader from "@/components/admin/AdminHeader";

/** Lo que ve quien entra a un módulo que su rol no puede abrir. */
export default function SinAcceso() {
  return (
    <>
      <AdminHeader kicker="Acceso" title="Sin acceso a esta sección" />
      <div className="px-4 md:px-7 py-14 max-w-[60ch]">
        <div className="font-extrabold text-[17px] mb-1.5">Tu rol no tiene permiso para ver esta sección</div>
        <div className="text-[13px] leading-[1.6] opacity-66">
          Si la necesitas, pídele a un administrador que le agregue el permiso a tu rol en Usuarios › Roles y
          permisos. El cambio corre de inmediato, sin volver a iniciar sesión.
        </div>
      </div>
    </>
  );
}
