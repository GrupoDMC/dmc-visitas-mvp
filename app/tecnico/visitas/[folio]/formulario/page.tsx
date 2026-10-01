import { notFound, redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { getVisitaCompletaPorFolio } from "@/lib/data/visitas";
import { listarInternos, listarMotivos, listarProblemas, listarTrabajos } from "@/lib/data/catalogos";
import { leerBorrador } from "@/lib/data/borradores";
import MobileShell from "@/components/mobile/MobileShell";
import FormularioVisita from "@/components/mobile/FormularioVisita";
import { participaEnVisita, tomadaPorOtro } from "@/lib/ui/estado";

export const dynamic = "force-dynamic";

export default async function FormularioPage({ params }: { params: Promise<{ folio: string }> }) {
  const { folio: folioParam } = await params;
  const folio = decodeURIComponent(folioParam);
  const sesion = await getSesion();
  if (!sesion?.tecnico) redirect("/login");

  const visita = await getVisitaCompletaPorFolio(folio);
  if (!visita || !participaEnVisita(visita, sesion.tecnico.id)) notFound();
  // Si la inició el otro técnico, el formulario es suyo: este vuelve al detalle.
  if ((visita.estado !== "PROGRAMADA" && visita.estado !== "EN_CURSO") || tomadaPorOtro(visita, sesion.tecnico.id)) {
    redirect(`/tecnico/visitas/${visita.folio}`);
  }

  // El borrador respaldado en el servidor: sirve cuando el técnico entra desde
  // otro equipo, o cuando el celular perdió lo que tenía guardado. La copia del
  // propio celular manda si es más nueva; eso lo decide el formulario.
  const [motivos, trabajos, problemas, internos, borrador] = await Promise.all([
    listarMotivos(),
    listarTrabajos(),
    listarProblemas(),
    listarInternos(),
    leerBorrador(folio, sesion.usuario.id).catch(() => null),
  ]);

  return (
    <MobileShell titulo="Formulario" volverHref={`/tecnico/visitas/${visita.folio}`}>
      <FormularioVisita
        visita={visita}
        motivos={motivos}
        catalogoTrabajo={trabajos}
        catalogoProblema={problemas}
        catalogoInterno={internos}
        borradorServidor={borrador}
      />
    </MobileShell>
  );
}
