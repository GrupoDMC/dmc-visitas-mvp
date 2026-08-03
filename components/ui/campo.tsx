import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Campo de formulario. La etiqueta va SIEMPRE arriba del control: el
 * placeholder no es una etiqueta, desaparece justo cuando hace falta.
 */
export function Campo({
  htmlFor,
  etiqueta,
  ayuda,
  error,
  opcional,
  children,
}: {
  htmlFor: string;
  etiqueta: string;
  ayuda?: string;
  error?: string;
  opcional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-texto">
        {etiqueta}
        {opcional ? (
          <span className="ml-1.5 font-normal text-suave">(opcional)</span>
        ) : null}
      </label>
      {ayuda ? (
        <p id={`${htmlFor}-ayuda`} className="text-xs text-suave">
          {ayuda}
        </p>
      ) : null}
      {children}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          className="text-xs text-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Input de 40px de alto, como manda la densidad definida. */
export function Entrada({
  invalido,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalido || undefined}
      className={[
        "h-10 w-full rounded-base border bg-superficie px-3 text-base text-texto",
        "placeholder:text-suave",
        invalido ? "border-error" : "border-borde",
        "focus:border-acento focus:outline-none focus-visible:outline-2",
        "focus-visible:outline-offset-2 focus-visible:outline-acento",
        "disabled:cursor-not-allowed disabled:bg-fondo disabled:text-suave",
        className,
      ].join(" ")}
    />
  );
}

/**
 * Select nativo. No hay combobox propio a propósito: el nativo ya sabe teclado,
 * lector de pantalla y rueda de iOS, y no hay nada acá que lo necesite mejor.
 */
export function Selector({
  invalido,
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalido?: boolean }) {
  return (
    <select
      {...props}
      aria-invalid={invalido || undefined}
      className={[
        "h-10 w-full appearance-none rounded-base border bg-superficie px-3",
        "text-base text-texto",
        // La flecha va como fondo: el appearance-none de arriba borra la nativa.
        "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%221.75%22%20stroke-linecap%3D%22round%22%3E%3Cpath%20d%3D%22M6%208l4%204%204-4%22/%3E%3C/svg%3E')]",
        "bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-9",
        invalido ? "border-error" : "border-borde",
        "focus:border-acento focus:outline-none focus-visible:outline-2",
        "focus-visible:outline-offset-2 focus-visible:outline-acento",
        "disabled:cursor-not-allowed disabled:bg-fondo disabled:text-suave",
        className,
      ].join(" ")}
    >
      {children}
    </select>
  );
}

/**
 * Textarea. Va SIEMPRE controlada desde afuera, igual que el resto: React 19
 * vacía los campos no controlados en cuanto termina la acción, también cuando
 * vuelve con un error de validación, y acá lo que se pierde son párrafos.
 */
export function AreaTexto({
  invalido,
  className = "",
  rows = 4,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalido?: boolean }) {
  return (
    <textarea
      {...props}
      rows={rows}
      aria-invalid={invalido || undefined}
      className={[
        "w-full rounded-base border bg-superficie px-3 py-2 text-base text-texto",
        "placeholder:text-suave",
        invalido ? "border-error" : "border-borde",
        "focus:border-acento focus:outline-none focus-visible:outline-2",
        "focus-visible:outline-offset-2 focus-visible:outline-acento",
        "disabled:cursor-not-allowed disabled:bg-fondo disabled:text-suave",
        className,
      ].join(" ")}
    />
  );
}

/**
 * Casilla con su etiqueta al lado. El área táctil abarca las dos cosas y no
 * baja de 44px de alto.
 */
export function Casilla({
  id,
  name,
  etiqueta,
  descripcion,
  defaultChecked,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  name: string;
  etiqueta: string;
  descripcion?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (marcada: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-h-11 items-start gap-3 py-1.5">
      <input
        id={id}
        name={name}
        // El valor viaja solo si la casilla está marcada, que es justo lo que
        // leen las acciones con marcada().
        value="si"
        type="checkbox"
        defaultChecked={defaultChecked}
        checked={checked}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
        disabled={disabled}
        className="mt-2.5 size-4 shrink-0 accent-acento disabled:cursor-not-allowed disabled:opacity-60"
      />
      <label
        htmlFor={id}
        className={disabled ? "py-1.5" : "cursor-pointer py-1.5"}
      >
        <span className="block text-sm font-medium text-texto">{etiqueta}</span>
        {descripcion ? (
          <span className="mt-0.5 block text-xs text-suave">{descripcion}</span>
        ) : null}
      </label>
    </div>
  );
}
