"use client";

import type { ActaEntrada } from "@/lib/data/visitas";
import type { EstadoProblema } from "@/lib/types";

/**
 * Lo que el técnico lleva escrito, guardado en el propio celular.
 *
 * Dos cosas viven acá, y las dos existen por lo mismo: en terreno la señal se
 * cae y el celular se apaga.
 *
 * 1. El BORRADOR — todo lo que hay en el formulario, escrito en el celular en
 *    cuanto se toca algo. Si la app se cierra a mitad de un acta (una llamada,
 *    la batería, un cierre por error), al volver a entrar está todo donde
 *    estaba. No pasa por el servidor: tiene que funcionar sin señal.
 *
 * 2. La COLA — el acta terminada que no se pudo enviar. Queda guardada tal cual
 *    se iba a mandar y se reintenta sola cuando vuelve la cobertura, así que el
 *    técnico puede guardar, cerrar y seguir a la siguiente tienda sin quedarse
 *    parado esperando señal.
 *
 * Se usa localStorage y no la base porque justamente el caso de uso es no tener
 * cómo hablar con la base. La copia en el servidor (dmc.visita_borrador) es un
 * respaldo aparte, para cuando sí hay señal.
 */

// ── Lo que se guarda ────────────────────────────────────────────────────────

export interface SubSeleccion {
  etiqueta: string;
  cantidad: number;
}

export interface TrabajoForm {
  id: number;
  codigo: string;
  subs: SubSeleccion[];
  detalle: string;
}

export interface ProblemaItemForm {
  etiqueta: string;
  cantidad: number;
}

export interface ProblemaForm {
  id: number;
  codigo: string;
  items: ProblemaItemForm[];
  desc: string;
  sol: string;
  estado: EstadoProblema;
}

export interface FotoForm {
  id: number;
  src: string;
}

/**
 * Un clip del trabajo, tal como lo lleva el formulario.
 *
 * No entra en el borrador y por una razón de fondo: el video no es algo que el
 * técnico tenga "a medio escribir". Se sube a dmc.visita_video en cuanto se
 * termina de grabar y se desactiva allá mismo en cuanto se borra, así que la
 * base ya sabe cuáles hay. El formulario los vuelve a leer de la visita al
 * entrar, y no de una copia en el celular que podría contradecirla.
 */
export interface VideoForm {
  /** Id en dmc.visita_video. 0 mientras todavía se está subiendo. */
  id: number;
  /** /api/visita/video/<id> una vez subido; object URL mientras sube. */
  src: string;
  duracionSeg: number;
  ancho: number;
  alto: number;
  bytes: number;
  /** 0 a 100 mientras sube; null cuando ya está guardado en la base. */
  progreso: number | null;
  error: string | null;
}

export interface FirmaForm {
  imagen: string;
  nombre: string;
  rut: string;
  hora: string;
}

export type Seccion = "sucursal" | "motivo" | "problemas" | "fotos" | "firmas";

export interface BorradorActa {
  folio: string;
  /** Cuándo se escribió esta copia, en ISO local. */
  guardadoEn: string;
  respNombre: string;
  respRut: string;
  respTel: string;
  motivosCodigos: string[];
  obs: string;
  interno: string;
  trabajos: TrabajoForm[];
  problemas: ProblemaForm[];
  fotos: FotoForm[];
  firma: FirmaForm | null;
  guardadas: Partial<Record<Seccion, boolean>>;
  horaInicio: string;
  /**
   * true cuando las fotos no cupieron en el almacenamiento del celular y se
   * guardó el resto. El texto vale más que perderlo todo por unas imágenes.
   */
  sinFotos?: boolean;
}

/** Un acta terminada esperando señal. */
export interface ActaEnCola {
  folio: string;
  /** Cuándo apretó "Guardar visita". Es la hora real del cierre en terreno. */
  capturadaEn: string;
  intentos: number;
  ultimoError: string | null;
  entrada: ActaEntrada;
}

// ── Claves y utilidades ─────────────────────────────────────────────────────

const CLAVE_BORRADOR = "dmc.borrador.";
const CLAVE_COLA = "dmc.acta-pendiente.";

function almacen(): Storage | null {
  // En SSR no hay localStorage, y un navegador con el almacenamiento bloqueado
  // lanza al leerlo. En los dos casos se sigue sin borrador, no se rompe nada.
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function leerJson<T>(clave: string): T | null {
  const ls = almacen();
  if (!ls) return null;
  try {
    const crudo = ls.getItem(clave);
    return crudo ? (JSON.parse(crudo) as T) : null;
  } catch {
    return null;
  }
}

function escribirJson(clave: string, valor: unknown): boolean {
  const ls = almacen();
  if (!ls) return false;
  try {
    ls.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

function borrar(clave: string): void {
  const ls = almacen();
  if (!ls) return;
  try {
    ls.removeItem(clave);
  } catch {
    /* nada que hacer */
  }
}

// ── Borrador ────────────────────────────────────────────────────────────────

export function leerBorrador(folio: string): BorradorActa | null {
  const b = leerJson<BorradorActa>(CLAVE_BORRADOR + folio);
  return b && b.folio === folio ? b : null;
}

/**
 * Guarda el borrador. Devuelve false solo si no se pudo guardar nada.
 *
 * Las fotos en base64 son lo pesado: si el celular se queda sin cuota, se
 * reintenta sin ellas antes de darse por vencido. Perder las fotos duele mucho
 * menos que perder el acta escrita.
 */
export function escribirBorrador(borrador: BorradorActa): boolean {
  if (escribirJson(CLAVE_BORRADOR + borrador.folio, borrador)) return true;
  return escribirJson(CLAVE_BORRADOR + borrador.folio, { ...borrador, fotos: [], sinFotos: true });
}

export function borrarBorrador(folio: string): void {
  borrar(CLAVE_BORRADOR + folio);
}

/** ¿Tiene algo escrito, o es un borrador vacío que no vale la pena ofrecer? */
export function borradorConDatos(b: BorradorActa | null): boolean {
  if (!b) return false;
  return Boolean(
    b.respNombre?.trim() ||
      b.respRut?.trim() ||
      b.respTel?.trim() ||
      b.obs?.trim() ||
      b.interno?.trim() ||
      b.trabajos?.length ||
      b.problemas?.length ||
      b.fotos?.length ||
      b.firma
  );
}

// ── Cola de actas por enviar ────────────────────────────────────────────────

export function encolarActa(acta: ActaEnCola): boolean {
  return escribirJson(CLAVE_COLA + acta.folio, acta);
}

export function leerActaEnCola(folio: string): ActaEnCola | null {
  const a = leerJson<ActaEnCola>(CLAVE_COLA + folio);
  return a && a.folio === folio ? a : null;
}

export function sacarDeCola(folio: string): void {
  borrar(CLAVE_COLA + folio);
}

/** Todas las actas pendientes, para el aviso del listado de visitas. */
export function actasEnCola(): ActaEnCola[] {
  const ls = almacen();
  if (!ls) return [];
  const pendientes: ActaEnCola[] = [];
  try {
    for (let i = 0; i < ls.length; i++) {
      const clave = ls.key(i);
      if (!clave?.startsWith(CLAVE_COLA)) continue;
      const acta = leerJson<ActaEnCola>(clave);
      if (acta?.folio) pendientes.push(acta);
    }
  } catch {
    return pendientes;
  }
  return pendientes;
}

// ── Presentación ────────────────────────────────────────────────────────────

/** "hace 2 min", "hace 1 h" — para decir cuándo se guardó lo que hay. */
export function haceCuanto(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "recién";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "recién";
  if (min === 1) return "hace 1 minuto";
  if (min < 60) return `hace ${min} minutos`;
  const h = Math.floor(min / 60);
  if (h === 1) return "hace 1 hora";
  if (h < 24) return `hace ${h} horas`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

/** ¿Hay señal? `navigator.onLine` miente hacia arriba, nunca hacia abajo. */
export function hayConexion(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}
