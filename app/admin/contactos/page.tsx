import ContactosLista from "@/components/admin/contactos/ContactosLista";
import SinAcceso from "@/components/admin/SinAcceso";
import { sesionCon } from "@/lib/auth";
import { listarContactos } from "@/lib/data/contactos";

export const dynamic = "force-dynamic";

export default async function ContactosPage() {
  if (!(await sesionCon("contactos.ver"))) return <SinAcceso />;
  return <ContactosLista contactos={await listarContactos()} />;
}
