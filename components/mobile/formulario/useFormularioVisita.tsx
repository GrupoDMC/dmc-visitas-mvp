"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfirmarCfg } from "@/components/ui/Confirmar";
import type { FirmaGuardada } from "@/components/mobile/FirmaSheet";
import { useToast } from "@/components/ui/Toast";
import { fmtRut, fmtTel, mensajeRut, rutCompleto, rutDvCorrecto, telCompleto } from "@/lib/ui/formato";
import { ajustarFotos, comprimirFoto, PRESUPUESTO_FOTOS_BYTES, pesoDeFotos } from "@/lib/ui/imagen";
import { useUsuarioLocal } from "@/lib/ui/usuario-local";
import { cargoVigente } from "@/lib/ui/cargos";
import { usePersonasLocal } from "@/lib/ui/personas-local";
import { puede, useReferencias } from "@/lib/ui/referencias";
import { guardarActaAction } from "@/app/actions/visitas";
import { editarActaTecnicoAction } from "@/app/actions/ediciones";
import { formularioDesdeActa } from "@/lib/ui/edicion";
import { guardarBorradorAction } from "@/app/actions/borradores";
import { liberarReservaAction, renovarReservaAction } from "@/app/actions/reservas";
import { debeRenovar, intervaloAvisoMs, PLAZO_RESERVA_SEG, type ReservaAjena } from "@/lib/reserva";
import { trabajosDelMotivo } from "@/lib/ui/motivos";
import {
  actasEnCola,
  migrarClavesViejas,
  borradorConDatos,
  borrarBorrador,
  encolarActa,
  escribirBorrador,
  hayConexion,
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
import type { ActaEntrada, EdicionActaEntrada } from "@/lib/contratos/acta";
import type { ProblemaSinResolver } from "@/lib/contratos/visitas";
import { FALTA_RESOLUCION } from "@/lib/validacion/aviso-problemas";
import type { CatalogoInterno, CatalogoMotivo, CatalogoProblema, CatalogoTrabajo, Visita } from "@/lib/types";
import { ahora } from "@/components/mobile/formulario/piezas";
import { useVideosActa } from "@/components/mobile/formulario/useVideosActa";
import { nuevoId, reservarIdsHasta } from "@/components/mobile/formulario/ids";

// El estado del formulario del acta y todo lo que lo cambia: los datos de cada
// sección, el borrador del celular, la cola de actas sin señal, las fotos y la
// subida de los videos. Las pantallas, secciones y hojas solo lo leen y llaman
// a sus manejadores (ver components/mobile/FormularioVisita.tsx).

export const SECCIONES: Seccion[] = ["sucursal", "motivo", "problemas", "interno", "fotos", "firmas"];

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

/**
 * Por qué este formulario dejó de poder escribir. En los dos casos lo que hay en
 * el celular (borrador o acta en cola) se conserva tal cual y no se envía nada.
 *
 * - reserva: el otro técnico tomó el acta mientras este estaba sin actividad.
 * - cerrada: el otro técnico ya cerró el acta de la visita.
 */
export type BloqueoActa = { tipo: "reserva"; reserva: ReservaAjena } | { tipo: "cerrada" };

export function useFormularioVisita({
  visita,
  motivos,
  catalogoTrabajo,
  catalogoProblema,
  catalogoInterno,
  borradorServidor,
  edicion = false,
  reservaPlazoSeg = PLAZO_RESERVA_SEG,
  porResolver = [],
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
  /** Plazo de la reserva del acta, en segundos: de ahí sale cada cuánto se avisa que se sigue trabajando. */
  reservaPlazoSeg?: number;
  /**
   * Los problemas que la visita venía a resolver (agendada desde el aviso o
   * desde «Problemas»). De cada uno el técnico dice si quedó solucionado.
   */
  porResolver?: ProblemaSinResolver[];
}) {
  const router = useRouter();
  // El borrador y la cola del equipo van a nombre del usuario (ver lib/ui/borrador).
  const uid = useUsuarioLocal();
  const { toast, aviso } = useToast();
  // Sin el permiso de celular «video» el formulario no ofrece grabar.
  const puedeVideo = puede(useReferencias(), "celular.video");

  // Al editar, todo arranca de lo que quedó en el acta.
  const [inicial] = useState(() => {
    if (!edicion) return null;
    const acta = formularioDesdeActa(visita);
    reservarIdsHasta(acta.siguienteId);
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
  // El cargo es opcional y no vive en la visita: sale de la lista de la tienda.
  const [respCargo, setRespCargo] = useState(visita.ejecucion?.responsableCargo ?? visita.responsableCargo ?? "");
  const personasLocal = usePersonasLocal(visita.sucursalId);
  const cargos = useReferencias().cargos;
  // Si quien se agendó ya está en la lista de la tienda con su cargo, llega puesto.
  useEffect(() => {
    if (respCargo || !personasLocal.length || !cargos.length) return;
    const rut = respRut.replace(/[^0-9kK]/g, "").toUpperCase();
    const conocida = personasLocal.find((p) =>
      rut ? (p.rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase() === rut : p.nombre === respNombre.trim()
    );
    const cargo = cargoVigente(cargos, conocida?.cargo);
    if (cargo) setRespCargo(cargo);
    // Solo cuando llega la lista: lo que se escriba después no se pisa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personasLocal]);

  // 2 · Motivo y trabajo realizado. Los que agendó coordinación vienen ya
  // marcados, pero el técnico puede quitarlos si en terreno no correspondían, y
  // sumar otros. Ojo: al iniciar la visita la ejecución existe pero sin motivos
  // reales, así que una lista vacía no cuenta como "ya confirmados".
  const motivosAgendados = useMemo(
    () => (visita.motivosCodigos?.length ? visita.motivosCodigos : [visita.motivoCodigo]).filter(Boolean),
    [visita.motivosCodigos, visita.motivoCodigo]
  );
  const confirmadosOAgendados = useCallback(
    (codigos: string[]) => {
      const limpios = [...new Set(codigos.filter(Boolean))];
      return limpios.length ? limpios : motivosAgendados;
    },
    [motivosAgendados]
  );
  const [motivosCodigos, setMotivosCodigos] = useState<string[]>(() =>
    confirmadosOAgendados(visita.ejecucion?.motivosRealesCodigos ?? [])
  );
  const [obs, setObs] = useState(inicial?.obs ?? "");
  const [trabajos, setTrabajos] = useState<TrabajoForm[]>(inicial?.trabajos ?? []);

  // 3 · Problemas detectados, y lo que se dice de los que la visita venía a resolver.
  const [problemas, setProblemas] = useState<ProblemaForm[]>(inicial?.problemas ?? []);
  const [resoluciones, setResoluciones] = useState<Record<string, boolean>>({});
  const sinResponder = porResolver.filter((p) => resoluciones[p.id] === undefined);

  // 4 · Comentario interno: su checklist, el texto, y fotos y videos marcados
  //     como internos. Nada de esto lo ve el cliente.
  const [interno, setInterno] = useState(inicial?.interno ?? "");
  const [internos, setInternos] = useState<string[]>(inicial?.internos ?? []);

  // 5 · Fotos y videos (los del trabajo y los internos, separados por `interno`)
  const [fotos, setFotos] = useState<FotoForm[]>(inicial?.fotos ?? []);
  // Sin tope de fotos: cuando juntas no caben en el request, se les baja la
  // calidad (ver ajustarFotos) en vez de impedir que se tomen más.
  useEffect(() => {
    if (pesoDeFotos(fotos) <= PRESUPUESTO_FOTOS_BYTES) return;
    let vigente = true;
    void ajustarFotos(fotos).then((ajustadas) => {
      if (!vigente || ajustadas === fotos) return;
      const nuevas = new Map(ajustadas.map((f) => [f.id, f.src]));
      setFotos((prev) => prev.map((f) => (nuevas.has(f.id) && f.src.startsWith("data:") ? { ...f, src: nuevas.get(f.id)! } : f)));
    });
    return () => {
      vigente = false;
    };
  }, [fotos]);
  // Reserva del acta (ver lib/reserva): si el otro técnico la toma o cierra la
  // visita, el formulario deja de escribir y de enviar, y lo que hay en el
  // celular se conserva.
  const [bloqueo, setBloqueo] = useState<BloqueoActa | null>(null);
  const bloqueoRef = useRef<BloqueoActa | null>(null);
  bloqueoRef.current = bloqueo;
  const perderReserva = useCallback((reserva: ReservaAjena) => setBloqueo({ tipo: "reserva", reserva }), []);

  // 5 · Video: vive en su propio hook (subida por partes y reintentos).
  const { videos, setVideos, clipsRef, agregarVideo, reintentarVideo, quitarVideo } = useVideosActa({
    visita,
    edicion,
    aviso,
    setGuardadas,
    onReservaAjena: perderReserva,
  });

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
      respCargo,
      motivosCodigos,
      obs,
      interno,
      internos,
      trabajos,
      problemas,
      resoluciones,
      fotos,
      firma,
      guardadas,
      horaInicio,
    }),
    [visita.folio, respNombre, respRut, respTel, respCargo, motivosCodigos, obs, interno, internos, trabajos, problemas, resoluciones, fotos, firma, guardadas, horaInicio]
  );

  const aplicarBorrador = useCallback((b: BorradorActa) => {
    setRespNombre(b.respNombre ?? "");
    setRespRut(b.respRut ?? "");
    setRespTel(b.respTel ?? "");
    setRespCargo(b.respCargo ?? "");
    if (b.motivosCodigos?.length) setMotivosCodigos(confirmadosOAgendados(b.motivosCodigos));
    setObs(b.obs ?? "");
    setInterno(b.interno ?? "");
    setInternos(b.internos ?? []);
    // Los trabajos de borradores anteriores no traen motivo: van bajo el primero.
    const primerMotivo = b.motivosCodigos?.[0] ?? "";
    setTrabajos((b.trabajos ?? []).map((t) => ({ ...t, motivo: t.motivo || primerMotivo })));
    setProblemas(b.problemas ?? []);
    setResoluciones(b.resoluciones ?? {});
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
    reservarIdsHasta(Math.max(...usados.map((n) => n + 1), 1));
  }, [confirmadosOAgendados]);

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

    // Lo guardado con el formato anterior (sin usuario) de esta visita pasa a este usuario.
    migrarClavesViejas(uid, [visita.folio]);
    const local = leerBorrador(uid, visita.folio);
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

    const enCola = leerActaEnCola(uid, visita.folio);
    if (enCola) setPendiente({ capturadaEn: enCola.capturadaEn, intentos: enCola.intentos });
    setOtrasPendientes(actasEnCola(uid).filter((a) => a.folio !== visita.folio).length);
    setConSenal(hayConexion());
    setListo(true);
  }, [uid, visita.folio, borradorServidor, aplicarBorrador, edicion]);

  // Guardado en el celular: al ritmo al que se escribe, no en cada tecla.
  useEffect(() => {
    if (edicion || !listo || paso === "ok" || paso === "encolada") return;
    const t = setTimeout(() => {
      const b = construirBorrador();
      if (!borradorConDatos(b)) return;
      const ok = escribirBorrador(uid, b);
      if (!ok) return;
      const guardado = leerBorrador(uid, visita.folio);
      borradorRef.current = guardado ?? b;
      setRespaldo({ guardadoEn: b.guardadoEn, sinFotos: Boolean(guardado?.sinFotos) });
    }, 800);
    return () => clearTimeout(t);
  }, [uid, edicion, listo, paso, construirBorrador, visita.folio]);

  // Respaldo en el servidor: cada tanto y solo si hay señal. Las fotos no
  // suben acá —pesan demasiado para mandarlas cada medio minuto—, así que la
  // copia del servidor recupera el texto y no las imágenes.
  useEffect(() => {
    if (edicion || !listo || paso === "ok" || paso === "encolada") return;
    const id = setInterval(() => {
      const b = borradorRef.current;
      if (!b || !hayConexion() || subidoRef.current === b.guardadoEn || bloqueoRef.current) return;
      subidoRef.current = b.guardadoEn;
      void guardarBorradorAction(visita.folio, JSON.stringify({ ...b, fotos: [], sinFotos: true }))
        .then((r) => {
          if (r.reservaAjena) perderReserva(r.reservaAjena);
        })
        .catch(() => {
          // Sin señal o servidor caído: el borrador del celular sigue intacto.
          subidoRef.current = "";
        });
    }, CADA_CUANTO_SUBE);
    return () => clearInterval(id);
  }, [edicion, listo, paso, visita.folio, perderReserva]);

  // ── Reserva del acta ──────────────────────────────────────────────────────
  //
  // Abrir el formulario ya tomó la reserva (la toma el servidor al armar la
  // página). Acá se mantiene: mientras haya actividad —tocar, escribir, subir
  // un video— se avisa al servidor cada tanto, y al volver a la pantalla se
  // avisa de inmediato, que es cuando uno se entera de que el otro técnico la
  // tomó. Una pantalla abierta y olvidada NO renueva: a los 15 minutos sin
  // actividad la reserva vence sola.

  const ultimaActividadRef = useRef(0);
  const ultimoAvisoRef = useRef(0);
  const subiendoRef = useRef(false);
  subiendoRef.current = videos.some((v) => v.progreso !== null && !v.error);

  /** Cualquier cambio en el formulario o en los videos es actividad. */
  useEffect(() => {
    ultimaActividadRef.current = Date.now();
  }, [construirBorrador, videos]);

  const avisarReserva = useCallback(async () => {
    if (bloqueoRef.current) return;
    ultimoAvisoRef.current = Date.now();
    try {
      const r = await renovarReservaAction(visita.folio);
      if (r.reservaAjena) perderReserva(r.reservaAjena);
    } catch {
      // Sin señal: se vuelve a avisar en el próximo intento. Nada se pierde.
    }
  }, [visita.folio, perderReserva]);

  useEffect(() => {
    if (edicion || !listo || paso === "ok") return;
    const cadaCuanto = intervaloAvisoMs(reservaPlazoSeg);
    const puedeAvisar = () => document.visibilityState === "visible" && hayConexion();
    // Al abrir: si la reserva se soltó entre el servidor y acá, se vuelve a tomar.
    void avisarReserva();
    const marcar = () => {
      const ahoraMs = Date.now();
      ultimaActividadRef.current = ahoraMs;
      // La primera actividad tras una pausa renueva al instante, sin esperar al reloj.
      if (ahoraMs - ultimoAvisoRef.current >= cadaCuanto && puedeAvisar()) void avisarReserva();
    };
    const id = setInterval(() => {
      if (!puedeAvisar()) return;
      if (
        debeRenovar({
          ultimaActividadMs: ultimaActividadRef.current,
          ultimoAvisoMs: ultimoAvisoRef.current,
          subiendo: subiendoRef.current,
        })
      ) {
        void avisarReserva();
      }
    }, cadaCuanto);
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      ultimaActividadRef.current = Date.now();
      void avisarReserva();
    };
    const eventos = ["pointerdown", "keydown", "touchstart", "scroll", "input"] as const;
    for (const e of eventos) window.addEventListener(e, marcar, { passive: true, capture: true });
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(id);
      for (const e of eventos) window.removeEventListener(e, marcar, { capture: true });
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [edicion, listo, paso, reservaPlazoSeg, avisarReserva]);

  // Salir del formulario suelta la reserva: el otro técnico no espera el plazo.
  useEffect(() => {
    if (edicion) return;
    const folio = visita.folio;
    return () => {
      void liberarReservaAction(folio).catch(() => {
        // Si no se pudo soltar, vence sola.
      });
    };
  }, [edicion, visita.folio]);

  // Al perder el acta se deja a salvo lo escrito al instante, sin esperar al
  // guardado con pausa de arriba.
  useEffect(() => {
    if (!bloqueo || edicion) return;
    const b = construirBorrador();
    if (borradorConDatos(b)) escribirBorrador(uid, b);
    // Solo cuando aparece el bloqueo; después no se vuelve a escribir encima.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloqueo]);

  /** "Intentar recuperarla": si el otro técnico ya la soltó o venció, vuelve a ser de este. */
  const recuperarReserva = useCallback(async () => {
    if (bloqueoRef.current?.tipo !== "reserva") return;
    try {
      const r = await renovarReservaAction(visita.folio);
      if (r.ok) {
        ultimoAvisoRef.current = Date.now();
        setBloqueo(null);
        aviso("Recuperaste el acta");
      } else if (r.reservaAjena) {
        setBloqueo({ tipo: "reserva", reserva: r.reservaAjena });
        aviso("Sigue en curso por el otro técnico");
      } else {
        aviso("No se pudo comprobar. Revisa la señal e inténtalo otra vez");
      }
    } catch {
      aviso("Sin señal: no se pudo comprobar");
    }
  }, [visita.folio, aviso]);

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
    (!!guardadas.sucursal || !faltaEnSeccion("sucursal")) &&
    (!!guardadas.motivo || !faltaEnSeccion("motivo")) &&
    sinResponder.length === 0;
  // Al editar la firma ya está en el acta y no se pide de nuevo; lo que sí se
  // pide es el porqué del cambio.
  const motivoEdicionListo = motivoEdicion.trim().length >= 5;
  const puedeGuardar = puedeRevisar && (edicion ? motivoEdicionListo : !!firma) && !guardando;

  const falta = useMemo(() => {
    const f: string[] = [];
    if (!guardadas.sucursal) f.push("los datos del responsable");
    if (!guardadas.motivo) f.push("el motivo");
    if (sinResponder.length) f.push("responder si quedaron solucionados los problemas que venías a resolver");
    if (edicion) {
      if (!motivoEdicionListo) f.push("escribir por qué se edita el acta");
    } else if (!firma) f.push("la firma de la tienda");
    return f;
  }, [guardadas.sucursal, guardadas.motivo, sinResponder.length, firma, edicion, motivoEdicionListo]);

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
      responsableCargo: respCargo.trim() || null,
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
      resoluciones: porResolver
        .filter((p) => resoluciones[p.id] !== undefined)
        .map((p) => ({ problemaId: p.id, resuelto: resoluciones[p.id] })),
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

        // El otro técnico tiene el acta reservada o ya cerró la visita: nada se
        // guardó en el servidor. El borrador y el acta en cola NO se tocan.
        if (!res.ok && res.reservaAjena) {
          perderReserva(res.reservaAjena);
          return false;
        }
        if (!res.ok && res.cerradaPorOtro) {
          // Si el acta salía directo del formulario, queda en el celular igual
          // que una sin señal para que no dependa solo del borrador.
          if (!leerActaEnCola(uid, visita.folio)) {
            encolarActa(uid, { folio: visita.folio, capturadaEn, intentos: 0, ultimoError: res.error ?? null, entrada });
          }
          setBloqueo({ tipo: "cerrada" });
          return false;
        }

        if (!res.ok) {
          // El caso del acta que sí había llegado: se cortó la señal justo al
          // recibir la respuesta, el acta quedó encolada y al reintentar el
          // servidor contesta que la visita ya está cerrada. No es un fallo:
          // está guardada, solo hay que dejar de insistir.
          if (/ya (quedó|está) cerrada/i.test(res.error ?? "")) {
            sacarDeCola(uid, visita.folio);
            borrarBorrador(uid, visita.folio);
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
          sacarDeCola(uid, visita.folio);
          setPendiente(null);
          setErrorGuardado(res.error ?? "No se pudo guardar la visita.");
          setPaso("preview");
          aviso(res.error ?? "No se pudo guardar la visita");
          return false;
        }

        sacarDeCola(uid, visita.folio);
        borrarBorrador(uid, visita.folio);
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
        const enCola = leerActaEnCola(uid, visita.folio);
        const intentos = (enCola?.intentos ?? 0) + 1;
        const guardada = encolarActa(uid, {
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
    [uid, visita.folio, aviso, router, perderReserva]
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
      responsableCargo: cargos.length || respCargo ? respCargo.trim() || null : undefined,
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
    if (bloqueo) return;
    const entrada = armarEntrada();
    if (!entrada) return aviso("Falta la firma de la tienda");

    setGuardando(true);
    const capturadaEn = new Date().toISOString();
    const salio = await enviarActa(entrada, capturadaEn, !hayConexion());
    setGuardando(false);
    if (!salio && leerActaEnCola(uid, visita.folio)) setPaso("encolada");
  }

  /** "Enviar ahora" y el reintento automático: los dos pasan por acá. */
  const reintentarPendiente = useCallback(
    async (avisarSiFalla: boolean) => {
      const enCola = leerActaEnCola(uid, visita.folio);
      if (!enCola) {
        setPendiente(null);
        return;
      }
      const salio = await enviarActa(enCola.entrada, enCola.capturadaEn, true);
      if (salio) aviso("Acta sincronizada");
      else if (avisarSiFalla) aviso("Todavía no hay señal. Sigue guardada en el celular.");
    },
    [uid, visita.folio, enviarActa, aviso]
  );

  // Reintento solo: al volver la señal y, si no, cada tanto.
  useEffect(() => {
    if (!pendiente || enviando || bloqueo) return;
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
  }, [pendiente, enviando, bloqueo, reintentarPendiente]);

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
      // Los problemas nuevos son opcionales; los que venía a resolver necesitan respuesta.
      case "problemas":
        return sinResponder.length ? FALTA_RESOLUCION : null;
      // Comentario interno y fotos son opcionales.
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

  const trbSel = catalogoTrabajo.find((t) => t.codigo === nt.codigo) ?? null;
  // En la hoja de trabajo solo van los que el checklist asignó a este motivo.
  const ofrecidos = trabajosDelMotivo(catalogoTrabajo, nt.motivo);
  const yaAgregado = (codigo: string) => trabajos.some((t) => t.codigo === codigo && motivoDe(t) === nt.motivo);
  const filaTrabajo = (t: (typeof ofrecidos)[number]) => {
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
  };
  const probSel = catalogoProblema.find((p) => p.codigo === np.codigo) ?? null;
  const probTieneOpciones = !!probSel && probSel.opciones.length > 0;
  const probListo = !!np.codigo && (probTieneOpciones ? np.items.length > 0 : !!np.desc.trim());
  const errorRut = mensajeRut(respRut);
  const sucursalCompleta = !!respNombre.trim() && rutCompleto(respRut) && !errorRut && telCompleto(respTel);

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
    setFotos((prev) => [...prev, { id: nuevoId(), src: reducida, interno: interna }]);
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

  return {
    visita,
    motivos,
    catalogoTrabajo,
    catalogoProblema,
    catalogoInterno,
    borradorServidor,
    reservaPlazoSeg,
    edicion,
    router,
    uid,
    toast,
    aviso,
    bloqueo,
    recuperarReserva,
    puedeVideo,
    inicial,
    paso,
    setPaso,
    abierta,
    setAbierta,
    guardadas,
    setGuardadas,
    motivoEdicion,
    setMotivoEdicion,
    confirmar,
    setConfirmar,
    horaInicio,
    setHoraInicio,
    horaTermino,
    setHoraTermino,
    guardando,
    setGuardando,
    errorGuardado,
    setErrorGuardado,
    respNombre,
    setRespNombre,
    respRut,
    setRespRut,
    respTel,
    setRespTel,
    respCargo,
    setRespCargo,
    personasLocal,
    cargos,
    motivosAgendados,
    confirmadosOAgendados,
    motivosCodigos,
    setMotivosCodigos,
    obs,
    setObs,
    trabajos,
    setTrabajos,
    problemas,
    setProblemas,
    porResolver,
    resoluciones,
    setResoluciones,
    sinResponder,
    interno,
    setInterno,
    internos,
    setInternos,
    fotos,
    setFotos,
    videos,
    setVideos,
    firma,
    setFirma,
    sheet,
    setSheet,
    destinoMedia,
    setDestinoMedia,
    nt,
    setNt,
    np,
    setNp,
    verOtrosMotivos,
    setVerOtrosMotivos,
    listo,
    setListo,
    respaldo,
    setRespaldo,
    recuperado,
    setRecuperado,
    pendiente,
    setPendiente,
    enviando,
    setEnviando,
    conSenal,
    setConSenal,
    otrasPendientes,
    setOtrasPendientes,
    borradorRef,
    clipsRef,
    subidoRef,
    yaRecuperado,
    construirBorrador,
    aplicarBorrador,
    motivoDe,
    videosListos,
    trabajosVigentes,
    nGuardadas,
    puedeRevisar,
    motivoEdicionListo,
    puedeGuardar,
    falta,
    nombreMotivos,
    armarEntrada,
    enviarActa,
    armarEdicion,
    guardarEdicion,
    guardarVisita,
    reintentarPendiente,
    faltaEnSeccion,
    guardarSeccion,
    toggleSeccion,
    nombreTrabajo,
    nombreMotivo,
    nombreInterno,
    fotosTrabajo,
    fotosInternas,
    videosTrabajo,
    videosInternos,
    nombreProblema,
    trbSel,
    ofrecidos,
    yaAgregado,
    filaTrabajo,
    probSel,
    probTieneOpciones,
    probListo,
    errorRut,
    sucursalCompleta,
    cambiarCantidad,
    agregarFoto,
    onArchivos,
    abrirCamara,
    abrirVideo,
    pedirQuitarFoto,
    pedirQuitarVideo,
    abrirHojaTrabajo,
    desmarcarMotivo,
    agregarVideo,
    reintentarVideo,
    quitarVideo,
  };
}

/** Todo lo que el formulario expone a sus pantallas, secciones y hojas. */
export type FormularioVisitaApi = ReturnType<typeof useFormularioVisita>;
