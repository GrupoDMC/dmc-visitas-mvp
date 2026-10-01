import Link from "next/link";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { getVisitasPorTecnico } from "@/lib/data/visitas";
import { listarMalls, listarSucursales } from "@/lib/data/maestros";
import { diaDeVisita, hoyISO } from "@/lib/ui/fecha";
import MobileShell from "@/components/mobile/MobileShell";
import Tag from "@/components/Tag";
import { ESTADO_VISITA_BARRA, ESTADO_VISITA_LABEL, ESTADO_VISITA_TAG, textoMotivos } from "@/lib/ui/estado";
import type { Visita } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const sesion = await getSesion();
  if (!sesion?.tecnico) redirect("/login");

  const HOY = hoyISO();
  const [visitas, malls, sucursales] = await Promise.all([
    getVisitasPorTecnico(sesion.tecnico.id),
    listarMalls(),
    listarSucursales(),
  ]);
  // Las que tienen margen de días cuentan como de hoy mientras sigan abiertas.
  const deHoy = visitas.filter((v) => diaDeVisita(v, HOY) === HOY);
  const nHoy = deHoy.length;
  const nCurso = deHoy.filter((v) => v.estado === "EN_CURSO").length;
  const nPend = deHoy.filter((v) => v.estado === "PROGRAMADA" || v.estado === "PENDIENTE").length;

  const proxima = [...deHoy]
    .filter((v) => v.estado === "PROGRAMADA" || v.estado === "EN_CURSO")
    .sort((a, b) => (a.horaProgramada ?? "99:99").localeCompare(b.horaProgramada ?? "99:99"))[0];

  // Las visitas de hoy, agrupadas por el mall de su tienda. Las que no están
  // en ningún mall van juntas al final, en «Otras visitas».
  const porHora = (a: Visita, b: Visita) => (a.horaProgramada ?? "99:99").localeCompare(b.horaProgramada ?? "99:99");
  const abierta = (v: Visita) => v.estado === "PROGRAMADA" || v.estado === "EN_CURSO" || v.estado === "PENDIENTE";
  const mallDe = new Map(sucursales.map((s) => [s.id, s.mallId ?? null]));
  const grupos = malls
    .map((m) => ({
      clave: String(m.id),
      nombre: m.nombre,
      direccion: m.direccion as string | null,
      visitas: deHoy.filter((v) => mallDe.get(v.sucursalId) === m.id).sort(porHora),
    }))
    .filter((g) => g.visitas.length > 0);
  const hayMalls = grupos.length > 0;
  const sinMall = deHoy.filter((v) => !grupos.some((g) => g.visitas.includes(v))).sort(porHora);
  if (hayMalls && sinMall.length > 0) {
    grupos.push({ clave: "otras", nombre: "Otras visitas", direccion: null, visitas: sinMall });
  }

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

        {hayMalls ? (
          <>
            <div className="text-[10px] tracking-[.15em] uppercase opacity-66 mt-6.5 mb-2.5">Tus malls de hoy</div>
            <div className="flex flex-col gap-3">
              {grupos.map((g) => {
                const porHacer = g.visitas.filter(abierta).length;
                return (
                  <details
                    key={g.clave}
                    open={grupos.length === 1}
                    className="group border border-[var(--color-divider)] border-l-[5px] border-l-[var(--color-accent)] bg-[var(--color-surface)]"
                  >
                    <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center gap-3 px-4 py-3.5 min-h-[64px]">
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-[19px] leading-[1.15] truncate">{g.nombre}</div>
                        {g.direccion ? <div className="text-[13px] opacity-60 mt-0.5 truncate">{g.direccion}</div> : null}
                        <div className="text-[11px] tracking-[.06em] uppercase opacity-66 mt-1.5 tabular-nums">
                          {g.visitas.length} {g.visitas.length === 1 ? "visita" : "visitas"}
                          {porHacer > 0 ? ` · ${porHacer} por hacer` : " · todas cerradas"}
                        </div>
                      </div>
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        className="flex-none transition-transform group-open:rotate-180"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </summary>
                    <div className="border-t border-[var(--color-divider-soft)]">
                      {g.visitas.map((v) => (
                        <Link
                          key={v.id}
                          href={`/tecnico/visitas/${v.folio}`}
                          className="flex items-center gap-3 px-4 py-3 min-h-[60px] bg-[var(--color-bg)] border-b border-black/[.18] last:border-b-0 hover:bg-black/[.05]"
                          style={{ borderLeft: `4px solid ${ESTADO_VISITA_BARRA[v.estado]}` }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-extrabold text-[15px] leading-[1.2] truncate">
                              {v.cliente?.nombreFantasia} · {v.sucursal?.nombre}
                            </div>
                            <div className="text-[12px] opacity-62 mt-0.5 truncate">
                              <span className="tabular-nums">{v.horaProgramada ?? "Sin hora"}</span> · {textoMotivos(v)}
                            </div>
                          </div>
                          <Tag variant={ESTADO_VISITA_TAG[v.estado]} className="flex-none">
                            {ESTADO_VISITA_LABEL[v.estado]}
                          </Tag>
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            className="flex-none opacity-60"
                          >
                            <path d="M9 6l6 6-6 6" />
                          </svg>
                        </Link>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </>
        ) : proxima ? (
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
                  <span>{textoMotivos(proxima)}</span>
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
