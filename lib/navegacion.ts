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
  { href: "/tecnicos", etiqueta: "Técnicos", roles: ["ADMIN", "COORDINADOR"] },
];

/**
 * "Sucursales" no está en la navegación a propósito: se administran desde la
 * ficha de su cliente y no tienen listado propio de primer nivel.
 */

/** Adonde se manda a un TECNICO que intenta entrar a una pantalla de maestros. */
export const INICIO_TECNICO = "/visitas";

/**
 * Los maestros. Un TECNICO que llegue a cualquiera de estas por URL directa se
 * va rebotado desde el proxy.
 *
 * `/visitas` NO está en la lista y no puede estarlo: es el destino del rebote,
 * y una ruta que rebota hacia sí misma es un bucle de redirecciones. Además en
 * la fase 3 `/visitas` pasa a mostrarle al técnico sus propias visitas, así
 * que es una pantalla compartida, no de coordinación.
 */
export const RUTAS_MAESTROS: readonly string[] = ["/clientes", "/tecnicos"];

export function esRutaDeMaestros(pathname: string): boolean {
  return RUTAS_MAESTROS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
  );
}

export function navegacionPara(rol: Rol): ItemNav[] {
  return ITEMS.filter((item) => item.roles.includes(rol));
}

/** Marca activo el ítem exacto y también sus subrutas (/visitas/123). */
export function estaActivo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
