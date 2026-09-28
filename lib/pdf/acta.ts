import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
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
const MARGEN = 48;
const UTIL = ANCHO - MARGEN * 2;
const PIE = 36;

const NEGRO = rgb(0.125, 0.118, 0.114);
const GRIS = rgb(0.42, 0.4, 0.4);
const LINEA = rgb(0.78, 0.77, 0.76);
const ACENTO = rgb(0.8, 0.13, 0.05);

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

function hhmm(iso: string | null | undefined): string {
  return iso ? iso.slice(11, 16) : "—";
}

/** Escritor con salto de página automático. */
class Hoja {
  pagina!: PDFPage;
  y = 0;

  constructor(
    private doc: PDFDocument,
    private normal: PDFFont,
    private negrita: PDFFont,
    private encabezado: (p: PDFPage) => number
  ) {
    this.nueva();
  }

  nueva() {
    this.pagina = this.doc.addPage([ANCHO, ALTO]);
    this.y = this.encabezado(this.pagina);
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
        if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) {
          actual = prueba;
          continue;
        }
        if (actual) salida.push(actual);
        // Una palabra que sola no cabe (un código, una URL) se parte a la fuerza.
        let resto = palabra;
        while (fuente.widthOfTextAtSize(resto, tam) > ancho && resto.length > 1) {
          let corte = resto.length - 1;
          while (corte > 1 && fuente.widthOfTextAtSize(resto.slice(0, corte), tam) > ancho) corte--;
          salida.push(resto.slice(0, corte));
          resto = resto.slice(corte);
        }
        actual = resto;
      }
      salida.push(actual);
    }
    return salida;
  }

  texto(
    texto: string,
    opc: { tam?: number; negrita?: boolean; color?: ReturnType<typeof rgb>; x?: number; ancho?: number; interlineado?: number } = {}
  ) {
    const tam = opc.tam ?? 10;
    const fuente = opc.negrita ? this.negrita : this.normal;
    const x = opc.x ?? MARGEN;
    const ancho = opc.ancho ?? UTIL - (x - MARGEN);
    const alto = tam * (opc.interlineado ?? 1.35);
    for (const linea of this.lineas(texto, fuente, tam, ancho)) {
      this.espacio(alto);
      this.pagina.drawText(linea, { x, y: this.y - tam, size: tam, font: fuente, color: opc.color ?? NEGRO });
      this.y -= alto;
    }
  }

  titulo(texto: string) {
    this.espacio(34);
    this.y -= 10;
    this.pagina.drawText(limpio(texto.toUpperCase()), {
      x: MARGEN,
      y: this.y - 9,
      size: 9,
      font: this.negrita,
      color: ACENTO,
    });
    this.y -= 14;
    this.pagina.drawLine({
      start: { x: MARGEN, y: this.y },
      end: { x: MARGEN + UTIL, y: this.y },
      thickness: 1.2,
      color: NEGRO,
    });
    this.y -= 8;
  }

  /** Fila etiqueta / valor, con la etiqueta en una columna fija. */
  dato(etiqueta: string, valor: string) {
    const col = 128;
    const lineas = this.lineas(valor || "—", this.normal, 10, UTIL - col);
    const alto = Math.max(1, lineas.length) * 13.5 + 5;
    this.espacio(alto);
    this.pagina.drawText(limpio(etiqueta.toUpperCase()), {
      x: MARGEN,
      y: this.y - 9,
      size: 7.5,
      font: this.negrita,
      color: GRIS,
    });
    let y = this.y;
    for (const l of lineas) {
      this.pagina.drawText(l, { x: MARGEN + col, y: y - 10, size: 10, font: this.normal, color: NEGRO });
      y -= 13.5;
    }
    this.y -= alto;
    this.pagina.drawLine({
      start: { x: MARGEN, y: this.y + 2 },
      end: { x: MARGEN + UTIL, y: this.y + 2 },
      thickness: 0.4,
      color: LINEA,
    });
  }

  separacion(pts: number) {
    this.y -= pts;
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

  const encabezado = (p: PDFPage): number => {
    let y = ALTO - MARGEN;
    if (imgLogo) {
      const alto = 30;
      const ancho = (imgLogo.width / imgLogo.height) * alto;
      p.drawImage(imgLogo, { x: MARGEN, y: y - alto, width: ancho, height: alto });
    } else {
      p.drawText("Grupo dMC", { x: MARGEN, y: y - 20, size: 16, font: negrita, color: NEGRO });
    }
    const derecha = (t: string, yy: number, tam: number, f: PDFFont, c = NEGRO) =>
      p.drawText(limpio(t), { x: MARGEN + UTIL - f.widthOfTextAtSize(limpio(t), tam), y: yy, size: tam, font: f, color: c });
    derecha("ACTA DE VISITA TÉCNICA", y - 11, 8, negrita, ACENTO);
    derecha(visita.folio, y - 28, 15, negrita);
    y -= 40;
    p.drawLine({ start: { x: MARGEN, y }, end: { x: MARGEN + UTIL, y }, thickness: 2, color: NEGRO });
    return y - 12;
  };

  const h = new Hoja(doc, normal, negrita, encabezado);

  // ── Datos de la visita ──
  h.titulo("Datos de la visita");
  const sucursal = visita.sucursal;
  h.dato("Cliente", visita.cliente?.nombreFantasia ?? "—");
  h.dato(
    "Sucursal",
    [sucursal?.nombre, [sucursal?.direccion, sucursal?.comuna, sucursal?.region].filter(Boolean).join(", ")]
      .filter(Boolean)
      .join(" · ")
  );
  h.dato("Fecha", visita.fechaProgramada);
  h.dato("Horario en tienda", ejec ? `${hhmm(ejec.horaInicio)} a ${hhmm(ejec.horaTermino)}` : "—");
  h.dato("Técnico", visita.tecnico?.nombreCompleto ?? "—");
  // Los motivos que confirmó el técnico en terreno; si no hay, los agendados.
  const codigosMotivo = ejec?.motivosRealesCodigos?.length ? ejec.motivosRealesCodigos : visita.motivosCodigos;
  h.dato(
    "Motivo",
    codigosMotivo.map((c) => d.motivos.find((m) => m.codigo === c)?.nombre ?? c).join(" · ") || "—"
  );
  h.dato(
    "Responsable de tienda",
    [ejec?.responsableNombre ?? visita.responsableNombre, ejec?.responsableRut, ejec?.responsableTelefono]
      .filter(Boolean)
      .join(" · ")
  );

  // ── Trabajo realizado, agrupado por motivo ──
  const trabajos = visita.trabajos ?? [];
  if (trabajos.length) {
    h.titulo("Trabajo realizado");
    const nombreTrabajo = (c: string) => d.trabajos.find((t) => t.codigo === c)?.nombre ?? c;
    const nombreMotivo = (c: string) => d.motivos.find((m) => m.codigo === c)?.nombre ?? c;
    const grupos = new Map<string, typeof trabajos>();
    for (const t of trabajos) {
      const k = t.motivoCodigo ?? "";
      grupos.set(k, [...(grupos.get(k) ?? []), t]);
    }
    for (const [motivo, lista] of grupos) {
      if (motivo && grupos.size > 1) {
        h.separacion(2);
        h.texto(nombreMotivo(motivo).toUpperCase(), { tam: 7.5, negrita: true, color: GRIS });
      }
      for (const t of lista) {
        h.texto(`• ${nombreTrabajo(t.trabajoCodigo)}`, { tam: 10.5, negrita: true });
        if (t.subtrabajos.length) {
          h.texto(t.subtrabajos.map((s) => (s.cantidad > 1 ? `${s.etiqueta} × ${s.cantidad}` : s.etiqueta)).join("  ·  "), {
            tam: 9.5,
            x: MARGEN + 12,
            color: GRIS,
          });
        }
        if (t.detalle) h.texto(t.detalle, { tam: 9.5, x: MARGEN + 12 });
        h.separacion(3);
      }
    }
  }

  if (ejec?.observaciones) {
    h.titulo("Detalle del trabajo");
    h.texto(ejec.observaciones, { tam: 10 });
  }

  // ── Problemas ──
  const problemas = visita.problemas ?? [];
  if (problemas.length) {
    h.titulo(`Problemas detectados (${problemas.length})`);
    for (const [i, p] of problemas.entries()) {
      const tipo = d.problemas.find((x) => x.codigo === p.tipoCodigo)?.nombre ?? p.tipoCodigo;
      h.texto(`${i + 1}. ${tipo}`, { tam: 10.5, negrita: true });
      if (p.items.length) {
        h.texto(p.items.map((it) => `${it.etiqueta} × ${it.cantidad}`).join("  ·  "), {
          tam: 9.5,
          x: MARGEN + 14,
          color: GRIS,
        });
      }
      if (p.descripcion) h.texto(p.descripcion, { tam: 9.5, x: MARGEN + 14 });
      if (p.solucion) h.texto(`Sugerido: ${p.solucion}`, { tam: 9.5, x: MARGEN + 14, color: GRIS });
      h.separacion(4);
    }
  }

  // ── Fotos: tres por fila, cada una ajustada a su celda ──
  const fotos = (await Promise.all(d.fotos.map((f) => incrustar(doc, f)))).filter((x): x is PDFImage => Boolean(x));
  if (fotos.length) {
    h.titulo(`Fotos del trabajo (${fotos.length})`);
    const cols = 3;
    const hueco = 8;
    const lado = (UTIL - hueco * (cols - 1)) / cols;
    const altoCelda = lado * 0.75;
    for (let i = 0; i < fotos.length; i += cols) {
      h.espacio(altoCelda + hueco);
      const fila = fotos.slice(i, i + cols);
      fila.forEach((img, j) => {
        const escala = Math.min(lado / img.width, altoCelda / img.height);
        const w = img.width * escala;
        const hh = img.height * escala;
        const x = MARGEN + j * (lado + hueco);
        h.pagina.drawRectangle({
          x,
          y: h.y - altoCelda,
          width: lado,
          height: altoCelda,
          color: rgb(0.93, 0.92, 0.92),
        });
        h.pagina.drawImage(img, { x: x + (lado - w) / 2, y: h.y - altoCelda + (altoCelda - hh) / 2, width: w, height: hh });
      });
      h.y -= altoCelda + hueco;
    }
  }

  // ── Firma ──
  h.titulo("Conformidad de la tienda");
  const firma = visita.firmas?.find((f) => f.rol === "TIENDA") ?? visita.firmas?.[0];
  const imgFirma = d.firma ? await incrustar(doc, d.firma) : null;
  h.espacio(110);
  if (imgFirma) {
    const alto = 70;
    const escala = Math.min(220 / imgFirma.width, alto / imgFirma.height);
    h.pagina.drawImage(imgFirma, {
      x: MARGEN,
      y: h.y - alto,
      width: imgFirma.width * escala,
      height: imgFirma.height * escala,
    });
  }
  h.y -= 76;
  h.pagina.drawLine({ start: { x: MARGEN, y: h.y }, end: { x: MARGEN + 230, y: h.y }, thickness: 0.8, color: NEGRO });
  h.y -= 4;
  h.texto([firma?.nombre, firma?.rut].filter(Boolean).join(" · ") || "Sin firma", { tam: 10, negrita: true });
  h.texto("Responsable de tienda", { tam: 8, color: GRIS });

  // ── Pie en todas las páginas ──
  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    const pie = limpio(`Grupo dMC · Acta ${visita.folio} · ${visita.sucursal?.nombre ?? ""}`);
    const num = `Página ${i + 1} de ${paginas.length}`;
    p.drawLine({
      start: { x: MARGEN, y: MARGEN + 12 },
      end: { x: MARGEN + UTIL, y: MARGEN + 12 },
      thickness: 0.4,
      color: LINEA,
    });
    p.drawText(pie, { x: MARGEN, y: MARGEN, size: 7.5, font: normal, color: GRIS });
    p.drawText(num, {
      x: MARGEN + UTIL - normal.widthOfTextAtSize(num, 7.5),
      y: MARGEN,
      size: 7.5,
      font: normal,
      color: GRIS,
    });
  });

  return doc.save();
}
