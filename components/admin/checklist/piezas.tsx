"use client";

import { useState } from "react";
import { type Motivo, mover, nombreDeCopia, nuevaClave, reubicar } from "@/components/admin/checklist/modelo";

// Las piezas del editor del checklist: la caja de una sección, el bloque de
// cada lista, las filas simples y arrastrables, y los íconos.

/**
 * Una sección de la Lista 1 o de la Lista 3: una caja que se pliega, con su
 * nombre editable, su lugar entre las demás y un atajo para crear dentro de ella.
 * «Sin sección» (`fija`) es la misma caja sin nombre editable ni quitar.
 */
export function CajaSeccion({
  nombre,
  phNombre,
  fija,
  cuenta,
  abierta,
  onToggle,
  onRenombrar,
  onSubir,
  onBajar,
  onQuitar,
  cta,
  onNuevo,
  children,
}: {
  nombre: string;
  phNombre?: string;
  fija?: boolean;
  cuenta: string;
  abierta: boolean;
  onToggle: () => void;
  onRenombrar?: (nombre: string) => void;
  onSubir?: () => void;
  onBajar?: () => void;
  onQuitar?: () => void;
  cta: string;
  onNuevo: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-2 border-black/[.45] bg-[var(--color-bg)]">
      <div
        className="flex items-center gap-2.5 flex-wrap px-3 py-2.5"
        style={{ background: abierta ? "#d9d7d6" : "var(--color-surface)" }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={abierta}
          aria-label={abierta ? "Plegar la sección" : "Desplegar la sección"}
          className="btn btn-icon w-8.5 h-8.5 flex-none border border-black/[.3]"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            className="transition-transform duration-150"
            style={{ transform: `rotate(${abierta ? 180 : 0}deg)` }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {fija || !onRenombrar ? (
          <div className="flex-1 min-w-[160px] font-extrabold text-[15px] opacity-80">{nombre}</div>
        ) : (
          <input
            value={nombre}
            onChange={(e) => onRenombrar(e.target.value)}
            placeholder={phNombre}
            className="input flex-1 min-w-[160px] min-h-10 font-extrabold text-[15px] bg-[var(--color-bg)]"
            aria-label="Nombre de la sección"
            autoComplete="off"
          />
        )}
        <span className="text-[11px] leading-[1.2] tracking-[.06em] uppercase opacity-62">{cuenta}</span>
        {fija ? null : (
          <>
            <button
              type="button"
              onClick={onSubir}
              disabled={!onSubir}
              className="btn btn-icon w-8.5 h-8.5 flex-none border border-black/[.3] disabled:opacity-30"
              aria-label="Subir la sección"
              title="Subir la sección"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={onBajar}
              disabled={!onBajar}
              className="btn btn-icon w-8.5 h-8.5 flex-none border border-black/[.3] disabled:opacity-30"
              aria-label="Bajar la sección"
              title="Bajar la sección"
            >
              ↓
            </button>
          </>
        )}
        <button type="button" onClick={onNuevo} className="btn btn-secondary min-h-[34px] px-2.5 text-[12px]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>{cta}</span>
        </button>
        {fija || !onQuitar ? null : (
          <button
            type="button"
            onClick={onQuitar}
            className="btn btn-icon w-8.5 h-8.5 flex-none border border-black/[.3]"
            aria-label="Quitar la sección"
            title="Quitar la sección (sus entradas pasan a «Sin sección»)"
          >
            <IconoBasura />
          </button>
        )}
      </div>
      {abierta ? <div className="p-3 flex flex-col gap-2.5 border-t border-black/[.25]">{children}</div> : null}
    </div>
  );
}

export function Bloque({
  numero,
  titulo,
  bajada,
  cta,
  onAgregar,
  ctaExtra,
  children,
}: {
  numero: string;
  titulo: string;
  bajada: string;
  cta: string;
  onAgregar: () => void;
  /** Un segundo botón junto al principal (en las listas con secciones: «Nueva sección»). */
  ctaExtra?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="border-t-2 border-[var(--color-divider)] pt-4 mb-11">
      <div className="flex items-end gap-3.5 flex-wrap mb-4">
        <div className="min-w-0">
          <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">{numero}</div>
          <h2 className="font-extrabold text-[21px] leading-[1.15] tracking-[-.02em] mt-1.5 mb-1">{titulo}</h2>
          <p className="m-0 text-[13px] opacity-68 max-w-[64ch]">{bajada}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {ctaExtra ? (
            <button className="btn btn-secondary min-h-10 px-3.5 text-[13px]" onClick={ctaExtra.onClick}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>{ctaExtra.label}</span>
            </button>
          ) : null}
          <button className="btn btn-secondary min-h-10 px-3.5 text-[13px]" onClick={onAgregar}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>{cta}</span>
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * Lista plana y reordenable: comentario interno, gestión y estados. Cada fila es un
 * nombre con su código, un botón para clonar y otro para quitar.
 */
export function FilasSimples({
  grupo,
  lista,
  visibles,
  bloqueado,
  que,
  placeholder,
  onEditar,
  onPedirQuitar,
}: {
  grupo: string;
  lista: Motivo[];
  visibles: { m: Motivo; i: number }[];
  bloqueado: boolean;
  que: string;
  placeholder: string;
  onEditar: (fn: (prev: Motivo[]) => Motivo[]) => void;
  onPedirQuitar: (m: Motivo) => void;
}) {
  return (
    <div className="flex flex-col gap-2 max-w-[720px]">
      {visibles.map(({ m, i }) => (
        <Arrastrable
          key={m.key}
          grupo={grupo}
          indice={i}
          total={lista.length}
          bloqueado={bloqueado}
          onReordenar={(desde, ranura) => onEditar((prev) => reubicar(prev, desde, ranura))}
          onMover={(d) => onEditar((prev) => mover(prev, i, d))}
          className="flex items-center gap-2.5"
        >
          {(agarre) => (
            <>
              {agarre}
              <Numero n={i + 1} />
              <input
                value={m.nombre}
                onChange={(e) =>
                  onEditar((prev) => prev.map((x) => (x.key === m.key ? { ...x, nombre: e.target.value } : x)))
                }
                placeholder={placeholder}
                className="input flex-1 min-w-0 bg-[var(--color-surface-3)]"
                aria-label={`Nombre del ${que}`}
                autoComplete="off"
              />
              <Codigo codigo={m.codigo} />
              <button
                onClick={() =>
                  onEditar((prev) => {
                    const copia: Motivo = {
                      key: nuevaClave(),
                      id: null,
                      codigo: null,
                      nombre: nombreDeCopia(m.nombre, prev.map((x) => x.nombre)),
                    };
                    const nueva = [...prev];
                    nueva.splice(i + 1, 0, copia);
                    return nueva;
                  })
                }
                className="btn btn-icon w-10 h-10 flex-none border border-black/[.3]"
                aria-label={`Clonar ${que}`}
                title={`Clonar este ${que}`}
              >
                <IconoClonar />
              </button>
              <button
                onClick={() => onPedirQuitar(m)}
                className="btn btn-icon w-10 h-10 flex-none border border-black/[.3]"
                aria-label={`Quitar ${que}`}
              >
                <IconoBasura />
              </button>
            </>
          )}
        </Arrastrable>
      ))}
    </div>
  );
}

/** Elige si el subdetalle se marca a secas o si además lleva cantidad. */
export function ModoItem({
  permiteCantidad,
  onCambiar,
}: {
  permiteCantidad: boolean;
  onCambiar: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-none" role="group" aria-label="Cómo se registra en el celular">
      <button
        type="button"
        onClick={() => onCambiar(false)}
        title="En el celular sale como una casilla: se marca y listo."
        className="min-h-10 px-2.5 border border-black/[.3] border-r-0 cursor-pointer text-[11px] leading-none tracking-[.06em] uppercase"
        style={{
          background: permiteCantidad ? "transparent" : "var(--color-text)",
          color: permiteCantidad ? "var(--color-text)" : "var(--color-bg)",
        }}
      >
        Marcar
      </button>
      <button
        type="button"
        onClick={() => onCambiar(true)}
        title="En el celular sale con un contador: se marca y se indica cuántos."
        className="min-h-10 px-2.5 border border-black/[.3] cursor-pointer text-[11px] leading-none tracking-[.06em] uppercase"
        style={{
          background: permiteCantidad ? "var(--color-text)" : "transparent",
          color: permiteCantidad ? "var(--color-bg)" : "var(--color-text)",
        }}
      >
        Cantidad
      </button>
    </div>
  );
}

/**
 * Fila que se reordena arrastrándola.
 *
 * Antes el orden se cambiaba de a un clic por posición, con dos flechitas: para
 * bajar una entrada seis lugares había que apretar seis veces. Ahora se agarra
 * de la manilla y se suelta donde va.
 *
 * Solo la manilla arrastra: si la fila entera fuera arrastrable, seleccionar
 * texto dentro de sus campos empezaría a mover la fila. Y la manilla también
 * responde a las flechas del teclado, para quien no usa el mouse.
 */
export function Arrastrable({
  grupo,
  indice,
  total,
  bloqueado,
  onReordenar,
  onMover,
  className,
  children,
}: {
  /** Filas del mismo grupo se aceptan entre sí; de otro grupo, no. */
  grupo: string;
  indice: number;
  total: number;
  /** Con la búsqueda puesta no se ven todas las filas: mover sería a ciegas. */
  bloqueado: boolean;
  /** Suelta la fila `desde` en la ranura `ranura` (hueco entre filas). */
  onReordenar: (desde: number, ranura: number) => void;
  /** El equivalente por teclado: una posición arriba o abajo. */
  onMover: (delta: number) => void;
  className?: string;
  children: (agarre: React.ReactNode) => React.ReactNode;
}) {
  const [asido, setAsido] = useState(false);
  const [borde, setBorde] = useState<"arriba" | "abajo" | null>(null);
  // El tipo del dataTransfer es lo único legible durante el dragover, así que
  // el grupo viaja en el nombre del tipo. Debe ir en minúsculas.
  const tipo = `application/x-dmc-${grupo.toLowerCase()}`;

  const mitadDeArriba = (e: React.DragEvent<HTMLDivElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    return e.clientY < caja.top + caja.height / 2;
  };

  const agarre = (
    <button
      type="button"
      draggable={false}
      disabled={bloqueado}
      onPointerDown={() => setAsido(true)}
      onPointerUp={() => setAsido(false)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        onMover(e.key === "ArrowUp" ? -1 : 1);
      }}
      aria-label={`Mover: fila ${indice + 1} de ${total}`}
      title={
        bloqueado
          ? "Quita la búsqueda para poder reordenar"
          : "Arrastra para cambiar el orden (o usa ↑ ↓ del teclado)"
      }
      className="w-7 h-9 flex-none grid place-items-center border border-black/[.3] bg-[var(--color-bg)] text-[var(--color-text)] cursor-grab active:cursor-grabbing hover:bg-black/[.08] disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="9" cy="6" r="1.7" />
        <circle cx="15" cy="6" r="1.7" />
        <circle cx="9" cy="12" r="1.7" />
        <circle cx="15" cy="12" r="1.7" />
        <circle cx="9" cy="18" r="1.7" />
        <circle cx="15" cy="18" r="1.7" />
      </svg>
    </button>
  );

  return (
    <div
      draggable={asido && !bloqueado}
      onDragStart={(e) => {
        if (!asido || bloqueado) return e.preventDefault();
        e.dataTransfer.setData(tipo, String(indice));
        e.dataTransfer.effectAllowed = "move";
        // Las filas de subdetalle viven dentro de la fila de su grupo: sin esto
        // el arrastre del sub burbujea al Arrastrable de afuera, que —al no
        // estar asido— lo cancela con preventDefault y nada se mueve.
        e.stopPropagation();
      }}
      onDragEnd={(e) => {
        setAsido(false);
        setBorde(null);
        e.stopPropagation();
      }}
      onDragOver={(e) => {
        if (bloqueado || !e.dataTransfer.types.includes(tipo)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setBorde(mitadDeArriba(e) ? "arriba" : "abajo");
      }}
      onDragLeave={() => setBorde(null)}
      onDrop={(e) => {
        setBorde(null);
        if (bloqueado || !e.dataTransfer.types.includes(tipo)) return;
        e.preventDefault();
        e.stopPropagation();
        const desde = Number(e.dataTransfer.getData(tipo));
        if (!Number.isInteger(desde)) return;
        onReordenar(desde, mitadDeArriba(e) ? indice : indice + 1);
      }}
      className={`relative ${className ?? ""}`}
      style={{ opacity: asido ? 0.55 : 1 }}
    >
      {borde ? (
        <span
          aria-hidden="true"
          className="absolute left-0 right-0 h-[3px] bg-[var(--color-accent)] pointer-events-none z-10"
          style={borde === "arriba" ? { top: -2 } : { bottom: -2 }}
        />
      ) : null}
      {children(agarre)}
    </div>
  );
}

/**
 * El código interno de la entrada.
 *
 * Es la llave con la que las visitas y las actas apuntan a esta fila
 * (motivo_codigo, trabajo_codigo, tipo_codigo). Se genera solo a partir del
 * nombre la primera vez y no cambia nunca más: si cambiara, un acta firmada
 * hace un año dejaría de poder decir qué trabajo se hizo. Por eso se muestra
 * pero no se edita.
 */
export function Codigo({ codigo }: { codigo: string | null }) {
  if (!codigo) {
    return (
      <span
        className="flex-none text-[10px] tracking-[.06em] uppercase opacity-45"
        title="El código interno se genera solo al guardar, a partir del nombre."
      >
        sin código aún
      </span>
    );
  }
  return (
    <code
      className="flex-none px-1.5 py-0.5 text-[10px] tracking-[.04em] bg-black/[.06] opacity-70"
      title="Código interno: con él las visitas y las actas ya firmadas apuntan a esta entrada. Se genera solo y no cambia aunque le cambies el nombre."
    >
      {codigo}
    </code>
  );
}

export function Numero({ n }: { n: number }) {
  return (
    <span className="w-6.5 h-6.5 flex-none grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs tabular-nums">
      {n}
    </span>
  );
}

export function Vacio({ children, grande }: { children: React.ReactNode; grande?: boolean }) {
  return (
    <div
      className={`border border-dashed border-black/[.4] opacity-70 ${grande ? "p-6.5 text-sm" : "p-3.5 text-[13px]"}`}
    >
      {children}
    </div>
  );
}

export function IconoClonar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 9h11v11H9z" />
      <path d="M4 15V4h11" />
    </svg>
  );
}

export function IconoBasura() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </svg>
  );
}
