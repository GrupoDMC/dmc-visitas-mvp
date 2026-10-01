import type { ReactNode } from "react";

export default function AdminHeader({
  kicker,
  title,
  children,
  pestanas,
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
  /** Pestañas de la sección, bajo el título (ver Usuarios). */
  pestanas?: ReactNode;
}) {
  return (
    <div className="lg:sticky lg:top-0 z-10 bg-[var(--color-bg)] border-b-2 border-[var(--color-divider)] flex items-end gap-x-5 gap-y-3 px-4 md:px-7 pt-4 md:pt-[22px] pb-4 flex-wrap">
      <div className="min-w-0">
        <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">{kicker}</div>
        <h1 className="font-extrabold text-[24px] md:text-[30px] leading-[1.08] tracking-[-.03em] mt-1.5">{title}</h1>
      </div>
      {children ? <div className="ml-auto flex items-center gap-2 md:gap-3 flex-wrap">{children}</div> : null}
      {pestanas ? <div className="basis-full min-w-0 flex items-center gap-1.5 -mb-4 pt-3">{pestanas}</div> : null}
    </div>
  );
}
