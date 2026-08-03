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
  // Misma ruta, distinto nombre y distinta pantalla según el rol: `/visitas`
  // le muestra al técnico sus tarjetas y al coordinador la tabla completa.
  { href: "/visitas", etiqueta: "Mis visitas", roles: ["TECNICO"] },
  { href: "/visitas", etiqueta: "Visitas", roles: ["ADMIN", "COORDINADOR"] },
  { href: "/clientes", etiqueta: "Clientes", roles: ["ADMIN", "COORDINADOR"] },
  { href: "/tecnicos", etiqueta: "Técnicos", roles: ["ADMIN", "COORDINADOR"] },
  { href: "/usuarios", etiqueta: "Usuarios", roles: ["ADMIN"] },
  { href: "/exportar", etiqueta: "Exportar", roles: ["ADMIN"] },
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
 *
 * `/usuarios` y `/exportar` son ADMIN-only, más estrictas que el resto —
 * pero el proxy solo distingue TECNICO de "el resto" (ver `rolDelUsuario` en
 * proxy.ts), así que a un COORDINADOR el proxy lo deja pasar igual. La barrera
 * real para esas dos es `requerirAdmin()` en la página.
 */
export const RUTAS_MAESTROS: readonly string[] = [
  "/clientes",
  "/tecnicos",
  "/usuarios",
  "/exportar",
];

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
