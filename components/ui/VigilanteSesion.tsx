"use client";

import { useEffect } from "react";

/**
 * Saca al usuario apenas vence la sesión y la mantiene viva mientras trabaja.
 *
 * Dos cosas que el middleware solo no resuelve:
 *
 * - Vencer "de una": sin esto la pantalla seguía abierta con la sesión muerta
 *   y el usuario recién se enteraba al hacer clic, a veces después de llenar
 *   algo que no se iba a poder guardar. Acá se mira la hora de vencimiento
 *   (cookie dmc_exp) cada pocos segundos y, al pasarla, se va a /login.
 *
 * - Renovar por actividad y no solo por tiempo: tocar la pantalla o escribir
 *   no genera peticiones al servidor, así que un técnico llenando el acta sin
 *   guardar nada se quedaba sin sesión a mitad. Cada tanto, si hubo actividad,
 *   se avisa al servidor (POST /api/sesion) y el middleware renueva el token.
 */

const COOKIE_EXPIRA = "dmc_exp";
/** Cada cuánto se mira si ya venció. */
const CADA_CUANTO_MIRA = 5_000;
/** Como mucho un aviso de actividad por este intervalo. */
const AVISO_CADA = 60_000;

function leerExpira(): number | null {
  const par = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_EXPIRA}=`));
  const valor = Number(par?.slice(COOKIE_EXPIRA.length + 1));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

function salir() {
  window.location.replace("/login?expirada=1");
}

export default function VigilanteSesion() {
  useEffect(() => {
    let ultimoAviso = 0;
    let avisando = false;

    const avisar = async () => {
      if (avisando) return;
      avisando = true;
      ultimoAviso = Date.now();
      try {
        const res = await fetch("/api/sesion", { method: "POST", cache: "no-store" });
        if (res.status === 401) salir();
      } catch {
        // Sin señal: no se puede renovar ni confirmar nada. Se vuelve a
        // intentar con la próxima actividad.
        ultimoAviso = 0;
      } finally {
        avisando = false;
      }
    };

    const mirar = () => {
      const exp = leerExpira();
      if (exp === null) {
        // Sesión abierta antes de que existiera la cookie: el aviso la trae.
        if (!avisando && Date.now() - ultimoAviso > CADA_CUANTO_MIRA) void avisar();
        return;
      }
      if (exp * 1000 <= Date.now()) salir();
    };

    const actividad = () => {
      if (Date.now() - ultimoAviso >= AVISO_CADA) void avisar();
    };

    mirar();
    const id = setInterval(mirar, CADA_CUANTO_MIRA);
    const eventos = ["pointerdown", "keydown", "input", "scroll"] as const;
    for (const e of eventos) window.addEventListener(e, actividad, { passive: true, capture: true });
    // Al volver a la pestaña (celular desbloqueado) se revisa en el acto.
    document.addEventListener("visibilitychange", mirar);

    return () => {
      clearInterval(id);
      for (const e of eventos) window.removeEventListener(e, actividad, { capture: true });
      document.removeEventListener("visibilitychange", mirar);
    };
  }, []);

  return null;
}
