"use client";

import { useRouter } from "next/navigation";
import { detalleActaEnCurso, textoActaEnCurso, type ReservaAjena } from "@/lib/reserva";

/**
 * El aviso que ve el técnico que abre un acta que el otro técnico tiene
 * reservada: quién la tiene, desde qué hora y cuándo se libera. No hay forma de
 * editarla desde acá; la reserva vence sola tras el plazo sin actividad.
 */
export default function ActaEnCurso({
  reserva,
  plazoSeg,
  destacado = false,
}: {
  reserva: ReservaAjena;
  plazoSeg: number;
  /** En la pantalla del formulario ocupa el lugar del acta, con un botón para volver a mirar. */
  destacado?: boolean;
}) {
  const router = useRouter();
  return (
    <div
      role="status"
      className={`${destacado ? "mx-4 mt-6" : "mt-4.5"} p-3.5 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)] text-sm leading-[1.5]`}
    >
      <div className="font-extrabold text-[15px]">{textoActaEnCurso(reserva)}</div>
      <p className="mt-1.5 mb-0">{detalleActaEnCurso(reserva, plazoSeg)}</p>
      <p className="mt-1.5 mb-0 opacity-70">
        Mientras esté en curso no se puede editar. Si no la va a terminar, vuelve a mirar más tarde o pide a
        coordinación que la libere.
      </p>
      {destacado ? (
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-3 min-h-[46px] px-4 bg-[var(--color-text)] text-[var(--color-bg)] border-0 font-extrabold text-sm cursor-pointer"
        >
          Volver a mirar
        </button>
      ) : null}
    </div>
  );
}
