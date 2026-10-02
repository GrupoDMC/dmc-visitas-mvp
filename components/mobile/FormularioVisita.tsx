"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Sheet from "./Sheet";
import Confirmar, { type ConfirmarCfg } from "./Confirmar";
import CamaraSheet from "./CamaraSheet";
import VideoSheet, { type ClipGrabado } from "./VideoSheet";
import FirmaSheet, { type FirmaGuardada } from "./FirmaSheet";
import { Toast, useToast } from "./toast";
import { fmtRut, fmtTel, mensajeRut, rutCompleto, rutDvCorrecto, telCompleto } from "@/lib/ui/formato";
import { comprimirFoto } from "@/lib/ui/imagen";
import { mb, reloj, repararDuracionPreview, trozoBase64, VIDEO_TROZO_BYTES } from "@/lib/ui/video";
import { guardarActaAction } from "@/app/actions/visitas";
import { editarActaTecnicoAction } from "@/app/actions/ediciones";
import { fechaHoraCorta, formularioDesdeActa } from "@/lib/ui/edicion";
import {
  abrirVideoAction,
  borrarVideoAction,
  cerrarVideoAction,
  subirTrozoVideoAction,
} from "@/app/actions/videos";
import { descartarBorradorAction, guardarBorradorAction } from "@/app/actions/borradores";
import { trabajoVaConMotivo } from "@/lib/ui/referencias";
import {
  actasEnCola,
  borradorConDatos,
  borrarBorrador,
  encolarActa,
  escribirBorrador,
  hayConexion,
  haceCuanto,
  leerActaEnCola,
  leerBorrador,
  sacarDeCola,
  type BorradorActa,
  type FotoForm,
  type ProblemaForm,
  type ProblemaItemForm,
  type Seccion,
  type SubSeleccion,
  type TrabajoForm,
  type VideoForm,
} from "@/lib/ui/borrador";
import type { ActaEntrada } from "@/lib/data/visitas";
import type { EdicionActaEntrada } from "@/lib/data/ediciones";
import type {
  CatalogoInterno,
  CatalogoMotivo,
  CatalogoProblema,
  CatalogoTrabajo,
  Visita,
} from "@/lib/types";

const SECCIONES: Seccion[] = ["sucursal", "motivo", "problemas", "interno", "fotos", "firmas"];

const NOMBRE_SECCION: Record<Seccion, string> = {
  sucursal: "Sección responsable",
  motivo: "Sección trabajo realizado",
  problemas: "Problemas detectados",
  interno: "Comentario interno",
  fotos: "Fotos y video",
  firmas: "Firma de tienda",
};

/** Cada cuánto se sube el respaldo del borrador cuando hay señal. */
const CADA_CUANTO_SUBE = 30_000;
/** Cada cuánto se reintenta sola un acta que quedó esperando cobertura. */
const CADA_CUANTO_REINTENTA = 20_000;

let autoId = 1;

export default function FormularioVisita({
  visita,
  motivos,
  catalogoTrabajo,
  catalogoProblema,
  catalogoInterno,
  borradorServidor,
  edicion = false,
}: {
  visita: Visita;
  motivos: CatalogoMotivo[];
  catalogoTrabajo: CatalogoTrabajo[];
  catalogoProblema: CatalogoProblema[];
  catalogoInterno: CatalogoInterno[];
  /** Respaldo del acta a medio llenar que quedó en el servidor, si lo hay. */
  borradorServidor?: { payload: string; guardadoEn: string } | null;
  /**
   * true = se corrige un acta ya cerrada. El formulario parte de lo guardado
   * en la base, la firma de la tienda no se toca, no hay borrador ni cola (se
   * guarda con señal o no se guarda) y al confirmar se pide el porqué.
   */
  edicion?: boolean;
}) {
  const router = useRouter();
  const { toast, aviso } = useToast();

  // Al editar, todo arranca de lo que quedó en el acta.
  const [inicial] = useState(() => {
    if (!edicion) return null;
    const acta = formularioDesdeActa(visita);
    autoId = Math.max(autoId, acta.siguienteId);
    return acta;
  });

  const [paso, setPaso] = useState<"form" | "preview" | "ok" | "encolada">("form");
  const [abierta, setAbierta] = useState<Seccion | null>(edicion ? null : "sucursal");
  const [guardadas, setGuardadas] = useState<Partial<Record<Seccion, boolean>>>(() =>
    edicion ? Object.fromEntries(SECCIONES.map((k) => [k, true])) : {}
  );
  /** Por qué se edita el acta: obligatorio, queda en el registro. */
  const [motivoEdicion, setMotivoEdicion] = useState("");
  const [confirmar, setConfirmar] = useState<ConfirmarCfg | null>(null);
  const [horaInicio, setHoraInicio] = useState("—");
  const [horaTermino, setHoraTermino] = useState("—");
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  // 1 · Sucursal y responsable
  const [respNombre, setRespNombre] = useState(inicial?.respNombre ?? visita.responsableNombre ?? "");
  const [respRut, setRespRut] = useState(
    // Lo que ya haya en el acta manda; si no, lo que se anotó al agendar.
    inicial?.respRut ?? fmtRut(visita.ejecucion?.responsableRut ?? visita.responsableRut ?? "")
  );
  const [respTel, setRespTel] = useState(inicial?.respTel ?? fmtTel(visita.responsableTelefono ?? ""));

  // 2 · Motivo y trabajo realizado. Los que agendó coordinación vienen ya
  // marcados y no se pueden quitar; el técnico solo puede sumar otros.
  // Ojo: al iniciar la visita la ejecución existe pero sin motivos reales, así
  // que una lista vacía no cuenta como "ya confirmados".
  const motivosAgendados = useMemo(
    () => (visita.motivosCodigos?.length ? visita.motivosCodigos : [visita.motivoCodigo]).filter(Boolean),
    [visita.motivosCodigos, visita.motivoCodigo]
  );
  const conAgendados = useCallback(
    (codigos: string[]) => [...new Set([...motivosAgendados, ...codigos.filter(Boolean)])],
    [motivosAgendados]
  );
  const [motivosCodigos, setMotivosCodigos] = useState<string[]>(() =>
    conAgendados(visita.ejecucion?.motivosRealesCodigos ?? [])
  );
  const [obs, setObs] = useState(inicial?.obs ?? "");
  const [trabajos, setTrabajos] = useState<TrabajoForm[]>(inicial?.trabajos ?? []);

  // 3 · Problemas detectados
  const [problemas, setProblemas] = useState<ProblemaForm[]>(inicial?.problemas ?? []);

  // 4 · Comentario interno: su checklist, el texto, y fotos y videos marcados
  //     como internos. Nada de esto lo ve el cliente.
  const [interno, setInterno] = useState(inicial?.interno ?? "");
  const [internos, setInternos] = useState<string[]>(inicial?.internos ?? []);

  // 5 · Fotos y videos (los del trabajo y los internos, separados por `interno`)
  const [fotos, setFotos] = useState<FotoForm[]>(inicial?.fotos ?? []);
  // El video no se acumula en el formulario como las fotos: se sube a
  // dmc.visita_video en cuanto se termina de grabar, porque un minuto en 720p
  // pesa unos 11 MB y no cabe ni en una Server Action ni en localStorage. Por
  // eso la lista arranca de lo que la visita ya tiene subido y no del borrador:
  // la base es la que sabe qué clips hay.
  const [videos, setVideos] = useState<VideoForm[]>(() =>
    (visita.videos ?? []).map((v) => ({
      id: v.id,
      src: v.archivoUrl,
      duracionSeg: v.duracionSeg ?? 0,
      ancho: v.ancho ?? 0,
      alto: v.alto ?? 0,
      bytes: v.bytes ?? 0,
      progreso: null,
      error: null,
      interno: v.interno,
    }))
  );

  // 6 · Firma
  const [firma, setFirma] = useState<FirmaGuardada | null>(inicial?.firma ?? null);

  // Hojas inferiores
  const [sheet, setSheet] = useState<"trabajo" | "problema" | "firma" | "camara" | "video" | null>(null);
  /** A dónde va lo que se capture en la cámara o el video: al trabajo o al comentario interno. */
  const [destinoMedia, setDestinoMedia] = useState<"trabajo" | "interno">("trabajo");
  /**
   * La hoja de "agregar trabajo". `motivo` es bajo qué motivo se agrega, y
   * `agregados` los que ya se sumaron sin cerrar la hoja: después del primero
   * la hoja pregunta "¿Qué más hiciste?" en vez de cerrarse.
   */
  const [nt, setNt] = useState<{ motivo: string; codigo: string; subs: SubSeleccion[]; agregados: string[] }>({
    motivo: "",
    codigo: "",
    subs: [],
    agregados: [],
  });
  /** `editando` = id de la fila que se está corrigiendo; null si es un problema nuevo. */
  const [np, setNp] = useState<{ codigo: string; items: ProblemaItemForm[]; desc: string; editando: number | null }>({
    codigo: "",
    items: [],
    desc: "",
    editando: null,
  });
  /** Los motivos no marcados se esconden tras "Agregar otro motivo" para no llenar la pantalla. */
  const [verOtrosMotivos, setVerOtrosMotivos] = useState(false);

  // ── Borrador y envío diferido ─────────────────────────────────────────────
  //
  // En terreno pasan dos cosas todo el tiempo: el acta queda a medias (una
  // llamada, la batería, el celular que se bloquea) y la señal se corta justo
  // al guardar. Lo escrito se respalda en el propio celular en cuanto se toca
  // algo, y el acta terminada que no salió queda en una cola que se reintenta
  // sola. El técnico no tiene que quedarse parado esperando cobertura.

  /** false hasta que se terminó de mirar si había algo que recuperar. */
  const [listo, setListo] = useState(false);
  const [respaldo, setRespaldo] = useState<{ guardadoEn: string; sinFotos: boolean } | null>(null);
  const [recuperado, setRecuperado] = useState<{ guardadoEn: string; sinFotos: boolean } | null>(null);
  const [pendiente, setPendiente] = useState<{ capturadaEn: string; intentos: number } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [conSenal, setConSenal] = useState(true);
  const [otrasPendientes, setOtrasPendientes] = useState(0);

  /** Último borrador escrito en el celular, para saber qué falta subir. */
  const borradorRef = useRef<BorradorActa | null>(null);
  /**
   * Los clips todavía en el celular, por si hay que reintentar la subida.
   *
   * Van en un ref y no en el estado porque son megas: meterlos en el estado los
   * haría viajar en cada render y no aportan nada a lo que se pinta.
   */
  const clipsRef = useRef<Map<number, ClipGrabado>>(new Map());
  const subidoRef = useRef<string>("");
  /** La recuperación se hace una sola vez por pantalla, nunca dos. */
  const yaRecuperado = useRef(false);

  useEffect(() => {
    setHoraInicio(ahora());
  }, []);

  /** Todo lo que hay en pantalla, en el formato que se guarda y se recupera. */
  const construirBorrador = useCallback(
    (): BorradorActa => ({
      folio: visita.folio,
      guardadoEn: new Date().toISOString(),
      respNombre,
      respRut,
      respTel,
      motivosCodigos,
      obs,
      interno,
      internos,
      trabajos,
      problemas,
      fotos,
      firma,
      guardadas,
      horaInicio,
    }),
    [visita.folio, respNombre, respRut, respTel, motivosCodigos, obs, interno, internos, trabajos, problemas, fotos, firma, guardadas, horaInicio]
  );

  const aplicarBorrador = useCallback((b: BorradorActa) => {
    setRespNombre(b.respNombre ?? "");
    setRespRut(b.respRut ?? "");
    setRespTel(b.respTel ?? "");
    if (b.motivosCodigos?.length) setMotivosCodigos(conAgendados(b.motivosCodigos));
    setObs(b.obs ?? "");
    setInterno(b.interno ?? "");
    setInternos(b.internos ?? []);
    // Los trabajos de borradores anteriores no traen motivo: van bajo el primero.
    const primerMotivo = b.motivosCodigos?.[0] ?? "";
    setTrabajos((b.trabajos ?? []).map((t) => ({ ...t, motivo: t.motivo || primerMotivo })));
    setProblemas(b.problemas ?? []);
    setFotos(b.fotos ?? []);
    setFirma(b.firma ?? null);
    setGuardadas(b.guardadas ?? {});
    if (b.horaInicio && b.horaInicio !== "—") setHoraInicio(b.horaInicio);
    // Los ids de las filas recuperadas no pueden chocar con los que se generen
    // de acá en adelante.
    const usados = [
      ...(b.trabajos ?? []).map((t) => t.id),
      ...(b.problemas ?? []).map((x) => x.id),
      ...(b.fotos ?? []).map((f) => f.id),
    ];
    autoId = Math.max(autoId, ...usados.map((n) => n + 1), 1);
  }, [conAgendados]);

  // Al entrar: recuperar lo que hubiera quedado a medias y ver si hay un acta
  // esperando señal. Gana la copia más nueva entre el celular y el servidor.
  useEffect(() => {
    // Una sola vez: un router.refresh() vuelve a mandar las props del servidor,
    // y recuperar de nuevo pisaría con una copia vieja lo que se esté
    // escribiendo en ese momento.
    if (yaRecuperado.current) return;
    yaRecuperado.current = true;

    // Al editar un acta cerrada no hay borrador que recuperar: se parte de la base.
    if (edicion) {
      setConSenal(hayConexion());
      setListo(true);
      return;
    }

    const local = leerBorrador(visita.folio);
    let remoto: BorradorActa | null = null;
    if (borradorServidor?.payload) {
      try {
        remoto = JSON.parse(borradorServidor.payload) as BorradorActa;
      } catch {
        remoto = null;
      }
    }
    const candidatos = [local, remoto].filter((b): b is BorradorActa => borradorConDatos(b));
    const elegido = candidatos.sort((a, b) => b.guardadoEn.localeCompare(a.guardadoEn))[0];
    if (elegido) {
      aplicarBorrador(elegido);
      const estado = { guardadoEn: elegido.guardadoEn, sinFotos: Boolean(elegido.sinFotos) };
      setRespaldo(estado);
      setRecuperado(estado);
      borradorRef.current = elegido;
      subidoRef.current = remoto === elegido ? elegido.guardadoEn : "";
    }

    const enCola = leerActaEnCola(visita.folio);
    if (enCola) setPendiente({ capturadaEn: enCola.capturadaEn, intentos: enCola.intentos });
    setOtrasPendientes(actasEnCola().filter((a) => a.folio !== visita.folio).length);
    setConSenal(hayConexion());
    setListo(true);
  }, [visita.folio, borradorServidor, aplicarBorrador, edicion]);

  // Guardado en el celular: al ritmo al que se escribe, no en cada tecla.
  useEffect(() => {
    if (edicion || !listo || paso === "ok" || paso === "encolada") return;
    const t = setTimeout(() => {
      const b = construirBorrador();
      if (!borradorConDatos(b)) return;
      const ok = escribirBorrador(b);
      if (!ok) return;
      const guardado = leerBorrador(visita.folio);
      borradorRef.current = guardado ?? b;
      setRespaldo({ guardadoEn: b.guardadoEn, sinFotos: Boolean(guardado?.sinFotos) });
    }, 800);
    return () => clearTimeout(t);
  }, [edicion, listo, paso, construirBorrador, visita.folio]);

  // Respaldo en el servidor: cada tanto y solo si hay señal. Las fotos no
  // suben acá —pesan demasiado para mandarlas cada medio minuto—, así que la
  // copia del servidor recupera el texto y no las imágenes.
  useEffect(() => {
    if (edicion || !listo || paso === "ok" || paso === "encolada") return;
    const id = setInterval(() => {
      const b = borradorRef.current;
      if (!b || !hayConexion() || subidoRef.current === b.guardadoEn) return;
      subidoRef.current = b.guardadoEn;
      void guardarBorradorAction(visita.folio, JSON.stringify({ ...b, fotos: [], sinFotos: true })).catch(() => {
        // Sin señal o servidor caído: el borrador del celular sigue intacto.
        subidoRef.current = "";
      });
    }, CADA_CUANTO_SUBE);
    return () => clearInterval(id);
  }, [edicion, listo, paso, visita.folio]);

  // Aviso de señal: lo que decide si el acta se manda o se encola.
  useEffect(() => {
    const cambio = () => setConSenal(hayConexion());
    window.addEventListener("online", cambio);
    window.addEventListener("offline", cambio);
    return () => {
      window.removeEventListener("online", cambio);
      window.removeEventListener("offline", cambio);
    };
  }, []);

  /** Motivo bajo el que va un trabajo. Los de borradores viejos, sin motivo, van bajo el primero. */
  const motivoDe = (t: TrabajoForm) => t.motivo || motivosCodigos[0] || "";
  const videosListos = videos.filter((v) => v.id > 0 && v.progreso === null && !v.error);
  const trabajosVigentes = trabajos.filter((t) => motivosCodigos.includes(motivoDe(t)));

  const nGuardadas = SECCIONES.filter((k) => guardadas[k]).length;
  const puedeRevisar =
    (!!guardadas.sucursal || !faltaEnSeccion("sucursal")) && (!!guardadas.motivo || !faltaEnSeccion("motivo"));
  // Al editar la firma ya está en el acta y no se pide de nuevo; lo que sí se
  // pide es el porqué del cambio.
  const motivoEdicionListo = motivoEdicion.trim().length >= 5;
  const puedeGuardar = puedeRevisar && (edicion ? motivoEdicionListo : !!firma) && !guardando;

  const falta = useMemo(() => {
    const f: string[] = [];
    if (!guardadas.sucursal) f.push("los datos del responsable");
    if (!guardadas.motivo) f.push("el motivo");
    if (edicion) {
      if (!motivoEdicionListo) f.push("escribir por qué se edita el acta");
    } else if (!firma) f.push("la firma de la tienda");
    return f;
  }, [guardadas.sucursal, guardadas.motivo, firma, edicion, motivoEdicionListo]);

  const nombreMotivos = (codigos: string[]) =>
    codigos.map((c) => motivos.find((m) => m.codigo === c)?.nombre ?? c).join(" · ") || "Sin motivo";

  /** El acta tal como viaja al servidor, armada con lo que hay en pantalla. */
  function armarEntrada(): ActaEntrada | null {
    if (!firma) return null;
    return {
      folio: visita.folio,
      responsableNombre: respNombre.trim(),
      responsableRut: respRut.trim() || null,
      responsableTelefono: respTel.trim() || null,
      motivosCodigos,
      observaciones: obs.trim() || null,
      comentarioInterno: interno.trim() || null,
      internosCodigos: internos,
      // Solo los trabajos de motivos que siguen marcados.
      trabajos: trabajos
        .filter((t) => motivosCodigos.includes(motivoDe(t)))
        .map((t) => ({
          codigo: t.codigo,
          motivoCodigo: motivoDe(t),
          detalle: t.detalle?.trim() || null,
          subtrabajos: t.subs.map((sx) => ({ etiqueta: sx.etiqueta, cantidad: sx.cantidad })),
        })),
      problemas: problemas.map((pr) => ({
        tipoCodigo: pr.codigo,
        // El celular ya no pregunta "¿cómo queda?": todo problema nace abierto
        // y coordinación le cambia el estado desde el panel.
        estado: pr.estado ?? "ABIERTO",
        descripcion: pr.desc.trim() || null,
        solucion: pr.sol?.trim() || null,
        items: pr.items.map((it) => ({ etiqueta: it.etiqueta, cantidad: it.cantidad })),
      })),
      // Las fotos ya vienen reducidas desde que se tomaron: así el acta cabe en
      // el celular mientras espera señal y sale rápido cuando la hay.
      fotos: fotos.map((f) => ({ dataUrl: f.src, etiqueta: null, interno: Boolean(f.interno) })),
      // Los clips ya están en la base: acá va solo qué se conserva y en qué
      // orden. Los que quedaron subiendo cuando se apretó Guardar no entran.
      videosIds: videosListos.map((v) => v.id),
      videosInternosIds: videosListos.filter((v) => v.interno).map((v) => v.id),
      firma: { nombre: firma.nombre, rut: firma.rut || null, dataUrl: firma.imagen },
      dispositivo: typeof navigator === "undefined" ? null : navigator.userAgent.slice(0, 60),
    };
  }

  /**
   * Manda el acta y cierra la visita.
   *
   * Tres finales posibles:
   *
   * - Salió: la visita queda COMPLETADA y coordinación la ve al instante.
   * - El servidor la rechazó (la visita ya estaba cerrada, el checklist cambió):
   *   es un problema real que reintentar no arregla, así que se muestra y no se
   *   encola.
   * - No hubo forma de llegar al servidor: el acta queda guardada en el celular
   *   y se reintenta sola. Esto es lo que antes dejaba al técnico atrapado en la
   *   pantalla, apretando Guardar hasta que volviera la señal.
   */
  const enviarActa = useCallback(
    async (entrada: ActaEntrada, capturadaEn: string, offline: boolean): Promise<boolean> => {
      setEnviando(true);
      setErrorGuardado(null);
      try {
        const res = await guardarActaAction({ ...entrada, capturadaEn, registradoOffline: offline });

        if (!res.ok) {
          // El caso del acta que sí había llegado: se cortó la señal justo al
          // recibir la respuesta, el acta quedó encolada y al reintentar el
          // servidor contesta que la visita ya está cerrada. No es un fallo:
          // está guardada, solo hay que dejar de insistir.
          if (/ya (quedó|está) cerrada/i.test(res.error ?? "")) {
            sacarDeCola(visita.folio);
            borrarBorrador(visita.folio);
            borradorRef.current = null;
            setPendiente(null);
            setRespaldo(null);
            setPaso("ok");
            aviso("El acta ya estaba guardada en el servidor");
            router.refresh();
            return true;
          }
          // Cualquier otro rechazo: reintentar no lo va a arreglar. Se vuelve a
          // la revisión, que es donde se ve el motivo y el botón de guardar.
          sacarDeCola(visita.folio);
          setPendiente(null);
          setErrorGuardado(res.error ?? "No se pudo guardar la visita.");
          setPaso("preview");
          aviso(res.error ?? "No se pudo guardar la visita");
          return false;
        }

        sacarDeCola(visita.folio);
        borrarBorrador(visita.folio);
        borradorRef.current = null;
        setPendiente(null);
        setRespaldo(null);
        setHoraTermino(res.horaTermino || ahora());
        setPaso("ok");
        // El listado del técnico y el panel se recargan con la visita cerrada.
        router.refresh();
        return true;
      } catch (err) {
        console.error("[dmc] no se pudo enviar el acta:", err);
        const enCola = leerActaEnCola(visita.folio);
        const intentos = (enCola?.intentos ?? 0) + 1;
        const guardada = encolarActa({
          folio: visita.folio,
          capturadaEn,
          intentos,
          ultimoError: err instanceof Error ? err.message : String(err),
          entrada,
        });
        if (!guardada) {
          setErrorGuardado(
            "No hay señal y tampoco quedó espacio en el celular para guardar el acta. Borra alguna foto y vuelve a intentar."
          );
          aviso("No se pudo guardar el acta en el celular");
          return false;
        }
        setPendiente({ capturadaEn, intentos });
        setConSenal(false);
        return false;
      } finally {
        setEnviando(false);
      }
    },
    [visita.folio, aviso, router]
  );

  /** La corrección del acta cerrada, tal como viaja al servidor. */
  function armarEdicion(): EdicionActaEntrada {
    return {
      folio: visita.folio,
      motivoEdicion: motivoEdicion.trim(),
      edicionesVistas: visita.ediciones?.length ?? 0,
      responsableNombre: respNombre.trim(),
      responsableRut: respRut.trim() || null,
      responsableTelefono: respTel.trim() || null,
      motivosCodigos,
      observaciones: obs.trim() || null,
      comentarioInterno: interno.trim() || null,
      internosCodigos: internos,
      trabajos: trabajos
        .filter((t) => motivosCodigos.includes(motivoDe(t)))
        .map((t) => ({
          codigo: t.codigo,
          motivoCodigo: motivoDe(t),
          detalle: t.detalle?.trim() || null,
          subtrabajos: t.subs.map((sx) => ({ etiqueta: sx.etiqueta, cantidad: sx.cantidad })),
        })),
      problemas: problemas.map((pr) => ({
        id: pr.dbId ?? null,
        tipoCodigo: pr.codigo,
        descripcion: pr.desc.trim() || null,
        items: pr.items.map((it) => ({ etiqueta: it.etiqueta, cantidad: it.cantidad })),
      })),
      // Las fotos que ya estaban van por su id; solo las nuevas viajan enteras.
      fotosConservadas: fotos.filter((f) => f.dbId).map((f) => f.dbId!),
      fotosNuevas: fotos
        .filter((f) => !f.dbId)
        .map((f) => ({ dataUrl: f.src, etiqueta: null, interno: Boolean(f.interno) })),
      videosIds: videosListos.map((v) => v.id),
      videosInternosIds: videosListos.filter((v) => v.interno).map((v) => v.id),
    };
  }

  /**
   * Guarda la corrección. Sin cola ni reintentos: un acta ya cerrada no se
   * edita a ciegas, así que si no hay señal se avisa y no se guarda nada.
   */
  async function guardarEdicion() {
    if (!hayConexion()) {
      setErrorGuardado("No hay señal. La edición necesita conexión: no se guardó nada, inténtalo cuando vuelva.");
      return aviso("Sin señal: no se guardó la edición");
    }
    setGuardando(true);
    setErrorGuardado(null);
    try {
      const res = await editarActaTecnicoAction(armarEdicion());
      if (!res.ok) {
        setErrorGuardado(res.error ?? "No se pudo guardar la edición.");
        return aviso(res.error ?? "No se pudo guardar la edición");
      }
      setPaso("ok");
      router.refresh();
    } catch (err) {
      console.error("[dmc] no se pudo guardar la edición del acta:", err);
      setErrorGuardado("No se pudo llegar al servidor. No se guardó nada: inténtalo otra vez.");
      aviso("No se guardó la edición");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarVisita() {
    if (edicion) return guardarEdicion();
    const entrada = armarEntrada();
    if (!entrada) return aviso("Falta la firma de la tienda");

    setGuardando(true);
    const capturadaEn = new Date().toISOString();
    const salio = await enviarActa(entrada, capturadaEn, !hayConexion());
    setGuardando(false);
    if (!salio && leerActaEnCola(visita.folio)) setPaso("encolada");
  }

  /** "Enviar ahora" y el reintento automático: los dos pasan por acá. */
  const reintentarPendiente = useCallback(
    async (avisarSiFalla: boolean) => {
      const enCola = leerActaEnCola(visita.folio);
      if (!enCola) {
        setPendiente(null);
        return;
      }
      const salio = await enviarActa(enCola.entrada, enCola.capturadaEn, true);
      if (salio) aviso("Acta sincronizada");
      else if (avisarSiFalla) aviso("Todavía no hay señal. Sigue guardada en el celular.");
    },
    [visita.folio, enviarActa, aviso]
  );

  // Reintento solo: al volver la señal y, si no, cada tanto.
  useEffect(() => {
    if (!pendiente || enviando) return;
    const intentar = () => {
      if (!hayConexion()) return;
      void reintentarPendiente(false);
    };
    window.addEventListener("online", intentar);
    const id = setInterval(intentar, CADA_CUANTO_REINTENTA);
    return () => {
      window.removeEventListener("online", intentar);
      clearInterval(id);
    };
  }, [pendiente, enviando, reintentarPendiente]);

  /**
   * Qué le falta a una sección para darla por lista, o null si no le falta
   * nada. Es la misma regla para el botón "Guardar esta sección" y para el
   * guardado automático al pasar a otra.
   */
  function faltaEnSeccion(clave: Seccion): string | null {
    switch (clave) {
      case "sucursal":
        if (!respNombre.trim()) return "Falta el nombre del responsable de tienda";
        if (!rutCompleto(respRut)) return "El RUT del responsable está incompleto";
        if (!rutDvCorrecto(respRut)) return "Ese RUT no es válido: revisa el dígito verificador";
        if (!telCompleto(respTel)) return "El teléfono del responsable está incompleto";
        return null;
      case "motivo":
        if (motivosCodigos.length === 0) return "Marca al menos un motivo de la visita";
        if (!trabajosVigentes.length) return "Agrega al menos un trabajo realizado";
        return null;
      case "firmas":
        return firma ? null : "Falta la firma del responsable de tienda";
      // Problemas, comentario interno y fotos son opcionales.
      default:
        return null;
    }
  }

  /**
   * Marca una sección como revisada y abre la siguiente. NO escribe nada en
   * el servidor: el acta entera se manda al final, en "Guardar visita". Lo
   * escrito sí queda a salvo en el celular desde la primera tecla.
   */
  function guardarSeccion(clave: Seccion) {
    const falta = faltaEnSeccion(clave);
    if (falta) return aviso(falta);
    setGuardadas((g) => ({ ...g, [clave]: true }));
    const siguiente = SECCIONES[SECCIONES.indexOf(clave) + 1] ?? null;
    setAbierta(siguiente && !guardadas[siguiente] ? siguiente : null);
    aviso(`${NOMBRE_SECCION[clave]} lista`);
  }

  /**
   * Abrir o cerrar una sección. Al salir de la que estaba abierta, se guarda
   * sola si está completa: el técnico no tiene que acordarse del botón. Si le
   * falta algo, queda pendiente y se avisa qué.
   */
  function toggleSeccion(clave: Seccion) {
    if (abierta && abierta !== clave) {
      const falta = faltaEnSeccion(abierta);
      if (!falta) setGuardadas((g) => ({ ...g, [abierta]: true }));
      else aviso(`${NOMBRE_SECCION[abierta]} quedó pendiente: ${falta.charAt(0).toLowerCase()}${falta.slice(1)}`);
    } else if (abierta === clave && !faltaEnSeccion(clave)) {
      // Cerrarla tocando su propia cabecera también la deja lista.
      setGuardadas((g) => ({ ...g, [clave]: true }));
    }
    setAbierta((a) => (a === clave ? null : clave));
  }

  const nombreTrabajo = (codigo: string) => catalogoTrabajo.find((t) => t.codigo === codigo)?.nombre ?? "Trabajo";
  const nombreMotivo = (codigo: string) => motivos.find((m) => m.codigo === codigo)?.nombre ?? codigo;
  const nombreInterno = (codigo: string) => catalogoInterno.find((x) => x.codigo === codigo)?.nombre ?? codigo;
  const fotosTrabajo = fotos.filter((f) => !f.interno);
  const fotosInternas = fotos.filter((f) => f.interno);
  const videosTrabajo = videos.filter((v) => !v.interno);
  const videosInternos = videos.filter((v) => v.interno);
  const nombreProblema = (codigo: string) => catalogoProblema.find((p) => p.codigo === codigo)?.nombre ?? "Problema";

  // ───────────────────────── pantalla ACTA EN ESPERA ─────────────────────────
  //
  // El acta está completa y guardada en el celular, pero no salió. El técnico
  // puede irse a la siguiente tienda: se manda sola cuando vuelva la señal.
  if (paso === "encolada" && pendiente) {
    return (
      <div className="px-4 pt-11 pb-6.5 flex flex-col min-h-[70vh] animate-fade-in">
        <div className="w-14 h-14 bg-[var(--color-text)] grid place-items-center">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#f3f2f2" strokeWidth="2.2">
            <path d="M12 3v12M8 11l4 4 4-4" />
            <path d="M4 19h16" />
          </svg>
        </div>
        <h1 className="font-extrabold text-[34px] leading-[1.05] tracking-[-.03em] mt-5 mb-2">
          Acta guardada
          <br />
          en el celular
        </h1>
        <div className="text-[13px] tabular-nums opacity-60">
          {visita.folio} · {visita.sucursal?.nombre} · {pendiente.capturadaEn.slice(11, 16)}
        </div>
        <div className="h-0.5 bg-[var(--color-divider)] mt-5 mb-4" />
        <div className="flex gap-2.5 items-start px-3.5 py-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)]">
          <div className="text-[13px] leading-[1.5] text-[var(--color-accent-800)]">
            No hubo señal para enviarla. Queda completa y firmada en el equipo y se manda sola apenas haya cobertura:
            puedes seguir a la siguiente visita. No la vuelvas a llenar.
            {pendiente.intentos > 1 ? ` Van ${pendiente.intentos} intentos.` : ""}
          </div>
        </div>
        <div className="mt-auto pt-6.5 flex flex-col gap-2.5">
          <button
            onClick={() => void reintentarPendiente(true)}
            disabled={enviando}
            className="w-full min-h-[58px] flex items-center justify-between px-4.5 bg-[var(--color-accent)] text-[var(--color-bg)] font-extrabold text-base cursor-pointer text-left hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            <span>{enviando ? "Enviando…" : "Intentar enviarla ahora"}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M4 12a8 8 0 018-8c3 0 5.5 1.7 7 4M20 12a8 8 0 01-8 8c-3 0-5.5-1.7-7-4" />
              <path d="M19 4v4h-4M5 20v-4h4" />
            </svg>
          </button>
          <button
            onClick={() => router.push("/tecnico/visitas")}
            className="w-full min-h-[50px] px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
          >
            Seguir a la siguiente visita
          </button>
          <button
            onClick={() => setPaso("form")}
            className="w-full min-h-11 px-1 bg-transparent border-0 text-[var(--color-accent-active)] text-[13px] underline underline-offset-4 cursor-pointer text-left"
          >
            Volver al formulario
          </button>
        </div>
        <Toast texto={toast} />
      </div>
    );
  }

  // ─────────────────────────────── pantalla OK ───────────────────────────────
  if (paso === "ok") {
    return (
      <div className="px-4 pt-11 pb-6.5 flex flex-col min-h-[70vh] animate-fade-in">
        <div className="w-14 h-14 bg-[var(--color-accent)] grid place-items-center">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#f3f2f2" strokeWidth="2.6">
            <path d="M4 12l5 5L20 6" />
          </svg>
        </div>
        <h1 className="font-extrabold text-[34px] leading-[1.05] tracking-[-.03em] mt-5 mb-2">
          {edicion ? "Cambios" : "Visita"}
          <br />
          {edicion ? "guardados" : "guardada"}
        </h1>
        <div className="text-[13px] tabular-nums opacity-60">
          {visita.folio} · {visita.sucursal?.nombre}
          {edicion ? "" : ` · ${horaTermino}`}
        </div>
        <div className="h-0.5 bg-[var(--color-divider)] mt-5 mb-4" />
        <div className="flex gap-2.5 items-start px-3.5 py-3 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)]">
          <div className="text-[13px]">
            {edicion
              ? "El acta quedó corregida y la firma de la tienda se conservó. La edición quedó registrada con lo que cambiaste y el motivo: coordinación la ve en el panel."
              : "Guardada en el servidor y marcada como completada. Coordinación ya la ve así en el panel, y a ti deja de aparecerte en curso."}
          </div>
        </div>
        <div className="mt-auto pt-6.5 flex flex-col gap-2.5">
          <button
            onClick={() => router.push("/tecnico/visitas")}
            className="w-full min-h-[58px] flex items-center justify-between px-4.5 bg-[var(--color-accent)] text-[var(--color-bg)] font-extrabold text-base cursor-pointer text-left hover:bg-[var(--color-accent-hover)]"
          >
            <span>{edicion ? "Volver a mis visitas" : "Siguiente visita"}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
          {/* Lleva al acta que quedó en la base, no de vuelta a la pantalla
              previa a guardar: esa mostraba otra vez el botón "Guardar visita"
              sobre una visita ya cerrada. */}
          <button
            onClick={() => router.push(`/tecnico/visitas/${visita.folio}/revisar`)}
            className="w-full min-h-[50px] px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
          >
            Ver el acta guardada
          </button>
        </div>
      </div>
    );
  }

  // ───────────────────────────── pantalla PREVIEW ─────────────────────────────
  if (paso === "preview") {
    const resumen: { k: string; v: string }[] = [
      { k: "Cliente", v: visita.cliente?.nombreFantasia ?? "—" },
      { k: "Sucursal", v: `${visita.sucursal?.nombre} · ${visita.sucursal?.direccion}, ${visita.sucursal?.comuna}` },
      { k: motivosCodigos.length > 1 ? "Motivos de la visita" : "Motivo de la visita", v: nombreMotivos(motivosCodigos) },
      { k: "Nombre", v: respNombre || "—" },
      { k: "Rut", v: respRut || "Sin RUT" },
      { k: "Teléfono de contacto", v: respTel || "—" },
      { k: "Detalle del trabajo", v: obs || "Sin detalle escrito." },
    ];

    return (
      <div className="animate-fade-in">
        <div className="px-4 pt-5">
          <div className="text-[10px] tracking-[.15em] uppercase text-[var(--color-accent-active)]">
            {edicion ? "Edición del acta" : "Antes de guardar"}
          </div>
          <h1 className="font-extrabold text-[28px] leading-[1.06] tracking-[-.03em] mt-2 mb-1.5">
            {edicion ? "Revisa cómo" : "Revisa lo que"}
            <br />
            {edicion ? "queda el acta" : "se va a guardar"}
          </h1>
          <p className="m-0 mb-4 text-sm opacity-60">
            {edicion
              ? "Así va a quedar el acta corregida. La firma de la tienda es la misma de cuando se cerró."
              : "Lee cada punto con el encargado de la tienda antes de confirmar."}
          </p>
        </div>

        <div className="mx-4 border border-[var(--color-divider)] bg-[var(--color-surface-3)]">
          <div className="px-4 py-3.5 border-b-2 border-[var(--color-divider)] flex items-center gap-2.5">
            <div className="font-extrabold text-[13px] tracking-[.06em] uppercase">Acta de visita</div>
            <span className="tag tag-accent ml-auto">{edicion ? "Acta corregida" : "Quedará Completada"}</span>
          </div>
          <div className="px-4 pt-1 pb-3.5">
            {resumen.map((r) => (
              <div key={r.k} className="py-3.5 border-b border-black/[.2]">
                <div className="text-[11px] tracking-[.1em] uppercase opacity-66">{r.k}</div>
                <div className="text-[17px] leading-[1.4] mt-1.5">{r.v}</div>
              </div>
            ))}

            {trabajosVigentes.length > 0 ? (
              <div className="pt-3.5">
                <div className="text-[11px] tracking-[.1em] uppercase opacity-66 mb-2.5">Trabajo realizado</div>
                <div className="flex flex-col gap-2.5">
                  {trabajosVigentes.map((t) => (
                    <div key={t.id} className="border-l-[3px] border-[var(--color-text)] pl-3">
                      <div className="text-[10px] tracking-[.1em] uppercase opacity-62">{nombreMotivo(motivoDe(t))}</div>
                      <div className="font-extrabold text-base leading-[1.25]">{nombreTrabajo(t.codigo)}</div>
                      {t.subs.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {t.subs.map((s) => (
                            <span
                              key={s.etiqueta}
                              className="px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2] tabular-nums"
                            >
                              {s.etiqueta}
                              {s.cantidad > 1 ? ` × ${s.cantidad}` : ""}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {t.detalle ? <div className="text-sm opacity-72 mt-1.5">{t.detalle}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {problemas.length > 0 ? (
              <div className="pt-3.5">
                <div className="text-[11px] tracking-[.1em] uppercase opacity-66 mb-2.5">Problemas detectados</div>
                <div className="flex flex-col gap-2.5">
                  {problemas.map((p) => (
                    <div key={p.id} className="border-l-[3px] border-[var(--color-accent)] pl-3">
                      <div className="font-extrabold text-base leading-[1.25]">{nombreProblema(p.codigo)}</div>
                      {p.items.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {p.items.map((z) => (
                            <span
                              key={z.etiqueta}
                              className="px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2] tabular-nums"
                            >
                              {z.etiqueta} × {z.cantidad}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {p.desc ? <div className="text-sm opacity-72 mt-1.5">{p.desc}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {fotosTrabajo.length > 0 ? (
              <div className="pt-4">
                <div className="text-[10px] tracking-[.12em] uppercase opacity-62 mb-2">Fotos ({fotosTrabajo.length})</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {fotosTrabajo.map((f) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={f.id}
                      src={f.src}
                      alt=""
                      className="w-full aspect-square object-cover border border-black/[.3]"
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {videosTrabajo.length > 0 ? (
              <div className="pt-4">
                <div className="text-[10px] tracking-[.12em] uppercase opacity-62 mb-2">
                  Videos ({videosTrabajo.length})
                </div>
                <div className="grid gap-2">
                  {videosTrabajo.map((v) => (
                    <div key={v.id} className="flex items-center gap-2.5 border border-black/[.3] px-2.5 py-2">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="flex-none">
                        <path d="M3 7h11v10H3z" />
                        <path d="M14 11l7-4v10l-7-4z" />
                      </svg>
                      <span className="text-[13px] tabular-nums">
                        {reloj(v.duracionSeg)} · {v.ancho}x{v.alto}
                      </span>
                      <span className="ml-auto text-[11px] opacity-62 tabular-nums">
                        {v.error ? "no se subió" : v.progreso !== null ? `subiendo ${v.progreso}%` : "guardado"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {interno.trim() || internos.length || fotosInternas.length || videosInternos.length ? (
              <div className="mt-4 px-3 py-3 bg-[var(--color-surface)] border-l-[3px] border-[var(--color-text)]">
                <div className="text-[10px] tracking-[.12em] uppercase opacity-62">
                  Comentario interno · no lo ve el cliente
                </div>
                {internos.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {internos.map((c) => (
                      <span
                        key={c}
                        className="px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2]"
                      >
                        {nombreInterno(c)}
                      </span>
                    ))}
                  </div>
                ) : null}
                {interno.trim() ? <div className="text-sm mt-2">{interno}</div> : null}
                {fotosInternas.length || videosInternos.length ? (
                  <div className="text-xs opacity-66 mt-2">
                    {fotosInternas.length} foto{fotosInternas.length === 1 ? "" : "s"}
                    {videosInternos.length ? ` · ${videosInternos.length} video${videosInternos.length > 1 ? "s" : ""}` : ""}
                  </div>
                ) : null}
              </div>
            ) : null}

            {firma ? (
              <div className="flex gap-3.5 pt-4.5">
                <div className="flex-[0_1_250px] min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={firma.imagen} alt="Firma" className="w-full h-[60px] object-contain object-left-bottom" />
                  <div className="h-px bg-[var(--color-text)] mt-1" />
                  <div className="text-xs mt-1.5">
                    {firma.nombre}
                    {firma.rut ? ` · ${firma.rut}` : ""}
                  </div>
                  <div className="text-[10px] tracking-[.09em] uppercase opacity-62">Responsable de tienda</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="px-4 pt-4.5 pb-6.5">
          {edicion ? (
            <div className="mb-3.5">
              <label htmlFor="f-motivo-edicion" className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
                ¿Por qué se edita el acta?
                <span className="opacity-66 normal-case tracking-normal"> (obligatorio · queda en el registro)</span>
              </label>
              <textarea
                id="f-motivo-edicion"
                rows={3}
                value={motivoEdicion}
                onChange={(e) => setMotivoEdicion(e.target.value)}
                autoComplete="off"
                placeholder="Ej: anoté mal el RUT del encargado; faltaba agregar el cambio de la antena 2"
                className={`${entrada} min-h-[96px] leading-[1.4] resize-y`}
              />
            </div>
          ) : null}
          {falta.length > 0 ? (
            <div className="px-3.5 py-3 mb-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)] text-[13px] text-[var(--color-accent-800)]">
              Falta {falta.join(", ")}.
            </div>
          ) : null}
          {errorGuardado ? (
            <div
              role="alert"
              className="px-3.5 py-3 mb-3 bg-[#f7ded9] border-l-4 border-[var(--color-accent)] text-[13px] leading-[1.45] text-[#8f1400]"
            >
              {errorGuardado}
            </div>
          ) : null}
          <button
            onClick={() => {
              if (guardando) return;
              if (!puedeGuardar) return aviso(`Falta ${falta.join(", ")}`);
              void guardarVisita();
            }}
            disabled={guardando}
            className="w-full min-h-[62px] flex items-center justify-between px-4.5 border-0 font-extrabold text-[17px] cursor-pointer text-left hover:brightness-95"
            style={{
              background: puedeGuardar ? "var(--color-accent)" : "#8f8b8b",
              color: puedeGuardar ? "var(--color-bg)" : "var(--color-surface-3)",
            }}
          >
            <span>{guardando ? "Guardando…" : edicion ? "Guardar cambios" : "Guardar visita"}</span>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M4 12l5 5L20 6" />
            </svg>
          </button>
          <button
            onClick={() => setPaso("form")}
            disabled={guardando}
            className="w-full min-h-[50px] mt-2.5 px-4 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07] disabled:opacity-60"
          >
            Volver a corregir
          </button>
          <p className="mt-2.5 mb-0 text-xs opacity-66">
            {edicion
              ? "Al confirmar queda registrado qué cambiaste, cuándo y por qué. El PDF del acta sale con los datos corregidos."
              : "Al confirmar, la visita queda cerrada y coordinación la ve completada al instante."}
          </p>
        </div>
        <Toast texto={toast} />
      </div>
    );
  }

  // ────────────────────────────── pantalla FORM ──────────────────────────────
  const trbSel = catalogoTrabajo.find((t) => t.codigo === nt.codigo) ?? null;
  // En la hoja de trabajo solo van los que el checklist asignó a este motivo.
  const trabajosDelMotivo = catalogoTrabajo.filter((t) => trabajoVaConMotivo(t, nt.motivo));
  const yaAgregado = (codigo: string) => trabajos.some((t) => t.codigo === codigo && motivoDe(t) === nt.motivo);
  const probSel = catalogoProblema.find((p) => p.codigo === np.codigo) ?? null;
  const probTieneOpciones = !!probSel && probSel.opciones.length > 0;
  const probListo = !!np.codigo && (probTieneOpciones ? np.items.length > 0 : !!np.desc.trim());
  const errorRut = mensajeRut(respRut);
  const sucursalCompleta = !!respNombre.trim() && rutCompleto(respRut) && !errorRut && telCompleto(respTel);

  return (
    <div className="animate-fade-in">
      <div className="px-4 pt-4.5 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="text-xs tabular-nums tracking-[.08em] opacity-66">{visita.folio}</div>
          <span className="tag tag-accent">{edicion ? "Editando acta cerrada" : `En curso desde ${horaInicio}`}</span>
        </div>
        <h1 className="font-extrabold text-2xl leading-[1.1] tracking-[-.025em] mt-2.5 mb-0.5">{visita.sucursal?.nombre}</h1>
        <div className="text-[13px] opacity-66">
          {visita.cliente?.nombreFantasia} · {nombreMotivos(visita.motivosCodigos ?? [visita.motivoCodigo])}
        </div>
        <div className="flex gap-1.5 mt-4">
          {SECCIONES.map((k) => (
            <div key={k} className="flex-1 h-1.5" style={{ background: guardadas[k] ? "var(--color-accent)" : "var(--color-neutral-300)" }} />
          ))}
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] tracking-[.09em] uppercase opacity-62">
          <span>
            {nGuardadas} de {SECCIONES.length} secciones listas
          </span>
          <span>{edicion ? "Los cambios se guardan al final" : "El acta se cierra al final"}</span>
        </div>

        {edicion ? (
          <div className="mt-3 px-3.5 py-3 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)] text-[13px] leading-[1.45]">
            Estás corrigiendo un acta ya cerrada. Todo parte de lo que quedó guardado y la firma de la tienda se
            conserva. Nada cambia hasta que confirmes al final, y ahí se pide el motivo.
            {visita.ejecucion?.editableHasta
              ? ` Puedes editarla hasta el ${fechaHoraCorta(visita.ejecucion.editableHasta)}.`
              : ""}
          </div>
        ) : (
        <EstadoBorrador
          respaldo={respaldo}
          recuperado={recuperado}
          pendiente={pendiente}
          enviando={enviando}
          conSenal={conSenal}
          otrasPendientes={otrasPendientes}
          onOcultarRecuperado={() => setRecuperado(null)}
          onEmpezarDeNuevo={() =>
            setConfirmar({
              titulo: "¿Empezar el acta de nuevo?",
              texto:
                "Se borra lo que habías dejado a medias en este celular —trabajos, problemas, fotos y firma— y el formulario queda en blanco. Los videos ya subidos se quitan aparte, uno por uno.",
              cta: "Empezar de nuevo",
              accion: () => {
                borrarBorrador(visita.folio);
                borradorRef.current = null;
                void descartarBorradorAction(visita.folio);
                setRespaldo(null);
                setRecuperado(null);
                aplicarBorrador({
                  folio: visita.folio,
                  guardadoEn: new Date().toISOString(),
                  respNombre: visita.responsableNombre ?? "",
                  respRut: fmtRut(visita.responsableRut ?? ""),
                  respTel: fmtTel(visita.responsableTelefono ?? ""),
                  motivosCodigos: visita.motivosCodigos ?? [visita.motivoCodigo],
                  obs: "",
                  interno: "",
                  internos: [],
                  trabajos: [],
                  problemas: [],
                  fotos: [],
                  firma: null,
                  guardadas: {},
                  horaInicio,
                });
                setAbierta("sucursal");
                aviso("Formulario en blanco");
              },
            })
          }
          onEnviarPendiente={() => void reintentarPendiente(true)}
        />
        )}
      </div>

      <div className="border-t-2 border-[var(--color-divider)]">
        {/* ── 1 · Sucursal y responsable ── */}
        <Cabecera
          n={1}
          titulo="Sucursal y responsable"
          ok={!!guardadas.sucursal}
          chip={guardadas.sucursal ? { variante: "accent", texto: "Guardada" } : { variante: "neutral", texto: "Pendiente" }}
          onToggle={() => toggleSeccion("sucursal")}
        />
        {abierta === "sucursal" ? (
          <Cuerpo>
            <Campo label="Responsable de tienda" htmlFor="f-nom">
              <input
                id="f-nom"
                value={respNombre}
                onChange={(e) => setRespNombre(e.target.value)}
                placeholder="Nombre y apellido"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className={entrada}
              />
            </Campo>
            <div className="flex gap-3">
              <Campo label="RUT" htmlFor="f-rut" className="flex-1 min-w-0">
                <input
                  id="f-rut"
                  // Teclado de texto y no numérico: el dígito verificador puede ser K.
                  inputMode="text"
                  autoCapitalize="characters"
                  value={respRut}
                  onChange={(e) => setRespRut(fmtRut(e.target.value))}
                  placeholder="11.111.111-1"
                  autoComplete="off"
                  className={`${entrada} tabular-nums`}
                />
                {errorRut ? <div className="mt-1 text-xs text-[var(--color-accent-800)]">{errorRut}</div> : null}
              </Campo>
              <Campo label="Teléfono" htmlFor="f-tel" className="flex-1 min-w-0">
                <input
                  id="f-tel"
                  inputMode="tel"
                  value={respTel}
                  onChange={(e) => setRespTel(fmtTel(e.target.value))}
                  onFocus={() => {
                    if (!respTel) setRespTel("+56 9 ");
                  }}
                  placeholder="+56 9 1234 5678"
                  autoComplete="off"
                  className={`${entrada} tabular-nums`}
                />
              </Campo>
            </div>
            {!sucursalCompleta ? (
              <p className="m-0 text-xs text-[var(--color-accent-800)]">
                Completa nombre, RUT y teléfono del responsable para poder guardar esta sección.
              </p>
            ) : null}
            <BotonGuardar
              texto="Guardar y seguir"
              habilitado={sucursalCompleta}
              onClick={() => guardarSeccion("sucursal")}
            />
          </Cuerpo>
        ) : null}

        {/* ── 2 · Motivo y trabajo realizado ── */}
        <Cabecera
          n={2}
          titulo="Motivo y trabajo realizado"
          ok={!!guardadas.motivo}
          chip={
            guardadas.motivo
              ? {
                  variante: "accent",
                  texto: `${trabajosVigentes.length} ${trabajosVigentes.length === 1 ? "trabajo" : "trabajos"}`,
                }
              : { variante: "neutral", texto: "Pendiente" }
          }
          onToggle={() => toggleSeccion("motivo")}
        />
        {abierta === "motivo" ? (
          <Cuerpo>
            {/* Cada motivo marcado es una subcategoría con sus propios
                trabajos, y la hoja de "agregar" solo ofrece los trabajos que
                el checklist asignó a ese motivo. Los motivos sin marcar
                quedan escondidos para no llenar la pantalla. */}
            <div>
              <div className="text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
                Motivo de la visita
                <span className="opacity-66 normal-case tracking-normal"> (y lo que hiciste en cada uno)</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {motivos
                  .filter((m) => motivosCodigos.includes(m.codigo))
                  .map((m) => {
                    const suyos = trabajos.filter((t) => motivoDe(t) === m.codigo);
                    return (
                      <div
                        key={m.codigo}
                        className="bg-[var(--color-surface-3)] border border-[var(--color-accent)] border-l-4"
                      >
                        <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2">
                          <span className="w-[22px] h-[22px] flex-none grid place-items-center bg-[var(--color-accent)]">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f3f2f2" strokeWidth="3.4">
                              <path d="M4 12l5 5L20 6" />
                            </svg>
                          </span>
                          <span className="flex-1 min-w-0 font-extrabold text-[15px] leading-[1.25]">{m.nombre}</span>
                          {motivosAgendados.includes(m.codigo) ? (
                            <span className="text-[11px] tracking-[.09em] uppercase opacity-60 flex-none">Agendado</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => desmarcarMotivo(m.codigo)}
                              className="min-h-9 px-1 bg-transparent border-0 text-[var(--color-accent-active)] text-xs underline underline-offset-[3px] cursor-pointer flex-none"
                            >
                              Quitar
                            </button>
                          )}
                        </div>

                        <div className="px-3.5 pb-3 flex flex-col gap-2">
                          {suyos.map((t) => (
                            <div key={t.id} className="bg-[var(--color-bg)] border border-[var(--color-divider)] px-3 py-2.5">
                              <div className="flex items-start gap-2">
                                <div className="flex-1 min-w-0 font-extrabold text-[15px] leading-[1.25]">
                                  {nombreTrabajo(t.codigo)}
                                </div>
                                <button
                                  onClick={() =>
                                    setConfirmar({
                                      titulo: "¿Quitar este trabajo?",
                                      texto: `«${nombreTrabajo(t.codigo)}» se borra del trabajo realizado de esta visita.`,
                                      cta: "Quitar trabajo",
                                      accion: () => setTrabajos((prev) => prev.filter((x) => x.id !== t.id)),
                                    })
                                  }
                                  aria-label="Quitar trabajo"
                                  className="w-8 h-8 -mr-1 -mt-1 flex-none grid place-items-center bg-transparent border-0 text-[var(--color-text)] cursor-pointer hover:bg-black/[.07]"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                                    <path d="M6 6l12 12M18 6L6 18" />
                                  </svg>
                                </button>
                              </div>
                              {t.subs.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                  {t.subs.map((s) => (
                                    <span
                                      key={s.etiqueta}
                                      className="max-w-full px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2] tabular-nums"
                                    >
                                      {s.etiqueta}
                                      {s.cantidad > 1 ? ` × ${s.cantidad}` : ""}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              {t.detalle ? <div className="text-sm opacity-75 mt-1.5">{t.detalle}</div> : null}
                            </div>
                          ))}
                          <button
                            onClick={() => abrirHojaTrabajo(m.codigo)}
                            className="w-full min-h-[48px] flex items-center gap-2.5 px-3.5 bg-transparent border border-dashed border-black/[.5] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.06]"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                            <span>{suyos.length ? "¿Qué más hiciste?" : "Agregar trabajo realizado"}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}

                {motivos.length === 0 ? (
                  <div className="px-3.5 py-3 border border-dashed border-black/[.4] text-[13px] opacity-70">
                    No hay motivos en el checklist. Avisa a coordinación: sin motivos no se puede cerrar el acta.
                  </div>
                ) : null}

                {/* Los que no están marcados, plegados. */}
                {motivos.some((m) => !motivosCodigos.includes(m.codigo)) ? (
                  motivosCodigos.length === 0 || verOtrosMotivos ? (
                    <div className="flex flex-col gap-1.5">
                      {motivosCodigos.length > 0 ? (
                        <div className="text-[11px] tracking-[.09em] uppercase opacity-60 mt-1">Otros motivos</div>
                      ) : null}
                      {motivos
                        .filter((m) => !motivosCodigos.includes(m.codigo))
                        .map((m) => (
                          <button
                            key={m.codigo}
                            type="button"
                            role="checkbox"
                            aria-checked={false}
                            onClick={() => {
                              setMotivosCodigos((prev) => [...prev, m.codigo]);
                              setGuardadas((g) => ({ ...g, motivo: false }));
                              setVerOtrosMotivos(false);
                            }}
                            className="w-full min-h-[48px] flex items-center gap-3 px-3.5 text-[15px] leading-[1.25] text-[var(--color-text)] cursor-pointer text-left bg-[var(--color-surface-3)] border border-[rgba(32,30,29,.35)] hover:brightness-95"
                          >
                            <span className="w-[22px] h-[22px] flex-none border-2 border-[var(--color-text)]" />
                            <span className="flex-1 min-w-0">{m.nombre}</span>
                          </button>
                        ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setVerOtrosMotivos(true)}
                      className="w-full min-h-[44px] flex items-center gap-2 px-3.5 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] text-[13px] cursor-pointer text-left hover:bg-black/[.06]"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      <span>La visita fue también por otro motivo</span>
                    </button>
                  )
                ) : null}
              </div>
            </div>

            {/* Un solo detalle para todo el trabajo, en vez de uno por trabajo. */}
            <Campo label="Detalle del trabajo" htmlFor="f-obs" extra="(opcional · la ve el cliente)">
              <textarea
                id="f-obs"
                rows={3}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                autoComplete="off"
                placeholder="Lo que no calce con la lista: pórtico 2 quedó midiendo 1,1 m, detalles del local, del acceso o del equipo"
                className={`${entrada} min-h-[96px] leading-[1.4] resize-y`}
              />
            </Campo>

            <BotonGuardar
              texto={
                trabajosVigentes.length
                  ? `Guardar ${trabajosVigentes.length} trabajo${trabajosVigentes.length > 1 ? "s" : ""} y seguir`
                  : "Guardar y seguir"
              }
              habilitado={motivosCodigos.length > 0 && trabajosVigentes.length > 0}
              onClick={() => guardarSeccion("motivo")}
            />
          </Cuerpo>
        ) : null}

        {/* ── 3 · Problemas detectados ── */}
        <Cabecera
          n={3}
          titulo="Problemas detectados"
          ok={!!guardadas.problemas}
          chip={
            guardadas.problemas
              ? { variante: "accent", texto: problemas.length ? `${problemas.length} cargados` : "Sin problemas" }
              : problemas.length
                ? { variante: "outline", texto: `${problemas.length} sin guardar` }
                : { variante: "neutral", texto: "Opcional" }
          }
          onToggle={() => toggleSeccion("problemas")}
        />
        {abierta === "problemas" ? (
          <Cuerpo gap={false}>
            <p className="m-0 mb-3.5 text-[13px] opacity-60">Cada problema se llena en su propia ficha para no saturar esta pantalla.</p>
            <div className="flex flex-col gap-2.5">
              {problemas.map((p, i) => (
                <div key={p.id} className="bg-[var(--color-surface-3)] border border-[var(--color-divider)] border-l-4 border-l-[var(--color-accent)] px-3.5 py-3">
                  <div className="text-[10px] tracking-[.1em] uppercase text-[var(--color-accent-active)]">Problema {i + 1}</div>
                  <div className="font-extrabold text-base leading-[1.25] mt-2">{nombreProblema(p.codigo)}</div>
                  {p.items.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {p.items.map((z) => (
                        <span
                          key={z.etiqueta}
                          className="max-w-full px-2.5 py-1 bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-[1.2] tabular-nums"
                        >
                          {z.etiqueta} × {z.cantidad}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {p.desc ? <div className="text-sm opacity-75 mt-2">{p.desc}</div> : null}
                  <button
                    onClick={() => {
                      setNp({ codigo: p.codigo, items: p.items.map((z) => ({ ...z })), desc: p.desc, editando: p.id });
                      setSheet("problema");
                    }}
                    className="min-h-10 mt-2 mr-4 p-0 bg-transparent border-0 text-[var(--color-text)] font-extrabold text-xs underline underline-offset-[3px] cursor-pointer"
                  >
                    Corregir
                  </button>
                  <button
                    onClick={() =>
                      setConfirmar({
                        titulo: "¿Quitar este problema?",
                        texto: `Se borra de esta visita lo que anotaste sobre «${nombreProblema(p.codigo)}».`,
                        cta: "Quitar problema",
                        accion: () => setProblemas((prev) => prev.filter((x) => x.id !== p.id)),
                      })
                    }
                    className="min-h-10 mt-2 p-0 bg-transparent border-0 text-[var(--color-accent-active)] text-xs underline underline-offset-[3px] cursor-pointer"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setNp({ codigo: "", items: [], desc: "", editando: null });
                setSheet("problema");
              }}
              className="w-full min-h-[54px] flex items-center gap-2.5 px-4 mt-3 bg-transparent border border-dashed border-black/[.5] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.06]"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Agregar un problema</span>
            </button>
            <div className="mt-2.5">
              <BotonGuardar
                texto={problemas.length ? `Guardar ${problemas.length} problema${problemas.length > 1 ? "s" : ""} y seguir` : "Sin problemas · seguir"}
                habilitado
                onClick={() => guardarSeccion("problemas")}
              />
            </div>
          </Cuerpo>
        ) : null}

        {/* ── 4 · Comentario interno ── */}
        <Cabecera
          n={4}
          titulo="Comentario interno"
          ok={!!guardadas.interno}
          chip={
            internos.length || interno.trim() || fotosInternas.length || videosInternos.length
              ? { variante: guardadas.interno ? "accent" : "outline", texto: guardadas.interno ? "Guardado" : "Sin guardar" }
              : { variante: guardadas.interno ? "accent" : "neutral", texto: guardadas.interno ? "Sin comentario" : "Opcional" }
          }
          onToggle={() => toggleSeccion("interno")}
        />
        {abierta === "interno" ? (
          <Cuerpo gap={false}>
            <div className="px-3.5 py-2.5 mb-3.5 bg-[var(--color-bg)] border-l-4 border-[var(--color-text)] text-[13px] leading-[1.45]">
              Solo para coordinación. Nada de esta sección sale en el acta que recibe el cliente.
            </div>

            {catalogoInterno.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {catalogoInterno.map((x) => {
                  const activo = internos.includes(x.codigo);
                  return (
                    <button
                      key={x.codigo}
                      type="button"
                      role="checkbox"
                      aria-checked={activo}
                      onClick={() => {
                        setInternos((prev) => (activo ? prev.filter((c) => c !== x.codigo) : [...prev, x.codigo]));
                        setGuardadas((g) => ({ ...g, interno: false }));
                      }}
                      className="w-full min-h-[50px] flex items-center gap-3 px-3.5 text-[15px] leading-[1.25] text-[var(--color-text)] cursor-pointer text-left hover:brightness-95"
                      style={{
                        background: activo ? "var(--color-accent-100)" : "var(--color-surface-3)",
                        border: `1px solid ${activo ? "var(--color-accent)" : "rgba(32,30,29,.35)"}`,
                        fontWeight: activo ? 800 : 400,
                      }}
                    >
                      <span
                        className="w-[22px] h-[22px] flex-none border-2 border-[var(--color-text)] grid place-items-center"
                        style={{ background: activo ? "var(--color-accent)" : "transparent" }}
                      >
                        {activo ? (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f3f2f2" strokeWidth="3.4">
                            <path d="M4 12l5 5L20 6" />
                          </svg>
                        ) : null}
                      </span>
                      <span className="flex-1 min-w-0">{x.nombre}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="mt-3.5">
              <Campo label="Descripción" htmlFor="f-int" extra="(opcional · no la ve el cliente)">
                <textarea
                  id="f-int"
                  rows={3}
                  value={interno}
                  onChange={(e) => setInterno(e.target.value)}
                  autoComplete="off"
                  placeholder="Solo para coordinación: algo que deba saber del local, del acceso o del equipo"
                  className={`${entrada} min-h-[96px] leading-[1.4] resize-y`}
                />
              </Campo>
            </div>

            <div className="mt-3.5 text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">Fotos y video internos</div>
            <GaleriaFotos
              fotos={fotosInternas}
              onQuitar={pedirQuitarFoto}
              onCamara={() => abrirCamara("interno")}
              onArchivos={(e) => onArchivos(e, true)}
            />
            <ListaVideos
              videos={videosInternos}
              clips={clipsRef.current}
              onQuitar={pedirQuitarVideo}
              onReintentar={reintentarVideo}
            />
            <button
              onClick={() => abrirVideo("interno")}
              className="w-full min-h-[48px] flex items-center gap-2.5 px-4 mt-2 bg-[var(--color-text)] text-[var(--color-bg)] border-0 font-extrabold text-sm cursor-pointer text-left hover:bg-[var(--color-neutral-900)]"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M3 7h11v10H3z" />
                <path d="M14 11l7-4v10l-7-4z" />
              </svg>
              <span>{videosInternos.length ? "Grabar otro video interno" : "Grabar video interno"}</span>
            </button>

            <div className="mt-3.5">
              <BotonGuardar texto="Guardar y seguir" habilitado onClick={() => guardarSeccion("interno")} />
            </div>
          </Cuerpo>
        ) : null}

        {/* ── 5 · Fotos y video del trabajo ── */}
        <Cabecera
          n={5}
          titulo="Fotos y video del trabajo"
          ok={!!guardadas.fotos}
          chip={
            guardadas.fotos
              ? {
                  variante: "accent",
                  texto: videosTrabajo.length
                    ? `${fotosTrabajo.length} fotos · ${videosTrabajo.length} video${videosTrabajo.length > 1 ? "s" : ""}`
                    : `${fotosTrabajo.length} fotos`,
                }
              : { variante: "neutral", texto: "Al final" }
          }
          onToggle={() => toggleSeccion("fotos")}
        />
        {abierta === "fotos" ? (
          <Cuerpo gap={false}>
            <p className="m-0 mb-3.5 text-[13px] opacity-60">
              Al final del trabajo: pórtico terminado, etiqueta de serie y cada problema que dejes anotado.
            </p>
            <GaleriaFotos
              fotos={fotosTrabajo}
              onQuitar={pedirQuitarFoto}
              onCamara={() => abrirCamara("trabajo")}
              onArchivos={(e) => onArchivos(e, false)}
            />
            {/* ── Video: 720p y hasta 1 minuto ── */}
            <div className="mt-5 pt-4 border-t border-[var(--color-divider)]">
              <div className="flex items-center gap-2">
                <div className="text-[10px] tracking-[.12em] uppercase opacity-66">Video del trabajo</div>
                <span className="ml-auto text-[11px] opacity-55 tabular-nums">720p · máx. 1 min</span>
              </div>
              <p className="m-0 mt-1.5 mb-3 text-[13px] opacity-60">
                Para lo que una foto no alcanza a mostrar: la falsa alarma sonando, el pórtico
                mientras pasa el carro, el ruido de la placa.
              </p>

              <ListaVideos
                videos={videosTrabajo}
                clips={clipsRef.current}
                onQuitar={pedirQuitarVideo}
                onReintentar={reintentarVideo}
              />

              <button
                onClick={() => abrirVideo("trabajo")}
                className="w-full min-h-[52px] flex items-center gap-2.5 px-4 mt-2 bg-[var(--color-text)] text-[var(--color-bg)] border-0 font-extrabold text-sm cursor-pointer text-left hover:bg-[var(--color-neutral-900)]"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M3 7h11v10H3z" />
                  <path d="M14 11l7-4v10l-7-4z" />
                </svg>
                <span>{videosTrabajo.length ? "Grabar otro video" : "Grabar video"}</span>
              </button>
            </div>

            <div className="mt-3.5">
              <BotonGuardar
                texto={
                  fotosTrabajo.length || videosTrabajo.length
                    ? `Guardar ${fotosTrabajo.length} foto${fotosTrabajo.length === 1 ? "" : "s"}${videosTrabajo.length ? ` y ${videosTrabajo.length} video${videosTrabajo.length > 1 ? "s" : ""}` : ""}`
                    : "Seguir sin fotos"
                }
                habilitado
                onClick={() => guardarSeccion("fotos")}
              />
            </div>
          </Cuerpo>
        ) : null}

        {/* ── 6 · Firma de la tienda ── */}
        <Cabecera
          n={6}
          titulo="Firma de la tienda"
          ok={!!firma}
          chip={
            firma
              ? { variante: "accent", texto: edicion ? "Se conserva" : "Firmada" }
              : { variante: "neutral", texto: edicion ? "Sin firma" : "Pendiente" }
          }
          onToggle={() => toggleSeccion("firmas")}
        />
        {abierta === "firmas" ? (
          <Cuerpo>
            <div className="bg-[var(--color-surface-3)] border border-[var(--color-divider)] px-3.5 py-3">
              <div className="flex items-center gap-2">
                <div className="text-[10px] tracking-[.12em] uppercase opacity-66">Responsable de tienda</div>
                <span className={`tag ${firma ? "tag-accent" : "tag-neutral"} ml-auto`}>
                  {firma ? `Firmado ${firma.hora}` : "Sin firmar"}
                </span>
              </div>
              <div className="font-extrabold text-[15px] leading-[1.2] mt-1.5">
                {firma?.nombre || respNombre || visita.responsableNombre || "Encargado de tienda"}
              </div>
              {firma ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={firma.imagen}
                  alt="Firma"
                  className="w-full h-[76px] object-contain object-left mt-2 border-b border-black/[.35]"
                />
              ) : null}
              {edicion ? (
                <p className="m-0 mt-3 text-[13px] leading-[1.45] opacity-70">
                  {firma
                    ? "La firma es la que dejó la tienda al cerrar el acta: al editar se conserva tal cual y no se vuelve a firmar."
                    : "Esta acta se cerró sin firma. Al editar no se puede agregar."}
                </p>
              ) : (
              <button
                onClick={() => setSheet("firma")}
                className="w-full min-h-[50px] flex items-center justify-between px-3.5 mt-3 border border-[var(--color-divider)] font-extrabold text-sm cursor-pointer text-left"
                style={{
                  background: firma ? "transparent" : "var(--color-accent)",
                  color: firma ? "var(--color-text)" : "var(--color-bg)",
                }}
              >
                <span>{firma ? "Volver a firmar" : "Firmar"}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 20c4 0 5-14 9-14s2 9 5 9 4-3 4-3" />
                </svg>
              </button>
              )}
            </div>
            {edicion ? null : (
              <BotonGuardar texto="Guardar esta sección" habilitado={!!firma} onClick={() => guardarSeccion("firmas")} />
            )}
          </Cuerpo>
        ) : null}
      </div>

      <div className="px-4 pt-5 pb-6.5">
        <button
          onClick={() => {
            // La sección abierta se guarda sola también al ir a revisar.
            const listas = { ...guardadas };
            if (abierta && !faltaEnSeccion(abierta)) listas[abierta] = true;
            // Las dos obligatorias cuentan como listas si ya están completas,
            // aunque el técnico no haya pasado por ellas (datos precargados).
            if (!faltaEnSeccion("sucursal")) listas.sucursal = true;
            if (!faltaEnSeccion("motivo")) listas.motivo = true;
            setGuardadas(listas);
            if (!listas.sucursal) return aviso(faltaEnSeccion("sucursal") ?? "Guarda los datos del responsable");
            if (!listas.motivo) return aviso(faltaEnSeccion("motivo") ?? "Guarda el motivo y el trabajo realizado");
            setAbierta(null);
            setHoraTermino(ahora());
            setPaso("preview");
          }}
          className="w-full min-h-[60px] flex items-center justify-between px-4.5 border-0 font-extrabold text-base cursor-pointer text-left hover:brightness-95"
          style={{
            background: puedeRevisar ? "var(--color-accent)" : "#8f8b8b",
            color: puedeRevisar ? "var(--color-bg)" : "var(--color-surface-3)",
          }}
        >
          <span>{edicion ? "Revisar los cambios" : "Revisar y guardar"}</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        <p className="mt-2.5 mb-0 text-xs opacity-66">
          {puedeRevisar
            ? "Vas a ver el acta completa antes de guardar nada."
            : "Guarda las secciones 1 y 2 para poder revisar el acta."}
        </p>
      </div>

      {/* ── Hoja: agregar trabajo realizado ── */}
      {sheet === "trabajo" ? (
        <Sheet titulo={`Trabajo realizado · ${nombreMotivo(nt.motivo)}`} onClose={() => setSheet(null)}>
          <div className="px-4 pt-4 pb-5.5 flex flex-col gap-4.5">
            {/* Tras agregar uno la hoja no se cierra: pregunta qué más se hizo,
                para que el técnico no tenga que volver a buscar el botón ni se
                confunda con lo que ya cargó. */}
            {nt.agregados.length > 0 ? (
              <div className="px-3.5 py-3 bg-[var(--color-accent-100)] border-l-4 border-[var(--color-accent)]">
                <div className="text-[10px] tracking-[.12em] uppercase text-[var(--color-accent-800)]">
                  Ya agregaste
                </div>
                <div className="text-sm font-extrabold mt-1">{nt.agregados.map(nombreTrabajo).join(" · ")}</div>
              </div>
            ) : null}
            <div>
              <PasoTitulo n="1" texto={trabajosDelMotivo.some((t) => yaAgregado(t.codigo)) ? "¿Qué más hiciste?" : "¿Qué trabajo hiciste?"} />
              <div className="flex flex-col gap-1.5">
                {trabajosDelMotivo.map((t) => {
                  const activo = nt.codigo === t.codigo;
                  const agregado = yaAgregado(t.codigo);
                  return (
                    <button
                      key={t.codigo}
                      disabled={agregado}
                      onClick={() => setNt((p) => ({ ...p, codigo: t.codigo, subs: [] }))}
                      className="w-full min-h-[54px] flex items-center gap-3 px-3.5 font-extrabold text-[15px] leading-[1.2] cursor-pointer text-left hover:brightness-95 disabled:cursor-default disabled:opacity-55"
                      style={{
                        background: activo ? "var(--color-text)" : "var(--color-surface-3)",
                        color: activo ? "var(--color-bg)" : "var(--color-text)",
                        border: `1px solid ${activo ? "var(--color-text)" : "rgba(32,30,29,.35)"}`,
                      }}
                    >
                      <span className="w-[18px] h-[18px] flex-none border-2 border-current grid place-items-center">
                        {activo || agregado ? <span className="w-2 h-2 bg-current" /> : null}
                      </span>
                      <span className="flex-1 min-w-0">{t.nombre}</span>
                      {agregado ? (
                        <span className="text-[10px] tracking-[.08em] uppercase font-normal flex-none">Agregado</span>
                      ) : null}
                    </button>
                  );
                })}
                {trabajosDelMotivo.length === 0 ? (
                  <div className="px-3.5 py-3 border border-dashed border-black/[.4] text-[13px] opacity-70">
                    El checklist no tiene trabajos para este motivo. Avisa a coordinación.
                  </div>
                ) : null}
              </div>
            </div>

            {trbSel && trbSel.subtrabajos.length > 0 ? (
              <div>
                <PasoTitulo n="2" texto={trbSel.grupoLabel ?? "Subtrabajos"} />
                <div className="flex flex-col gap-1.5">
                  {trbSel.subtrabajos.map((s) => {
                    const marcado = nt.subs.find((x) => x.etiqueta === s.etiqueta);
                    const activo = !!marcado;
                    return (
                      <div key={s.id} className="flex items-stretch gap-2">
                        <button
                          onClick={() =>
                            setNt((p) => ({
                              ...p,
                              subs: activo
                                ? p.subs.filter((x) => x.etiqueta !== s.etiqueta)
                                : [...p.subs, { etiqueta: s.etiqueta, cantidad: 1 }],
                            }))
                          }
                          className="flex-1 min-w-0 min-h-[54px] flex items-center gap-3 px-3.5 text-[15px] leading-[1.2] text-[var(--color-text)] cursor-pointer text-left hover:brightness-95"
                          style={{
                            background: activo ? "var(--color-accent-100)" : "var(--color-surface-3)",
                            border: `1px solid ${activo ? "var(--color-accent)" : "rgba(32,30,29,.35)"}`,
                            fontWeight: activo ? 800 : 400,
                          }}
                        >
                          <span
                            className="w-[18px] h-[18px] flex-none border-2 border-[var(--color-text)] grid place-items-center"
                            style={{ background: activo ? "var(--color-text)" : "transparent" }}
                          >
                            {activo ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f3f2f2" strokeWidth="3.2">
                                <path d="M4 12l5 5L20 6" />
                              </svg>
                            ) : null}
                          </span>
                          <span className="flex-1 min-w-0">{s.etiqueta}</span>
                        </button>
                        {/* El contador solo aparece si el checklist dice que esta
                            opción lleva cantidad; si no, se marca y punto. */}
                        {activo && s.permiteCantidad ? (
                          <Contador
                            valor={marcado.cantidad}
                            onCambiar={(d) =>
                              setNt((p) => ({
                                ...p,
                                subs: p.subs.map((x) =>
                                  x.etiqueta === s.etiqueta
                                    ? { ...x, cantidad: Math.min(99, Math.max(1, x.cantidad + d)) }
                                    : x
                                ),
                              }))
                            }
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <button
              onClick={() => {
                if (!nt.codigo) return aviso("Elige el trabajo realizado");
                if (trbSel && trbSel.subtrabajos.length > 0 && nt.subs.length === 0) {
                  return aviso(`Marca al menos un ${trbSel.singular ?? "subtrabajo"}`);
                }
                setTrabajos((prev) => [
                  ...prev,
                  { id: autoId++, codigo: nt.codigo, motivo: nt.motivo, subs: nt.subs.map((x) => ({ ...x })), detalle: "" },
                ]);
                setGuardadas((g) => ({ ...g, motivo: false }));
                // La hoja queda abierta preguntando "¿Qué más hiciste?".
                setNt((p) => ({ ...p, codigo: "", subs: [], agregados: [...p.agregados, p.codigo] }));
                aviso(`${nombreTrabajo(nt.codigo)} agregado · ¿qué más hiciste?`);
              }}
              className="w-full min-h-[58px] flex items-center justify-between px-4.5 border-0 font-extrabold text-base cursor-pointer text-left hover:brightness-95"
              style={{
                background: nt.codigo ? "var(--color-accent)" : "#8f8b8b",
                color: nt.codigo ? "var(--color-bg)" : "var(--color-surface-3)",
              }}
            >
              <span>Agregar a la visita</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            {nt.agregados.length > 0 ? (
              <button
                onClick={() => setSheet(null)}
                className="w-full min-h-[50px] px-4 -mt-2 bg-transparent border border-[var(--color-divider)] text-[var(--color-text)] font-extrabold text-sm cursor-pointer text-left hover:bg-black/[.07]"
              >
                Listo, no hice nada más
              </button>
            ) : null}
          </div>
        </Sheet>
      ) : null}

      {/* ── Hoja: agregar un problema ── */}
      {sheet === "problema" ? (
        <Sheet titulo={np.editando === null ? "Nuevo problema" : "Corregir problema"} onClose={() => setSheet(null)}>
          <div className="p-4 flex flex-col gap-3.5">
            <div>
              <PasoTitulo n="1" texto="¿Qué tipo de problema es?" />
              <div className="flex flex-col gap-1.5">
                {catalogoProblema.map((t) => {
                  const activo = np.codigo === t.codigo;
                  return (
                    <button
                      key={t.codigo}
                      onClick={() => setNp((p) => ({ ...p, codigo: t.codigo, items: [] }))}
                      className="w-full min-h-[54px] flex items-center gap-3 px-3.5 font-extrabold text-[15px] leading-[1.3] cursor-pointer text-left"
                      style={{
                        background: activo ? "var(--color-text)" : "var(--color-surface-3)",
                        color: activo ? "var(--color-bg)" : "var(--color-text)",
                        border: `1px solid ${activo ? "var(--color-text)" : "rgba(32,30,29,.35)"}`,
                      }}
                    >
                      <span className="w-[18px] h-[18px] flex-none border-2 border-current grid place-items-center">
                        {activo ? <span className="w-2 h-2 bg-current" /> : null}
                      </span>
                      <span className="flex-1 min-w-0">{t.nombre}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {probSel && probSel.opciones.length > 0 ? (
              <div className="border-t border-black/[.3] pt-4">
                <PasoTitulo n="2" texto={probSel.grupoLabel ?? "Detalle"} />
                <p className="m-0 mb-3 ml-[33px] text-[13px] opacity-60">
                  {probSel.ayuda ?? `Marca ${(probSel.grupoLabel ?? "el detalle").toLowerCase()} y ajusta la cantidad.`}
                </p>
                <div className="flex flex-col gap-2">
                  {probSel.opciones.map((o) => {
                    const item = np.items.find((x) => x.etiqueta === o.etiqueta);
                    const activo = !!item;
                    return (
                      <div key={o.id} className="flex items-stretch gap-2">
                        <button
                          onClick={() =>
                            setNp((p) => ({
                              ...p,
                              items: activo
                                ? p.items.filter((x) => x.etiqueta !== o.etiqueta)
                                : [...p.items, { etiqueta: o.etiqueta, cantidad: 1 }],
                            }))
                          }
                          className="flex-1 min-w-0 min-h-[58px] flex items-center gap-3 px-3.5 text-base leading-[1.3] text-[var(--color-text)] cursor-pointer text-left"
                          style={{
                            background: activo ? "var(--color-accent-100)" : "var(--color-surface-3)",
                            border: `1px solid ${activo ? "var(--color-accent)" : "rgba(32,30,29,.35)"}`,
                            fontWeight: activo ? 800 : 400,
                          }}
                        >
                          <span
                            className="w-[22px] h-[22px] flex-none border-2 border-[var(--color-text)] grid place-items-center"
                            style={{ background: activo ? "var(--color-accent)" : "transparent" }}
                          >
                            {activo ? (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f3f2f2" strokeWidth="3.4">
                                <path d="M4 12l5 5L20 6" />
                              </svg>
                            ) : null}
                          </span>
                          <span className="flex-1 min-w-0">{o.etiqueta}</span>
                        </button>
                        {activo && o.permiteCantidad ? (
                          <Contador valor={item!.cantidad} onCambiar={(d) => cambiarCantidad(o.etiqueta, d)} alto />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 mb-0 text-xs opacity-62">
                  Toca para marcar. Las opciones que llevan cantidad muestran − y + al marcarlas.
                </p>
              </div>
            ) : null}

            <Campo label={probTieneOpciones ? "Nota corta" : "Qué encontraste"} htmlFor="p-desc" extra={probTieneOpciones ? "(opcional)" : undefined}>
              <textarea
                id="p-desc"
                rows={2}
                value={np.desc}
                onChange={(e) => setNp((p) => ({ ...p, desc: e.target.value }))}
                autoComplete="off"
                placeholder="Ej: las placas del pórtico 1 están quemadas"
                className={`${entradaSheet} min-h-[96px] leading-[1.4] resize-y`}
              />
            </Campo>

            <button
              onClick={() => {
                if (!np.codigo) return aviso("Elige primero el tipo de problema");
                if (probTieneOpciones && np.items.length === 0) {
                  return aviso(`Marca al menos un ${probSel?.singular ?? "detalle"}`);
                }
                if (!probTieneOpciones && !np.desc.trim()) return aviso("Escribe qué encontraste");
                if (np.editando === null) {
                  setProblemas((prev) => [
                    ...prev,
                    { id: autoId++, codigo: np.codigo, items: [...np.items], desc: np.desc.trim(), sol: "", estado: "ABIERTO" },
                  ]);
                } else {
                  // Se corrige en su misma fila: conserva su id de la base y su estado.
                  setProblemas((prev) =>
                    prev.map((x) =>
                      x.id === np.editando ? { ...x, codigo: np.codigo, items: [...np.items], desc: np.desc.trim() } : x
                    )
                  );
                }
                setGuardadas((g) => ({ ...g, problemas: false }));
                setSheet(null);
                setAbierta("problemas");
                aviso(np.editando === null ? "Problema agregado a la ficha" : "Problema corregido");
              }}
              className="w-full min-h-[58px] flex items-center justify-between px-4.5 border-0 font-extrabold text-base cursor-pointer text-left hover:brightness-95"
              style={{
                background: probListo ? "var(--color-accent)" : "#8f8b8b",
                color: probListo ? "var(--color-bg)" : "var(--color-surface-3)",
              }}
            >
              <span>{np.editando === null ? "Agregar a la visita" : "Guardar la corrección"}</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        </Sheet>
      ) : null}

      {sheet === "firma" ? (
        <FirmaSheet
          nombreInicial={respNombre || visita.responsableNombre || ""}
          rutInicial={respRut}
          onAviso={aviso}
          onCerrar={() => setSheet(null)}
          onConfirmar={(f) => {
            setFirma(f);
            setSheet(null);
            setAbierta("firmas");
            setGuardadas((g) => ({ ...g, firmas: false }));
            aviso("Firma guardada");
          }}
        />
      ) : null}

      {sheet === "camara" ? (
        <CamaraSheet
          onCapturar={(src) => void agregarFoto(src, destinoMedia === "interno")}
          onCerrar={() => setSheet(null)}
        />
      ) : null}

      {sheet === "video" ? (
        <VideoSheet
          onGrabado={(clip) => {
            agregarVideo(clip, destinoMedia === "interno");
            setSheet(null);
            setAbierta(destinoMedia === "interno" ? "interno" : "fotos");
            aviso(
              clip.ajustes.length
                ? "Video ajustado y agregado · subiendo al servidor"
                : "Video agregado · subiendo al servidor"
            );
          }}
          onCerrar={() => setSheet(null)}
        />
      ) : null}

      {confirmar ? <Confirmar cfg={confirmar} onCerrar={() => setConfirmar(null)} /> : null}
      <Toast texto={toast} />
    </div>
  );

  function cambiarCantidad(etiqueta: string, delta: number) {
    setNp((p) => ({
      ...p,
      items: p.items.map((x) =>
        x.etiqueta === etiqueta ? { ...x, cantidad: Math.min(99, Math.max(1, x.cantidad + delta)) } : x
      ),
    }));
  }

  /**
   * Agrega una foto ya reducida.
   *
   * Antes se comprimían todas juntas recién al guardar. Ahora se reduce cada
   * una al entrar, porque la foto tiene que caber en el borrador del celular
   * —una foto de cámara pesa varios MB y el almacenamiento del navegador es de
   * unos pocos— y porque al guardar sin señal no hay tiempo de procesar nada.
   */
  async function agregarFoto(src: string, interna = false) {
    const reducida = await comprimirFoto(src);
    setFotos((prev) => [...prev, { id: autoId++, src: reducida, interno: interna }]);
    setGuardadas((g) => ({ ...g, [interna ? "interno" : "fotos"]: false }));
  }

  function onArchivos(e: React.ChangeEvent<HTMLInputElement>, interna: boolean) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => void agregarFoto(String(reader.result), interna);
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  function abrirCamara(destino: "trabajo" | "interno") {
    setDestinoMedia(destino);
    setSheet("camara");
  }

  function abrirVideo(destino: "trabajo" | "interno") {
    setDestinoMedia(destino);
    setSheet("video");
  }

  function pedirQuitarFoto(f: FotoForm) {
    setConfirmar({
      titulo: "¿Borrar esta foto?",
      texto: "La foto se quita del acta y hay que volver a tomarla si la necesitas.",
      cta: "Borrar foto",
      accion: () => {
        setFotos((prev) => prev.filter((x) => x.id !== f.id));
        setGuardadas((g) => ({ ...g, [f.interno ? "interno" : "fotos"]: false }));
      },
    });
  }

  function pedirQuitarVideo(v: VideoForm) {
    setConfirmar({
      titulo: "¿Borrar este video?",
      texto: "El video se quita del acta y hay que volver a grabarlo si lo necesitas.",
      cta: "Borrar video",
      accion: () => quitarVideo(v),
    });
  }

  function abrirHojaTrabajo(motivo: string) {
    setNt({ motivo, codigo: "", subs: [], agregados: [] });
    setSheet("trabajo");
  }

  /** Quitar un motivo se lleva sus trabajos: se pide confirmación si tenía alguno. */
  function desmarcarMotivo(codigo: string) {
    const suyos = trabajos.filter((t) => motivoDe(t) === codigo);
    const quitar = () => {
      setTrabajos((prev) => prev.filter((t) => motivoDe(t) !== codigo));
      setMotivosCodigos((prev) => prev.filter((c) => c !== codigo));
      setGuardadas((g) => ({ ...g, motivo: false }));
    };
    if (!suyos.length) return quitar();
    setConfirmar({
      titulo: "¿Quitar este motivo?",
      texto: `«${nombreMotivo(codigo)}» se quita de la visita junto con ${suyos.length === 1 ? "su trabajo" : `sus ${suyos.length} trabajos`}: ${suyos.map((t) => nombreTrabajo(t.codigo)).join(", ")}.`,
      cta: "Quitar motivo",
      accion: quitar,
    });
  }

  /**
   * Sube el clip recién grabado, por partes y en cuanto se acepta.
   *
   * No espera al "Guardar visita": un minuto en 720p pesa unos 11 MB y el
   * cuerpo de una Server Action se corta en 4,5 MB, así que el clip nunca
   * podría viajar dentro del acta. Se manda de a 2 MB mientras el técnico sigue
   * llenando el formulario, y lo que queda en pantalla es una barra de avance.
   *
   * Si se corta la señal a mitad, la fila queda incompleta en la base —no la
   * muestra nadie— y en el formulario aparece el clip con su error y el botón
   * para reintentar. El acta se puede cerrar igual: el video es evidencia
   * adicional, no un requisito.
   */
  async function subirClip(clip: ClipGrabado, filaId: number) {
    const marcar = (cambio: Partial<VideoForm>) =>
      setVideos((prev) => prev.map((v) => (v.id === filaId ? { ...v, ...cambio } : v)));

    let abierto;
    try {
      abierto = await abrirVideoAction(visita.folio, {
        mime: clip.mime,
        bytes: clip.blob.size,
        duracionSeg: clip.medida.duracionSeg,
        ancho: clip.medida.ancho,
        alto: clip.medida.alto,
        grabadoEn: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[dmc] abrirVideo:", err);
      marcar({ progreso: null, error: "No hubo señal para empezar a subir el video." });
      return;
    }

    if (!abierto.ok || !abierto.videoId) {
      marcar({ progreso: null, error: abierto.error ?? "No se pudo empezar a subir el video." });
      return;
    }
    const videoId = abierto.videoId;

    let subido = 0;
    while (subido < clip.blob.size) {
      const hasta = Math.min(subido + VIDEO_TROZO_BYTES, clip.blob.size);
      let res;
      try {
        res = await subirTrozoVideoAction({
          folio: visita.folio,
          videoId,
          desde: subido,
          // El trozo viaja dentro del objeto, no como argumento suelto: ver
          // la explicación en app/actions/videos (TrozoVideo).
          trozoBase64: await trozoBase64(clip.blob, subido, hasta),
        });
      } catch (err) {
        // El motivo real va al log, no a la pantalla: cuando el que falla es el
        // servidor, el mensaje que llega es el genérico de producción ("An
        // error occurred in the Server Components render…") y al técnico no le
        // dice nada. En pantalla va algo accionable y el clip queda con su
        // botón de reintentar.
        console.error("[dmc] subirTrozoVideo:", err);
        marcar({ progreso: null, error: "Se cortó la subida del video. Vuelve a intentarlo." });
        return;
      }
      if (!res.ok) {
        marcar({ progreso: null, error: res.error ?? "No se pudo subir el video." });
        return;
      }
      subido = res.recibidos ?? hasta;
      marcar({ progreso: Math.round((subido / clip.blob.size) * 100) });
    }

    const cerrado = await cerrarVideoAction(visita.folio, videoId).catch(() => null);
    if (!cerrado?.ok) {
      marcar({ progreso: null, error: cerrado?.error ?? "El video no terminó de guardarse." });
      return;
    }
    // Se pisa el id temporal por el de la base y la vista previa local por la
    // ruta que sirve el servidor: así el clip sobrevive a recargar la pantalla.
    clipsRef.current.delete(filaId);
    setVideos((prev) =>
      prev.map((v) =>
        v.id === filaId
          ? {
              ...v,
              id: videoId,
              // Al editar un acta cerrada el clip queda inactivo hasta guardar
              // y el servidor todavía no lo sirve: se sigue viendo el local.
              src: edicion ? v.src : cerrado.archivoUrl ?? v.src,
              progreso: null,
              error: null,
            }
          : v
      )
    );
  }

  /** El clip aceptado en la hoja de grabación entra a la lista y empieza a subir. */
  function agregarVideo(clip: ClipGrabado, interno = false) {
    const filaId = -autoId++;  // negativo: todavía no tiene id de la base
    // El clip se guarda en memoria para poder reintentar la subida sin obligar
    // al técnico a volver a grabar: si se cayó la señal, el video sigue acá.
    clipsRef.current.set(filaId, clip);
    setVideos((prev) => [
      ...prev,
      {
        id: filaId,
        src: URL.createObjectURL(clip.blob),
        duracionSeg: clip.medida.duracionSeg,
        ancho: clip.medida.ancho,
        alto: clip.medida.alto,
        bytes: clip.blob.size,
        progreso: 0,
        error: null,
        interno,
      },
    ]);
    setGuardadas((g) => ({ ...g, [interno ? "interno" : "fotos"]: false }));
    void subirClip(clip, filaId);
  }

  /** Volver a intentar la subida de un clip que se cortó, sin regrabarlo. */
  function reintentarVideo(video: VideoForm) {
    const clip = clipsRef.current.get(video.id);
    if (!clip) return aviso("Ese video ya no está en el celular: hay que grabarlo de nuevo");
    setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, progreso: 0, error: null } : v)));
    void subirClip(clip, video.id);
  }

  /** Quita el clip del acta. Si ya estaba en la base, se deja inactivo allá. */
  function quitarVideo(video: VideoForm) {
    clipsRef.current.delete(video.id);
    setVideos((prev) => prev.filter((v) => v.id !== video.id));
    setGuardadas((g) => ({ ...g, [video.interno ? "interno" : "fotos"]: false }));
    // Al editar un acta cerrada el clip se quita recién al guardar la edición.
    if (video.id > 0 && !edicion) {
      void borrarVideoAction(visita.folio, video.id).catch(() => {
        // Que no se pueda marcar inactivo ahora no importa: al cerrar el acta
        // se desactiva igual todo lo que no venga en videosIds.
      });
    }
  }
}

// ─────────────────────────────── piezas locales ───────────────────────────────

const entrada =
  "w-full min-h-[52px] px-3.5 py-3 text-base bg-[var(--color-surface-3)] border border-[var(--color-divider)] text-[var(--color-text)] caret-[var(--color-accent)] focus-visible:border-[var(--color-accent)] focus-visible:outline-none";

const entradaSheet =
  "w-full min-h-[52px] px-3.5 py-3 text-base bg-[var(--color-surface)] border border-[var(--color-divider)] text-[var(--color-text)] caret-[var(--color-accent)] focus-visible:border-[var(--color-accent)] focus-visible:outline-none";

function ahora(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function Cabecera({
  n,
  titulo,
  ok,
  chip,
  onToggle,
}: {
  n: number;
  titulo: string;
  ok: boolean;
  chip: { variante: "accent" | "neutral" | "outline"; texto: string };
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2.5 min-h-[60px] px-4 bg-transparent border-0 border-b border-black/[.25] cursor-pointer text-left text-[var(--color-text)] hover:bg-black/[.04]"
    >
      <span
        className="w-6.5 h-6.5 flex-none grid place-items-center font-extrabold text-xs tabular-nums"
        style={{
          background: ok ? "var(--color-accent)" : "transparent",
          color: ok ? "var(--color-bg)" : "var(--color-text)",
        }}
      >
        {n}
      </span>
      <span className="font-extrabold text-[15px] leading-[1.2] flex-1">{titulo}</span>
      <span className={`tag tag-${chip.variante}`}>{chip.texto}</span>
    </button>
  );
}

/**
 * Qué pasa con lo que el técnico lleva escrito.
 *
 * Tres cosas que hasta ahora no se decían en ninguna parte: que lo escrito está
 * a salvo en el celular, que se recuperó lo que había quedado a medias, y que
 * hay un acta terminada esperando señal.
 */
function EstadoBorrador({
  respaldo,
  recuperado,
  pendiente,
  enviando,
  conSenal,
  otrasPendientes,
  onOcultarRecuperado,
  onEmpezarDeNuevo,
  onEnviarPendiente,
}: {
  respaldo: { guardadoEn: string; sinFotos: boolean } | null;
  recuperado: { guardadoEn: string; sinFotos: boolean } | null;
  pendiente: { capturadaEn: string; intentos: number } | null;
  enviando: boolean;
  conSenal: boolean;
  otrasPendientes: number;
  onOcultarRecuperado: () => void;
  onEmpezarDeNuevo: () => void;
  onEnviarPendiente: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 mt-3">
      {pendiente ? (
        <div className="px-3.5 py-3 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)]">
          <div className="text-[10px] tracking-[.12em] uppercase text-[var(--color-accent-800)]">
            Acta terminada · falta enviarla
          </div>
          <div className="text-[13px] leading-[1.45] text-[var(--color-accent-800)] mt-1.5">
            Quedó guardada en el celular a las {pendiente.capturadaEn.slice(11, 16)} y se manda sola cuando haya señal.
            No la vuelvas a llenar.
          </div>
          <button
            onClick={onEnviarPendiente}
            disabled={enviando}
            className="w-full min-h-[46px] flex items-center justify-between px-3.5 mt-2.5 bg-[var(--color-accent)] text-[var(--color-bg)] border-0 font-extrabold text-[13px] cursor-pointer text-left disabled:opacity-60"
          >
            <span>{enviando ? "Enviando…" : "Enviar ahora"}</span>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M4 12a8 8 0 018-8c3 0 5.5 1.7 7 4M20 12a8 8 0 01-8 8c-3 0-5.5-1.7-7-4" />
              <path d="M19 4v4h-4M5 20v-4h4" />
            </svg>
          </button>
        </div>
      ) : null}

      {recuperado ? (
        <div className="px-3.5 py-3 bg-[var(--color-surface)] border-l-4 border-[var(--color-text)]">
          <div className="text-[10px] tracking-[.12em] uppercase opacity-66">Recuperamos lo que llevabas</div>
          <div className="text-[13px] leading-[1.45] mt-1.5">
            Esta acta quedó a medias {haceCuanto(recuperado.guardadoEn)} y se volvió a cargar tal cual.
            {recuperado.sinFotos ? " Las fotos no alcanzaron a guardarse: hay que tomarlas de nuevo." : ""}
          </div>
          <div className="flex gap-3.5 items-center mt-2">
            <button
              onClick={onOcultarRecuperado}
              className="min-h-10 px-1 bg-transparent border-0 font-extrabold text-[13px] cursor-pointer text-[var(--color-text)] underline underline-offset-4"
            >
              Seguir con esto
            </button>
            <button
              onClick={onEmpezarDeNuevo}
              className="min-h-10 px-1 bg-transparent border-0 text-[13px] cursor-pointer text-[var(--color-accent-active)] underline underline-offset-4"
            >
              Empezar de nuevo
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2 text-[11px] leading-[1.3] opacity-70">
        <span
          className="w-2 h-2 flex-none rounded-full"
          style={{ background: conSenal ? "var(--color-accent)" : "#8f8b8b" }}
          aria-hidden="true"
        />
        <span>
          {!conSenal
            ? "Sin señal · lo que escribes queda guardado en el celular"
            : respaldo
              ? `Guardado en el celular ${haceCuanto(respaldo.guardadoEn)}`
              : "Lo que escribas se guarda solo en este celular"}
        </span>
      </div>

      {otrasPendientes > 0 ? (
        <div className="text-[11px] leading-[1.3] text-[var(--color-accent-800)]">
          Tienes {otrasPendientes} acta{otrasPendientes > 1 ? "s" : ""} de otra visita esperando señal. Se envía
          {otrasPendientes > 1 ? "n" : ""} al abrir esa visita.
        </div>
      ) : null}
    </div>
  );
}

function Cuerpo({ children, gap = true }: { children: React.ReactNode; gap?: boolean }) {
  return (
    <div className={`p-4 bg-[var(--color-surface)] border-b border-black/[.25] ${gap ? "flex flex-col gap-3.5" : ""}`}>
      {children}
    </div>
  );
}

function Campo({
  label,
  extra,
  htmlFor,
  children,
  className,
}: {
  label: string;
  extra?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-[11px] tracking-[.09em] uppercase opacity-60 mb-1.5">
        {label}
        {extra ? <span className="opacity-66 normal-case tracking-normal"> {extra}</span> : null}
      </label>
      {children}
    </div>
  );
}

function PasoTitulo({ n, texto }: { n: string; texto: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <span className="w-6 h-6 flex-none grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] font-extrabold text-xs leading-none tabular-nums">
        {n}
      </span>
      <span className="font-extrabold text-base leading-[1.2]">{texto}</span>
    </div>
  );
}

/** − / + para las opciones del checklist que llevan cantidad. */
function Contador({
  valor,
  onCambiar,
  alto,
}: {
  valor: number;
  onCambiar: (delta: number) => void;
  alto?: boolean;
}) {
  const altura = alto ? "min-h-[58px]" : "min-h-[54px]";
  return (
    <div className="flex-none flex items-center border border-[var(--color-divider)] bg-[var(--color-surface-3)]">
      <button
        type="button"
        onClick={() => onCambiar(-1)}
        aria-label="Quitar uno"
        className={`w-[44px] ${altura} bg-transparent border-0 cursor-pointer text-[var(--color-text)] font-extrabold text-[22px] leading-none`}
      >
        −
      </button>
      <div className="min-w-[28px] text-center font-extrabold text-[19px] leading-none tabular-nums">{valor}</div>
      <button
        type="button"
        onClick={() => onCambiar(1)}
        aria-label="Agregar uno"
        className={`w-[44px] ${altura} bg-transparent border-0 cursor-pointer text-[var(--color-text)] font-extrabold text-[22px] leading-none`}
      >
        +
      </button>
    </div>
  );
}

function BotonGuardar({ texto, onClick, habilitado }: { texto: string; onClick: () => void; habilitado: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-disabled={!habilitado}
      className="w-full min-h-[54px] flex items-center justify-between px-4 border-0 font-extrabold text-[15px] cursor-pointer text-left hover:brightness-95"
      style={{
        background: habilitado ? "var(--color-accent)" : "#8f8b8b",
        color: habilitado ? "var(--color-bg)" : "var(--color-surface-3)",
      }}
    >
      <span>{texto}</span>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M4 12l5 5L20 6" />
      </svg>
    </button>
  );
}

/** Grilla de fotos con sus botones de cámara y galería. La usan el trabajo y el comentario interno. */
function GaleriaFotos({
  fotos,
  onQuitar,
  onCamara,
  onArchivos,
}: {
  fotos: FotoForm[];
  onQuitar: (f: FotoForm) => void;
  onCamara: () => void;
  onArchivos: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {fotos.map((f) => (
        <div key={f.id} className="relative aspect-square border border-[var(--color-divider)] overflow-hidden bg-[var(--color-neutral-300)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.src} alt="" className="w-full h-full object-cover" />
          <button
            onClick={() => onQuitar(f)}
            aria-label="Quitar foto"
            className="absolute top-0 right-0 w-8 h-8 grid place-items-center bg-[var(--color-text)] text-[var(--color-bg)] border-0 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}
      <button
        onClick={onCamara}
        className="relative aspect-square flex flex-col items-center justify-center gap-1.5 border border-black/[.5] cursor-pointer bg-[var(--color-text)] text-[var(--color-bg)] overflow-hidden hover:bg-[var(--color-neutral-900)]"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 8h3l2-3h8l2 3h3v12H3z" />
          <circle cx="12" cy="13" r="3.4" />
        </svg>
        <span className="font-extrabold text-[10px] tracking-[.08em] uppercase">Cámara</span>
      </button>
      <label className="relative aspect-square flex flex-col items-center justify-center gap-1.5 border border-dashed border-black/[.5] cursor-pointer bg-[var(--color-surface-3)] overflow-hidden hover:bg-[#eeeaea]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#201e1d" strokeWidth="1.8">
          <path d="M4 5h16v14H4z" />
          <path d="M4 16l5-5 4 4 3-3 4 4" />
          <circle cx="9" cy="9" r="1.4" />
        </svg>
        <span className="font-extrabold text-[10px] tracking-[.08em] uppercase">Galería</span>
        <input type="file" accept="image/*" multiple onChange={onArchivos} className="absolute w-px h-px opacity-0 pointer-events-none" />
      </label>
    </div>
  );
}

/** Los clips con su avance de subida, su error y el botón de reintentar. */
function ListaVideos({
  videos,
  clips,
  onQuitar,
  onReintentar,
}: {
  videos: VideoForm[];
  /** Los clips todavía en memoria: sin él, un clip cortado no se puede reintentar. */
  clips: Map<number, ClipGrabado>;
  onQuitar: (v: VideoForm) => void;
  onReintentar: (v: VideoForm) => void;
}) {
  if (!videos.length) return null;
  return (
    <div className="grid gap-2 mt-3 mb-1">
      {videos.map((v) => (
        <div key={v.id} className="border border-[var(--color-divider)] bg-[var(--color-surface-3)]">
          <video
            src={v.src}
            controls
            preload="metadata"
            playsInline
            onLoadedMetadata={(e) => repararDuracionPreview(e.currentTarget)}
            className="w-full aspect-video bg-black object-contain"
          />
          <div className="flex items-center gap-2 px-2.5 py-2">
            <span className="text-[11px] tabular-nums opacity-70">
              {reloj(v.duracionSeg)} · {v.ancho}x{v.alto} · {mb(v.bytes)}
            </span>
            <button
              onClick={() => onQuitar(v)}
              aria-label="Quitar video"
              className="ml-auto w-8 h-8 grid place-items-center bg-transparent border border-[var(--color-divider)] cursor-pointer text-[var(--color-text)] hover:bg-black/[.07]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {/* Mientras sube: la barra. Si se cortó: el motivo. */}
          {v.progreso !== null ? (
            <div className="px-2.5 pb-2.5">
              <div className="h-1 bg-[var(--color-divider)] overflow-hidden">
                <div
                  className="h-full bg-[var(--color-accent)] transition-[width] duration-300"
                  style={{ width: `${v.progreso}%` }}
                />
              </div>
              <div className="mt-1 text-[11px] opacity-62 tabular-nums">Subiendo… {v.progreso}%</div>
            </div>
          ) : null}
          {v.error ? (
            <div className="px-2.5 pb-2.5">
              <div className="text-[11px] text-[var(--color-accent-active)] leading-[1.45]">{v.error}</div>
              {clips.has(v.id) ? (
                <button
                  onClick={() => onReintentar(v)}
                  className="mt-2 min-h-[38px] w-full px-3 bg-[var(--color-text)] text-[var(--color-bg)] border-0 font-extrabold text-[12px] cursor-pointer text-left hover:bg-[var(--color-neutral-900)]"
                >
                  Reintentar la subida
                </button>
              ) : (
                <div className="mt-1 text-[11px] opacity-62">El acta se puede guardar igual; el video no va a quedar.</div>
              )}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
