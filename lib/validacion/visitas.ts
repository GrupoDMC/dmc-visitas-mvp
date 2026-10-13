import { z } from "zod";
import {
  arreglo,
  codigo,
  fechaISO,
  fechaOVacia,
  folio,
  hora,
  horaOVacia,
  idElegible,
  idPositivo,
  rutGuardable,
  telefono,
  texto,
  textoLibre,
} from "./comun";

// Visitas: agendar y gestionar (panel), el celular del técnico y las
// «acciones para múltiples visitas».

const OBLIGATORIOS = "Cliente, sucursal y técnico asignado son obligatorios.";

/** Un id que la pantalla ya exige: si falta, el mensaje es el de siempre. */
const idObligatorio = z
  .number(OBLIGATORIOS)
  .int(OBLIGATORIOS)
  .positive(OBLIGATORIOS)
  .max(Number.MAX_SAFE_INTEGER, OBLIGATORIOS);

/** Un trabajo marcado en el acta, con sus subtrabajos. */
export const subtrabajoActa = z.object({
  etiqueta: texto(80),
  cantidad: z.number().int().min(0).max(100_000),
});

export const trabajoActa = z.object({
  codigo,
  motivoCodigo: codigo.nullable().optional(),
  detalle: textoLibre.nullable(),
  subtrabajos: arreglo(subtrabajoActa, 200),
});

/** Los datos con que se agenda o se corrige una visita (DatosVisita). */
export const datosVisita = z.object({
  clienteId: idObligatorio,
  sucursalId: idObligatorio,
  tecnicoId: idObligatorio,
  tecnicoAyudanteId: idElegible.nullable().optional(),
  motivoCodigo: codigo,
  motivosCodigos: arreglo(codigo, 30).optional(),
  fechaProgramada: fechaOVacia,
  fechaHasta: fechaOVacia.nullable().optional(),
  horaProgramada: horaOVacia.nullable(),
  trabajoSolicitado: textoLibre,
  indicacionesAcceso: textoLibre.nullable(),
  responsableNombre: texto(120).nullable(),
  responsableRut: rutGuardable.nullable(),
  responsableTelefono: telefono.nullable(),
  responsableCargo: texto(80).nullable().optional(),
  problemaOrigenId: idPositivo.nullable().optional(),
  creadaEnTerreno: z.boolean().optional(),
});

/** Una ruta: tantos locales como una jornada pueda llevar. */
export const entradaVisitasMasivas = arreglo(datosVisita, 300);

export const entradaEditarVisita = z.object({ folio, datos: datosVisita });

export const entradaReprogramar = z.object({
  folio,
  tecnicoId: idPositivo,
  fecha: fechaISO,
  hora: hora.nullable(),
});

export const entradaCancelarAdmin = z.object({ folio, motivo: textoLibre });

export const entradaEliminarVisita = z.object({ folio, confirmacionFolio: texto(16) });

export const entradaFolio = folio;

// ── Lotes ──────────────────────────────────────────────────────────────────

/** El diálogo manda las visitas por tandas de 25; el tope deja margen. */
const TANDA = 50;

export const cambiosVisita = z.object({
  tecnicoId: idElegible.optional(),
  tecnicoAyudanteId: idElegible.nullable().optional(),
  fecha: fechaOVacia.optional(),
  hora: horaOVacia.optional(),
  motivosCodigos: arreglo(codigo, 30).optional(),
  trabajoSolicitado: textoLibre.optional(),
  indicacionesAcceso: textoLibre.optional(),
});

export const entradaModificarVisitas = arreglo(z.object({ folio, cambios: cambiosVisita }), TANDA);

export const entradaCancelarVisitas = arreglo(z.object({ folio, motivo: textoLibre }), TANDA);

export const entradaEliminarVisitas = z.object({
  folios: arreglo(folio, TANDA),
  total: z.number().int().min(0).max(1_000_000),
  confirmacion: texto(40),
});

// ── Problemas y pendientes ─────────────────────────────────────────────────

export const entradaActualizarProblema = z.object({
  problemaId: idPositivo,
  // Los estados son los de la Lista 7 del checklist (editable): varchar(10).
  estado: z.string().min(1).max(10),
  tipoCodigo: codigo,
  nota: textoLibre.optional(),
});

export const entradaGestionPendiente = z.object({ folio, codigo, marcado: z.boolean() });

export const entradaGestionProblema = z.object({ problemaId: idPositivo, codigo, marcado: z.boolean() });

export const entradaEnviarActa = z.object({
  folio,
  para: texto(600),
  cc: texto(600),
  asunto: texto(240),
  cuerpo: textoLibre.optional(),
  adjuntos: z.number().int().min(0).max(1000),
});

// ── Celular del técnico ────────────────────────────────────────────────────

/** Lo que el técnico puede hacer con una visita suya desde «Otras acciones». */
export const entradaCambiarEstado = z.object({
  folio,
  estado: z.enum(["REAGENDADA", "PENDIENTE", "CANCELADA"]),
  motivo: textoLibre,
  fechaNueva: fechaOVacia.nullable().optional(),
  horaNueva: horaOVacia.nullable().optional(),
});

export const entradaCrearVisitaTecnico = z.object({
  sucursalId: idElegible,
  motivoCodigo: codigo,
  motivosCodigos: arreglo(codigo, 30).optional(),
  fecha: fechaOVacia,
  hora: horaOVacia.nullable(),
  tecnicoAyudanteId: idElegible.nullable().optional(),
  responsableNombre: texto(120),
  responsableRut: rutGuardable,
  responsableTelefono: telefono,
  responsableCargo: texto(80).optional(),
  trabajo: textoLibre,
});

// ── Visitas en papel ───────────────────────────────────────────────────────

export const informePapel = z.object({
  clienteId: idElegible,
  sucursalId: idElegible,
  tecnicoId: idElegible,
  tecnicoAyudanteId: idElegible.nullable(),
  motivosCodigos: arreglo(codigo, 30),
  trabajos: arreglo(trabajoActa, 100).optional(),
  fecha: z.string().max(10),
  firmanteNombre: texto(120),
  firmanteRut: rutGuardable.nullable(),
  descripcion: textoLibre,
  aunqueRepetida: z.boolean().optional(),
});

export const entradaVisitasPapel = z.object({ informes: arreglo(informePapel, 150) });

export const entradaFirmantes = z.object({ sucursalIds: arreglo(idElegible, 200) });

export const entradaPersonasLocal = idPositivo;
