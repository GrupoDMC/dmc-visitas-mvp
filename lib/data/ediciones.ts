import "server-only";
import { enTransaccion, num, sql } from "@/lib/data/sql";
import {
  decodificarImagen,
  DIAS_PARA_EDITAR,
  escribirInternos,
  escribirTrabajos,
  faltaMigracionEdicion,
  getVisitaCompletaPorFolio,
  insertarFoto,
  insertarItemsDeProblema,
  insertarProblema,
  sincronizarMotivosCon,
  type FotoActa,
  type FotoLista,
  type SubtrabajoActa,
  type TrabajoActa,
} from "@/lib/data/visitas";
import { listarInternos, listarMotivos, listarProblemas, listarTrabajos } from "@/lib/data/catalogos";
import { rutLimpio } from "@/lib/ui/formato";
import type { EstadoVisita, OrigenRegistro, Visita } from "@/lib/types";

// Edición del acta ya cerrada.
//
// Un acta COMPLETADA se puede corregir: el técnico desde el celular, hasta un
// día después de cerrarla; el administrador desde el panel, sin plazo. Tres
// reglas la gobiernan:
//
// 1. No se pierde nada. Lo que se quita queda inactivo (trabajos, fotos,
//    videos) y lo que no se tocó no se reescribe. La firma de la tienda no se
//    toca nunca: ni la imagen ni la hora en que se firmó.
// 2. Todo queda anotado. Cada edición deja una fila en dmc.visita_edicion con
//    quién, cuándo, qué partes, qué cambió exactamente y por qué. El "qué
//    cambió" lo calcula el servidor comparando contra lo guardado: no depende
//    de lo que el cliente diga que cambió.
// 3. El acta sigue siendo la misma. No cambia de estado, no cambian sus horas y
//    el PDF sale igual que siempre, sin ninguna marca de edición.

export interface ProblemaEdicion {
  /** Id en dmc.problema si ya estaba en el acta; sin id, es uno nuevo. */
  id?: number | null;
  tipoCodigo: string;
  descripcion: string | null;
  items: SubtrabajoActa[];
}

export interface EdicionActaEntrada {
  folio: string;
  /** Por qué se edita. Obligatorio: queda en el registro. */
  motivoEdicion: string;
  /**
   * Cuántas ediciones tenía el acta cuando se abrió para editar. Si mientras
   * tanto alguien más la editó, esta se rechaza en vez de pisarla.
   */
  edicionesVistas: number;
  responsableNombre: string;
  responsableRut: string | null;
  responsableTelefono: string | null;
  motivosCodigos: string[];
  observaciones: string | null;
  comentarioInterno: string | null;
  internosCodigos: string[];
  trabajos: TrabajoActa[];
  problemas: ProblemaEdicion[];
  /** Ids de las fotos del acta que se conservan. Las demás quedan inactivas. */
  fotosConservadas: number[];
  fotosNuevas: FotoActa[];
  /** Los clips que quedan, en orden. Los nuevos ya están subidos. */
  videosIds: number[];
  /** De los nuevos, los que son del comentario interno. */
  videosInternosIds: number[];
}

export interface ResultadoEdicion {
  ok: boolean;
  error?: string;
  /** Las partes del acta que cambiaron. */
  secciones?: string[];
}

export interface ContextoEdicion {
  usuarioId: number;
  /** El técnico que edita desde el celular; null si se edita desde el panel. */
  tecnicoId: number | null;
  origen: OrigenRegistro;
  /** true = administración: sin el plazo de un día. */
  sinPlazo: boolean;
}

const SECCION = {
  responsable: "Responsable de tienda",
  trabajo: "Motivo y trabajo realizado",
  problemas: "Problemas detectados",
  interno: "Comentario interno",
  media: "Fotos y video",
} as const;

const PLAZO_VENCIDO = `Ya pasó el plazo de ${DIAS_PARA_EDITAR === 1 ? "un día" : `${DIAS_PARA_EDITAR} días`} para editar esta acta desde el celular. Pídele el cambio a coordinación.`;
const EDITADA_POR_OTRO = "Esta acta se editó mientras la tenías abierta. Vuelve a abrirla para ver cómo quedó.";
const FALTA_MIGRACION = "Falta aplicar la migración 013 en la base de datos. Avísale al administrador.";

/** Un rechazo a mitad de la transacción: deshace lo escrito y llega como mensaje. */
class EdicionRechazada extends Error {}

// ── Comparación ─────────────────────────────────────────────────────────────

interface Nombres {
  motivo: (codigo: string) => string;
  trabajo: (codigo: string) => string;
  problema: (codigo: string) => string;
  interno: (codigo: string) => string;
}

interface TrabajoNormal {
  motivo: string | null;
  codigo: string;
  detalle: string;
  subs: SubtrabajoActa[];
}

interface ProblemaNormal {
  id: number | null;
  tipo: string;
  desc: string;
  items: SubtrabajoActa[];
}

/** Lo que hay que escribir y lo que queda anotado. */
interface Cambios {
  lineas: { seccion: string; texto: string }[];
  ejecucion: boolean;
  motivos: boolean;
  trabajos: boolean;
  internos: boolean;
  problemas: { quitados: number[]; modificados: ProblemaNormal[]; nuevos: ProblemaNormal[]; orden: ProblemaNormal[] };
  fotosQuitadas: number[];
  videos: { cambio: boolean; ids: number[]; internos: Set<number> };
  /** Nombre y RUT bajo la firma, cuando eran los del responsable y este se corrigió. */
  firma: { id: number; nombre: string | null; rut: string | null } | null;
}

const txt = (s: string | null | undefined) => String(s ?? "").trim();
const cita = (s: string) => (s ? `«${s}»` : "(vacío)");
const soloDigitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");
const cantidad = (n: number) => Math.min(99, Math.max(1, Math.round(Number(n)) || 1));
const numeros = (ids: number[]) => ids.map((n) => `n.º ${n}`).join(", ");

function limpiarItems(items: SubtrabajoActa[]): SubtrabajoActa[] {
  const vistas = new Set<string>();
  const salida: SubtrabajoActa[] = [];
  for (const it of items ?? []) {
    const etiqueta = txt(it.etiqueta);
    if (!etiqueta || vistas.has(etiqueta)) continue;
    vistas.add(etiqueta);
    salida.push({ etiqueta, cantidad: cantidad(it.cantidad) });
  }
  return salida;
}

/** Los items como texto comparable, sin que importe el orden. */
function huellaItems(items: SubtrabajoActa[]): string {
  return items
    .map((s) => `${s.etiqueta}×${s.cantidad}`)
    .sort()
    .join("|");
}

function textoItems(items: SubtrabajoActa[]): string {
  return items.map((s) => `${s.etiqueta}${s.cantidad > 1 ? ` × ${s.cantidad}` : ""}`).join(", ");
}

function comparar(antes: Visita, e: EdicionActaEntrada, fotosNuevas: FotoLista[], nombres: Nombres): Cambios {
  const ejec = antes.ejecucion!;
  const lineas: Cambios["lineas"] = [];
  const anotar = (seccion: string, texto: string) => lineas.push({ seccion, texto });

  // 1 · Responsable de tienda
  const nombreAntes = txt(ejec.responsableNombre);
  const nombreAhora = txt(e.responsableNombre);
  const cambioNombre = nombreAntes !== nombreAhora;
  const cambioRut = rutLimpio(ejec.responsableRut ?? "") !== rutLimpio(e.responsableRut ?? "");
  const cambioTel = soloDigitos(ejec.responsableTelefono) !== soloDigitos(e.responsableTelefono);
  if (cambioNombre) anotar(SECCION.responsable, `Nombre: ${cita(nombreAntes)} → ${cita(nombreAhora)}`);
  if (cambioRut) anotar(SECCION.responsable, `RUT: ${cita(txt(ejec.responsableRut))} → ${cita(txt(e.responsableRut))}`);
  if (cambioTel) {
    anotar(SECCION.responsable, `Teléfono: ${cita(txt(ejec.responsableTelefono))} → ${cita(txt(e.responsableTelefono))}`);
  }

  // La firma no se toca. Pero si bajo ella iban el nombre o el RUT del
  // responsable y eso es justo lo que se corrige, el texto se corrige también:
  // si no, el acta diría una cosa arriba y otra bajo la firma.
  let firma: Cambios["firma"] = null;
  const firmaTienda = antes.firmas?.find((f) => f.rol === "TIENDA");
  if (firmaTienda) {
    const nombre =
      cambioNombre && txt(firmaTienda.nombre).toLowerCase() === nombreAntes.toLowerCase() ? nombreAhora : null;
    const rutAntes = rutLimpio(ejec.responsableRut ?? "");
    const rut =
      cambioRut && rutAntes && rutLimpio(firmaTienda.rut ?? "") === rutAntes && txt(e.responsableRut)
        ? txt(e.responsableRut)
        : null;
    if (nombre || rut) {
      firma = { id: firmaTienda.id, nombre, rut };
      anotar(
        SECCION.responsable,
        `${nombre && rut ? "El nombre y el RUT" : nombre ? "El nombre" : "El RUT"} bajo la firma también se ${nombre && rut ? "corrigieron" : "corrigió"}; la firma es la misma.`
      );
    }
  }

  // 2 · Motivos y trabajo realizado
  const motivosAntes = ejec.motivosRealesCodigos.filter(Boolean);
  const motivosAhora = [...new Set(e.motivosCodigos.filter(Boolean))];
  for (const c of motivosAhora.filter((c) => !motivosAntes.includes(c))) {
    anotar(SECCION.trabajo, `Motivo agregado: ${cita(nombres.motivo(c))}`);
  }
  for (const c of motivosAntes.filter((c) => !motivosAhora.includes(c))) {
    anotar(SECCION.trabajo, `Motivo quitado: ${cita(nombres.motivo(c))}`);
  }
  const cambioMotivos = motivosAntes.join("|") !== motivosAhora.join("|");
  if (cambioMotivos && motivosAntes[0] !== motivosAhora[0] && motivosAntes.includes(motivosAhora[0])) {
    anotar(SECCION.trabajo, `Motivo principal: ${cita(nombres.motivo(motivosAntes[0] ?? ""))} → ${cita(nombres.motivo(motivosAhora[0]))}`);
  }

  // Los trabajos de actas anteriores no traen motivo: cuelgan del primero,
  // igual que los muestra el formulario.
  const trabajosAntes: TrabajoNormal[] = (antes.trabajos ?? []).map((t) => ({
    motivo: t.motivoCodigo ?? motivosAntes[0] ?? null,
    codigo: t.trabajoCodigo,
    detalle: txt(t.detalle),
    subs: limpiarItems(t.subtrabajos),
  }));
  const trabajosAhora: TrabajoNormal[] = e.trabajos.map((t) => ({
    motivo: t.motivoCodigo && motivosAhora.includes(t.motivoCodigo) ? t.motivoCodigo : null,
    codigo: t.codigo,
    detalle: txt(t.detalle),
    subs: limpiarItems(t.subtrabajos),
  }));
  const claveT = (t: TrabajoNormal) => `${t.motivo ?? ""}|${t.codigo}`;
  const huellaT = (t: TrabajoNormal) => `${t.detalle}#${huellaItems(t.subs)}`;
  const describeT = (t: TrabajoNormal) =>
    `«${nombres.trabajo(t.codigo)}»${t.subs.length ? ` (${textoItems(t.subs)})` : ""}${t.detalle ? ` — ${t.detalle}` : ""}${t.motivo ? `, en ${nombres.motivo(t.motivo)}` : ""}`;
  const porClaveAntes = new Map(trabajosAntes.map((t) => [claveT(t), t]));
  const porClaveAhora = new Map(trabajosAhora.map((t) => [claveT(t), t]));
  let cambioTrabajos = trabajosAntes.length !== trabajosAhora.length;
  for (const t of trabajosAhora) {
    const previo = porClaveAntes.get(claveT(t));
    if (!previo) {
      cambioTrabajos = true;
      anotar(SECCION.trabajo, `Trabajo agregado: ${describeT(t)}`);
    } else if (huellaT(previo) !== huellaT(t)) {
      cambioTrabajos = true;
      anotar(SECCION.trabajo, `Trabajo modificado: ${describeT(previo)} → ${describeT(t)}`);
    }
  }
  for (const t of trabajosAntes) {
    if (porClaveAhora.has(claveT(t))) continue;
    cambioTrabajos = true;
    anotar(SECCION.trabajo, `Trabajo quitado: ${describeT(t)}`);
  }

  const obsAntes = txt(ejec.observaciones);
  const obsAhora = txt(e.observaciones);
  if (obsAntes !== obsAhora) anotar(SECCION.trabajo, `Detalle del trabajo: ${cita(obsAntes)} → ${cita(obsAhora)}`);

  // 3 · Problemas detectados
  const describeP = (p: ProblemaNormal) =>
    `«${nombres.problema(p.tipo)}»${p.items.length ? ` (${textoItems(p.items)})` : ""}${p.desc ? ` — ${p.desc}` : ""}`;
  const problemasAntes = new Map(
    (antes.problemas ?? []).map((p): [number, ProblemaNormal] => [
      p.id,
      { id: p.id, tipo: p.tipoCodigo, desc: txt(p.descripcion), items: limpiarItems(p.items) },
    ])
  );
  const problemas: Cambios["problemas"] = { quitados: [], modificados: [], nuevos: [], orden: [] };
  const conservados = new Set<number>();
  for (const p of e.problemas) {
    const id = p.id && problemasAntes.has(p.id) && !conservados.has(p.id) ? p.id : null;
    const ahora: ProblemaNormal = { id, tipo: p.tipoCodigo, desc: txt(p.descripcion), items: limpiarItems(p.items) };
    problemas.orden.push(ahora);
    if (id === null) {
      problemas.nuevos.push(ahora);
      anotar(SECCION.problemas, `Problema agregado: ${describeP(ahora)}`);
      continue;
    }
    conservados.add(id);
    const previo = problemasAntes.get(id)!;
    if (previo.tipo !== ahora.tipo || previo.desc !== ahora.desc || huellaItems(previo.items) !== huellaItems(ahora.items)) {
      problemas.modificados.push(ahora);
      anotar(SECCION.problemas, `Problema modificado: ${describeP(previo)} → ${describeP(ahora)}`);
    }
  }
  for (const [id, previo] of problemasAntes) {
    if (conservados.has(id)) continue;
    problemas.quitados.push(id);
    anotar(SECCION.problemas, `Problema quitado: ${describeP(previo)}`);
  }

  // 4 · Comentario interno
  const internoAntes = txt(ejec.comentarioInterno);
  const internoAhora = txt(e.comentarioInterno);
  if (internoAntes !== internoAhora) {
    anotar(SECCION.interno, `Descripción: ${cita(internoAntes)} → ${cita(internoAhora)}`);
  }
  const checkAntes = (antes.internos ?? []).map((x) => x.codigo);
  const checkAhora = [...new Set(e.internosCodigos.filter(Boolean))];
  const marcados = checkAhora.filter((c) => !checkAntes.includes(c));
  const desmarcados = checkAntes.filter((c) => !checkAhora.includes(c));
  if (marcados.length) anotar(SECCION.interno, `Marcado: ${marcados.map((c) => cita(nombres.interno(c))).join(", ")}`);
  if (desmarcados.length) {
    anotar(SECCION.interno, `Desmarcado: ${desmarcados.map((c) => cita(nombres.interno(c))).join(", ")}`);
  }

  // 5 · Fotos y video. Lo que se quita no se borra: queda inactivo en la base,
  //     y por eso se anota su número.
  const fotosAntes = antes.fotos ?? [];
  const quedan = new Set(e.fotosConservadas);
  const fotosQuitadas = fotosAntes.filter((f) => !quedan.has(f.id));
  for (const interna of [false, true]) {
    const tipo = interna ? "internas" : "del trabajo";
    const quitadas = fotosQuitadas.filter((f) => f.interno === interna).map((f) => f.id);
    const agregadas = fotosNuevas.filter((f) => f.interno === interna).length;
    if (agregadas) anotar(SECCION.media, `Fotos ${tipo} agregadas: ${agregadas}`);
    if (quitadas.length) {
      anotar(SECCION.media, `Fotos ${tipo} quitadas: ${quitadas.length} (${numeros(quitadas)}; quedan guardadas, inactivas)`);
    }
  }

  const videosAntes = antes.videos ?? [];
  const idsAntes = new Set(videosAntes.map((v) => v.id));
  const videosAhora = [...new Set(e.videosIds.filter((n) => Number.isInteger(n) && n > 0))];
  const internosNuevos = new Set(e.videosInternosIds ?? []);
  // Un clip que ya estaba conserva su carácter (del trabajo o interno).
  const internosVideo = new Set<number>([
    ...videosAntes.filter((v) => v.interno && videosAhora.includes(v.id)).map((v) => v.id),
    ...videosAhora.filter((id) => !idsAntes.has(id) && internosNuevos.has(id)),
  ]);
  const videosNuevos = videosAhora.filter((id) => !idsAntes.has(id));
  const videosQuitados = videosAntes.filter((v) => !videosAhora.includes(v.id));
  for (const interno of [false, true]) {
    const tipo = interno ? "internos" : "del trabajo";
    const agregados = videosNuevos.filter((id) => internosVideo.has(id) === interno);
    const quitados = videosQuitados.filter((v) => v.interno === interno).map((v) => v.id);
    if (agregados.length) anotar(SECCION.media, `Videos ${tipo} agregados: ${agregados.length} (${numeros(agregados)})`);
    if (quitados.length) {
      anotar(SECCION.media, `Videos ${tipo} quitados: ${quitados.length} (${numeros(quitados)}; quedan guardados, inactivos)`);
    }
  }

  return {
    lineas,
    ejecucion: cambioNombre || cambioRut || cambioTel || cambioMotivos || obsAntes !== obsAhora || internoAntes !== internoAhora,
    motivos: cambioMotivos,
    trabajos: cambioTrabajos,
    internos: marcados.length > 0 || desmarcados.length > 0,
    problemas,
    fotosQuitadas: fotosQuitadas.map((f) => f.id),
    videos: { cambio: videosNuevos.length > 0 || videosQuitados.length > 0, ids: videosAhora, internos: internosVideo },
    firma,
  };
}

// ── Guardado ────────────────────────────────────────────────────────────────

/**
 * Corrige un acta ya cerrada y deja el registro de la edición.
 *
 * Va todo en una transacción: o queda la corrección entera con su registro, o
 * no queda nada. Solo se escriben las partes que cambiaron.
 */
export async function editarActa(entrada: EdicionActaEntrada, ctx: ContextoEdicion): Promise<ResultadoEdicion> {
  const motivoEdicion = txt(entrada.motivoEdicion);
  if (motivoEdicion.length < 5) return { ok: false, error: "Escribe por qué se edita el acta: queda en el registro." };

  const antes = await getVisitaCompletaPorFolio(entrada.folio);
  if (!antes) return { ok: false, error: "No encontramos esa visita." };
  if (ctx.tecnicoId !== null && antes.tecnicoId !== ctx.tecnicoId && antes.tecnicoAyudanteId !== ctx.tecnicoId) {
    return { ok: false, error: "Esa visita no está asignada a ti." };
  }
  if (antes.estado !== "COMPLETADA" || !antes.ejecucion) {
    return { ok: false, error: "Solo se puede editar un acta que ya está cerrada." };
  }
  if (!ctx.sinPlazo && !antes.ejecucion.editablePorTecnico) return { ok: false, error: PLAZO_VENCIDO };
  if (entrada.edicionesVistas !== (antes.ediciones?.length ?? 0)) return { ok: false, error: EDITADA_POR_OTRO };

  const motivos = [...new Set(entrada.motivosCodigos.filter(Boolean))];
  if (!motivos.length) return { ok: false, error: "Marca al menos un motivo de la visita." };
  if (!txt(entrada.responsableNombre)) return { ok: false, error: "Falta el nombre del responsable de la tienda." };
  // ck_problema_otro_desc: se valida antes de escribir nada.
  for (const pr of entrada.problemas) {
    if (pr.tipoCodigo === "OTRO" && !txt(pr.descripcion)) {
      return { ok: false, error: "El problema marcado como «Otro» necesita que escribas qué se encontró." };
    }
  }

  const fotosNuevas: FotoLista[] = [];
  for (const f of entrada.fotosNuevas ?? []) {
    const img = decodificarImagen(f.dataUrl);
    if (!img) return { ok: false, error: "Una de las fotos nuevas llegó dañada. Quítala y vuelve a agregarla." };
    fotosNuevas.push({ ...img, etiqueta: f.etiqueta, interno: Boolean(f.interno) });
  }

  // Los nombres con que se anota cada cambio: el del checklist de hoy y, si la
  // entrada ya no existe, su código.
  const [catMotivos, catTrabajos, catProblemas, catInternos] = await Promise.all([
    listarMotivos(),
    listarTrabajos(),
    listarProblemas(),
    listarInternos(),
  ]);
  const buscar = (lista: { codigo: string; nombre: string }[]) => (codigo: string) =>
    lista.find((x) => x.codigo === codigo)?.nombre ?? codigo;
  const nombres: Nombres = {
    motivo: buscar(catMotivos),
    trabajo: buscar(catTrabajos),
    problema: buscar(catProblemas),
    interno: buscar(catInternos),
  };

  const cambios = comparar(antes, { ...entrada, motivosCodigos: motivos }, fotosNuevas, nombres);
  if (!cambios.lineas.length) return { ok: false, error: "No cambiaste nada: el acta quedó como estaba." };
  const secciones = [...new Set(cambios.lineas.map((l) => l.seccion))];

  try {
    return await enTransaccion(async (ej) => {
      const id = antes.id;
      const p = (extra: [string, unknown, unknown][] = []) =>
        [["id", sql.BigInt, id], ...extra] as Parameters<typeof ej.ejecutar>[1];

      // Con la fila bloqueada se vuelve a mirar lo que pudo cambiar entre la
      // lectura y este momento: el estado, el plazo y si alguien editó antes.
      const [fila] = await ej.consulta<{ estado: EstadoVisita; en_plazo: boolean | null; ediciones: number }>(
        `SELECT v.estado,
                (SELECT CAST(CASE WHEN DATEADD(day, ${DIAS_PARA_EDITAR}, e.hora_termino) >= SYSDATETIME()
                                  THEN 1 ELSE 0 END AS bit)
                   FROM dmc.visita_ejecucion e WHERE e.visita_id = v.id) AS en_plazo,
                (SELECT COUNT(*) FROM dmc.visita_edicion x WHERE x.visita_id = v.id) AS ediciones
           FROM dmc.visita v WITH (UPDLOCK, ROWLOCK) WHERE v.id = @id AND v.activo = 1`,
        p()
      );
      if (!fila || fila.estado !== "COMPLETADA") {
        throw new EdicionRechazada("Solo se puede editar un acta que ya está cerrada.");
      }
      if (!ctx.sinPlazo && !fila.en_plazo) throw new EdicionRechazada(PLAZO_VENCIDO);
      if (num(fila.ediciones) !== entrada.edicionesVistas) throw new EdicionRechazada(EDITADA_POR_OTRO);

      // Un problema que coordinación ya gestionó no se quita del acta: se
      // perdería su historial y la visita agendada para resolverlo.
      for (const problemaId of cambios.problemas.quitados) {
        const [gestionado] = await ej.consulta<{ id: number }>(
          `SELECT p.id FROM dmc.problema p
            WHERE p.id = @p AND p.visita_id = @id
              AND (p.estado <> 'ABIERTO'
                   OR EXISTS (SELECT 1 FROM dmc.problema_visita_resolucion r WHERE r.problema_id = p.id)
                   OR EXISTS (SELECT 1 FROM dmc.visita v2 WHERE v2.problema_origen_id = p.id)
                   OR EXISTS (SELECT 1 FROM dmc.problema_historial h WHERE h.problema_id = p.id)
                   OR EXISTS (SELECT 1 FROM dmc.visita_foto f WHERE f.problema_id = p.id)
                   OR EXISTS (SELECT 1 FROM dmc.visita_video w WHERE w.problema_id = p.id))`,
          p([["p", sql.BigInt, problemaId]])
        );
        if (gestionado) {
          const tipo = antes.problemas?.find((x) => x.id === problemaId)?.tipoCodigo ?? "";
          throw new EdicionRechazada(
            `El problema «${nombres.problema(tipo)}» ya lo gestionó coordinación (cambió su estado o tiene una visita agendada): no se puede quitar del acta. Su estado se cambia en Problemas.`
          );
        }
      }

      // 1 · Responsable, motivo principal, detalle y comentario interno. Las
      //     horas, el dispositivo y la sincronización son del cierre original.
      if (cambios.ejecucion) {
        await ej.ejecutar(
          `UPDATE dmc.visita_ejecucion
              SET responsable_nombre   = @nombre,
                  responsable_rut      = @rut,
                  responsable_telefono = @telefono,
                  motivo_real_codigo   = @motivo,
                  observaciones        = @obs,
                  comentario_interno   = @interno
            WHERE visita_id = @id`,
          p([
            ["nombre", sql.NVarChar(120), txt(entrada.responsableNombre)],
            ["rut", sql.VarChar(12), txt(entrada.responsableRut) || null],
            ["telefono", sql.VarChar(30), txt(entrada.responsableTelefono) || null],
            ["motivo", sql.VarChar(40), motivos[0]],
            ["obs", sql.NVarChar(sql.MAX), txt(entrada.observaciones) || null],
            ["interno", sql.NVarChar(sql.MAX), txt(entrada.comentarioInterno) || null],
          ])
        );
      }

      // La firma: solo el texto que la acompaña. La imagen y la hora en que se
      // firmó no se tocan.
      if (cambios.firma) {
        await ej.ejecutar(
          `UPDATE dmc.visita_firma
              SET nombre = COALESCE(@nombre, nombre), rut = COALESCE(@rut, rut), actualizado_en = SYSDATETIME()
            WHERE id = @firma AND visita_id = @id`,
          p([
            ["firma", sql.BigInt, cambios.firma.id],
            ["nombre", sql.NVarChar(120), cambios.firma.nombre],
            ["rut", sql.VarChar(12), cambios.firma.rut],
          ])
        );
      }

      // 2 · Motivos confirmados y trabajos realizados.
      if (cambios.motivos) await sincronizarMotivosCon(ej, id, "REAL", motivos);
      if (cambios.trabajos) await escribirTrabajos(ej, id, entrada.trabajos, motivos);

      // 3 · Problemas: cada uno se corrige en su misma fila, para que conserve
      //     su estado, su historial y lo que cuelgue de él.
      for (const problemaId of cambios.problemas.quitados) {
        await ej.ejecutar(`DELETE FROM dmc.problema WHERE id = @p AND visita_id = @id`, p([["p", sql.BigInt, problemaId]]));
      }
      for (const pr of cambios.problemas.modificados) {
        await ej.ejecutar(
          `UPDATE dmc.problema SET tipo_codigo = @tipo, descripcion = @desc WHERE id = @p AND visita_id = @id;
           DELETE FROM dmc.problema_item WHERE problema_id = @p;`,
          p([
            ["p", sql.BigInt, pr.id],
            ["tipo", sql.VarChar(40), pr.tipo],
            ["desc", sql.NVarChar(sql.MAX), pr.desc || null],
          ])
        );
        await insertarItemsDeProblema(ej, pr.id!, pr.items);
      }
      const { quitados, nuevos } = cambios.problemas;
      if (quitados.length || nuevos.length) {
        for (const [i, pr] of cambios.problemas.orden.entries()) {
          if (pr.id === null) {
            await insertarProblema(
              ej,
              id,
              { tipoCodigo: pr.tipo, estado: "ABIERTO", descripcion: pr.desc || null, solucion: null, items: pr.items },
              i + 1
            );
          } else {
            await ej.ejecutar(
              `UPDATE dmc.problema SET orden = @orden WHERE id = @p AND visita_id = @id AND orden <> @orden`,
              p([
                ["p", sql.BigInt, pr.id],
                ["orden", sql.SmallInt, i + 1],
              ])
            );
          }
        }
      }

      // 4 · Checklist del comentario interno.
      if (cambios.internos) await escribirInternos(ej, id, entrada.internosCodigos);

      // 5 · Fotos: las quitadas quedan inactivas y las nuevas van al final.
      //     Las listas van interpoladas porque son de largo variable; salen de
      //     ids leídos de la base, no del cliente.
      if (cambios.fotosQuitadas.length) {
        await ej.ejecutar(
          `UPDATE dmc.visita_foto SET activo = 0
            WHERE visita_id = @id AND activo = 1 AND id IN (${cambios.fotosQuitadas.join(",")})`,
          p()
        );
      }
      const ultimoOrden = Math.max(0, ...(antes.fotos ?? []).map((f) => f.orden));
      for (const [i, f] of fotosNuevas.entries()) await insertarFoto(ej, id, f, ultimoOrden + i + 1);

      // 5b · Videos. Los que se grabaron al editar ya están subidos, pero
      //      inactivos: recién acá entran al acta.
      if (cambios.videos.cambio) {
        const lista = cambios.videos.ids.length ? cambios.videos.ids.join(",") : "0";
        await ej.ejecutar(
          `UPDATE dmc.visita_video SET activo = 0 WHERE visita_id = @id AND activo = 1 AND id NOT IN (${lista})`,
          p()
        );
        for (const [i, videoId] of cambios.videos.ids.entries()) {
          await ej.ejecutar(
            `UPDATE dmc.visita_video SET activo = 1, orden = @orden, interno = @interno
              WHERE id = @video AND visita_id = @id AND subida_completa = 1`,
            p([
              ["video", sql.BigInt, videoId],
              ["orden", sql.SmallInt, i + 1],
              ["interno", sql.Bit, cambios.videos.internos.has(videoId)],
            ])
          );
        }
      }

      // 6 · El registro: quién, desde dónde, qué partes, qué cambió y por qué.
      await ej.ejecutar(
        `INSERT INTO dmc.visita_edicion (visita_id, origen, usuario_id, tecnico_id, motivo, secciones, detalle)
         VALUES (@id, @origen, @usuario, @tecnico, @motivo, @secciones, @detalle)`,
        p([
          ["origen", sql.VarChar(6), ctx.origen],
          ["usuario", sql.BigInt, ctx.usuarioId],
          ["tecnico", sql.BigInt, ctx.tecnicoId],
          ["motivo", sql.NVarChar(sql.MAX), motivoEdicion],
          ["secciones", sql.NVarChar(400), secciones.join(" · ")],
          ["detalle", sql.NVarChar(sql.MAX), cambios.lineas.map((l) => `${l.seccion}: ${l.texto}`).join("\n")],
        ])
      );

      return { ok: true, secciones };
    });
  } catch (err) {
    if (err instanceof EdicionRechazada) return { ok: false, error: err.message };
    if (faltaMigracionEdicion(err)) return { ok: false, error: FALTA_MIGRACION };
    throw err;
  }
}
