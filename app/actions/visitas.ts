"use server";

import { revalidatePath } from "next/cache";
import { log } from "@/lib/log";
import { getSesion } from "@/lib/auth";
import { tiene } from "@/lib/permisos";
import {
  cambiarEstadoVisita,
  crearEIniciarVisita,
  getEquipoDeVisita,
  getVisitaCompletaPorFolio,
  guardarActa,
  iniciarVisita,
} from "@/lib/data/visitas";
import type { ActaEntrada } from "@/lib/contratos/acta";
import { registrarPersonaLocal } from "@/lib/data/personas-local";
import { getSucursal } from "@/lib/data/maestros";
import { cargoDelChecklist, listarMotivos } from "@/lib/data/catalogos";
import { algunoPideHora } from "@/lib/ui/motivos";
import { participaEnVisita } from "@/lib/ui/estado";
import { borrarBorrador } from "@/lib/data/borradores";
import { estadoDeReserva, liberarReserva } from "@/lib/data/reservas";
import { textoActaEnCurso, type ReservaAjena } from "@/lib/reserva";
import type { EstadoVisita } from "@/lib/types";
import { validar } from "@/lib/validacion/comun";
import { actaEntrada } from "@/lib/validacion/actas";
import { errorDeActa, motivoParaNoCerrar } from "@/lib/validacion/reglas-acta";
import { entradaCambiarEstado, entradaCrearVisitaTecnico, entradaFolio } from "@/lib/validacion/visitas";

export interface ResultadoAccion {
  ok: boolean;
  error?: string;
  /** Folio de la visita recién creada en terreno. */
  folio?: string;
  /** Hora con la que quedó sellado el cierre del acta. */
  horaTermino?: string;
  /** Otro técnico tiene el acta reservada: no se guardó nada y lo del celular sigue ahí. */
  reservaAjena?: ReservaAjena;
  /** El otro técnico ya cerró el acta de esta visita: la de este celular se conserva sin enviar. */
  cerradaPorOtro?: boolean;
}

/** Solo los técnicos de la visita (asignado y ayudante) pueden tocarla desde el móvil. */
async function visitaDelTecnico(folio: string) {
  const sesion = await getSesion();
  if (!sesion?.tecnico) return null;
  const visita = await getVisitaCompletaPorFolio(folio);
  if (!visita || !participaEnVisita(visita, sesion.tecnico.id)) return null;
  return { visita, sesion, tecnico: sesion.tecnico };
}

function revalidar(folio: string) {
  revalidatePath("/tecnico");
  revalidatePath("/tecnico/visitas");
  revalidatePath(`/tecnico/visitas/${folio}`);
  revalidatePath("/tecnico/perfil");
  revalidatePath("/admin", "layout");
}

function comoError(err: unknown, contexto: string): ResultadoAccion {
  log.error(contexto, { err });
  return { ok: false, error: "No se pudo guardar en el servidor. Revisa la conexión e inténtalo otra vez." };
}

/** "Iniciar visita" — deja la visita EN_CURSO antes de abrir el formulario. */
export async function iniciarVisitaAction(folioPedido: string): Promise<ResultadoAccion> {
  // El folio decide qué visita se busca: se valida antes. Sin una visita suya
  // la respuesta es la de siempre.
  const entrada = validar(entradaFolio, folioPedido, "iniciarVisita");
  if (!entrada.ok) return { ok: false, error: "No encontramos esa visita entre las tuyas." };
  const folio = entrada.datos;
  const contexto = await visitaDelTecnico(folio);
  if (!contexto) return { ok: false, error: "No encontramos esa visita entre las tuyas." };
  const { visita, sesion, tecnico } = contexto;

  try {
    // Quién la puede iniciar y si ya la tomó el otro se decide con la fila
    // bloqueada, no con lo que se leyó recién.
    const fallo = await iniciarVisita(folio, visita.responsableNombre, {
      tecnicoId: tecnico.id,
      usuarioId: sesion.usuario.id,
    });
    if (fallo) {
      revalidar(folio);
      return { ok: false, error: fallo.error };
    }
  } catch (err) {
    return comoError(err, "iniciarVisita");
  }
  revalidar(folio);
  return { ok: true };
}

/**
 * "Guardar visita": cierra el acta.
 *
 * Es la única escritura que hace el formulario del técnico. Hasta que se
 * aprieta este botón, lo que hay en pantalla no existe en ninguna parte; a
 * partir de acá la visita queda COMPLETADA y coordinación la ve al instante.
 */
export async function guardarActaAction(entradaPedida: ActaEntrada): Promise<ResultadoAccion> {
  const sesion = await getSesion();
  if (!sesion?.tecnico) return { ok: false, error: "Tu cuenta no tiene un técnico asociado." };
  const valida = validar(actaEntrada, entradaPedida, "guardarActa");
  if (!valida.ok) return { ok: false, error: valida.error };
  const entrada: ActaEntrada = valida.datos;
  const falta = errorDeActa(entrada);
  if (falta) return { ok: false, error: falta };
  const equipo = await getEquipoDeVisita(entrada.folio);
  if (!equipo) return { ok: false, error: "No encontramos esa visita." };
  // Quién puede escribir lo decide la reserva, que guardarActa comprueba con la
  // fila de la visita tomada: acá no se mira quién inició la visita.
  // Una visita ya cerrada la juzga guardarActa, que distingue si la cerró este
  // mismo técnico (el acta llegó y se perdió la respuesta) o el otro.
  const rechazo = motivoParaNoCerrar(equipo, sesion.tecnico.id, { conReserva: true });
  if (rechazo && equipo.estado !== "COMPLETADA") return { ok: false, error: rechazo };

  try {
    const res = await guardarActa(entrada, {
      usuarioId: sesion.usuario.id,
      tecnicoId: sesion.tecnico.id,
    });
    if (!res.ok) {
      return { ok: false, error: res.error, reservaAjena: res.reservaAjena, cerradaPorOtro: res.cerradaPorOtro };
    }
    // Quien firmó queda en la lista de la tienda para la próxima visita. El
    // acta ya está confirmada: si esto falla no puede devolverse "No se pudo
    // guardar", porque el técnico reintentaría sobre una visita ya cerrada.
    try {
      const cerrada = await getVisitaCompletaPorFolio(entrada.folio);
      if (cerrada) {
        await registrarPersonaLocal(cerrada.sucursalId, {
          nombre: entrada.responsableNombre,
          rut: entrada.responsableRut,
          telefono: entrada.responsableTelefono,
          cargo: await cargoDelChecklist(entrada.responsableCargo),
        });
      }
    } catch (err) {
      log.error("registrarPersonaLocal tras guardar el acta", { err });
    }
    // El acta ya está en sus tablas: el respaldo a medio llenar sobra, y si
    // quedara ahí la próxima visita a este folio lo ofrecería para recuperar.
    // Que falle no invalida el guardado.
    await borrarBorrador(entrada.folio, sesion.usuario.id).catch((err) =>
      log.error("borrarBorrador tras guardar el acta", { err })
    );
    // Sin revalidatePath a propósito: revalidar desde una acción hace que Next
    // vuelva a renderizar la página actual en la misma respuesta, y el
    // formulario de una visita ya COMPLETADA redirige al detalle, tapando la
    // pantalla «Visita guardada». Las páginas son dinámicas y no hay caché de
    // servidor que limpiar: al salir de la confirmación se cargan de nuevo.
    return { ok: true, horaTermino: res.horaTermino };
  } catch (err) {
    const texto = err instanceof Error ? err.message : String(err);
    if (/fk_vis_trab_catalogo|fk_problema_tipo|fk_ejecucion_motivo|fk_visita_motivo_catalogo/i.test(texto)) {
      return {
        ok: false,
        error: "El checklist cambió mientras llenabas el acta. Vuelve a entrar al formulario y revisa lo marcado.",
      };
    }
    return comoError(err, "guardarActa");
  }
}

/** Reagendar, dejar pendiente o cancelar desde "Otras acciones de la visita". */
export async function cambiarEstadoVisitaAction(pedido: {
  folio: string;
  estado: Extract<EstadoVisita, "REAGENDADA" | "PENDIENTE" | "CANCELADA">;
  motivo: string;
  fechaNueva?: string | null;
  horaNueva?: string | null;
}): Promise<ResultadoAccion> {
  // El folio decide qué visita se busca: se valida antes. Sin una visita suya
  // la respuesta es la de siempre.
  const entrada = validar(entradaCambiarEstado, pedido, "cambiarEstadoVisita");
  if (!entrada.ok) return { ok: false, error: entrada.error };
  const input = entrada.datos;
  const contexto = await visitaDelTecnico(input.folio);
  if (!contexto) return { ok: false, error: "No encontramos esa visita entre las tuyas." };
  if (!tiene(contexto.sesion.permisos, "celular.estado")) {
    return { ok: false, error: "Tu rol no puede reagendar, dejar pendiente ni cancelar visitas." };
  }
  const reserva = await estadoDeReserva(contexto.visita.id, contexto.tecnico.id);
  if (reserva.estado === "ajena") return { ok: false, error: textoActaEnCurso(reserva), reservaAjena: reserva };

  const motivo = input.motivo.trim();
  if (!motivo) return { ok: false, error: "El motivo es obligatorio." };
  if (input.estado === "REAGENDADA" && !input.fechaNueva) {
    return { ok: false, error: "Elige la nueva fecha." };
  }

  try {
    await cambiarEstadoVisita({
      folio: input.folio,
      estado: input.estado,
      motivo,
      fechaNueva: input.fechaNueva,
      horaNueva: input.horaNueva,
      origen: "MOVIL",
      usuarioId: contexto.sesion.usuario.id,
      tecnicoId: contexto.tecnico.id,
    });
  } catch (err) {
    return comoError(err, "cambiarEstadoVisita");
  }
  // La visita sale de la agenda del técnico: la reserva ya no sirve.
  await liberarReserva(input.folio, contexto.sesion.usuario.id);
  revalidar(input.folio);
  return { ok: true };
}

/**
 * "Agregar visita" desde el celular: la visita que el técnico hace fuera de su
 * planificación. Nace asignada a él y queda EN_CURSO para llenar el acta.
 */
export async function crearVisitaTecnicoAction(pedido: {
  sucursalId: number;
  /** El motivo principal: el primero que marcó el técnico. */
  motivoCodigo: string;
  /** Todos los motivos marcados. */
  motivosCodigos?: string[];
  fecha: string;
  hora: string | null;
  /** El compañero, cuando van dos técnicos al mismo local. */
  tecnicoAyudanteId?: number | null;
  responsableNombre: string;
  responsableRut: string;
  responsableTelefono: string;
  responsableCargo?: string;
  trabajo: string;
}): Promise<ResultadoAccion> {
  const sesion = await getSesion();
  if (!sesion?.tecnico) return { ok: false, error: "Tu cuenta no tiene un técnico asociado." };
  if (!tiene(sesion.permisos, "celular.crearVisita")) {
    return { ok: false, error: "Tu rol no puede agregar visitas desde el celular." };
  }
  const entrada = validar(entradaCrearVisitaTecnico, pedido, "crearVisitaTecnico");
  if (!entrada.ok) return { ok: false, error: entrada.error };
  const input = entrada.datos;

  const sucursal = await getSucursal(input.sucursalId);
  if (!sucursal) return { ok: false, error: "Elige la sucursal donde estás." };
  if (!input.motivoCodigo) return { ok: false, error: "Marca al menos un motivo de la visita." };
  if (!input.fecha) return { ok: false, error: "Elige la fecha de la visita." };
  // Basta con que una instalación esté entre los motivos marcados.
  const motivosVisita = input.motivosCodigos?.length ? input.motivosCodigos : [input.motivoCodigo];
  if (!input.hora && algunoPideHora(motivosVisita, await listarMotivos())) {
    return { ok: false, error: "La hora es obligatoria para instalaciones." };
  }
  if (input.tecnicoAyudanteId && input.tecnicoAyudanteId === sesion.tecnico.id) {
    return { ok: false, error: "El ayudante tiene que ser otro técnico, no tú." };
  }

  try {
    // Crear e iniciar van en una sola transacción: si iniciar falla no queda
    // una visita creada y sin iniciar.
    const res = await crearEIniciarVisita(
      {
        clienteId: sucursal.clienteId,
        sucursalId: sucursal.id,
        tecnicoId: sesion.tecnico.id,
        tecnicoAyudanteId: input.tecnicoAyudanteId ?? null,
        motivoCodigo: input.motivoCodigo,
        motivosCodigos: input.motivosCodigos,
        fechaProgramada: input.fecha,
        horaProgramada: input.hora,
        trabajoSolicitado: input.trabajo.trim() || "Visita agregada por el técnico, fuera de la planificación.",
        indicacionesAcceso: null,
        responsableNombre: input.responsableNombre || null,
        responsableRut: input.responsableRut || null,
        responsableTelefono: input.responsableTelefono || null,
        responsableCargo: input.responsableCargo || null,
        creadaEnTerreno: true,
      },
      { tecnicoId: sesion.tecnico.id, usuarioId: sesion.usuario.id }
    );
    if ("error" in res) return { ok: false, error: res.error };
    revalidar(res.folio);
    return { ok: true, folio: res.folio };
  } catch (err) {
    return comoError(err, "crearVisitaTecnico");
  }
}
