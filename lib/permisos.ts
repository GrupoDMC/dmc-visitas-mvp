// Catálogo de permisos del panel.
//
// Un permiso es "<módulo>.<acción>". La lista vive acá, en el código, porque
// cada permiso es una comprobación escrita en una acción del servidor: agregar
// uno a mano en la base no haría nada. Lo que sí vive en la base es qué
// permisos tiene cada rol (dmc.rol_permiso).
//
// Este archivo lo importan el servidor y los componentes de cliente.

export interface AccionPermiso {
  clave: string;
  label: string;
}

export interface ModuloPermiso {
  clave: string;
  label: string;
  acciones: AccionPermiso[];
}

/** La acción que abre el módulo: sin ella, las demás no sirven de nada. */
export const VER = "ver";

export const MODULOS: ModuloPermiso[] = [
  { clave: "panel", label: "Panel", acciones: [{ clave: "ver", label: "Ver el panel y sus gráficos" }] },
  {
    clave: "visitas",
    label: "Visitas",
    acciones: [
      { clave: "ver", label: "Ver visitas y actas" },
      { clave: "crear", label: "Agregar visitas (una o masivas)" },
      { clave: "editar", label: "Corregir visitas" },
      { clave: "reprogramar", label: "Cambiar fecha y técnico" },
      { clave: "enviar", label: "Enviar el acta por correo" },
      { clave: "liberar", label: "Liberar visitas en curso" },
      { clave: "cancelar", label: "Cancelar por admin" },
      { clave: "eliminar", label: "Eliminar visitas" },
    ],
  },
  {
    clave: "reagendas",
    label: "Reagendas y pendientes",
    acciones: [{ clave: "ver", label: "Ver reagendas y pendientes" }],
  },
  {
    clave: "problemas",
    label: "Problemas",
    acciones: [
      { clave: "ver", label: "Ver problemas" },
      { clave: "editar", label: "Cambiar estado y tipo" },
    ],
  },
  {
    clave: "tecnicos",
    label: "Técnicos",
    acciones: [
      { clave: "ver", label: "Ver técnicos" },
      { clave: "crear", label: "Agregar técnicos" },
      { clave: "editar", label: "Editar técnicos" },
    ],
  },
  {
    clave: "usuarios",
    label: "Usuarios",
    acciones: [
      { clave: "ver", label: "Ver usuarios" },
      { clave: "crear", label: "Agregar usuarios" },
      { clave: "editar", label: "Editar usuarios" },
      { clave: "contrasenas", label: "Atender contraseñas pedidas" },
      { clave: "roles", label: "Administrar roles y permisos" },
    ],
  },
  {
    clave: "clientes",
    label: "Clientes",
    acciones: [
      { clave: "ver", label: "Ver clientes" },
      { clave: "crear", label: "Agregar clientes" },
      { clave: "editar", label: "Editar clientes" },
    ],
  },
  {
    clave: "malls",
    label: "Malls",
    acciones: [
      { clave: "ver", label: "Ver malls" },
      { clave: "crear", label: "Agregar malls" },
      { clave: "editar", label: "Editar malls y sus tiendas" },
    ],
  },
  {
    clave: "sucursales",
    label: "Sucursales",
    acciones: [
      { clave: "ver", label: "Ver sucursales" },
      { clave: "crear", label: "Agregar sucursales" },
      { clave: "editar", label: "Editar sucursales" },
    ],
  },
  {
    clave: "checklist",
    label: "Checklist",
    acciones: [
      { clave: "ver", label: "Ver el checklist" },
      { clave: "editar", label: "Editar el checklist" },
    ],
  },
];

/** Todos los permisos que existen: lo que tiene el administrador. */
export const TODOS_LOS_PERMISOS: string[] = MODULOS.flatMap((m) => m.acciones.map((a) => `${m.clave}.${a.clave}`));

/**
 * Lo que podía hacer un coordinador antes de que existieran los roles: todo
 * menos lo que era solo del administrador. Es el permiso de un coordinador sin
 * rol asignado y la semilla del rol «Coordinador» de la migración 008.
 */
export const PERMISOS_COORDINADOR: string[] = TODOS_LOS_PERMISOS.filter(
  (p) => !["visitas.liberar", "visitas.cancelar","visitas.eliminar", "usuarios.roles"].includes(p)
);

export function tiene(permisos: readonly string[], permiso: string): boolean {
  return permisos.includes(permiso);
}

/**
 * Deja solo permisos que existen y agrega el "ver" de cada módulo que tenga
 * alguna otra acción marcada: poder editar algo que no se puede abrir no
 * significa nada.
 */
export function normalizarPermisos(permisos: readonly string[]): string[] {
  const validos = new Set(permisos.filter((p) => TODOS_LOS_PERMISOS.includes(p)));
  for (const p of [...validos]) validos.add(`${p.split(".")[0]}.${VER}`);
  return TODOS_LOS_PERMISOS.filter((p) => validos.has(p));
}
