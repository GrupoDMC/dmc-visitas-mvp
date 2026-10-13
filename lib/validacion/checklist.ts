import { z } from "zod";
import { arreglo, idPositivo, texto } from "./comun";

// El borrador del checklist (panel de administración). Todos los nombres y
// etiquetas son nvarchar(80); los rótulos de grupo, nvarchar(60).

const idOAlta = idPositivo.nullable();

const item = z.object({
  id: idOAlta,
  etiqueta: texto(80),
  permiteCantidad: z.boolean(),
});

const simple = z.object({ id: idOAlta, nombre: texto(80) });

const nombres = arreglo(texto(80), 300);

export const borradorChecklist = z.object({
  motivos: arreglo(
    z.object({
      id: idOAlta,
      nombre: texto(80),
      trabajos: nombres.optional(),
      seccion: texto(80).nullable().optional(),
    }),
    300
  ),
  problemas: arreglo(
    z.object({
      id: idOAlta,
      nombre: texto(80),
      grupoLabel: texto(60).nullable(),
      opciones: arreglo(item, 300),
    }),
    300
  ),
  trabajos: arreglo(
    z.object({
      id: idOAlta,
      nombre: texto(80),
      grupoLabel: texto(60).nullable(),
      subtrabajos: arreglo(item, 300),
      seccion: texto(80).nullable().optional(),
      motivos: nombres.optional(),
    }),
    300
  ),
  seccionesMotivo: nombres.optional(),
  seccionesTrabajo: nombres.optional(),
  internos: arreglo(simple, 300).optional(),
  pendientes: arreglo(simple, 300).optional(),
  cargos: arreglo(simple, 300).optional(),
  gestionProblemas: arreglo(simple, 300).optional(),
  estadosProblema: arreglo(simple, 300).optional(),
});
