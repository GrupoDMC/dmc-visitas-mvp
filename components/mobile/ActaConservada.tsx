"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { borradorConDatos, borrarBorrador, haceCuanto, leerActaEnCola, leerBorrador, sacarDeCola } from "@/lib/ui/borrador";
import { useUsuarioLocal } from "@/lib/ui/usuario-local";

/**
 * Lo que este celular guardó de una visita que el otro técnico cerró primero:
 * el acta en cola o el borrador. No se envía —la visita ya tiene acta— ni se
 * descarta solo: se avisa y es el técnico quien decide botarlo.
 */
export default function ActaConservada({ folio, cerroNombre }: { folio: string; cerroNombre: string }) {
  const uid = useUsuarioLocal();
  const router = useRouter();
  const [guardado, setGuardado] = useState<{ tipo: "acta" | "borrador"; desde: string } | null>(null);

  useEffect(() => {
    const cola = leerActaEnCola(uid, folio);
    if (cola) return setGuardado({ tipo: "acta", desde: cola.capturadaEn });
    const borrador = leerBorrador(uid, folio);
    setGuardado(borradorConDatos(borrador) && borrador ? { tipo: "borrador", desde: borrador.guardadoEn } : null);
  }, [uid, folio]);

  if (!guardado) return null;

  function descartar() {
    if (!window.confirm("¿Descartar lo que quedó en este celular? No se puede recuperar.")) return;
    sacarDeCola(uid, folio);
    borrarBorrador(uid, folio);
    setGuardado(null);
    router.refresh();
  }

  return (
    <div className="mt-3 p-3.5 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)]">
      <div className="text-[10px] tracking-[.12em] uppercase text-[var(--color-accent-800)] mb-1.5">
        {guardado.tipo === "acta" ? "Tu acta no se envió" : "Tu borrador no se envió"}
      </div>
      <div className="text-sm leading-[1.5] text-[var(--color-accent-800)]">
        {cerroNombre} ya cerró esta visita. {guardado.tipo === "acta" ? "El acta que dejaste" : "El borrador que dejaste"}{" "}
        {haceCuanto(guardado.desde)} sigue guardado en este celular, sin enviarse. Si hace falta algo de lo que
        escribiste, coordinación puede corregir el acta desde el panel.
      </div>
      <button
        type="button"
        onClick={descartar}
        className="mt-2.5 min-h-11 px-1 bg-transparent border-0 text-[var(--color-accent-active)] text-[13px] underline underline-offset-4 cursor-pointer"
      >
        Descartar lo guardado en este celular
      </button>
    </div>
  );
}
