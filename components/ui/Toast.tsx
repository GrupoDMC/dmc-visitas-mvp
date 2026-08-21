"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Aviso corto en la parte de abajo — el `aviso()` de los mockups. Se usa para
 * confirmar guardados, para explicar por qué no se puede continuar y para
 * avisar el cierre de sesión.
 */
export function useToast() {
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aviso = useCallback((texto: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(texto);
    timer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { toast, aviso };
}

/**
 * `mobile` deja el aviso sobre la barra de tabs del celular; `panel` lo pega
 * al borde inferior de la ventana, como en el mockup de coordinación.
 */
export function Toast({ texto, variante = "mobile" }: { texto: string; variante?: "mobile" | "panel" }) {
  if (!texto) return null;
  const posicion =
    variante === "panel"
      ? "bottom-[26px] w-auto max-w-[min(520px,calc(100%-32px))]"
      : "bottom-[76px] w-[calc(100%-32px)] max-w-[428px]";
  return (
    <div
      role="status"
      className={`fixed left-1/2 -translate-x-1/2 ${posicion} z-[70] px-4 py-3 bg-[var(--color-text)] text-[var(--color-bg)] flex items-center gap-2.5 animate-up-dlg`}
    >
      <span className="w-2 h-2 flex-none bg-[var(--color-accent)]" />
      <span className="text-[13px]">{texto}</span>
    </div>
  );
}
