import Link from "next/link";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { getVisitasPorTecnico } from "@/lib/data/visitas";
import { listarMalls, listarSucursales } from "@/lib/data/maestros";
import { diaDeVisita, hoyISO, sumarDias } from "@/lib/ui/fecha";
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

  // La agenda: arriba las que el técnico ya empezó, que son las que necesita
  // abrir cuanto antes, y después las programadas de cualquier día, de la
  // fecha más lejana a la más próxima a vencer. Las cerradas no salen.
  const porHora = (a: Visita, b: Visita) => (a.horaProgramada ?? "99:99").localeCompare(b.horaProgramada ?? "99:99");
  const mallDe = new Map(sucursales.map((s) => [s.id, s.mallId ?? null]));

  const fechaLarga = (fecha: string) =>
    new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  const tituloDia = (fecha: string) => {
    if (fecha === HOY) return "Hoy";
    if (fecha === sumarDias(HOY, -1)) return `Ayer · ${fechaLarga(fecha)}`;
    if (fecha === sumarDias(HOY, 1)) return `Mañana · ${fechaLarga(fecha)}`;
    return fechaLarga(fecha);
  };

  // Clave de la sección de las en curso: ordena por encima de cualquier fecha.
  const EN_CURSO = "~";
  const porDia = new Map<string, Visita[]>();
  for (const v of visitas) {
    if (v.estado !== "PROGRAMADA" && v.estado !== "EN_CURSO") continue;
    const dia = v.estado === "EN_CURSO" ? EN_CURSO : diaDeVisita(v, HOY);
    porDia.set(dia, [...(porDia.get(dia) ?? []), v]);
  }
  // Dentro de cada día, agrupadas por el mall de su tienda. Las que no están
  // en ningún mall van juntas al final, en «Otras visitas».
  const dias = [...porDia.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([fecha, delDia]) => {
      const grupos = malls
        .map((m) => ({
          clave: String(m.id),
          nombre: m.nombre,
          direccion: [m.direccion, m.comuna].filter(Boolean).join(", ") as string | null,
          visitas: delDia.filter((v) => mallDe.get(v.sucursalId) === m.id).sort(porHora),
        }))
        .filter((g) => g.visitas.length > 0);
      const sinMall = delDia.filter((v) => !grupos.some((g) => g.visitas.includes(v))).sort(porHora);
      if (sinMall.length > 0) {
        grupos.push({
          clave: "otras",
          nombre: grupos.length > 0 ? "Otras visitas" : "Visitas",
          direccion: null,
          visitas: sinMall,
        });
      }
      return {
        fecha,
        titulo: fecha === EN_CURSO ? "En curso" : tituloDia(fecha),
        atrasado: fecha === EN_CURSO || fecha < HOY,
        grupos,
      };
    });

  const fechaHoy = fechaLarga(HOY);

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

        {dias.length === 0 ? (
          <div className="mt-6.5 py-6 text-center text-sm opacity-62">No tienes visitas agendadas.</div>
        ) : null}
        {dias.map((d) => (
          <div key={d.fecha}>
            <div
              className={`text-[10px] tracking-[.15em] uppercase mt-6.5 mb-2.5 ${
                d.atrasado ? "font-extrabold text-[var(--color-accent-active)]" : "opacity-66"
              }`}
            >
              {d.titulo}
            </div>
            <div className="flex flex-col gap-3">
              {d.grupos.map((g) => {
                return (
                  <details
                    key={g.clave}
                    open={d.grupos.length === 1}
                    className="group border border-[var(--color-divider)] border-l-[5px] border-l-[var(--color-accent)] bg-[var(--color-surface)]"
                  >
                    <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center gap-3 px-4 py-3.5 min-h-[64px]">
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-[19px] leading-[1.15] truncate">{g.nombre}</div>
                        {g.direccion ? <div className="text-[13px] opacity-60 mt-0.5 truncate">{g.direccion}</div> : null}
                        <div className="text-[11px] tracking-[.06em] uppercase opacity-66 mt-1.5 tabular-nums">
                          {g.visitas.length} {g.visitas.length === 1 ? "visita" : "visitas"}                        </div>
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
          </div>
        ))}

        <Link
          href="/tecnico/visitas"
          className="w-full min-h-[52px] flex items-center justify-between px-4 mt-5bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm hover:bg-black/[.07]"
        >
          <span>Ver todas mis visitas</span>
          <span className="tabular-nums opacity-62">{visitas.length}</span>
        </Link>
      </div>
    </MobileShell>
  );
}
