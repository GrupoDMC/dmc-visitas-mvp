import type { Visita } from "@/lib/types";
import type { MedioActa } from "@/lib/ui/medios-acta";
import { nombreArchivoActa, nombreCarpetaLocal, nombresSinColision } from "@/lib/ui/nombre-acta";
import type { ArchivoZip } from "@/lib/ui/zip";

/**
 * Cuánto pueden sumar, como máximo, las fotos y videos de un mismo .zip. El
 * zip se arma entero en la memoria del navegador, y armarZip no sabe de zip64
 * (tope de 4 GB): pasado esto, lo que falta se anota y no se baja.
 */
export const TOPE_BYTES_MEDIOS = 1024 * 1024 * 1024;

/** Archivo suelto de la raíz del zip con lo que no se pudo incluir. */
export const NOMBRE_CONSTANCIA = "LEEME - archivos no incluidos.txt";

type DatosActa = Pick<Visita, "folio" | "sucursal" | "cliente">;

export interface ActaDescargada {
  visita: DatosActa;
  pdf: Uint8Array;
  medios: { nombre: string; bytes: Uint8Array }[];
}

/**
 * La estructura del .zip: una carpeta por local con el PDF del acta y todos sus
 * medios. Dos locales con el mismo nombre quedan «Local» y «Local (2)». Si hay
 * `incidencias`, se suma el archivo de constancia en la raíz.
 */
export function armarArchivosZip(descargadas: ActaDescargada[], incidencias: string[] = []): ArchivoZip[] {
  // Por nombre de local, para que el zip se lea ordenado y no según quién respondió primero.
  const actas = descargadas
    .map((a) => ({ a, carpeta: nombreCarpetaLocal(a.visita) }))
    .sort((x, y) => x.carpeta.localeCompare(y.carpeta, "es") || x.a.visita.folio.localeCompare(y.a.visita.folio))
    .map((x) => x.a);
  const carpetas = nombresSinColision(actas.map((a) => nombreCarpetaLocal(a.visita)));
  const archivos: ArchivoZip[] = [];

  actas.forEach((a, i) => {
    const pdf = nombreArchivoActa(a.visita);
    // El PDF entra primero: si un medio se llamara igual, el que cambia es el medio.
    const nombres = nombresSinColision([pdf, ...a.medios.map((m) => m.nombre)], true);
    archivos.push({ nombre: `${carpetas[i]}/${nombres[0]}`, bytes: a.pdf });
    a.medios.forEach((m, j) => archivos.push({ nombre: `${carpetas[i]}/${nombres[j + 1]}`, bytes: m.bytes }));
  });

  if (incidencias.length) {
    const texto = [
      "Estos archivos no se pudieron incluir en el .zip:",
      "",
      ...incidencias.map((l) => `- ${l}`),
      "",
    ].join("\r\n");
    archivos.push({ nombre: NOMBRE_CONSTANCIA, bytes: new TextEncoder().encode(texto) });
  }
  return archivos;
}

type Peticion = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Baja un archivo completo. Las rutas de video y adjunto responden por tramos
 * de 2 MB, y sin pedir un Range entregan solo el primero: por eso se pide
 * «bytes=N-» hasta completar, escribiendo directo en un buffer del tamaño final
 * (sin juntar trozos ni copiar después). Lanza si algo falla o no cuadra.
 */
export async function bajarCompleto(url: string, peticion: Peticion = fetch, tope = Infinity): Promise<Uint8Array> {
  let res = await peticion(url, { headers: { Range: "bytes=0-" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  if (res.status !== 206) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > tope) throw new Error("supera el tope de memoria");
    return bytes;
  }

  const total = Number(/\/(\d+)\s*$/.exec(res.headers.get("Content-Range") ?? "")?.[1]);
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error("respuesta sin tamaño total");
  if (total > tope) throw new Error("supera el tope de memoria");

  const salida = new Uint8Array(total);
  let hecho = 0;
  for (;;) {
    const trozo = new Uint8Array(await res.arrayBuffer());
    if (trozo.length === 0 || hecho + trozo.length > total) throw new Error("tramo inesperado");
    salida.set(trozo, hecho);
    hecho += trozo.length;
    if (hecho === total) return salida;
    res = await peticion(url, { headers: { Range: `bytes=${hecho}-` } });
    if (res.status !== 206) throw new Error(`HTTP ${res.status}`);
  }
}

export interface ResultadoActas {
  actas: ActaDescargada[];
  /** Folios cuyo PDF no se pudo bajar: no entran al zip. */
  fallidas: string[];
  /** Un renglón por archivo que no se pudo incluir (medios, lista de medios, tope). */
  incidencias: string[];
}

/**
 * Reúne, acta por acta, el PDF y sus medios. Unas pocas actas a la vez (cada
 * PDF lo arma el servidor con sus fotos) y los medios de cada una en serie, para
 * no tener varios clips en vuelo. Un medio que falla se anota y se sigue: solo
 * el PDF es imprescindible.
 */
export async function reunirActas(
  visitas: DatosActa[],
  { peticion = fetch, topeBytes = TOPE_BYTES_MEDIOS, simultaneas = 3 }: { peticion?: Peticion; topeBytes?: number; simultaneas?: number } = {}
): Promise<ResultadoActas> {
  const resultado: ResultadoActas = { actas: [], fallidas: [], incidencias: [] };
  const cola = visitas.map((v, orden) => ({ v, orden }));
  const porOrden = new Map<number, ActaDescargada>();
  let usados = 0;

  const rotulo = (v: DatosActa) => `${v.folio} (${nombreCarpetaLocal(v)})`;

  await Promise.all(
    Array.from({ length: Math.min(simultaneas, cola.length) }, async () => {
      for (let it = cola.shift(); it; it = cola.shift()) {
        const { v, orden } = it;
        let pdf: Uint8Array;
        try {
          const r = await peticion(`/api/visita/acta/${encodeURIComponent(v.folio)}`);
          if (!r.ok) throw new Error(String(r.status));
          pdf = new Uint8Array(await r.arrayBuffer());
        } catch {
          resultado.fallidas.push(v.folio);
          continue;
        }

        const medios: ActaDescargada["medios"] = [];
        let lista: MedioActa[] = [];
        try {
          const r = await peticion(`/api/visita/medios/${encodeURIComponent(v.folio)}`);
          if (!r.ok) throw new Error(String(r.status));
          lista = ((await r.json()) as { medios: MedioActa[] }).medios;
        } catch {
          resultado.incidencias.push(`${rotulo(v)}: no se pudo leer la lista de fotos y videos.`);
        }

        for (const m of lista) {
          // Se reserva el peso conocido antes de bajar, para que las actas en paralelo no se pasen juntas.
          const reserva = m.bytes ?? 0;
          if (usados + reserva > topeBytes) {
            resultado.incidencias.push(`${rotulo(v)} / ${m.nombre}: se superó el tope de tamaño del .zip.`);
            continue;
          }
          usados += reserva;
          try {
            const bytes = await bajarCompleto(m.url, peticion, topeBytes - (usados - reserva));
            usados += bytes.length - reserva;
            medios.push({ nombre: m.nombre, bytes });
          } catch (e) {
            usados -= reserva;
            const motivo = e instanceof Error ? e.message : "error";
            resultado.incidencias.push(`${rotulo(v)} / ${m.nombre}: no se pudo descargar (${motivo}).`);
          }
        }
        porOrden.set(orden, { visita: v, pdf, medios });
      }
    })
  );

  resultado.actas = [...porOrden.entries()].sort((a, b) => a[0] - b[0]).map(([, a]) => a);
  resultado.fallidas.sort();
  resultado.incidencias.sort((a, b) => a.localeCompare(b, "es"));
  return resultado;
}
