import type { ReactNode } from "react";

export default function AdminHeader({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 bg-[var(--color-bg)] border-b-2 border-[var(--color-divider)] flex items-end gap-5 px-7 pt-[22px] pb-4 flex-wrap">
      <div className="min-w-0">
        <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">{kicker}</div>
        <h1 className="font-extrabold text-[30px] leading-[1.08] tracking-[-.03em] mt-1.5">{title}</h1>
      </div>
      {children ? <div className="ml-auto flex items-center gap-3">{children}</div> : null}
    </div>
  );
}
