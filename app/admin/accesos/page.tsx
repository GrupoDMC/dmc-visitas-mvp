import { redirect } from "next/navigation";

// "Contraseñas pedidas" dejó de ser una sección aparte: ahora es una pestaña de
// Usuarios, que es donde se administran las cuentas. Esta ruta queda solo para
// que los enlaces y favoritos viejos sigan llegando a alguna parte.
export default function AccesosPage() {
  redirect("/admin/usuarios?vista=contrasenas");
}
