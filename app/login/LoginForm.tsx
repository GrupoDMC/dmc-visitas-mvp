"use client";

import { useActionState, useState } from "react";
import {
  loginAction,
  solicitarPasswordAction,
  type LoginState,
  type SolicitudState,
} from "@/app/actions/auth";

const initialState: LoginState = { error: null };
const initialSolicitud: SolicitudState = { ok: false, error: null };

const CAMPO =
  "w-full min-h-[54px] px-3.5 py-3 text-base bg-[var(--color-surface)] border border-[var(--color-divider)] text-[var(--color-text)] caret-[var(--color-accent)] focus-visible:border-[var(--color-accent)] focus-visible:outline-none";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [verPass, setVerPass] = useState(false);
  const [olvide, setOlvide] = useState(false);

  if (olvide) return <OlvideMiPassword onVolver={() => setOlvide(false)} />;

  return (
    <form action={formAction} className="flex flex-col gap-4" autoComplete="off">
      <div>
        <label htmlFor="lg-mail" className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
          Correo
        </label>
        <input
          id="lg-mail"
          name="email"
          type="email"
          inputMode="email"
          // Nada se autocompleta en el sistema: los equipos de terreno son
          // compartidos y el navegador ofrecía el correo del turno anterior.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          required
          className={CAMPO}
        />
      </div>
      <div>
        <label htmlFor="lg-pass" className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
          Contraseña
        </label>
        {/* El ojo va dentro del campo: un solo control, sin casilla aparte. */}
        <div className="relative">
          <input
            id="lg-pass"
            name="password"
            type={verPass ? "text" : "password"}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="••••••••"
            required
            className={`${CAMPO} pr-[52px]`}
          />
          <button
            type="button"
            onClick={() => setVerPass((v) => !v)}
            aria-label={verPass ? "Ocultar contraseña" : "Ver contraseña"}
            aria-pressed={verPass}
            title={verPass ? "Ocultar contraseña" : "Ver contraseña"}
            className="absolute right-0 top-0 bottom-0 w-[46px] grid place-items-center bg-transparent border-0 cursor-pointer text-[var(--color-text)] opacity-60 hover:opacity-100"
          >
            {verPass ? <IconoOjoTachado /> : <IconoOjo />}
          </button>
        </div>
      </div>

      {state.error ? <Alerta>{state.error}</Alerta> : null}

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
        <button
          type="button"
          onClick={() => setOlvide(true)}
          className="p-0 bg-transparent border-0 text-[13px] text-[var(--color-accent-active)] underline underline-offset-[3px] cursor-pointer"
        >
          Olvidé mi contraseña
        </button>
        <span className="text-[11px] tracking-[.08em] uppercase opacity-60">v0.4 · MVP</span>
      </div>
    </form>
  );
}

/**
 * Recuperación de contraseña.
 *
 * No hay servidor de correo: en vez de mandar un enlace, se registra la
 * solicitud y el administrador la ve en el panel, donde asigna una clave
 * temporal. La pantalla dice exactamente eso para que nadie se quede esperando
 * un correo que no va a llegar.
 */
function OlvideMiPassword({ onVolver }: { onVolver: () => void }) {
  const [state, formAction, pending] = useActionState(solicitarPasswordAction, initialSolicitud);

  if (state.ok) {
    return (
      <div className="flex flex-col gap-4">
        <div className="px-3.5 py-3 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)]">
          <div className="font-extrabold text-[15px] mb-1">Solicitud enviada</div>
          <p className="m-0 text-[13px] leading-[1.5] opacity-75">
            Si ese correo tiene una cuenta, el administrador va a ver la solicitud en el panel y te va a entregar una
            contraseña temporal. No te llega ningún correo: te la pasan por el canal de siempre.
          </p>
        </div>
        <button
          type="button"
          onClick={onVolver}
          className="w-full min-h-[54px] flex items-center justify-between px-4.5 bg-[var(--color-accent)] text-[var(--color-bg)] border-0 font-extrabold text-base cursor-pointer text-left hover:bg-[var(--color-accent-hover)]"
        >
          <span>Volver a iniciar sesión</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" autoComplete="off">
      <div className="px-3.5 py-3 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)] text-[13px] leading-[1.5]">
        Déjanos tu correo y el administrador te asigna una contraseña temporal. No se envía ningún correo automático.
      </div>

      <div>
        <label htmlFor="rec-mail" className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
          Correo con el que entras
        </label>
        <input
          id="rec-mail"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          required
          className={CAMPO}
        />
      </div>

      <div>
        <label htmlFor="rec-msg" className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
          Mensaje para el administrador <span className="opacity-70">(opcional)</span>
        </label>
        <textarea
          id="rec-msg"
          name="mensaje"
          rows={3}
          maxLength={400}
          autoComplete="off"
          placeholder="Por ejemplo: en qué turno estás o a qué número llamarte"
          className={`${CAMPO} min-h-[90px] resize-y leading-[1.45]`}
        />
      </div>

      {state.error ? <Alerta>{state.error}</Alerta> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full min-h-[58px] flex items-center justify-between gap-2.5 px-4.5 bg-[var(--color-accent)] text-[var(--color-bg)] border-0 font-extrabold text-base cursor-pointer text-left hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
      >
        <span>{pending ? "Enviando…" : "Pedir contraseña nueva"}</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onVolver}
        className="w-full min-h-[50px] px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
      >
        Volver a iniciar sesión
      </button>
    </form>
  );
}

function Alerta({ children }: { children: React.ReactNode }) {
  return (
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
      <span>{children}</span>
    </div>
  );
}

function IconoOjo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

function IconoOjoTachado() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <path d="M4 4l16 16" />
    </svg>
  );
}
