import { notFound, redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { getVisitaCompletaPorFolio } from "@/lib/data/visitas";
import { listarProblemas, listarTrabajos } from "@/lib/data/catalogos";
import MobileShell from "@/components/mobile/MobileShell";
import Tag from "@/components/Tag";
import { ESTADO_PROBLEMA_LABEL, ESTADO_PROBLEMA_TAG } from "@/lib/ui/estado";
import { nombreProblema, nombreTrabajo } from "@/lib/ui/referencias";

export const dynamic = "force-dynamic";

export default async function RevisarActaPage({ params }: { params: Promise<{ folio: string }> }) {
  const { folio: folioParam } = await params;
  const folio = decodeURIComponent(folioParam);
  const sesion = await getSesion();
  if (!sesion?.tecnico) redirect("/login");

  const visita = await getVisitaCompletaPorFolio(folio);
  if (!visita || visita.tecnicoId !== sesion.tecnico.id) notFound();

  const [catalogoTrabajos, catalogoProblemas] = await Promise.all([listarTrabajos(), listarProblemas()]);

  return (
    <MobileShell titulo="Acta guardada" volverHref={`/tecnico/visitas/${visita.folio}`}>
      <div className="animate-fade-in">
        <div className="px-4 pt-5">
          <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">Acta de visita</div>
          <h1 className="font-extrabold text-[26px] leading-[1.1] tracking-[-.02em] mt-2 mb-0.5">{visita.sucursal?.nombre}</h1>
          <div className="text-sm opacity-60">{visita.cliente?.nombreFantasia}</div>
        </div>

        <div className="mx-4 mt-4 border border-[var(--color-divider)] bg-[var(--color-surface-3)] px-4 pt-1 pb-4">
          <Fila k="Motivo" v={visita.motivo?.nombre} />
          <Fila k="Técnico" v={visita.tecnico?.nombreCompleto} />
          <Fila k="Fecha" v={visita.fechaProgramada} />
          {visita.ejecucion?.observaciones ? <Fila k="Observación" v={visita.ejecucion.observaciones} /> : null}

          {visita.trabajos && visita.trabajos.length > 0 ? (
            <div className="pt-3">
              <div className="text-[11px] tracking-[.1em] uppercase opacity-66 mb-2">Trabajo realizado</div>
              {visita.trabajos.map((t) => (
                <div key={t.id} className="border-l-[3px] border-[var(--color-text)] pl-3 mb-2.5">
                  <div className="font-extrabold text-[15px] leading-[1.25]">
                    {nombreTrabajo(catalogoTrabajos, t.trabajoCodigo)}
                  </div>
                  {t.subtrabajos.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {t.subtrabajos.map((s) => (
                        <span key={s.id} className="px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2]">
                          {s.etiqueta}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {t.detalle ? <div className="text-sm opacity-72 mt-1.5">{t.detalle}</div> : null}
                </div>
              ))}
            </div>
          ) : null}

          {visita.problemas && visita.problemas.length > 0 ? (
            <div className="pt-3">
              <div className="text-[11px] tracking-[.1em] uppercase opacity-66 mb-2">Problemas</div>
              {visita.problemas.map((p) => (
                <div key={p.id} className="px-3 py-3 mb-2 bg-[var(--color-accent-200)] border-l-[3px] border-[var(--color-accent)]">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <div className="font-extrabold text-sm leading-[1.25] text-[var(--color-accent-800)]">
                      {nombreProblema(catalogoProblemas, p.tipoCodigo)}
                    </div>
                    <Tag variant={ESTADO_PROBLEMA_TAG[p.estado]} className="ml-auto">
                      {ESTADO_PROBLEMA_LABEL[p.estado]}
                    </Tag>
                  </div>
                  {p.descripcion ? (
                    <div className="text-[13px] leading-[1.5] text-[var(--color-accent-800)] mt-1.5">{p.descripcion}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {visita.firmas && visita.firmas.length > 0 ? (
            <div className="pt-4">
              <div className="h-px bg-[var(--color-text)] mt-8" />
              <div className="text-xs mt-1">{visita.firmas[0].nombre}</div>
              <div className="text-[10px] tracking-[.09em] uppercase opacity-62">Tienda</div>
            </div>
          ) : null}
        </div>
      </div>
    </MobileShell>
  );
}

function Fila({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className="py-2.5 border-b border-black/[.2]">
      <div className="text-[11px] tracking-[.1em] uppercase opacity-66">{k}</div>
      <div className="text-sm mt-1">{v || "—"}</div>
    </div>
  );
}
