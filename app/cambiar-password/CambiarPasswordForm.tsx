"use client";

import { useActionState, useState } from "react";
import { cambiarPasswordAction, logoutAction, type CambioPasswordState } from "@/app/actions/auth";
import { Alerta, CAMPO } from "@/app/login/LoginForm";

const initialState: CambioPasswordState = { error: null };

export default function CambiarPasswordForm() {
  const [state, formAction, pending] = useActionState(cambiarPasswordAction, initialState);
  const [ver, setVer] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4" autoComplete="off">
        <div>
          <label htmlFor="cp-nueva" className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
            Contraseña nueva
          </label>
          <input
            id="cp-nueva"
            name="nueva"
            type={ver ? "text" : "password"}
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            required
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor="cp-repetida" className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
            Repítela
          </label>
          <input
            id="cp-repetida"
            name="repetida"
            type={ver ? "text" : "password"}
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            required
            className={CAMPO}
          />
        </div>
        <label className="flex items-center gap-2 text-[13px] opacity-75 cursor-pointer">
          <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} />
          Mostrar las contraseñas
        </label>

        {state.error ? <Alerta>{state.error}</Alerta> : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full min-h-[58px] flex items-center justify-between gap-2.5 px-4.5 bg-[var(--color-accent)] text-[var(--color-bg)] border-0 font-extrabold text-base cursor-pointer text-left mt-1.5 hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-active)] disabled:opacity-60"
        >
          <span>{pending ? "Guardando…" : "Guardar y entrar"}</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>

      <form action={logoutAction}>
        <button
          type="submit"
          className="p-0 bg-transparent border-0 text-[13px] text-[var(--color-accent-active)] underline underline-offset-[3px] cursor-pointer"
        >
          Salir sin cambiarla
        </button>
      </form>
    </div>
  );
}
