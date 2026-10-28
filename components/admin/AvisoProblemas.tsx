"use client";

import { useEffect, useState } from "react";
import { problemasSinResolverAction } from "@/app/actions/admin";
import { fechaHoraLegible } from "@/lib/ui/fecha";
import { FALTA_ELEGIR, FALTA_RESPUESTA } from "@/lib/validacion/aviso-problemas";
import type { AvisoProblemas as RespuestaAviso, ProblemaSinResolver } from "@/lib/contratos/visitas";

// El aviso de problemas sin resolver del formulario de visita: al agendar o
// reprogramar en una sucursal que los tiene, se muestran y se pregunta si la
// visita es para resolverlos. Sin respuesta no se guarda (el servidor lo
// vuelve a exigir). Sin problemas, no aparece nada.

/**
 * Lee los problemas de la sucursal y lleva la respuesta.
 *
 * `folio`: al reprogramar, sin los que esa visita ya venía a resolver.
 * `origenId`: la visita nace desde un problema; llega ya respondida con él.
 */
export function useAvisoProblemas(sucursalId: number | null, opciones: { folio?: string; origenId?: number } = {}) {
  const { folio, origenId } = opciones;
  /** null = todavía leyendo. */
  const [problemas, setProblemas] = useState<ProblemaSinResolver[] | null>(null);
  const [respuesta, setRespuesta] = useState<RespuestaAviso["respuesta"] | null>(origenId ? "RESUELVE" : null);
  const [elegidos, setElegidos] = useState<number[]>(origenId ? [origenId] : []);

  useEffect(() => {
    let vigente = true;
    // Otra sucursal, otros problemas: la respuesta anterior ya no vale.
    setProblemas(null);
    setRespuesta(origenId ? "RESUELVE" : null);
    setElegidos(origenId ? [origenId] : []);
    if (!sucursalId) {
      setProblemas([]);
      return;
    }
    // Si no se pueden leer, el formulario sigue: el servidor igual exige la
    // respuesta y devuelve el motivo al guardar.
    problemasSinResolverAction({ sucursalId, folio })
      .then((r) => vigente && setProblemas(r.problemas))
      .catch(() => vigente && setProblemas([]));
    return () => {
      vigente = false;
    };
  }, [sucursalId, folio, origenId]);

  const lista = problemas ?? [];

  /** Por qué todavía no se puede guardar, o null. */
  function falta(): string | null {
    if (problemas === null) return "Espera: se están revisando los problemas de la sucursal.";
    if (lista.length === 0) return null;
    if (!respuesta) return FALTA_RESPUESTA;
    if (respuesta === "RESUELVE" && !elegidos.some((id) => lista.some((p) => p.id === id))) return FALTA_ELEGIR;
    return null;
  }

  /** Lo que viaja al servidor. Null si la sucursal no tiene problemas. */
  function respuestaAviso(): RespuestaAviso | null {
    if (lista.length === 0 || !respuesta) return null;
    const ids = lista.map((p) => p.id);
    return {
      respuesta,
      avisados: ids,
      elegidos: respuesta === "RESUELVE" ? elegidos.filter((id) => ids.includes(id)) : [],
    };
  }

  return {
    problemas: lista,
    cargando: problemas === null,
    respuesta,
    setRespuesta,
    elegidos,
    alternar: (id: number) => setElegidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    falta,
    respuestaAviso,
  };
}

export type AvisoProblemasApi = ReturnType<typeof useAvisoProblemas>;

const fecha = (iso: string) => fechaHoraLegible(iso).split(" · ")[0];

export default function AvisoProblemas({ aviso, deshabilitado }: { aviso: AvisoProblemasApi; deshabilitado?: boolean }) {
  const { problemas, respuesta, setRespuesta, elegidos, alternar } = aviso;
  if (problemas.length === 0) return null;
  const resuelve = respuesta === "RESUELVE";

  return (
    <section
      role="alert"
      className="mt-4 border-2 border-[var(--color-accent)] bg-[var(--color-surface)] px-4 py-3.5"
    >
      <div className="text-[11px] tracking-[.1em] uppercase font-extrabold text-[var(--color-accent-active)]">
        Atención
      </div>
      <p className="m-0 mt-1 font-extrabold text-[15px] leading-[1.3]">
        {problemas.length === 1
          ? "Esta sucursal tiene un problema sin resolver"
          : `Esta sucursal tiene ${problemas.length} problemas sin resolver`}
      </p>

      <ul className="list-none m-0 mt-3 p-0 flex flex-col gap-2">
        {problemas.map((p) => {
          const marcado = elegidos.includes(p.id);
          const contenido = (
            <>
              {resuelve ? (
                <span className="w-3.5 h-3.5 mt-0.5 flex-none border-2 border-current grid place-items-center">
                  {marcado ? (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                      <path d="M4 12l5 5L20 6" />
                    </svg>
                  ) : null}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <b className="text-sm">{p.tipo}</b>
                  <span className="text-[11px] tracking-[.06em] uppercase px-1.5 border border-current">
                    {p.estadoNombre}
                  </span>
                </span>
                <span className="block text-xs opacity-70 mt-0.5">
                  Levantado el {fecha(p.creadoEn)} en {p.folio}
                  {p.agendadoEn ? ` · ya agendado en ${p.agendadoEn}` : ""}
                </span>
                {p.descripcion ? <span className="block text-[13px] mt-1 line-clamp-2">{p.descripcion}</span> : null}
              </span>
            </>
          );
          return (
            <li key={p.id}>
              {resuelve ? (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={marcado}
                  disabled={deshabilitado}
                  onClick={() => alternar(p.id)}
                  className="w-full flex items-start gap-2.5 px-3 py-2 border border-black/[.35] text-left cursor-pointer"
                  style={{
                    background: marcado ? "var(--color-text)" : "var(--color-bg)",
                    color: marcado ? "var(--color-bg)" : "var(--color-text)",
                  }}
                >
                  {contenido}
                </button>
              ) : (
                <div className="flex items-start gap-2.5 px-3 py-2 border border-[var(--color-divider)]">{contenido}</div>
              )}
            </li>
          );
        })}
      </ul>

      <fieldset className="m-0 mt-3.5 p-0 border-0" disabled={deshabilitado}>
        <legend className="p-0 font-extrabold text-sm">¿Esta visita es para resolver alguno de estos problemas?</legend>
        <div className="flex flex-wrap gap-2 mt-2">
          {(
            [
              ["RESUELVE", "Sí, para resolverlos"],
              ["OTRA_COSA", "No, es por otra cosa"],
            ] as const
          ).map(([valor, texto]) => {
            const activo = respuesta === valor;
            return (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => setRespuesta(valor)}
                className="min-h-10 px-3.5 border border-black/[.35] text-[13px] cursor-pointer"
                style={{
                  background: activo ? "var(--color-text)" : "var(--color-bg)",
                  color: activo ? "var(--color-bg)" : "var(--color-text)",
                  fontWeight: activo ? 800 : 400,
                }}
              >
                {texto}
              </button>
            );
          })}
        </div>
        <p className="m-0 mt-2 text-xs opacity-70">
          {resuelve
            ? "Marca arriba los que va a resolver: quedan como «Agendado» y el técnico confirma en el acta si quedaron solucionados."
            : respuesta === "OTRA_COSA"
              ? "Los problemas siguen como están. Queda registrado que se avisó y que la visita es por otra cosa."
              : "Responde para poder guardar."}
        </p>
      </fieldset>
    </section>
  );
}
