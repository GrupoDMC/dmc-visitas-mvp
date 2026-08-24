"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Sheet from "@/components/mobile/Sheet";
import { crearVisitaTecnicoAction } from "@/app/actions/visitas";
import { useReferencias } from "@/lib/ui/referencias";
import { fmtTel } from "@/lib/ui/formato";

const LABEL = "block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5";
const CAMPO =
  "w-full min-h-[54px] px-3.5 py-3 text-base leading-[1.3] bg-[var(--color-surface)] border border-[var(--color-divider)] text-[var(--color-text)] caret-[var(--color-accent)] focus-visible:border-[var(--color-accent)]";

/**
 * "Agregar visita" del celular: el mismo formulario que usa coordinación, para
 * cuando el técnico hace una visita que no le asignaron. Al confirmar, la
 * visita queda creada, iniciada y abierta en el formulario.
 */
export default function NuevaVisitaSheet({
  hoy,
  onCerrar,
  onError,
}: {
  hoy: string;
  onCerrar: () => void;
  onError: (mensaje: string) => void;
}) {
  const router = useRouter();
  const referencias = useReferencias();
  // Solo lo que sigue vigente: una sucursal dada de baja no debe poder recibir
  // una visita nueva.
  const clientes = referencias.clientes.filter((c) => c.activo);
  const sucursales = referencias.sucursales.filter((s) => s.activo);
  const catalogoMotivo = referencias.motivos;

  const [clienteId, setClienteId] = useState(String(clientes[0]?.id ?? ""));
  const [sucursalId, setSucursalId] = useState(
    String(sucursales.find((s) => String(s.clienteId) === String(clientes[0]?.id))?.id ?? "")
  );
  // El motivo dejo de ser uno solo: se marcan todos los que correspondan.
  // El primero marcado es el principal (el que va a dmc.visita.motivo_codigo).
  const [motivos, setMotivos] = useState<string[]>(() =>
    catalogoMotivo[0] ? [catalogoMotivo[0].codigo] : []
  );
  const [fecha, setFecha] = useState(hoy);
  const [hora, setHora] = useState("");
  const [encargado, setEncargado] = useState("");
  const [telefono, setTelefono] = useState("");
  const [trabajo, setTrabajo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const propias = sucursales.filter((s) => String(s.clienteId) === clienteId);
  const esInstalacion = motivos.includes("INSTALACION");
  const listo = Boolean(clienteId && sucursalId && motivos.length > 0 && (!esInstalacion || hora));

  async function confirmar() {
    if (!listo) {
      onError(
        esInstalacion && !hora
          ? "La hora es obligatoria para instalaciones"
          : motivos.length === 0
            ? "Marca al menos un motivo de la visita"
            : "Falta cliente y sucursal"
      );
      return;
    }
    setGuardando(true);
    const res = await crearVisitaTecnicoAction({
      sucursalId: Number(sucursalId),
      motivoCodigo: motivos[0],
      motivosCodigos: motivos,
      fecha,
      hora: hora || null,
      responsableNombre: encargado,
      responsableTelefono: telefono,
      trabajo,
    });
    setGuardando(false);

    if (!res.ok || !res.folio) {
      onError(res.error ?? "No se pudo crear la visita.");
      return;
    }
    onCerrar();
    router.push(`/tecnico/visitas/${res.folio}/formulario`);
  }

  return (
    <Sheet titulo="Agregar visita" onClose={onCerrar}>
      <div className="p-4 flex flex-col gap-3.5">
        <p className="m-0 text-[13px] opacity-60">
          Mismo formulario que usa coordinación para crear una visita, para cuando no te la asignaron o la haces fuera
          de tu planificación.
        </p>

        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <label htmlFor="nv-cli" className={LABEL}>
              Cliente
            </label>
            <select
              id="nv-cli"
              value={clienteId}
              onChange={(e) => {
                setClienteId(e.target.value);
                const primera = sucursales.find((s) => String(s.clienteId) === e.target.value);
                setSucursalId(primera ? String(primera.id) : "");
              }}
              className={CAMPO}
            >
              {clientes.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.nombreFantasia}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label htmlFor="nv-suc" className={LABEL}>
              Sucursal
            </label>
            <select id="nv-suc" value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} className={CAMPO}>
              {propias.length === 0 ? <option value="">Sin sucursales</option> : null}
              {propias.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className={LABEL}>
            Motivo de la visita <span className="opacity-70 normal-case tracking-normal">(marca todos los que correspondan)</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {catalogoMotivo.map((m) => {
              const activo = motivos.includes(m.codigo);
              return (
                <button
                  key={m.codigo}
                  type="button"
                  role="checkbox"
                  aria-checked={activo}
                  onClick={() =>
                    setMotivos((prev) => (activo ? prev.filter((c) => c !== m.codigo) : [...prev, m.codigo]))
                  }
                  className="w-full min-h-[52px] flex items-center gap-3 px-3.5 text-[15px] leading-[1.25] text-[var(--color-text)] cursor-pointer text-left"
                  style={{
                    background: activo ? "var(--color-accent-100)" : "var(--color-surface)",
                    border: `1px solid ${activo ? "var(--color-accent)" : "var(--color-divider)"}`,
                    fontWeight: activo ? 800 : 400,
                  }}
                >
                  <span
                    className="w-[20px] h-[20px] flex-none border-2 border-[var(--color-text)] grid place-items-center"
                    style={{ background: activo ? "var(--color-accent)" : "transparent" }}
                  >
                    {activo ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f3f2f2" strokeWidth="3.4">
                        <path d="M4 12l5 5L20 6" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="flex-1 min-w-0">{m.nombre}</span>
                </button>
              );
            })}
            {catalogoMotivo.length === 0 ? (
              <div className="px-3.5 py-3 border border-dashed border-black/[.4] text-[13px] opacity-70">
                No hay motivos en el checklist: avisa a coordinacion.
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <label htmlFor="nv-fecha" className={LABEL}>
              Fecha programada
            </label>
            <input
              id="nv-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={`${CAMPO} tabular-nums`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <label htmlFor="nv-hora" className={LABEL}>
              {esInstalacion ? "Hora (obligatoria en instalación)" : "Hora (opcional)"}
            </label>
            <input
              id="nv-hora"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className={`${CAMPO} tabular-nums`}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <label htmlFor="nv-enc" className={LABEL}>
              Responsable de tienda
            </label>
            <input
              id="nv-enc"
              value={encargado}
              onChange={(e) => setEncargado(e.target.value)}
              placeholder="Quién recibe"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className={CAMPO}
            />
          </div>
          <div className="flex-1 min-w-0">
            <label htmlFor="nv-tel" className={LABEL}>
              Teléfono del responsable
            </label>
            <input
              id="nv-tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(fmtTel(e.target.value))}
              onFocus={() => {
                if (!telefono) setTelefono("+56 9 ");
              }}
              placeholder="+56 9 1234 5678"
              autoComplete="off"
              className={`${CAMPO} tabular-nums`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="nv-trab" className={LABEL}>
            Qué se necesita hacer
          </label>
          <textarea
            id="nv-trab"
            rows={3}
            value={trabajo}
            onChange={(e) => setTrabajo(e.target.value)}
            autoComplete="off"
            placeholder="Ej: calibrar las 3 antenas EAS del pórtico principal"
            className={`${CAMPO} min-h-[90px] resize-y leading-[1.4]`}
          />
        </div>

        <button
          type="button"
          onClick={confirmar}
          disabled={guardando}
          className="w-full min-h-[58px] flex items-center justify-between px-4.5 border-0 font-extrabold text-base cursor-pointer text-left text-[var(--color-bg)] hover:brightness-95"
          style={{ background: listo ? "var(--color-accent)" : "#8f8b8b" }}
        >
          <span>{guardando ? "Creando…" : "Crear e iniciar visita"}</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M4 12l5 5L20 6" />
          </svg>
        </button>
      </div>
    </Sheet>
  );
}
