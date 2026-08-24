"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import Confirmar, { type ConfirmarCfg } from "@/components/admin/Confirmar";
import Tag from "@/components/Tag";
import { Toast, useToast } from "@/components/ui/Toast";
import {
  atenderSolicitudPasswordAction,
  descartarSolicitudPasswordAction,
} from "@/app/actions/admin";
import { fechaHoraLegible } from "@/lib/ui/fecha";
import type { SolicitudPassword } from "@/lib/types";

/**
 * "Olvidé mi contraseña" visto desde el panel.
 *
 * No hay servidor de correo: la persona deja la solicitud en el login y acá el
 * administrador le asigna una clave temporal, que después le entrega por el
 * canal que corresponda. La clave se muestra una sola vez, mientras el diálogo
 * está abierto: después ya está hasheada en la base y no hay forma de leerla.
 */
export default function SolicitudesPasswordView({
  solicitudes,
  pestanas,
}: {
  solicitudes: SolicitudPassword[];
  pestanas?: React.ReactNode;
}) {
  const router = useRouter();
  const { toast, aviso } = useToast();
  const [busqueda, setBusqueda] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [dialogo, setDialogo] = useState<{ solicitud: SolicitudPassword; clave: string } | null>(null);
  const [confirmar, setConfirmar] = useState<ConfirmarCfg | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [entregada, setEntregada] = useState<{ email: string; clave: string } | null>(null);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return solicitudes.filter((s) => {
      if (soloPendientes && s.estado !== "PENDIENTE") return false;
      if (!q) return true;
      return `${s.email} ${s.mensaje ?? ""}`.toLowerCase().includes(q);
    });
  }, [solicitudes, busqueda, soloPendientes]);

  const pendientes = solicitudes.filter((s) => s.estado === "PENDIENTE").length;

  async function asignar() {
    if (!dialogo) return;
    const clave = dialogo.clave.trim();
    if (clave.length < 8) return aviso("La contraseña temporal debe tener al menos 8 caracteres");

    setGuardando(true);
    const res = await atenderSolicitudPasswordAction(dialogo.solicitud.id, clave);
    setGuardando(false);

    if (!res.ok) return aviso(res.error ?? "No se pudo asignar la contraseña");
    setEntregada({ email: dialogo.solicitud.email, clave });
    setDialogo(null);
    router.refresh();
  }

  return (
    <>
      <AdminHeader kicker="Maestros · quién entra al sistema" title="Usuarios" pestanas={pestanas} />

      <div className="pb-10 animate-fade-in">
        <div className="flex items-center gap-2.5 flex-wrap px-7 py-4 border-b border-[var(--color-divider-soft)]">
          <div className="relative flex-1 min-w-[220px] max-w-[340px]">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por correo…"
              aria-label="Buscar por correo"
              autoComplete="off"
              className="input pl-9.5"
            />
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-text)"
              strokeWidth="2"
              className="absolute left-3 top-1/2 -translate-y-1/2 opacity-62 pointer-events-none"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M16.5 16.5L21 21" />
            </svg>
          </div>
          <button
            type="button"
            onClick={() => setSoloPendientes((v) => !v)}
            className="btn btn-secondary min-h-10 px-3.5"
          >
            {soloPendientes ? "Ver también las cerradas" : "Ver solo las pendientes"}
          </button>
          <div className="ml-auto text-[11px] tracking-[.08em] uppercase opacity-62 tabular-nums">
            {pendientes} {pendientes === 1 ? "pendiente" : "pendientes"}
          </div>
        </div>

        {entregada ? (
          <div className="mx-7 mt-5 border-2 border-[var(--color-text)] bg-[var(--color-surface-3)]">
            <div className="px-4 py-3 border-b border-[var(--color-divider)] font-extrabold text-[15px]">
              Contraseña asignada a {entregada.email}
            </div>
            <div className="px-4 py-3.5">
              <div className="text-[10px] tracking-[.12em] uppercase opacity-62 mb-1.5">
                Anótala ahora — no se puede volver a mostrar
              </div>
              <code className="inline-block px-3 py-2 bg-[var(--color-bg)] border border-black/[.35] text-base tracking-[.06em]">
                {entregada.clave}
              </code>
              <p className="mt-2.5 mb-0 text-[13px] opacity-70">
                Entrégasela por teléfono o en persona y pídele que la cambie apenas entre.
              </p>
              <button className="btn btn-secondary mt-3" onClick={() => setEntregada(null)}>
                Ya la anoté
              </button>
            </div>
          </div>
        ) : null}

        <div className="px-7 pt-5">
          <table className="table">
            <thead>
              <tr>
                <th>Correo</th>
                <th>Cuenta</th>
                <th>Mensaje</th>
                <th>Pedida</th>
                <th>Estado</th>
                <th style={{ width: 220 }} />
              </tr>
            </thead>
            <tbody>
              {filtradas.map((s) => (
                <tr key={s.id}>
                  <td>{s.email}</td>
                  <td>
                    {s.usuarioId === null ? (
                      <Tag variant="neutral">Sin cuenta</Tag>
                    ) : s.usuarioActivo ? (
                      <Tag variant="accent">{s.usuarioRol}</Tag>
                    ) : (
                      <Tag variant="neutral">Desactivada</Tag>
                    )}
                  </td>
                  <td className="max-w-[280px]">
                    <span className="text-[13px] opacity-75">{s.mensaje || "—"}</span>
                  </td>
                  <td className="tabular-nums text-[13px]">{fechaHoraLegible(s.creadoEn)}</td>
                  <td>
                    <Tag variant={s.estado === "PENDIENTE" ? "accent" : "neutral"}>
                      {s.estado === "PENDIENTE" ? "Pendiente" : s.estado === "ATENDIDA" ? "Atendida" : "Descartada"}
                    </Tag>
                  </td>
                  <td className="text-right">
                    {s.estado === "PENDIENTE" ? (
                      <div className="flex gap-2 justify-end">
                        <button
                          className="btn btn-primary min-h-9 px-3 text-[13px]"
                          onClick={() => setDialogo({ solicitud: s, clave: claveSugerida() })}
                          disabled={s.usuarioId === null}
                          title={
                            s.usuarioId === null
                              ? "Ese correo no tiene cuenta. Créala en la pestaña «Cuentas»."
                              : undefined
                          }
                        >
                          Asignar clave
                        </button>
                        <button
                          className="btn btn-secondary min-h-9 px-3 text-[13px]"
                          onClick={() =>
                            setConfirmar({
                              titulo: "¿Descartar esta solicitud?",
                              texto: `La solicitud de ${s.email} queda cerrada sin tocar ninguna contraseña.`,
                              cta: "Descartar",
                              accion: async () => {
                                const res = await descartarSolicitudPasswordAction(s.id);
                                if (!res.ok) return aviso(res.error ?? "No se pudo descartar");
                                aviso("Solicitud descartada");
                                router.refresh();
                              },
                            })
                          }
                        >
                          Descartar
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtradas.length === 0 ? (
            <div className="py-14 text-center">
              <div className="font-extrabold text-[17px] mb-1.5">Nada pendiente</div>
              <div className="text-[13px] opacity-66">
                Cuando alguien apriete «Olvidé mi contraseña» en el login, la solicitud aparece acá.
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {dialogo ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Asignar contraseña temporal"
          className="fixed inset-0 z-[60] bg-[rgba(45,43,43,.5)] grid place-items-center p-6"
          onClick={() => setDialogo(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[520px] bg-[var(--color-bg)] border-2 border-[var(--color-text)] animate-up-dlg"
          >
            <div className="px-5.5 py-4.5 border-b-2 border-[var(--color-divider)]">
              <div className="text-[10px] tracking-[.14em] uppercase text-[var(--color-accent-active)]">
                Acceso · contraseña temporal
              </div>
              <div className="font-extrabold text-[21px] leading-[1.15] mt-1">{dialogo.solicitud.email}</div>
            </div>
            <div className="p-5.5">
              <div className="field m-0">
                <label htmlFor="clave-temporal">Contraseña temporal</label>
                <input
                  id="clave-temporal"
                  value={dialogo.clave}
                  onChange={(e) => setDialogo({ ...dialogo, clave: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                  className="input tracking-[.08em]"
                />
                <div className="text-[11px] leading-[1.4] opacity-66 mt-1.5">
                  Mínimo 8 caracteres. Se muestra una sola vez: anótala antes de cerrar. La persona debería cambiarla
                  apenas entre.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDialogo({ ...dialogo, clave: claveSugerida() })}
                className="mt-2 p-0 bg-transparent border-0 text-[var(--color-accent-active)] text-[13px] underline underline-offset-[3px] cursor-pointer"
              >
                Generar otra
              </button>

              <div className="flex gap-2.5 justify-end mt-5.5 pt-4.5 border-t border-[var(--color-divider-soft)]">
                <button className="btn btn-secondary min-h-11 px-4.5" onClick={() => setDialogo(null)}>
                  Cancelar
                </button>
                <button className="btn btn-primary min-h-11 px-4.5" onClick={asignar} disabled={guardando}>
                  <span>{guardando ? "Asignando…" : "Asignar contraseña"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {confirmar ? <Confirmar cfg={confirmar} onCerrar={() => setConfirmar(null)} /> : null}
      <Toast texto={toast} variante="panel" />
    </>
  );
}

/** Clave temporal legible por teléfono: sin caracteres que se confundan. */
function claveSugerida(): string {
  const alfabeto = "abcdefghijkmnpqrstuvwxyz23456789";
  const valores = new Uint32Array(10);
  crypto.getRandomValues(valores);
  return Array.from(valores, (v) => alfabeto[v % alfabeto.length]).join("");
}
