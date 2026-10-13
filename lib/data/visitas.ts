import "server-only";

// Visitas y todo lo que cuelga de ellas. Este archivo solo reúne los módulos
// por tema, para que quien importa no tenga que saber dónde vive cada cosa:
//
//   visitas-lectura .... la carga de visitas completas y sus filtros
//   visitas-escritura .. estados, alta, corrección, reprogramación y problemas
//   visitas-acta ....... envío, cierre desde el celular y escrituras del acta
//   visitas-medios ..... fotos y firmas servidas desde la base

export * from "@/lib/data/visitas-lectura";
export * from "@/lib/data/visitas-escritura";
export * from "@/lib/data/visitas-acta";
export * from "@/lib/data/visitas-medios";
