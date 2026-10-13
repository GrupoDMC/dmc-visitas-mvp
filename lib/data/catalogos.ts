import "server-only";

// Las listas del checklist. Este archivo solo reúne los módulos por tema:
//
//   catalogos-lectura .... las listas tal como las ven el panel y el celular
//   catalogos-guardado ... el guardado en bloque del borrador del panel
//   catalogos-plantilla .. la plantilla propia (guardar, leer y aplicar)

export * from "@/lib/data/catalogos-lectura";
export * from "@/lib/data/catalogos-guardado";
export * from "@/lib/data/catalogos-plantilla";
