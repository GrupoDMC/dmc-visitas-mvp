import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { CatalogoMotivo, CatalogoProblema, CatalogoTrabajo, Visita } from "@/lib/types";

/**
 * El acta de la visita en PDF, lista para mandarle al cliente.
 *
 * Es el acta "de cara afuera": responsable, motivos, trabajo realizado,
 * problemas, fotos y firma. El comentario interno —texto, checklist, fotos y
 * clips marcados como internos— NO entra: es solo para coordinación.
 *
 * Se arma con pdf-lib y las fuentes estándar del PDF (Helvetica), así que no
 * depende de ningún archivo de fuentes ni de un navegador en el servidor.
 */

export interface ImagenActa {
  bytes: Uint8Array;
  mime: string;
}

export interface DatosPdfActa {
  visita: Visita;
  motivos: CatalogoMotivo[];
  trabajos: CatalogoTrabajo[];
  problemas: CatalogoProblema[];
  /** Bytes de cada foto del trabajo (no internas), en el orden del acta. */
  fotos: ImagenActa[];
  firma: ImagenActa | null;
}

// ── Medidas (A4 en puntos) ──────────────────────────────────────────────────
const ANCHO = 595.28;
const ALTO = 841.89;
const MARGEN = 44;
const UTIL = ANCHO - MARGEN * 2;
/** Alto reservado para el pie de página por encima del margen inferior. */
const PIE = 30;

// ── Paleta: el morado del logo como marca, grises cálidos para el resto ─────
function hex(h: string): Color {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
const TINTA = hex("#201e1d");
const TEXTO = hex("#444141");
const GRIS = hex("#7d7979");
const LINEA = hex("#e4e0e0");
const FONDO = hex("#f7f5f5");
const MARCA = hex("#762282");
const MARCA_SUAVE = hex("#f5eef6");
const MARCA_BORDE = hex("#e6d3e8");
const ALERTA = hex("#c2410c");
const ALERTA_SUAVE = hex("#fff5ee");
const BLANCO = rgb(1, 1, 1);

/**
 * Las fuentes estándar del PDF codifican en WinAnsi (Latin-1 y unos pocos
 * signos más). Acentos, ñ, ¿, ¡, «», ·, – y × entran; un emoji o un signo
 * raro que el técnico haya pegado haría fallar todo el documento, así que se
 * omite.
 */
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
function limpio(texto: string | null | undefined): string {
  return Array.from(String(texto ?? ""))
    .map((c) => {
      if (c === "\t") return " ";
      if (c === "\r") return "";
      const code = c.codePointAt(0) ?? 0;
      if (code === 10 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255) || WIN_ANSI_EXTRA.has(c)) return c;
      return "";
    })
    .join("");
}

/**
 * Ancho real del texto dibujado. `widthOfTextAtSize` descuenta el kerning,
 * pero `drawText` no lo aplica: medido así, las líneas salen hasta un 5% más
 * anchas de lo calculado y se pasan del margen. Se suma glifo por glifo.
 */
const anchos = new WeakMap<PDFFont, Map<string, number>>();
function anchoDe(fuente: PDFFont, texto: string, tam: number): number {
  let tabla = anchos.get(fuente);
  if (!tabla) anchos.set(fuente, (tabla = new Map()));
  let total = 0;
  for (const c of texto) {
    let w = tabla.get(c);
    if (w === undefined) tabla.set(c, (w = fuente.widthOfTextAtSize(c, 1000)));
    total += w;
  }
  return (total * tam) / 1000;
}

// ── Fechas: vienen de SQL como texto local ('YYYY-MM-DD' y 'YYYY-MM-DDTHH:mm:ss') ──
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function partesFecha(iso: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso ?? "");
  if (!m) return null;
  const [a, me, d, hh, mm] = m.slice(1).map((x) => (x === undefined ? 0 : Number(x)));
  return { a, me, d, hh, mm, dia: new Date(Date.UTC(a, me - 1, d)).getUTCDay() };
}

/** '2026-09-28' → '28 de septiembre de 2026'. */
function fechaLarga(iso: string | null | undefined): string {
  const p = partesFecha(iso);
  return p ? `${p.d} de ${MESES[p.me - 1]} de ${p.a}` : iso || "—";
}

/** '2026-09-28' → 'Lunes'. */
function diaSemana(iso: string | null | undefined): string {
  const p = partesFecha(iso);
  return p ? DIAS[p.dia] : "";
}

/** '2026-09-28T12:45:00' → '28-09-2026 12:45'. */
function fechaHora(iso: string | null | undefined): string {
  const p = partesFecha(iso);
  if (!p) return "";
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(p.d)}-${dos(p.me)}-${p.a} ${dos(p.hh)}:${dos(p.mm)}`;
}

function hhmm(iso: string | null | undefined): string {
  return iso ? iso.slice(11, 16) : "—";
}

/** Minutos entre dos marcas locales, o null si falta alguna. */
function duracion(inicio: string | null | undefined, termino: string | null | undefined): string | null {
  const a = partesFecha(inicio);
  const b = partesFecha(termino);
  if (!a || !b) return null;
  const min = Math.round(
    (Date.UTC(b.a, b.me - 1, b.d, b.hh, b.mm) - Date.UTC(a.a, a.me - 1, a.d, a.hh, a.mm)) / 60000
  );
  if (min < 0) return null;
  const h = Math.floor(min / 60);
  return h ? `${h} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`;
}

/** Rectángulo con esquinas redondeadas; (x, y) es la esquina superior izquierda. */
function caja(
  p: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  opc: { r?: number; fondo?: Color; borde?: Color; grosor?: number } = {}
) {
  const r = Math.min(opc.r ?? 5, w / 2, h / 2);
  // drawSvgPath invierte el eje Y: dentro del trazado, +y va hacia abajo.
  const d =
    `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} ` +
    `H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  p.drawSvgPath(d, {
    x,
    y,
    color: opc.fondo,
    borderColor: opc.borde,
    borderWidth: opc.borde ? (opc.grosor ?? 0.6) : 0,
  });
}

interface Chip {
  texto: string;
  ancho: number;
}

/** Escritor con salto de página automático. */
class Hoja {
  pagina!: PDFPage;
  y = 0;
  /** Dónde arranca el contenido en la página actual (tras el encabezado). */
  private tope = 0;

  constructor(
    private doc: PDFDocument,
    readonly normal: PDFFont,
    readonly negrita: PDFFont,
    private encabezado: (p: PDFPage, indice: number) => number
  ) {
    this.nueva();
  }

  nueva() {
    const indice = this.doc.getPageCount();
    this.pagina = this.doc.addPage([ANCHO, ALTO]);
    this.y = this.tope = this.encabezado(this.pagina, indice);
  }

  get alInicio() {
    return this.y === this.tope;
  }

  /** Lo que cabe de alto en una página vacía. */
  get altoPagina() {
    return this.tope - (MARGEN + PIE);
  }

  /** Asegura `alto` puntos libres antes del pie; si no, página nueva. */
  espacio(alto: number) {
    if (this.y - alto < MARGEN + PIE) this.nueva();
  }

  lineas(texto: string, fuente: PDFFont, tam: number, ancho: number): string[] {
    const salida: string[] = [];
    for (const parrafo of limpio(texto).split("\n")) {
      const palabras = parrafo.split(/\s+/).filter(Boolean);
      if (!palabras.length) {
        salida.push("");
        continue;
      }
      let actual = "";
      for (const palabra of palabras) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (anchoDe(fuente, prueba, tam) <= ancho) {
          actual = prueba;
          continue;
        }
        if (actual) salida.push(actual);
        // Una palabra que sola no cabe (un código, una URL) se parte a la fuerza.
        let resto = palabra;
        while (anchoDe(fuente, resto, tam) > ancho && resto.length > 1) {
          let corte = resto.length - 1;
          while (corte > 1 && anchoDe(fuente, resto.slice(0, corte), tam) > ancho) corte--;
          salida.push(resto.slice(0, corte));
          resto = resto.slice(corte);
        }
        actual = resto;
      }
      salida.push(actual);
    }
    return salida;
  }

  /** Dibuja líneas ya cortadas desde `y` hacia abajo, sin paginar. */
  escribir(lineas: string[], x: number, y: number, tam: number, fuente: PDFFont, color: Color, alto = tam * 1.4) {
    lineas.forEach((l, i) => {
      if (l) this.pagina.drawText(l, { x, y: y - tam - i * alto, size: tam, font: fuente, color });
    });
    return lineas.length * alto;
  }

  texto(
    texto: string,
    opc: { tam?: number; negrita?: boolean; color?: Color; x?: number; ancho?: number; interlineado?: number } = {}
  ) {
    const tam = opc.tam ?? 10;
    const fuente = opc.negrita ? this.negrita : this.normal;
    const x = opc.x ?? MARGEN;
    const ancho = opc.ancho ?? UTIL - (x - MARGEN);
    const alto = tam * (opc.interlineado ?? 1.4);
    for (const linea of this.lineas(texto, fuente, tam, ancho)) {
      this.espacio(alto);
      if (linea) this.pagina.drawText(linea, { x, y: this.y - tam, size: tam, font: fuente, color: opc.color ?? TINTA });
      this.y -= alto;
    }
  }

  /**
   * Título de sección con su barra de marca. `reserva` es lo mínimo del
   * contenido que tiene que caber debajo, para que el título nunca quede solo
   * al pie de una página.
   */
  titulo(texto: string, reserva = 40, contador?: number) {
    const hueco = this.alInicio ? 0 : 20;
    this.espacio(hueco + 20 + reserva);
    if (!this.alInicio) this.y -= hueco;
    const t = limpio(texto);
    this.pagina.drawRectangle({ x: MARGEN, y: this.y - 12, width: 3, height: 13, color: MARCA });
    this.pagina.drawText(t, { x: MARGEN + 10, y: this.y - 11, size: 11.5, font: this.negrita, color: TINTA });
    if (contador !== undefined) {
      const c = String(contador);
      const x = MARGEN + 10 + anchoDe(this.negrita, t, 11.5) + 7;
      const w = Math.max(16, anchoDe(this.negrita, c, 8) + 10);
      caja(this.pagina, x, this.y - 0.5, w, 13, { r: 6.5, fondo: MARCA_SUAVE });
      this.pagina.drawText(c, {
        x: x + (w - anchoDe(this.negrita, c, 8)) / 2,
        y: this.y - 9.5,
        size: 8,
        font: this.negrita,
        color: MARCA,
      });
    }
    this.y -= 22;
  }

  /** Reparte etiquetas en filas de "píldoras" que caben en `ancho`. */
  chips(textos: string[], ancho: number, tam = 8.5, negrita = false): Chip[][] {
    const fuente = negrita ? this.negrita : this.normal;
    const filas: Chip[][] = [];
    let fila: Chip[] = [];
    let ocupado = 0;
    for (const t of textos.map(limpio).filter(Boolean)) {
      const w = Math.min(ancho, anchoDe(fuente, t, tam) + 14);
      if (fila.length && ocupado + 5 + w > ancho) {
        filas.push(fila);
        fila = [];
        ocupado = 0;
      }
      ocupado += (fila.length ? 5 : 0) + w;
      fila.push({ texto: t, ancho: w });
    }
    if (fila.length) filas.push(fila);
    return filas;
  }

  static altoChips(filas: Chip[][], tam = 8.5) {
    return filas.length ? filas.length * (tam + 9) + (filas.length - 1) * 4 : 0;
  }

  dibujarChips(
    filas: Chip[][],
    x: number,
    y: number,
    opc: { tam?: number; fondo?: Color; borde?: Color; color?: Color; negrita?: boolean } = {}
  ) {
    const tam = opc.tam ?? 8.5;
    const alto = tam + 9;
    const fuente = opc.negrita ? this.negrita : this.normal;
    filas.forEach((fila, i) => {
      let cx = x;
      const cy = y - i * (alto + 4);
      for (const c of fila) {
        caja(this.pagina, cx, cy, c.ancho, alto, { r: alto / 2, fondo: opc.fondo ?? FONDO, borde: opc.borde });
        this.pagina.drawText(c.texto, { x: cx + 7, y: cy - alto + 5.2, size: tam, font: fuente, color: opc.color ?? TEXTO });
        cx += c.ancho + 5;
      }
    });
  }
}

async function incrustar(doc: PDFDocument, img: ImagenActa): Promise<PDFImage | null> {
  try {
    if (/png/i.test(img.mime)) return await doc.embedPng(img.bytes);
    if (/jpe?g/i.test(img.mime)) return await doc.embedJpg(img.bytes);
    // Sin mime confiable: se prueba por la firma de los bytes.
    if (img.bytes[0] === 0x89 && img.bytes[1] === 0x50) return await doc.embedPng(img.bytes);
    if (img.bytes[0] === 0xff && img.bytes[1] === 0xd8) return await doc.embedJpg(img.bytes);
  } catch (err) {
    console.error("[dmc] no se pudo incrustar una imagen en el PDF:", err);
  }
  return null;
}

async function logo(doc: PDFDocument): Promise<PDFImage | null> {
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "DMC-logo.png"));
    return await doc.embedPng(bytes);
  } catch {
    // Sin el archivo (despliegue que no lo trae) el encabezado va solo con texto.
    return null;
  }
}

export async function generarPdfActa(d: DatosPdfActa): Promise<Uint8Array> {
  const { visita } = d;
  const ejec = visita.ejecucion;
  const doc = await PDFDocument.create();
  doc.setTitle(`Acta ${visita.folio}`);
  doc.setAuthor("Grupo dMC");
  doc.setSubject(`Visita técnica · ${visita.sucursal?.nombre ?? ""}`);

  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const imgLogo = await logo(doc);
  const problemas = visita.problemas ?? [];

  const derecha = (p: PDFPage, t: string, y: number, tam: number, f: PDFFont, c: Color) =>
    p.drawText(limpio(t), { x: MARGEN + UTIL - anchoDe(f, limpio(t), tam), y, size: tam, font: f, color: c });

  // ── Encabezado: completo en la primera página, compacto en las siguientes ──
  const encabezado = (p: PDFPage, indice: number): number => {
    const primera = indice === 0;
    let y = ALTO - 40;
    const altoLogo = primera ? 38 : 24;
    if (imgLogo) {
      const ancho = (imgLogo.width / imgLogo.height) * altoLogo;
      p.drawImage(imgLogo, { x: MARGEN, y: y - altoLogo, width: ancho, height: altoLogo });
    } else {
      p.drawText("Grupo dMC", { x: MARGEN, y: y - altoLogo + 6, size: primera ? 18 : 13, font: negrita, color: MARCA });
    }
    if (primera) {
      derecha(p, "ACTA DE VISITA TÉCNICA", y - 9, 7.5, negrita, MARCA);
      derecha(p, visita.folio, y - 29, 19, negrita, TINTA);
      derecha(p, visita.sucursal?.nombre ?? "", y - 42, 8.5, normal, GRIS);
    } else {
      derecha(p, `Acta ${visita.folio}`, y - 11, 9.5, negrita, TINTA);
      derecha(p, "Acta de visita técnica", y - 23, 7.5, normal, GRIS);
    }
    y -= altoLogo + 12;
    p.drawLine({ start: { x: MARGEN, y }, end: { x: MARGEN + UTIL, y }, thickness: 0.6, color: LINEA });
    p.drawLine({ start: { x: MARGEN, y }, end: { x: MARGEN + 56, y }, thickness: 2.2, color: MARCA });
    return y - 18;
  };

  const h = new Hoja(doc, normal, negrita, encabezado);

  // ── Resumen: la fecha, el horario y lo encontrado, de un vistazo ──
  {
    const alto = 58;
    const celdas: { etiqueta: string; valor: string; sub: string; color?: Color }[] = [
      { etiqueta: "FECHA DE LA VISITA", valor: fechaLarga(visita.fechaProgramada), sub: diaSemana(visita.fechaProgramada) },
      {
        etiqueta: "HORARIO EN TIENDA",
        valor: ejec ? `${hhmm(ejec.horaInicio)} – ${hhmm(ejec.horaTermino)}` : "—",
        sub: "Llegada y salida",
      },
      { etiqueta: "DURACIÓN", valor: duracion(ejec?.horaInicio, ejec?.horaTermino) ?? "—", sub: "En tienda" },
      {
        etiqueta: "PROBLEMAS",
        valor: problemas.length ? String(problemas.length) : "Ninguno",
        sub: problemas.length ? (problemas.length === 1 ? "Detectado" : "Detectados") : "Sin observaciones",
        color: problemas.length ? ALERTA : undefined,
      },
    ];
    // La fecha larga necesita más aire que el resto.
    const pesos = [1.55, 1.15, 0.95, 0.95];
    const total = pesos.reduce((a, b) => a + b, 0);
    caja(h.pagina, MARGEN, h.y, UTIL, alto, { r: 6, fondo: MARCA_SUAVE, borde: MARCA_BORDE });
    let x = MARGEN;
    celdas.forEach((c, i) => {
      const w = (UTIL * pesos[i]) / total;
      if (i > 0) {
        h.pagina.drawLine({ start: { x, y: h.y - 12 }, end: { x, y: h.y - alto + 12 }, thickness: 0.6, color: MARCA_BORDE });
      }
      const px = x + 14;
      const anchoTexto = w - 20;
      let tam = 12;
      while (tam > 8 && anchoDe(negrita, limpio(c.valor), tam) > anchoTexto) tam -= 0.5;
      h.pagina.drawText(limpio(c.etiqueta), { x: px, y: h.y - 17, size: 6.8, font: negrita, color: MARCA });
      h.pagina.drawText(limpio(c.valor), { x: px, y: h.y - 34, size: tam, font: negrita, color: c.color ?? TINTA });
      h.pagina.drawText(limpio(c.sub), { x: px, y: h.y - 47, size: 7.5, font: normal, color: GRIS });
      x += w;
    });
    h.y -= alto + 4;
  }

  // ── Datos de la visita, en dos columnas ──
  {
    h.titulo("Datos de la visita", 60);
    const sucursal = visita.sucursal;
    const hueco = 20;
    const col = (UTIL - hueco) / 2;
    type Campo = { etiqueta: string; valor: string };
    const filas: (Campo | [Campo, Campo])[] = [
      [
        { etiqueta: "Cliente", valor: visita.cliente?.nombreFantasia ?? "—" },
        { etiqueta: "Sucursal", valor: [sucursal?.nombre, sucursal?.codigo ? `(${sucursal.codigo})` : ""].filter(Boolean).join(" ") },
      ],
      {
        etiqueta: "Dirección",
        valor: [sucursal?.direccion, sucursal?.comuna, sucursal?.region].filter(Boolean).join(", "),
      },
      [
        { etiqueta: "Técnico a cargo", valor: visita.tecnico?.nombreCompleto ?? "—" },
        { etiqueta: "Técnico ayudante", valor: visita.tecnicoAyudante?.nombreCompleto ?? "No aplica" },
      ],
      [
        { etiqueta: "Responsable de tienda", valor: ejec?.responsableNombre ?? visita.responsableNombre ?? "—" },
        {
          etiqueta: "RUT · Teléfono",
          valor: [ejec?.responsableRut, ejec?.responsableTelefono].filter(Boolean).join("  ·  ") || "—",
        },
      ],
    ];
    const medir = (c: Campo, ancho: number) => h.lineas(c.valor || "—", normal, 10, ancho);
    for (const fila of filas) {
      const campos = Array.isArray(fila) ? fila : [fila];
      const ancho = Array.isArray(fila) ? col : UTIL;
      const lineas = campos.map((c) => medir(c, ancho));
      const alto = 14 + Math.max(...lineas.map((l) => l.length)) * 13.5 + 8;
      h.espacio(alto);
      campos.forEach((c, i) => {
        const x = MARGEN + i * (col + hueco);
        h.pagina.drawText(limpio(c.etiqueta.toUpperCase()), { x, y: h.y - 7, size: 6.8, font: negrita, color: GRIS });
        h.escribir(lineas[i], x, h.y - 12, 10, normal, TINTA, 13.5);
      });
      h.y -= alto;
      h.pagina.drawLine({ start: { x: MARGEN, y: h.y + 3 }, end: { x: MARGEN + UTIL, y: h.y + 3 }, thickness: 0.5, color: LINEA });
      h.y -= 6;
    }

    // Los motivos que confirmó el técnico en terreno; si no hay, los agendados.
    const codigosMotivo = ejec?.motivosRealesCodigos?.length ? ejec.motivosRealesCodigos : visita.motivosCodigos;
    const nombres = codigosMotivo.map((c) => d.motivos.find((m) => m.codigo === c)?.nombre ?? c);
    if (nombres.length) {
      const filasChips = h.chips(nombres, UTIL, 8.5, true);
      const alto = 14 + Hoja.altoChips(filasChips) + 6;
      h.espacio(alto);
      h.pagina.drawText("MOTIVO DE LA VISITA", { x: MARGEN, y: h.y - 7, size: 6.8, font: negrita, color: GRIS });
      h.dibujarChips(filasChips, MARGEN, h.y - 13, { fondo: MARCA_SUAVE, borde: MARCA_BORDE, color: MARCA, negrita: true });
      h.y -= alto;
    }
  }

  /**
   * Tarjeta con barra de color a la izquierda: título, píldoras y texto.
   * Si no cabe ni en una página vacía, cae a texto corrido para no cortarse.
   */
  const tarjeta = (opc: {
    titulo: string;
    insignia?: string;
    chips: string[];
    textos: { etiqueta?: string; texto: string }[];
    acento: Color;
    fondo: Color;
  }) => {
    const pad = 12;
    const x = MARGEN + 3 + pad;
    const ancho = UTIL - 3 - pad * 2;
    const anchoInsignia = opc.insignia ? 24 : 0;
    const lineasTitulo = h.lineas(opc.titulo, negrita, 10.5, ancho - anchoInsignia);
    const filasChips = h.chips(opc.chips, ancho);
    const bloques = opc.textos.map((t) => ({
      etiqueta: t.etiqueta,
      lineas: h.lineas(t.texto, normal, 9.5, ancho),
    }));
    const altoTitulo = lineasTitulo.length * 14;
    const altoChips = filasChips.length ? 7 + Hoja.altoChips(filasChips) : 0;
    const altoBloques = bloques.reduce((s, b) => s + 7 + (b.etiqueta ? 11 : 0) + b.lineas.length * 13.3, 0);
    const alto = pad + altoTitulo + altoChips + altoBloques + pad - 2;

    if (alto > h.altoPagina) {
      h.texto(opc.titulo, { tam: 10.5, negrita: true });
      if (opc.chips.length) h.texto(opc.chips.join("  ·  "), { tam: 9, color: GRIS });
      for (const t of opc.textos) h.texto(t.etiqueta ? `${t.etiqueta}: ${t.texto}` : t.texto, { tam: 9.5, color: TEXTO });
      h.y -= 10;
      return;
    }

    h.espacio(alto);
    caja(h.pagina, MARGEN, h.y, UTIL, alto, { r: 5, fondo: opc.fondo, borde: LINEA });
    h.pagina.drawRectangle({ x: MARGEN, y: h.y - alto + 4, width: 3, height: alto - 8, color: opc.acento });
    let y = h.y - pad;
    let tx = x;
    if (opc.insignia) {
      caja(h.pagina, x, y + 1, 17, 15, { r: 7.5, fondo: opc.acento });
      h.pagina.drawText(opc.insignia, {
        x: x + (17 - anchoDe(negrita, opc.insignia, 8.5)) / 2,
        y: y - 10.5,
        size: 8.5,
        font: negrita,
        color: BLANCO,
      });
      tx += anchoInsignia;
    }
    y -= h.escribir(lineasTitulo, tx, y + 1, 10.5, negrita, TINTA, 14);
    if (filasChips.length) {
      y -= 7;
      h.dibujarChips(filasChips, x, y);
      y -= Hoja.altoChips(filasChips);
    }
    for (const b of bloques) {
      y -= 7;
      if (b.etiqueta) {
        h.pagina.drawText(limpio(b.etiqueta.toUpperCase()), { x, y: y - 7, size: 6.8, font: negrita, color: GRIS });
        y -= 11;
      }
      y -= h.escribir(b.lineas, x, y + 1, 9.5, normal, TEXTO, 13.3);
    }
    h.y -= alto + 8;
  };

  // ── Trabajo realizado, agrupado por motivo ──
  const trabajos = visita.trabajos ?? [];
  if (trabajos.length) {
    h.titulo("Trabajo realizado", 60, trabajos.length);
    const nombreTrabajo = (c: string) => d.trabajos.find((t) => t.codigo === c)?.nombre ?? c;
    const nombreMotivo = (c: string) => d.motivos.find((m) => m.codigo === c)?.nombre ?? c;
    const grupos = new Map<string, typeof trabajos>();
    for (const t of trabajos) {
      const k = t.motivoCodigo ?? "";
      grupos.set(k, [...(grupos.get(k) ?? []), t]);
    }
    for (const [motivo, lista] of grupos) {
      if (motivo && grupos.size > 1) {
        h.espacio(70);
        if (!h.alInicio) h.y -= 4;
        h.pagina.drawText(limpio(nombreMotivo(motivo).toUpperCase()), {
          x: MARGEN,
          y: h.y - 8,
          size: 7.5,
          font: negrita,
          color: MARCA,
        });
        h.y -= 16;
      }
      for (const t of lista) {
        tarjeta({
          titulo: nombreTrabajo(t.trabajoCodigo),
          chips: t.subtrabajos.map((s) => (s.cantidad > 1 ? `${s.etiqueta}  × ${s.cantidad}` : s.etiqueta)),
          textos: t.detalle ? [{ texto: t.detalle }] : [],
          acento: MARCA,
          fondo: BLANCO,
        });
      }
    }
  }

  // ── Detalle del trabajo: texto libre en un recuadro que puede cruzar páginas ──
  if (ejec?.observaciones?.trim()) {
    h.titulo("Detalle del trabajo", 50);
    const pad = 12;
    const alto = 14;
    let lineas = h.lineas(ejec.observaciones.trim(), normal, 10, UTIL - pad * 2);
    while (lineas.length) {
      const caben = Math.floor((h.y - (MARGEN + PIE) - pad * 2) / alto);
      if (caben < 2) {
        h.nueva();
        continue;
      }
      const tramo = lineas.slice(0, caben);
      lineas = lineas.slice(caben);
      const altoCaja = tramo.length * alto + pad * 2 - 3;
      caja(h.pagina, MARGEN, h.y, UTIL, altoCaja, { r: 5, fondo: FONDO });
      h.escribir(tramo, MARGEN + pad, h.y - pad + 1, 10, normal, TEXTO, alto);
      h.y -= altoCaja;
      if (lineas.length) h.nueva();
    }
    h.y -= 4;
  }

  // ── Problemas ──
  if (problemas.length) {
    h.titulo("Problemas detectados", 70, problemas.length);
    for (const [i, p] of problemas.entries()) {
      const textos: { etiqueta?: string; texto: string }[] = [];
      if (p.descripcion) textos.push({ etiqueta: "Descripción", texto: p.descripcion });
      if (p.solucion) textos.push({ etiqueta: "Solución sugerida", texto: p.solucion });
      tarjeta({
        titulo: d.problemas.find((x) => x.codigo === p.tipoCodigo)?.nombre ?? p.tipoCodigo,
        insignia: String(i + 1),
        chips: p.items.map((it) => `${it.etiqueta}  × ${it.cantidad}`),
        textos,
        acento: ALERTA,
        fondo: ALERTA_SUAVE,
      });
    }
  }

  // ── Fotos: tres por fila, cada una ajustada a su celda y numerada ──
  const fotos = (await Promise.all(d.fotos.map((f) => incrustar(doc, f)))).filter((x): x is PDFImage => Boolean(x));
  if (fotos.length) {
    const cols = 3;
    const hueco = 10;
    const lado = (UTIL - hueco * (cols - 1)) / cols;
    const altoCelda = lado * 0.75;
    const altoFila = altoCelda + 16;
    h.titulo("Registro fotográfico", altoFila, fotos.length);
    for (let i = 0; i < fotos.length; i += cols) {
      h.espacio(altoFila);
      fotos.slice(i, i + cols).forEach((img, j) => {
        const escala = Math.min(lado / img.width, altoCelda / img.height);
        const w = img.width * escala;
        const hh = img.height * escala;
        const x = MARGEN + j * (lado + hueco);
        h.pagina.drawRectangle({ x, y: h.y - altoCelda, width: lado, height: altoCelda, color: FONDO });
        h.pagina.drawImage(img, { x: x + (lado - w) / 2, y: h.y - altoCelda + (altoCelda - hh) / 2, width: w, height: hh });
        h.pagina.drawRectangle({
          x,
          y: h.y - altoCelda,
          width: lado,
          height: altoCelda,
          borderColor: LINEA,
          borderWidth: 0.6,
        });
        h.pagina.drawText(`Foto ${i + j + 1}`, { x, y: h.y - altoCelda - 10, size: 7.5, font: normal, color: GRIS });
      });
      h.y -= altoFila + 4;
    }
  }

  // ── Firma: recuadro con la firma a la izquierda y los datos a la derecha ──
  {
    const alto = 128;
    h.titulo("Conformidad de la tienda", alto);
    const firma = visita.firmas?.find((f) => f.rol === "TIENDA") ?? visita.firmas?.[0];
    const imgFirma = d.firma ? await incrustar(doc, d.firma) : null;
    const anchoFirma = UTIL * 0.48;
    caja(h.pagina, MARGEN, h.y, anchoFirma, alto, { r: 6, borde: LINEA });
    const base = h.y - alto + 34;
    if (imgFirma) {
      const escala = Math.min((anchoFirma - 40) / imgFirma.width, 70 / imgFirma.height);
      const w = imgFirma.width * escala;
      h.pagina.drawImage(imgFirma, {
        x: MARGEN + (anchoFirma - w) / 2,
        y: base + 4,
        width: w,
        height: imgFirma.height * escala,
      });
    } else {
      const t = "Sin firma";
      h.pagina.drawText(t, {
        x: MARGEN + (anchoFirma - anchoDe(normal, t, 10)) / 2,
        y: base + 30,
        size: 10,
        font: normal,
        color: GRIS,
      });
    }
    h.pagina.drawLine({ start: { x: MARGEN + 20, y: base }, end: { x: MARGEN + anchoFirma - 20, y: base }, thickness: 0.7, color: TINTA });
    const pieFirma = "Firma del responsable de tienda";
    h.pagina.drawText(pieFirma, {
      x: MARGEN + (anchoFirma - anchoDe(normal, pieFirma, 7.5)) / 2,
      y: base - 14,
      size: 7.5,
      font: normal,
      color: GRIS,
    });

    // Columna de datos.
    const x = MARGEN + anchoFirma + 22;
    const ancho = UTIL - anchoFirma - 22;
    let y = h.y - 4;
    const dato = (etiqueta: string, valor: string, fuente = normal) => {
      h.pagina.drawText(limpio(etiqueta.toUpperCase()), { x, y: y - 7, size: 6.8, font: negrita, color: GRIS });
      y -= 12;
      y -= h.escribir(h.lineas(valor, fuente, 10, ancho), x, y, 10, fuente, TINTA, 13.5) + 8;
    };
    dato("Nombre", firma?.nombre || "—", negrita);
    dato("RUT", firma?.rut || "—");
    if (firma?.firmadoEn) dato("Firmado el", fechaHora(firma.firmadoEn));
    h.escribir(
      h.lineas("Con su firma, la tienda deja constancia de la visita y de los trabajos descritos en esta acta.", normal, 7.5, ancho),
      x,
      y + 2,
      7.5,
      normal,
      GRIS,
      10
    );
    h.y -= alto;
  }

  // ── Pie en todas las páginas ──
  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    const izquierda = "Grupo dMC · Ideas tecnológicas de seguridad";
    const num = limpio(`Acta ${visita.folio}  ·  Página ${i + 1} de ${paginas.length}`);
    p.drawLine({
      start: { x: MARGEN, y: MARGEN + 12 },
      end: { x: MARGEN + UTIL, y: MARGEN + 12 },
      thickness: 0.5,
      color: LINEA,
    });
    p.drawText(izquierda, { x: MARGEN, y: MARGEN, size: 7.5, font: normal, color: GRIS });
    p.drawText(num, {
      x: MARGEN + UTIL - anchoDe(normal, num, 7.5),
      y: MARGEN,
      size: 7.5,
      font: normal,
      color: GRIS,
    });
  });

  return doc.save();
}
