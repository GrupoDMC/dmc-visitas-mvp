import Link from "next/link";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { getVisitasPorTecnico } from "@/lib/mock/visitas";
import { HOY } from "@/lib/mock/queries";
import MobileShell from "@/components/mobile/MobileShell";
import Tag from "@/components/Tag";
import { ESTADO_VISITA_LABEL, ESTADO_VISITA_TAG } from "@/lib/ui/estado";

export default async function InicioPage() {
  const sesion = await getSesion();
  if (!sesion?.tecnico) redirect("/login");

  const visitas = getVisitasPorTecnico(sesion.tecnico.id);
  const deHoy = visitas.filter((v) => v.fechaProgramada === HOY);
  const nHoy = deHoy.length;
  const nCurso = deHoy.filter((v) => v.estado === "EN_CURSO").length;
  const nPend = deHoy.filter((v) => v.estado === "PROGRAMADA" || v.estado === "PENDIENTE").length;

  const proxima = [...deHoy]
    .filter((v) => v.estado === "PROGRAMADA" || v.estado === "EN_CURSO")
    .sort((a, b) => (a.horaProgramada ?? "99:99").localeCompare(b.horaProgramada ?? "99:99"))[0];

  const fechaHoy = new Date(`${HOY}T00:00:00`).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <MobileShell titulo="Inicio">
      <div className="px-4 pt-[22px] pb-[26px] animate-fade-in">
        <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)] capitalize">{fechaHoy}</div>
        <h1 className="font-extrabold text-[32px] leading-[1.06] tracking-[-.03em] mt-2 mb-1.5">
          Hola,
          <br />
          {sesion.tecnico.nombres}
        </h1>
        <p className="m-0 text-[13px] opacity-66">
          {sesion.tecnico.rut} · Técnico de terreno · {sesion.tecnico.email}
        </p>

        <div className="h-0.5 bg-[var(--color-divider)] mt-5" />
        <div className="grid grid-cols-3">
          <div className="py-3.5 pr-3 border-r border-black/[.2]">
            <div className="font-extrabold text-[30px] leading-none tabular-nums">{nHoy}</div>
            <div className="text-[10px] tracking-[.09em] uppercase opacity-66 mt-1.5">Visitas hoy</div>
          </div>
          <div className="py-3.5 px-3 border-r border-black/[.2]">
            <div className="font-extrabold text-[30px] leading-none tabular-nums text-[var(--color-accent)]">{nCurso}</div>
            <div className="text-[10px] tracking-[.09em] uppercase opacity-66 mt-1.5">En curso</div>
          </div>
          <div className="py-3.5 pl-3">
            <div className="font-extrabold text-[30px] leading-none tabular-nums">{nPend}</div>
            <div className="text-[10px] tracking-[.09em] uppercase opacity-66 mt-1.5">Por cerrar</div>
          </div>
        </div>
        <div className="h-0.5 bg-[var(--color-divider)]" />

        {proxima ? (
          <>
            <div className="text-[10px] tracking-[.15em] uppercase opacity-66 mt-6.5 mb-2.5">Tu próxima visita</div>
            <div className="border border-[var(--color-divider)] border-l-[5px] border-l-[var(--color-accent)] bg-[var(--color-surface)] px-4 pt-4 pb-3.5">
              <div className="flex items-baseline gap-2.5">
                <div className="font-extrabold text-[22px] leading-none tabular-nums">{proxima.horaProgramada ?? "—"}</div>
                <div className="text-[11px] tracking-[.08em] tabular-nums opacity-62">{proxima.folio}</div>
                <Tag variant={ESTADO_VISITA_TAG[proxima.estado]} className="ml-auto">
                  {ESTADO_VISITA_LABEL[proxima.estado]}
                </Tag>
              </div>
              <div className="font-extrabold text-[19px] leading-[1.15] mt-2.5">{proxima.sucursal?.nombre}</div>
              <div className="text-[13px] opacity-60 mt-0.5">
                {proxima.cliente?.nombreFantasia} · {proxima.sucursal?.direccion}
              </div>
              <div className="h-px bg-[var(--color-divider-soft)] my-3.5" />
              <div className="flex flex-col gap-1.5 text-[13px]">
                <div className="flex gap-2">
                  <span className="text-[10px] tracking-[.08em] uppercase opacity-60 min-w-[78px]">Motivo</span>
                  <span>{proxima.motivo?.nombre}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-[10px] tracking-[.08em] uppercase opacity-60 min-w-[78px]">Responsable</span>
                  <span>{proxima.responsableNombre ?? "—"}</span>
                </div>
              </div>
              <Link
                href={`/tecnico/visitas/${proxima.folio}`}
                className="w-full min-h-[54px] flex items-center justify-between px-4 mt-4 bg-[var(--color-accent)] text-[var(--color-bg)] font-extrabold text-[15px] hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-active)]"
              >
                <span>Abrir visita</span>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </>
        ) : null}

        <Link
          href="/tecnico/visitas"
          className="w-full min-h-[52px] flex items-center justify-between px-4 mt-3 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm hover:bg-black/[.07]"
        >
          <span>Ver todas mis visitas</span>
          <span className="tabular-nums opacity-62">{visitas.length}</span>
        </Link>
      </div>
    </MobileShell>
  );
}
