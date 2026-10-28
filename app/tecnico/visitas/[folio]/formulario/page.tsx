import { notFound, redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { getVisitaCompletaPorFolio } from "@/lib/data/visitas";
import { listarInternos, listarMotivos, listarProblemas, listarTrabajos } from "@/lib/data/catalogos";
import { leerBorrador } from "@/lib/data/borradores";
import MobileShell from "@/components/mobile/MobileShell";
import FormularioVisita from "@/components/mobile/FormularioVisita";
import { participaEnVisita } from "@/lib/ui/estado";
import { plazoReservaSeg, tomarReserva } from "@/lib/data/reservas";
import ActaEnCurso from "@/components/mobile/ActaEnCurso";
import { problemasPorResolver } from "@/lib/data/avisos-problema";

export const dynamic = "force-dynamic";

export default async function FormularioPage({ params }: { params: Promise<{ folio: string }> }) {
  const { folio: folioParam } = await params;
  const folio = decodeURIComponent(folioParam);
  const sesion = await getSesion();
  if (!sesion?.tecnico) redirect("/login");

  const visita = await getVisitaCompletaPorFolio(folio);
  if (!visita || !participaEnVisita(visita, sesion.tecnico.id)) notFound();
  if (visita.estado !== "PROGRAMADA" && visita.estado !== "EN_CURSO") {
    redirect(`/tecnico/visitas/${visita.folio}`);
  }

  // Abrir el acta la reserva (o la renueva, si ya era de este técnico). Si el
  // otro técnico la tiene vigente, acá solo se ve quién y desde cuándo.
  const plazoSeg = plazoReservaSeg();
  const reserva = await tomarReserva(visita.folio, { usuarioId: sesion.usuario.id, tecnicoId: sesion.tecnico.id });
  if (!reserva.ok) {
    if (reserva.motivo !== "ajena") redirect(`/tecnico/visitas/${visita.folio}`);
    return (
      <MobileShell titulo="Formulario" volverHref={`/tecnico/visitas/${visita.folio}`}>
        <ActaEnCurso reserva={reserva} plazoSeg={plazoSeg} destacado />
      </MobileShell>
    );
  }

  // El borrador respaldado en el servidor: sirve cuando el técnico entra desde
  // otro equipo, o cuando el celular perdió lo que tenía guardado. La copia del
  // propio celular manda si es más nueva; eso lo decide el formulario.
  const [motivos, trabajos, problemas, internos, borrador, porResolver] = await Promise.all([
    listarMotivos(),
    listarTrabajos(),
    listarProblemas(),
    listarInternos(),
    leerBorrador(folio, sesion.usuario.id).catch(() => null),
    problemasPorResolver(visita.id),
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
        reservaPlazoSeg={plazoSeg}
        porResolver={porResolver}
      />
    </MobileShell>
  );
}
