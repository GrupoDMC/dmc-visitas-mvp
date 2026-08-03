"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { estaActivo, type ItemNav } from "@/lib/navegacion";

export function NavLateral({
  items,
  alNavegar,
}: {
  items: ItemNav[];
  alNavegar?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones" className="p-3">
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const activo = estaActivo(pathname, item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={alNavegar}
                aria-current={activo ? "page" : undefined}
                className={[
                  "flex min-h-11 items-center rounded-base px-3 text-sm",
                  "transition-colors sm:min-h-10",
                  activo
                    ? "bg-acento-suave font-medium text-acento"
                    : "text-texto hover:bg-fondo",
                ].join(" ")}
              >
                {item.etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
