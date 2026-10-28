"use client";

import { Toast } from "@/components/ui/Toast";
import { reloj } from "@/lib/ui/video";
import { horaDeMarca, minutosDelPlazo } from "@/lib/reserva";
import { entrada } from "@/components/mobile/formulario/piezas";
import type { FormularioVisitaApi } from "@/components/mobile/formulario/useFormularioVisita";

// Las pantallas del acta que no son el formulario: en espera de señal, guardada
// y la revisión antes de guardar.

/**
 * El acta está completa y guardada en el celular, pero no salió. El técnico
 * puede irse a la siguiente tienda: se manda sola cuando vuelva la señal.
 */
export function PantallaEnEspera({ fv }: { fv: FormularioVisitaApi }) {
  const { visita, router, toast, setPaso, pendiente, enviando, reintentarPendiente } = fv;
  if (!pendiente) return null;
  return (
    <div className="px-4 pt-11 pb-6.5 flex flex-col min-h-[70vh] animate-fade-in">
      <div className="w-14 h-14 bg-[var(--color-text)] grid place-items-center">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#f3f2f2" strokeWidth="2.2">
          <path d="M12 3v12M8 11l4 4 4-4" />
          <path d="M4 19h16" />
        </svg>
      </div>
      <h1 className="font-extrabold text-[34px] leading-[1.05] tracking-[-.03em] mt-5 mb-2">
        Acta guardada
        <br />
        en el celular
      </h1>
      <div className="text-[13px] tabular-nums opacity-60">
        {visita.folio} · {visita.sucursal?.nombre} · {pendiente.capturadaEn.slice(11, 16)}
      </div>
      <div className="h-0.5 bg-[var(--color-divider)] mt-5 mb-4" />
      <div className="flex gap-2.5 items-start px-3.5 py-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)]">
        <div className="text-[13px] leading-[1.5] text-[var(--color-accent-800)]">
          No hubo señal para enviarla. Queda completa y firmada en el equipo y se manda sola apenas haya cobertura:
          puedes seguir a la siguiente visita. No la vuelvas a llenar.
          {pendiente.intentos > 1 ? ` Van ${pendiente.intentos} intentos.` : ""}
        </div>
      </div>
      <div className="mt-auto pt-6.5 flex flex-col gap-2.5">
        <button
          onClick={() => void reintentarPendiente(true)}
          disabled={enviando}
          className="w-full min-h-[58px] flex items-center justify-between px-4.5 bg-[var(--color-accent)] text-[var(--color-bg)] font-extrabold text-base cursor-pointer text-left hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
        >
          <span>{enviando ? "Enviando…" : "Intentar enviarla ahora"}</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M4 12a8 8 0 018-8c3 0 5.5 1.7 7 4M20 12a8 8 0 01-8 8c-3 0-5.5-1.7-7-4" />
            <path d="M19 4v4h-4M5 20v-4h4" />
          </svg>
        </button>
        <button
          onClick={() => router.push("/tecnico/visitas")}
          className="w-full min-h-[50px] px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
        >
          Seguir a la siguiente visita
        </button>
        <button
          onClick={() => setPaso("form")}
          className="w-full min-h-11 px-1 bg-transparent border-0 text-[var(--color-accent-active)] text-[13px] underline underline-offset-4 cursor-pointer text-left"
        >
          Volver al formulario
        </button>
      </div>
      <Toast texto={toast} />
    </div>
  );
}

/** El acta quedó guardada en el servidor. */
export function PantallaOk({ fv }: { fv: FormularioVisitaApi }) {
  const { visita, edicion, router, horaTermino } = fv;
  return (
    <div className="px-4 pt-11 pb-6.5 flex flex-col min-h-[70vh] animate-fade-in">
      <div className="w-14 h-14 bg-[var(--color-accent)] grid place-items-center">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#f3f2f2" strokeWidth="2.6">
          <path d="M4 12l5 5L20 6" />
        </svg>
      </div>
      <h1 className="font-extrabold text-[34px] leading-[1.05] tracking-[-.03em] mt-5 mb-2">
        {edicion ? "Cambios" : "Visita"}
        <br />
        {edicion ? "guardados" : "guardada"}
      </h1>
      <div className="text-[13px] tabular-nums opacity-60">
        {visita.folio} · {visita.sucursal?.nombre}
        {edicion ? "" : ` · ${horaTermino}`}
      </div>
      <div className="h-0.5 bg-[var(--color-divider)] mt-5 mb-4" />
      <div className="flex gap-2.5 items-start px-3.5 py-3 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)]">
        <div className="text-[13px]">
          {edicion
            ? "El acta quedó corregida y la firma de la tienda se conservó. La edición quedó registrada con lo que cambiaste y el motivo: coordinación la ve en el panel."
            : "Guardada en el servidor y marcada como completada. Coordinación ya la ve así en el panel, y a ti deja de aparecerte en curso."}
        </div>
      </div>
      <div className="mt-auto pt-6.5 flex flex-col gap-2.5">
        <button
          onClick={() => router.push("/tecnico/visitas")}
          className="w-full min-h-[58px] flex items-center justify-between px-4.5 bg-[var(--color-accent)] text-[var(--color-bg)] font-extrabold text-base cursor-pointer text-left hover:bg-[var(--color-accent-hover)]"
        >
          <span>{edicion ? "Volver a mis visitas" : "Siguiente visita"}</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        {/* Lleva al acta que quedó en la base, no de vuelta a la pantalla
            previa a guardar: esa mostraba otra vez el botón "Guardar visita"
            sobre una visita ya cerrada. */}
        <button
          onClick={() => router.push(`/tecnico/visitas/${visita.folio}/revisar`)}
          className="w-full min-h-[50px] px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
        >
          Ver el acta guardada
        </button>
      </div>
    </div>
  );
}

/** Antes de guardar: el acta completa para leerla con el encargado. */
export function PantallaRevision({ fv }: { fv: FormularioVisitaApi }) {
  const {
    visita,
    edicion,
    toast,
    aviso,
    setPaso,
    motivoEdicion,
    setMotivoEdicion,
    guardando,
    errorGuardado,
    respNombre,
    respRut,
    respTel,
    respCargo,
    motivosCodigos,
    obs,
    problemas,
    porResolver,
    resoluciones,
    interno,
    internos,
    firma,
    motivoDe,
    trabajosVigentes,
    puedeGuardar,
    falta,
    nombreMotivos,
    guardarVisita,
    nombreTrabajo,
    nombreMotivo,
    nombreInterno,
    fotosTrabajo,
    fotosInternas,
    videosTrabajo,
    videosInternos,
    nombreProblema,
  } = fv;
  const resumen: { k: string; v: string }[] = [
    { k: "Cliente", v: visita.cliente?.nombreFantasia ?? "—" },
    { k: "Sucursal", v: `${visita.sucursal?.nombre} · ${visita.sucursal?.direccion}, ${visita.sucursal?.comuna}` },
    { k: motivosCodigos.length > 1 ? "Motivos de la visita" : "Motivo de la visita", v: nombreMotivos(motivosCodigos) },
    { k: "Nombre", v: respNombre || "—" },
    { k: "Rut", v: respRut || "Sin RUT" },
    ...(respCargo ? [{ k: "Cargo", v: respCargo }] : []),
    { k: "Teléfono de contacto", v: respTel || "—" },
    { k: "Detalle del trabajo", v: obs || "Sin detalle escrito." },
  ];

  return (
    <div className="animate-fade-in">
      <div className="px-4 pt-5">
        <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">
          {edicion ? "Edición del acta" : "Antes de guardar"}
        </div>
        <h1 className="font-extrabold text-[28px] leading-[1.06] tracking-[-.03em] mt-2 mb-1.5">
          {edicion ? "Revisa cómo" : "Revisa lo que"}
          <br />
          {edicion ? "queda el acta" : "se va a guardar"}
        </h1>
        <p className="m-0 mb-4 text-sm opacity-60">
          {edicion
            ? "Así va a quedar el acta corregida. La firma de la tienda es la misma de cuando se cerró."
            : "Lee cada punto con el encargado de la tienda antes de confirmar."}
        </p>
      </div>

      <div className="mx-4 border border-[var(--color-divider)] bg-[var(--color-surface-3)]">
        <div className="px-4 py-3.5 border-b-2 border-[var(--color-divider)] flex items-center gap-2.5">
          <div className="font-extrabold text-[13px] tracking-[.06em] uppercase">Acta de visita</div>
          <span className="tag tag-accent ml-auto">{edicion ? "Acta corregida" : "Quedará Completada"}</span>
        </div>
        <div className="px-4 pt-1 pb-3.5">
          {resumen.map((r) => (
            <div key={r.k} className="py-3.5 border-b border-black/[.2]">
              <div className="text-[11px] tracking-[.1em] uppercase opacity-66">{r.k}</div>
              <div className="text-[17px] leading-[1.4] mt-1.5">{r.v}</div>
            </div>
          ))}

          {trabajosVigentes.length > 0 ? (
            <div className="pt-3.5">
              <div className="text-[11px] tracking-[.1em] uppercase opacity-66 mb-2.5">Trabajo realizado</div>
              <div className="flex flex-col gap-2.5">
                {trabajosVigentes.map((t) => (
                  <div key={t.id} className="border-l-[3px] border-[var(--color-text)] pl-3">
                    <div className="text-[10px] tracking-[.1em] uppercase opacity-62">{nombreMotivo(motivoDe(t))}</div>
                    <div className="font-extrabold text-base leading-[1.25]">{nombreTrabajo(t.codigo)}</div>
                    {t.subs.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {t.subs.map((s) => (
                          <span
                            key={s.etiqueta}
                            className="px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2] tabular-nums"
                          >
                            {s.etiqueta}
                            {s.cantidad > 1 ? ` × ${s.cantidad}` : ""}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {t.detalle ? <div className="text-sm opacity-72 mt-1.5">{t.detalle}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {porResolver.length > 0 ? (
            <div className="pt-3.5">
              <div className="text-[11px] tracking-[.1em] uppercase opacity-66 mb-2.5">Venías a resolver</div>
              <div className="flex flex-col gap-2">
                {porResolver.map((p) => (
                  <div key={p.id} className="border-l-[3px] border-[var(--color-accent)] pl-3 flex items-baseline justify-between gap-3">
                    <span className="font-extrabold text-base leading-[1.25]">{p.tipo}</span>
                    <span className="text-sm flex-none">
                      {resoluciones[p.id] === undefined ? "Sin responder" : resoluciones[p.id] ? "Solucionado" : "No solucionado"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {problemas.length > 0 ? (
            <div className="pt-3.5">
              <div className="text-[11px] tracking-[.1em] uppercase opacity-66 mb-2.5">Problemas detectados</div>
              <div className="flex flex-col gap-2.5">
                {problemas.map((p) => (
                  <div key={p.id} className="border-l-[3px] border-[var(--color-accent)] pl-3">
                    <div className="font-extrabold text-base leading-[1.25]">{nombreProblema(p.codigo)}</div>
                    {p.items.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {p.items.map((z) => (
                          <span
                            key={z.etiqueta}
                            className="px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2] tabular-nums"
                          >
                            {z.etiqueta} × {z.cantidad}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {p.desc ? <div className="text-sm opacity-72 mt-1.5">{p.desc}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {fotosTrabajo.length > 0 ? (
            <div className="pt-4">
              <div className="text-[10px] tracking-[.12em] uppercase opacity-62 mb-2">Fotos ({fotosTrabajo.length})</div>
              <div className="grid grid-cols-4 gap-1.5">
                {fotosTrabajo.map((f) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={f.id}
                    src={f.src}
                    alt=""
                    className="w-full aspect-square object-cover border border-black/[.3]"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {videosTrabajo.length > 0 ? (
            <div className="pt-4">
              <div className="text-[10px] tracking-[.12em] uppercase opacity-62 mb-2">
                Videos ({videosTrabajo.length})
              </div>
              <div className="grid gap-2">
                {videosTrabajo.map((v) => (
                  <div key={v.id} className="flex items-center gap-2.5 border border-black/[.3] px-2.5 py-2">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="flex-none">
                      <path d="M3 7h11v10H3z" />
                      <path d="M14 11l7-4v10l-7-4z" />
                    </svg>
                    <span className="text-[13px] tabular-nums">
                      {reloj(v.duracionSeg)} · {v.ancho}x{v.alto}
                    </span>
                    <span className="ml-auto text-[11px] opacity-62 tabular-nums">
                      {v.error ? "no se subió" : v.progreso !== null ? `subiendo ${v.progreso}%` : "guardado"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {interno.trim() || internos.length || fotosInternas.length || videosInternos.length ? (
            <div className="mt-4 px-3 py-3 bg-[var(--color-surface)] border-l-[3px] border-[var(--color-text)]">
              <div className="text-[10px] tracking-[.12em] uppercase opacity-62">
                Comentario interno · no lo ve el cliente
              </div>
              {internos.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {internos.map((c) => (
                    <span
                      key={c}
                      className="px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2]"
                    >
                      {nombreInterno(c)}
                    </span>
                  ))}
                </div>
              ) : null}
              {interno.trim() ? <div className="text-sm mt-2">{interno}</div> : null}
              {fotosInternas.length || videosInternos.length ? (
                <div className="text-xs opacity-66 mt-2">
                  {fotosInternas.length} foto{fotosInternas.length === 1 ? "" : "s"}
                  {videosInternos.length ? ` · ${videosInternos.length} video${videosInternos.length > 1 ? "s" : ""}` : ""}
                </div>
              ) : null}
            </div>
          ) : null}

          {firma ? (
            <div className="flex gap-3.5 pt-4.5">
              <div className="flex-[0_1_250px] min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={firma.imagen} alt="Firma" className="w-full h-[60px] object-contain object-left-bottom" />
                <div className="h-px bg-[var(--color-text)] mt-1" />
                <div className="text-xs mt-1.5">
                  {firma.nombre}
                  {firma.rut ? ` · ${firma.rut}` : ""}
                </div>
                <div className="text-[10px] tracking-[.09em] uppercase opacity-62">Responsable de tienda</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="px-4 pt-4.5 pb-6.5">
        {edicion ? (
          <div className="mb-3.5">
            <label htmlFor="f-motivo-edicion" className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
              ¿Por qué se edita el acta?
              <span className="opacity-66 normal-case tracking-normal"> (obligatorio · queda en el registro)</span>
            </label>
            <textarea
              id="f-motivo-edicion"
              rows={3}
              value={motivoEdicion}
              onChange={(e) => setMotivoEdicion(e.target.value)}
              autoComplete="off"
              placeholder="Ej: anoté mal el RUT del encargado; faltaba agregar el cambio de la antena 2"
              className={`${entrada} min-h-[96px] leading-[1.4] resize-y`}
            />
          </div>
        ) : null}
        {falta.length > 0 ? (
          <div className="px-3.5 py-3 mb-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)] text-[13px] text-[var(--color-accent-800)]">
            Falta {falta.join(", ")}.
          </div>
        ) : null}
        {errorGuardado ? (
          <div
            role="alert"
            className="px-3.5 py-3 mb-3 bg-[#f7ded9] border-l-4 border-[var(--color-accent)] text-[13px] leading-[1.45] text-[#8f1400]"
          >
            {errorGuardado}
          </div>
        ) : null}
        <button
          onClick={() => {
            if (guardando) return;
            if (!puedeGuardar) return aviso(`Falta ${falta.join(", ")}`);
            void guardarVisita();
          }}
          disabled={guardando}
          className="w-full min-h-[62px] flex items-center justify-between px-4.5 border-0 font-extrabold text-[17px] cursor-pointer text-left hover:brightness-95"
          style={{
            background: puedeGuardar ? "var(--color-accent)" : "#8f8b8b",
            color: puedeGuardar ? "var(--color-bg)" : "var(--color-surface-3)",
          }}
        >
          <span>{guardando ? "Guardando…" : edicion ? "Guardar cambios" : "Guardar visita"}</span>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M4 12l5 5L20 6" />
          </svg>
        </button>
        <button
          onClick={() => setPaso("form")}
          disabled={guardando}
          className="w-full min-h-[50px] mt-2.5 px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07] disabled:opacity-60"
        >
          Volver a corregir
        </button>
        <p className="mt-2.5 mb-0 text-xs opacity-66">
          {edicion
            ? "Al confirmar queda registrado qué cambiaste, cuándo y por qué. El PDF del acta sale con los datos corregidos."
            : "Al confirmar, la visita queda cerrada y coordinación la ve completada al instante."}
        </p>
      </div>
      <Toast texto={toast} />
    </div>
  );
}

/**
 * Cubre el formulario cuando el otro técnico tomó el acta mientras este estaba
 * sin actividad, o cuando ya cerró la visita. No se puede editar ni enviar nada,
 * y se dice con todas las letras que lo escrito sigue guardado en el celular.
 */
export function BloqueoDeActa({ fv }: { fv: FormularioVisitaApi }) {
  const { bloqueo, visita, router, recuperarReserva, toast } = fv;
  if (!bloqueo) return null;
  const detalle = `/tecnico/visitas/${visita.folio}`;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="bloqueo-titulo"
      className="fixed inset-0 z-50 flex justify-center bg-[rgba(32,30,29,.72)]"
    >
      <div className="w-full max-w-[460px] bg-[var(--color-bg)] flex flex-col px-4 pt-11 pb-6.5 overflow-y-auto">
        <h1 id="bloqueo-titulo" className="font-extrabold text-[28px] leading-[1.08] tracking-[-.03em] m-0">
          {bloqueo.tipo === "reserva" ? "Otro técnico tomó esta acta" : "El otro técnico ya cerró esta visita"}
        </h1>
        <div className="h-0.5 bg-[var(--color-divider)] mt-4 mb-4" />
        <p className="m-0 text-[15px] leading-[1.5]">
          {bloqueo.tipo === "reserva" ? (
            <>
              {bloqueo.reserva.nombre} la tiene en curso desde las {horaDeMarca(bloqueo.reserva.desde)}. Pasaron más de{" "}
              {minutosDelPlazo(fv.reservaPlazoSeg)} minutos sin actividad en este celular, así que la reserva venció.
            </>
          ) : (
            <>Su acta ya está en el sistema, así que la de este celular no se puede enviar.</>
          )}
        </p>
        <div className="mt-3.5 px-3.5 py-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)] text-[13px] leading-[1.5] text-[var(--color-accent-800)]">
          Lo que escribiste sigue guardado en este celular y no se perdió. No se envía nada y no se puede seguir
          editando mientras tanto.
        </div>
        <div className="mt-auto pt-6.5 flex flex-col gap-2.5">
          {bloqueo.tipo === "reserva" ? (
            <button
              onClick={() => void recuperarReserva()}
              className="w-full min-h-[54px] px-4.5 bg-[var(--color-accent)] text-[var(--color-bg)] border-0 font-extrabold text-base cursor-pointer text-left hover:bg-[var(--color-accent-hover)]"
            >
              Intentar recuperarla
            </button>
          ) : null}
          <button
            onClick={() => router.push(detalle)}
            className="w-full min-h-[50px] px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
          >
            Volver a la visita
          </button>
        </div>
        <Toast texto={toast} />
      </div>
    </div>
  );
}
