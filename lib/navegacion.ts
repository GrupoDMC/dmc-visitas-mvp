import type { Rol } from "@/lib/db/tipos";

export type ItemNav = {
  href: string;
  etiqueta: string;
  roles: readonly Rol[];
};

/**
 * Navegación de la aplicación. Cada ítem declara quién lo ve; el filtro
 * vive acá y no repartido por los componentes.
 *
 * Un TECNICO ve únicamente "Mis visitas" — el resto son pantallas de
 * coordinación.
 */
const ITEMS: readonly ItemNav[] = [
  { href: "/mis-visitas", etiqueta: "Mis visitas", roles: ["TECNICO"] },
  { href: "/visitas", etiqueta: "Visitas", roles: ["ADMIN", "COORDINADOR"] },
  { href: "/clientes", etiqueta: "Clientes", roles: ["ADMIN", "COORDINADOR"] },
  { href: "/sucursales", etiqueta: "Sucursales", roles: ["ADMIN", "COORDINADOR"] },
  { href: "/tecnicos", etiqueta: "Técnicos", roles: ["ADMIN", "COORDINADOR"] },
];

export function navegacionPara(rol: Rol): ItemNav[] {
  return ITEMS.filter((item) => item.roles.includes(rol));
}

/** Marca activo el ítem exacto y también sus subrutas (/visitas/123). */
export function estaActivo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
