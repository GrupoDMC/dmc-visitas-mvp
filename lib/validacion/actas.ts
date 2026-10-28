import { z } from "zod";
import {
  arreglo,
  codigo,
  folio,
  idPositivo,
  rutGuardable,
  telefono,
  texto,
  textoLibre,
} from "./comun";
import { subtrabajoActa, trabajoActa } from "./visitas";

// El acta del técnico: cierre, edición, respaldo del borrador y video.

/**
 * Fotos y firma viajan como data URL. Sin regex: son strings de megas. El tope
 * es en caracteres y queda por debajo del cuerpo máximo de la acción (4 MB).
 */
const dataUrlImagen = (max: number) =>
  z.string().max(max, "La imagen es demasiado grande.").startsWith("data:image/", "La imagen no es válida.");

export const fotoActa = z.object({
  dataUrl: dataUrlImagen(6_000_000),
  etiqueta: texto(40).nullable(),
  interno: z.boolean().optional(),
});

export const firmaActa = z.object({
  nombre: texto(120),
  rut: rutGuardable.nullable(),
  dataUrl: dataUrlImagen(1_500_000),
});

/** Un problema del acta. El estado es un código de la Lista 7 (editable): varchar(10). */
const problemaActa = z.object({
  tipoCodigo: codigo,
  estado: z.string().max(10),
  descripcion: textoLibre.nullable(),
  solucion: textoLibre.nullable(),
  items: arreglo(subtrabajoActa, 200),
});

/** «¿Quedó solucionado?» sobre un problema que la visita venía a resolver. */
const resolucionActa = z.object({ problemaId: idPositivo, resuelto: z.boolean() });

export const actaEntrada = z.object({
  folio,
  responsableNombre: texto(120),
  responsableRut: rutGuardable.nullable(),
  responsableTelefono: telefono.nullable(),
  responsableCargo: texto(80).nullable().optional(),
  motivosCodigos: arreglo(codigo, 30),
  observaciones: textoLibre.nullable(),
  comentarioInterno: textoLibre.nullable(),
  internosCodigos: arreglo(codigo, 100).optional(),
  trabajos: arreglo(trabajoActa, 100),
  problemas: arreglo(problemaActa, 100),
  resoluciones: arreglo(resolucionActa, 100).optional(),
  fotos: arreglo(fotoActa, 60),
  videosIds: arreglo(idPositivo, 30).optional(),
  videosInternosIds: arreglo(idPositivo, 30).optional(),
  firma: firmaActa.nullable(),
  dispositivo: texto(60).nullable(),
  capturadaEn: texto(40).nullable().optional(),
  registradoOffline: z.boolean().optional(),
});

const problemaEdicion = z.object({
  id: idPositivo.nullable().optional(),
  tipoCodigo: codigo,
  descripcion: textoLibre.nullable(),
  items: arreglo(subtrabajoActa, 200),
});

export const edicionActaEntrada = z.object({
  folio,
  motivoEdicion: textoLibre,
  edicionesVistas: z.number().int().min(0).max(1_000_000),
  responsableNombre: texto(120),
  responsableRut: rutGuardable.nullable(),
  responsableTelefono: telefono.nullable(),
  responsableCargo: texto(80).nullable().optional(),
  motivosCodigos: arreglo(codigo, 30),
  observaciones: textoLibre.nullable(),
  comentarioInterno: textoLibre.nullable(),
  internosCodigos: arreglo(codigo, 100),
  trabajos: arreglo(trabajoActa, 100),
  problemas: arreglo(problemaEdicion, 100),
  fotosConservadas: arreglo(idPositivo, 100),
  fotosNuevas: arreglo(fotoActa, 60),
  videosIds: arreglo(idPositivo, 30),
  videosInternosIds: arreglo(idPositivo, 30),
});

// ── Borrador ───────────────────────────────────────────────────────────────

/** El respaldo lleva fotos en base64: el mismo tope de siempre, en caracteres. */
export const PAYLOAD_BORRADOR_MAX = 3_000_000;

export const entradaGuardarBorrador = z.object({
  folio,
  payload: z.string().max(PAYLOAD_BORRADOR_MAX),
});

// ── Video ──────────────────────────────────────────────────────────────────

// Solo la forma y topes absurdos: los límites de negocio (25 MB, un minuto,
// 720p) y sus mensajes viven en motivoRechazo (lib/data/videos).
export const datosVideo = z.object({
  mime: z.string().max(40),
  bytes: z.number().int().min(0).max(2_000_000_000),
  duracionSeg: z.number().int().min(0).max(86_400),
  ancho: z.number().int().min(0).max(100_000),
  alto: z.number().int().min(0).max(100_000),
  etiqueta: texto(40).nullable().optional(),
  grabadoEn: texto(40).nullable().optional(),
});

/**
 * El trozo va en base64 (1,5 MB crudos son ~2 MB de texto); el tope deja
 * margen sobre los 4 MB crudos que acepta la capa de datos.
 */
export const trozoVideo = z.object({
  folio,
  videoId: idPositivo,
  desde: z.number().int().min(0).max(25 * 1024 * 1024),
  trozoBase64: z.string().min(1).max(6_000_000),
});

export const entradaVideoId = z.object({ folio, videoId: idPositivo });

// ── Adjuntos del trabajo a realizar ─────────────────────────────────────────
// Solo la forma: los límites de negocio viven en motivoRechazoAdjunto.

export const datosAdjunto = z.object({
  tipo: z.enum(["FOTO", "VIDEO"]),
  mime: z.string().max(40),
  bytes: z.number().int().min(0).max(2_000_000_000),
  nombre: texto(120).nullable().optional(),
  duracionSeg: z.number().int().min(0).max(86_400).nullable().optional(),
});

export const entradaAbrirAdjunto = z.object({ folio, datos: datosAdjunto });

export const trozoAdjunto = z.object({
  folio,
  adjuntoId: idPositivo,
  desde: z.number().int().min(0).max(25 * 1024 * 1024),
  trozoBase64: z.string().min(1).max(6_000_000),
});

export const entradaAdjuntoId = z.object({ folio, adjuntoId: idPositivo });
