"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";

const initialState: LoginState = { error: null };

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label
          htmlFor="lg-mail"
          className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5"
        >
          Correo
        </label>
        <input
          id="lg-mail"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          required
          className="w-full min-h-[54px] px-3.5 py-3 text-base bg-[var(--color-surface)] border border-[var(--color-divider)] text-[var(--color-text)] caret-[var(--color-accent)] focus-visible:border-[var(--color-accent)] focus-visible:outline-none"
        />
      </div>
      <div>
        <label
          htmlFor="lg-pass"
          className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5"
        >
          Contraseña
        </label>
        <input
          id="lg-pass"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          className="w-full min-h-[54px] px-3.5 py-3 text-base bg-[var(--color-surface)] border border-[var(--color-divider)] text-[var(--color-text)] caret-[var(--color-accent)] focus-visible:border-[var(--color-accent)] focus-visible:outline-none"
        />
      </div>

      {state.error ? (
        <div
          role="alert"
          className="flex gap-2.5 items-start px-3.5 py-2.5 bg-[#f7ded9] border-l-[3px] border-[var(--color-accent)] text-[#8f1400] text-[13px] leading-[1.45]"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            className="shrink-0 mt-0.5"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16.5v.01" />
          </svg>
          <span>{state.error}</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full min-h-[58px] flex items-center justify-between gap-2.5 px-4.5 bg-[var(--color-accent)] text-[var(--color-bg)] border-0 font-extrabold text-base cursor-pointer text-left mt-1.5 hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-active)] disabled:opacity-60"
      >
        <span>{pending ? "Ingresando…" : "Iniciar sesión"}</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>

      <div className="flex justify-between items-center pt-1">
        <a href="#" className="text-[13px] text-[var(--color-accent-active)] underline underline-offset-[3px]">
          Olvidé mi contraseña
        </a>
        <span className="text-[11px] tracking-[.08em] uppercase opacity-60">v0.4 · MVP</span>
      </div>
    </form>
  );
}
