import type {
  Visita,
  VisitaEjecucion,
  VisitaTrabajo,
  Problema,
  VisitaFoto,
  VisitaFirma,
  Reagendamiento,
} from "@/lib/types";
import { getClienteById, getSucursalById, getTecnicoById, sucursales } from "./maestros";
import { getCatalogoMotivoByCodigo } from "./catalogos";

// Visitas V-2026-00001 … V-2026-00015 — 13-08-2026 es "hoy" en el prototipo.
// Copiadas de la sección 12 de sql/dmc_contingencia_sqlserver.sql.

interface VisitaSeed {
  id: number;
  folio: string;
  sucursalNombre: string;
  tecnicoNombre: string;
  motivo: string;
  estado: Visita["estado"];
  fecha: string;
  hora: string | null;
  trabajo: string;
  responsableNombre: string;
  responsableTelefono: string;
  motivoPendiente?: string;
}

const seeds: VisitaSeed[] = [
  { id: 1, folio: "V-2026-00001", sucursalNombre: "Mall Arauco Estación", tecnicoNombre: "Rodrigo Pinto", motivo: "REVISION", estado: "REAGENDADA", fecha: "2026-08-07", hora: null, trabajo: "Revisión de condiciones del pórtico principal.", responsableNombre: "Felipe Araya", responsableTelefono: "+56 9 6620 4417" },
  { id: 2, folio: "V-2026-00002", sucursalNombre: "Mall Alto Las Condes", tecnicoNombre: "Camila Torres", motivo: "CALIBRACION", estado: "COMPLETADA", fecha: "2026-08-08", hora: "10:00", trabajo: "Calibrar pórtico del acceso principal tras detección intermitente.", responsableNombre: "Carolina Díaz", responsableTelefono: "+56 9 7741 2093" },
  { id: 3, folio: "V-2026-00003", sucursalNombre: "Mall Plaza Norte", tecnicoNombre: "Daniela Fuentes", motivo: "REVISION", estado: "REAGENDADA", fecha: "2026-08-09", hora: null, trabajo: "Revisar pórtico sin energía tras corte del mall.", responsableNombre: "Paulina Vera", responsableTelefono: "+56 9 8123 4455" },
  { id: 4, folio: "V-2026-00004", sucursalNombre: "Mall Plaza Trébol", tecnicoNombre: "Ignacio Salas", motivo: "REVISION", estado: "COMPLETADA", fecha: "2026-08-10", hora: "14:00", trabajo: "Revisar detección de etiquetas blandas en acceso sur.", responsableNombre: "Rodrigo Muñoz", responsableTelefono: "+56 9 5512 8890" },
  { id: 5, folio: "V-2026-00005", sucursalNombre: "Mall Arauco Maipú", tecnicoNombre: "Ignacio Salas", motivo: "CALIBRACION", estado: "COMPLETADA", fecha: "2026-08-10", hora: "09:45", trabajo: "Recalibrar pórtico principal después de mover el mueble de cajas.", responsableNombre: "Felipe Araya", responsableTelefono: "+56 9 6620 4417" },
  { id: 6, folio: "V-2026-00006", sucursalNombre: "Mall Plaza Egaña", tecnicoNombre: "Camila Torres", motivo: "DES_INSTALACION", estado: "CANCELADA", fecha: "2026-08-11", hora: null, trabajo: "Desinstalar pórtico por cierre de local.", responsableNombre: "Carolina Díaz", responsableTelefono: "+56 9 7741 2093" },
  { id: 7, folio: "V-2026-00007", sucursalNombre: "Portal Ñuñoa", tecnicoNombre: "Camila Torres", motivo: "VISITA", estado: "COMPLETADA", fecha: "2026-08-11", hora: "11:30", trabajo: "Preventiva trimestral: limpieza, prueba de etiquetas y conteo de alarmas.", responsableNombre: "Paulina Vera", responsableTelefono: "+56 9 8123 4455" },
  { id: 8, folio: "V-2026-00008", sucursalNombre: "Mall Plaza Vespucio", tecnicoNombre: "Rodrigo Pinto", motivo: "INSTALACION", estado: "COMPLETADA", fecha: "2026-08-12", hora: "15:00", trabajo: "Instalar 2 pórticos AM en acceso principal.", responsableNombre: "Rodrigo Muñoz", responsableTelefono: "+56 9 5512 8890" },
  { id: 9, folio: "V-2026-00009", sucursalNombre: "Mall Marina Arauco", tecnicoNombre: "Rodrigo Pinto", motivo: "RE_INSTALACION", estado: "PENDIENTE", fecha: "2026-08-12", hora: "10:15", trabajo: "Reinstalar pórtico retirado por obras del mall.", responsableNombre: "Felipe Araya", responsableTelefono: "+56 9 6620 4417", motivoPendiente: "Falta la tarjeta electrónica; quedó cotizada el 06-08 y no llegó a bodega." },
  { id: 10, folio: "V-2026-00010", sucursalNombre: "Mall Plaza Oeste", tecnicoNombre: "Daniela Fuentes", motivo: "REVISION", estado: "REAGENDADA", fecha: "2026-08-12", hora: null, trabajo: "Revisar alarmas falsas en caja 3.", responsableNombre: "Carolina Díaz", responsableTelefono: "+56 9 7741 2093" },
  { id: 11, folio: "V-2026-00011", sucursalNombre: "Mall Plaza Norte", tecnicoNombre: "Daniela Fuentes", motivo: "CALIBRACION", estado: "COMPLETADA", fecha: "2026-08-13", hora: "08:30", trabajo: "Calibrar antenas y revisar contador de personas.", responsableNombre: "Paulina Vera", responsableTelefono: "+56 9 8123 4455" },
  { id: 12, folio: "V-2026-00012", sucursalNombre: "Mall Plaza Tobalaba", tecnicoNombre: "Harold Peralta", motivo: "CALIBRACION", estado: "PROGRAMADA", fecha: "2026-08-13", hora: null, trabajo: "3 antenas EAS con falsa alarma cada 10 min. Calibrar y registrar la ganancia.", responsableNombre: "Paulina Vera", responsableTelefono: "+56 9 8123 4455" },
  { id: 13, folio: "V-2026-00013", sucursalNombre: "Costanera Center", tecnicoNombre: "Harold Peralta", motivo: "INSTALACION", estado: "PROGRAMADA", fecha: "2026-08-13", hora: "11:00", trabajo: "Instalar 2 pórticos AM en acceso principal y 1 contador de personas en caja.", responsableNombre: "Rodrigo Muñoz", responsableTelefono: "+56 9 5512 8890" },
  { id: 14, folio: "V-2026-00014", sucursalNombre: "Paseo Ahumada", tecnicoNombre: "Harold Peralta", motivo: "VISITA", estado: "PROGRAMADA", fecha: "2026-08-13", hora: null, trabajo: "Preventiva trimestral: limpieza de pórticos y prueba de etiquetas.", responsableNombre: "Carolina Díaz", responsableTelefono: "+56 9 7741 2093" },
  { id: 15, folio: "V-2026-00015", sucursalNombre: "Parque Arauco", tecnicoNombre: "Harold Peralta", motivo: "REVISION", estado: "EN_CURSO", fecha: "2026-08-13", hora: "09:00", trabajo: "Revisar los 2 pórticos del acceso oriente: alarmas sin producto.", responsableNombre: "Felipe Araya", responsableTelefono: "+56 9 6620 4417" },
  // Visitas ya cerradas por Harold — alimentan "Mis visitas realizadas" del perfil.
  { id: 16, folio: "V-2026-00016", sucursalNombre: "Mall Plaza Egaña", tecnicoNombre: "Harold Peralta", motivo: "VISITA", estado: "COMPLETADA", fecha: "2026-08-12", hora: "07:10", trabajo: "Preventiva trimestral: limpieza, revisión de conexiones y prueba con etiqueta patrón.", responsableNombre: "Carolina Díaz", responsableTelefono: "+56 9 7741 2093" },
  { id: 17, folio: "V-2026-00017", sucursalNombre: "Mall Alto Las Condes", tecnicoNombre: "Harold Peralta", motivo: "CALIBRACION", estado: "COMPLETADA", fecha: "2026-08-12", hora: "16:40", trabajo: "Cambiar la fuente del pórtico 1 y recalibrar después del cambio.", responsableNombre: "Paulina Vera", responsableTelefono: "+56 9 8123 4455" },
  { id: 18, folio: "V-2026-00018", sucursalNombre: "Mall Plaza Vespucio", tecnicoNombre: "Harold Peralta", motivo: "REVISION", estado: "COMPLETADA", fecha: "2026-08-11", hora: "11:20", trabajo: "Revisar condiciones del acceso principal y dejar registro del conteo de alarmas.", responsableNombre: "Rodrigo Muñoz", responsableTelefono: "+56 9 5512 8890" },
  { id: 19, folio: "V-2026-00019", sucursalNombre: "Portal Ñuñoa", tecnicoNombre: "Harold Peralta", motivo: "INSTALACION", estado: "COMPLETADA", fecha: "2026-08-10", hora: "09:05", trabajo: "Instalar pórtico nuevo y contador de personas en el acceso principal.", responsableNombre: "Paulina Vera", responsableTelefono: "+56 9 8123 4455" },
  { id: 20, folio: "V-2026-00020", sucursalNombre: "Mall Arauco Maipú", tecnicoNombre: "Harold Peralta", motivo: "RE_INSTALACION", estado: "PENDIENTE", fecha: "2026-08-06", hora: "15:15", trabajo: "Reinstalar el pórtico que se retiró por obras del acceso.", responsableNombre: "Felipe Araya", responsableTelefono: "+56 9 6620 4417", motivoPendiente: "Falta tarjeta electrónica cotizada el 06-08; el pórtico quedó en bodega de la tienda." },
  { id: 21, folio: "V-2026-00021", sucursalNombre: "Mall Plaza Oeste", tecnicoNombre: "Harold Peralta", motivo: "CALIBRACION", estado: "COMPLETADA", fecha: "2026-08-03", hora: "10:30", trabajo: "Calibrar las 4 antenas y capacitar al turno de tarde en el uso del desactivador.", responsableNombre: "Carolina Díaz", responsableTelefono: "+56 9 7741 2093" },
];

function addMinutes(fecha: string, hora: string, minutos: number): string {
  const [h, m] = hora.split(":").map(Number);
  const base = new Date(`${fecha}T00:00:00`);
  base.setMinutes(h * 60 + m + minutos);
  const hh = String(base.getHours()).padStart(2, "0");
  const mm = String(base.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export const visitas: Visita[] = seeds.map((s) => {
  const sucursal = sucursales.find((su) => su.nombre === s.sucursalNombre)!;
  const tecnico = getTecnicoById(
    { "Harold Peralta": 1, "Daniela Fuentes": 2, "Rodrigo Pinto": 3, "Camila Torres": 4, "Ignacio Salas": 5 }[
      s.tecnicoNombre
    ]!
  )!;
  return {
    id: s.id,
    folio: s.folio,
    clienteId: sucursal.clienteId,
    sucursalId: sucursal.id,
    tecnicoId: tecnico.id,
    motivoCodigo: s.motivo,
    estado: s.estado,
    fechaProgramada: s.fecha,
    horaProgramada: s.hora,
    trabajoSolicitado: s.trabajo,
    indicacionesAcceso: null,
    responsableNombre: s.responsableNombre,
    responsableTelefono: s.responsableTelefono,
    motivoPendiente: s.motivoPendiente ?? null,
    problemaOrigenId: null,
    creadaEnTerreno: false,
    creadoEn: "2026-08-01T09:00:00",
  };
});

function findVisita(folio: string): Visita {
  return visitas.find((v) => v.folio === folio)!;
}

// visita_ejecucion — para todas las visitas con estado <> PROGRAMADA
const comentarioInterno: Record<string, string> = {
  "V-2026-00009": "El encargado pide avisar con una hora de anticipación: el acceso de servicio se cierra a las 18:00.",
  "V-2026-00015": "El encargado pide avisar con una hora de anticipación: el acceso de servicio se cierra a las 18:00.",
};

export const ejecuciones: Record<number, VisitaEjecucion> = {};
for (const s of seeds) {
  if (s.estado === "PROGRAMADA") continue;
  const horaInicio = s.hora ?? "09:30";
  const enCurso = s.estado === "EN_CURSO";
  const completada = s.estado === "COMPLETADA";
  ejecuciones[s.id] = {
    visitaId: s.id,
    horaInicio: `${s.fecha}T${horaInicio}:00`,
    horaTermino: enCurso ? null : `${s.fecha}T${addMinutes(s.fecha, horaInicio, 65)}:00`,
    responsableNombre: s.responsableNombre,
    responsableRut: "17.004.556-K",
    responsableTelefono: s.responsableTelefono,
    motivoRealCodigo: s.motivo,
    observaciones: completada
      ? "Trabajo recibido conforme por la tienda. Se dejó el sector limpio y se explicó al encargado el uso del control de prueba."
      : "Observaciones aún no cerradas por el técnico.",
    comentarioInterno: comentarioInterno[s.folio] ?? null,
    dispositivo: "Android · app 1.4.2",
    appVersion: "1.4.2",
    registradoOffline: false,
    sincronizadoEn: completada ? `${s.fecha}T${addMinutes(s.fecha, horaInicio, 70)}:00` : null,
  };
}

// visita_trabajo + visita_trabajo_subtrabajo (sección "Trabajos realizados")
let trabajoAutoId = 1;
const trabajosSeed: { folio: string; codigo: string; detalle: string | null; orden: number; sub: { etiqueta: string; cantidad: number; orden: number }[] }[] = [
  { folio: "V-2026-00002", codigo: "CALIBRACION_ANTENAS", detalle: "Ganancia dejada en 66% tras cambiar el cable de antena.", orden: 1, sub: [{ etiqueta: "Pórtico 1", cantidad: 1, orden: 1 }] },
  { folio: "V-2026-00002", codigo: "CAMBIO_REPUESTO", detalle: null, orden: 2, sub: [{ etiqueta: "Antena completa", cantidad: 1, orden: 1 }] },
  { folio: "V-2026-00004", codigo: "MANTENCION", detalle: "Prueba con etiqueta patrón en los tres accesos.", orden: 1, sub: [{ etiqueta: "Prueba con etiqueta patrón", cantidad: 1, orden: 1 }] },
  { folio: "V-2026-00005", codigo: "CALIBRACION_ANTENAS", detalle: null, orden: 1, sub: [{ etiqueta: "Pórtico 1", cantidad: 1, orden: 1 }] },
  { folio: "V-2026-00005", codigo: "CAPACITACION", detalle: "Se explicó al encargado el uso del control de prueba.", orden: 2, sub: [] },
  { folio: "V-2026-00007", codigo: "MANTENCION", detalle: null, orden: 1, sub: [
    { etiqueta: "Limpieza interna", cantidad: 1, orden: 1 },
    { etiqueta: "Revisión de conexiones", cantidad: 1, orden: 2 },
    { etiqueta: "Prueba con etiqueta patrón", cantidad: 1, orden: 3 },
  ] },
  { folio: "V-2026-00008", codigo: "INSTALACION_EQUIPO", detalle: "2 pórticos AM en el acceso principal, fijados a piso.", orden: 1, sub: [{ etiqueta: "Pórtico nuevo", cantidad: 2, orden: 1 }] },
  { folio: "V-2026-00008", codigo: "CALIBRACION_ANTENAS", detalle: null, orden: 2, sub: [
    { etiqueta: "Pórtico 1", cantidad: 1, orden: 1 },
    { etiqueta: "Pórtico 2", cantidad: 1, orden: 2 },
  ] },
  { folio: "V-2026-00009", codigo: "RETIRO_EQUIPO", detalle: "El pórtico quedó en bodega de la tienda por obras del mall.", orden: 1, sub: [{ etiqueta: "Pórtico completo", cantidad: 1, orden: 1 }] },
  { folio: "V-2026-00011", codigo: "CALIBRACION_ANTENAS", detalle: null, orden: 1, sub: [{ etiqueta: "Antena AM", cantidad: 1, orden: 1 }] },
  { folio: "V-2026-00011", codigo: "MANTENCION", detalle: "Se revisó el contador antes de dejarlo en observación.", orden: 2, sub: [{ etiqueta: "Ajuste de sensibilidad", cantidad: 1, orden: 1 }] },
  { folio: "V-2026-00015", codigo: "MANTENCION", detalle: null, orden: 1, sub: [{ etiqueta: "Revisión de conexiones", cantidad: 1, orden: 1 }] },
  { folio: "V-2026-00016", codigo: "MANTENCION", detalle: "Los 2 pórticos quedaron detectando a 1,2 m.", orden: 1, sub: [
    { etiqueta: "Limpieza interna", cantidad: 1, orden: 1 },
    { etiqueta: "Revisión de conexiones", cantidad: 1, orden: 2 },
    { etiqueta: "Prueba con etiqueta patrón", cantidad: 1, orden: 3 },
  ] },
  { folio: "V-2026-00017", codigo: "CAMBIO_REPUESTO", detalle: "Se reemplazó la fuente del pórtico 1.", orden: 1, sub: [{ etiqueta: "Fuente de poder", cantidad: 1, orden: 1 }] },
  { folio: "V-2026-00017", codigo: "CALIBRACION_ANTENAS", detalle: null, orden: 2, sub: [{ etiqueta: "Pórtico 1", cantidad: 1, orden: 1 }] },
  { folio: "V-2026-00018", codigo: "MANTENCION", detalle: null, orden: 1, sub: [
    { etiqueta: "Ajuste de sensibilidad", cantidad: 1, orden: 1 },
    { etiqueta: "Revisión de conexiones", cantidad: 1, orden: 2 },
  ] },
  { folio: "V-2026-00019", codigo: "INSTALACION_EQUIPO", detalle: "Instalación completa en acceso principal.", orden: 1, sub: [
    { etiqueta: "Pórtico nuevo", cantidad: 1, orden: 1 },
    { etiqueta: "Contador de personas", cantidad: 1, orden: 2 },
  ] },
  { folio: "V-2026-00020", codigo: "RETIRO_EQUIPO", detalle: "El pórtico quedó en bodega de la tienda.", orden: 1, sub: [{ etiqueta: "Pórtico completo", cantidad: 1, orden: 1 }] },
  { folio: "V-2026-00021", codigo: "CALIBRACION_ANTENAS", detalle: null, orden: 1, sub: [
    { etiqueta: "Pórtico 1", cantidad: 1, orden: 1 },
    { etiqueta: "Pórtico 2", cantidad: 1, orden: 2 },
    { etiqueta: "Antena AM", cantidad: 1, orden: 3 },
  ] },
  { folio: "V-2026-00021", codigo: "CAPACITACION", detalle: "Se capacitó al turno de tarde en el uso del desactivador.", orden: 2, sub: [] },
];

export const trabajosPorVisita: Record<number, VisitaTrabajo[]> = {};
for (const t of trabajosSeed) {
  const visita = findVisita(t.folio);
  const trabajoId = trabajoAutoId++;
  const trabajo: VisitaTrabajo = {
    id: trabajoId,
    visitaId: visita.id,
    trabajoCodigo: t.codigo,
    detalle: t.detalle,
    orden: t.orden,
    subtrabajos: t.sub.map((s, i) => ({
      id: i + 1,
      visitaTrabajoId: trabajoId,
      etiqueta: s.etiqueta,
      cantidad: s.cantidad,
      orden: s.orden,
    })),
  };
  (trabajosPorVisita[visita.id] ??= []).push(trabajo);
}

// problema + problema_item (sección "Problemas levantados")
let problemaAutoId = 1;
const problemasSeed: { folio: string; tipo: string; estado: Problema["estado"]; descripcion: string; solucion: string; orden: number; items: { etiqueta: string; cantidad: number }[] }[] = [
  { folio: "V-2026-00015", tipo: "FALSA_ALARMA", estado: "ABIERTO", descripcion: "Pórtico del acceso oriente suena sin producto cada 10 minutos desde el lunes.", solucion: "Bajar ganancia y reubicar el sensor derecho; queda en revisión con la tienda.", orden: 1, items: [{ etiqueta: "Pórtico 1", cantidad: 1 }] },
  { folio: "V-2026-00011", tipo: "DESCALIBRACION", estado: "RESUELTO", descripcion: "Antena izquierda con ganancia sobre el rango recomendado.", solucion: "Ganancia ajustada a 68% y prueba con etiqueta patrón conforme.", orden: 1, items: [{ etiqueta: "Pórtico 1", cantidad: 1 }] },
  { folio: "V-2026-00011", tipo: "CONTADOR_FALLA", estado: "PENDIENTE", descripcion: "Contador de personas marca la mitad del flujo real en horario punta.", solucion: "Se solicitó sensor de recambio a bodega; queda cotizado.", orden: 2, items: [{ etiqueta: "Sensor", cantidad: 1 }] },
  { folio: "V-2026-00010", tipo: "FALSA_ALARMA", estado: "ABIERTO", descripcion: "Alarmas falsas en caja 3 cada vez que pasa el carro de reposición.", solucion: "No se pudo intervenir: la tienda estaba en inventario. Se reagendó.", orden: 1, items: [] },
  { folio: "V-2026-00009", tipo: "PLACAS_DANADAS", estado: "PENDIENTE", descripcion: "Placa Master del pórtico 2 quemada; el equipo no enciende.", solucion: "Tarjeta cotizada el 06-08, sin llegada a bodega. La visita queda pendiente.", orden: 1, items: [{ etiqueta: "Master 9000", cantidad: 1 }, { etiqueta: "TX MDG", cantidad: 2 }] },
  { folio: "V-2026-00009", tipo: "ANTENA_NO_DETECTA", estado: "ABIERTO", descripcion: "Pórtico 1 no detecta etiquetas AM a menos de 40 cm.", solucion: "Depende del cambio de tarjeta del pórtico 2 para poder recalibrar.", orden: 2, items: [] },
  { folio: "V-2026-00008", tipo: "CABLE_DANADO", estado: "RESUELTO", descripcion: "Tramo de 40 cm de cable a la vista en zona de cajas, con riesgo de tirón.", solucion: "Se cubrió con canaleta de 20 mm y se dejó registro fotográfico.", orden: 1, items: [] },
  { folio: "V-2026-00008", tipo: "ANTENA_NO_DETECTA", estado: "RESUELTO", descripcion: "Antena nueva sin detección tras la instalación.", solucion: "Se corrigió el conector del lazo y se validó con etiqueta patrón.", orden: 2, items: [] },
  { folio: "V-2026-00007", tipo: "CONTADOR_FALLA", estado: "PENDIENTE", descripcion: "Contador de personas se reinicia solo dos veces al día.", solucion: "Se sugiere cambio de fuente; queda a la espera de aprobación del cliente.", orden: 1, items: [] },
  { folio: "V-2026-00005", tipo: "DESCALIBRACION", estado: "RESUELTO", descripcion: "Pórtico principal descalibrado tras mover el mueble de cajas.", solucion: "Recalibrado y fijado; se explicó al encargado el uso del control de prueba.", orden: 1, items: [] },
  { folio: "V-2026-00005", tipo: "FALSA_ALARMA", estado: "ABIERTO", descripcion: "Falsos positivos con carros metálicos en el acceso norte.", solucion: "Se sugiere reubicar el pórtico 60 cm hacia el interior; requiere obra menor.", orden: 2, items: [] },
  { folio: "V-2026-00004", tipo: "ANTENA_NO_DETECTA", estado: "ABIERTO", descripcion: "Pórtico del acceso sur no detecta etiquetas blandas.", solucion: "Se sugiere cambio de lazo receptor; cotización enviada a coordinación.", orden: 1, items: [] },
  { folio: "V-2026-00003", tipo: "SIN_ENERGIA", estado: "ABIERTO", descripcion: "El pórtico quedó sin alimentación tras el corte de energía del mall.", solucion: "Requiere que el mall habilite el circuito; visita reagendada.", orden: 1, items: [] },
  { folio: "V-2026-00002", tipo: "ANTENA_NO_DETECTA", estado: "RESUELTO", descripcion: "Detección intermitente en el pórtico del acceso principal.", solucion: "Se reemplazó el cable de antena y se recalibró.", orden: 1, items: [] },
  { folio: "V-2026-00001", tipo: "PLACAS_DANADAS", estado: "PENDIENTE", descripcion: "Placa del contador con falla intermitente.", solucion: "Repuesto solicitado; se dejó el contador desconectado para evitar datos erróneos.", orden: 1, items: [{ etiqueta: "Slave 9000", cantidad: 1 }] },
  { folio: "V-2026-00018", tipo: "FALSA_ALARMA", estado: "ABIERTO", descripcion: "Pórtico 1 alarma sin producto cada 15 min; se sospecha interferencia del refrigerador nuevo de la caja 2.", solucion: "Queda en observación del turno de tarde durante la semana.", orden: 1, items: [{ etiqueta: "Pórtico 1", cantidad: 1 }] },
  { folio: "V-2026-00020", tipo: "PLACAS_DANADAS", estado: "PENDIENTE", descripcion: "No se pudo reinstalar: falta la tarjeta electrónica cotizada el 06-08.", solucion: "A la espera de que bodega confirme la llegada del repuesto.", orden: 1, items: [{ etiqueta: "Master 9000", cantidad: 1 }] },
  { folio: "V-2026-00021", tipo: "CONTADOR_FALLA", estado: "ABIERTO", descripcion: "El desactivador de la caja 3 falla con etiquetas duras.", solucion: "Queda en observación del turno de reposición; se sugiere cambio de fuente.", orden: 1, items: [{ etiqueta: "Fuente", cantidad: 1 }] },
];

export const problemasPorVisita: Record<number, Problema[]> = {};
export const todosLosProblemas: Problema[] = [];
for (const p of problemasSeed) {
  const visita = findVisita(p.folio);
  const id = problemaAutoId++;
  const problema: Problema = {
    id,
    visitaId: visita.id,
    tipoCodigo: p.tipo,
    estado: p.estado,
    descripcion: p.descripcion,
    solucion: p.solucion,
    orden: p.orden,
    resueltoEn: p.estado === "RESUELTO" ? `${visita.fechaProgramada}T12:00:00` : null,
    creadoEn: `${visita.fechaProgramada}T${visita.horaProgramada ?? "09:30"}:00`,
    items: p.items.map((it, i) => ({ id: i + 1, problemaId: id, etiqueta: it.etiqueta, cantidad: it.cantidad })),
  };
  (problemasPorVisita[visita.id] ??= []).push(problema);
  todosLosProblemas.push(problema);
}

// visita_firma — TIENDA en visitas COMPLETADA
export const firmasPorVisita: Record<number, VisitaFirma[]> = {};
let firmaAutoId = 1;
for (const s of seeds) {
  if (s.estado !== "COMPLETADA") continue;
  const ejec = ejecuciones[s.id];
  firmasPorVisita[s.id] = [
    {
      id: firmaAutoId++,
      visitaId: s.id,
      rol: "TIENDA",
      nombre: s.responsableNombre,
      rut: "17.004.556-K",
      imagenUrl: `/media/firmas/${s.folio}.png`,
      firmadoEn: ejec.horaTermino!,
    },
  ];
}

// visita_foto — 3 por visita ejecutada (Antes/Durante/Después)
export const fotosPorVisita: Record<number, VisitaFoto[]> = {};
let fotoAutoId = 1;
for (const s of seeds) {
  if (s.estado === "PROGRAMADA") continue;
  const horaInicio = s.hora ?? "09:30";
  fotosPorVisita[s.id] = (["Antes", "Durante", "Después"] as const).map((etiqueta, i) => ({
    id: fotoAutoId++,
    visitaId: s.id,
    problemaId: null,
    etiqueta,
    archivoUrl: `/media/fotos/${s.folio}-${i + 1}.jpg`,
    orden: i + 1,
    tomadaEn: `${s.fecha}T${addMinutes(s.fecha, horaInicio, (i + 1) * 11)}:00`,
  }));
}

// reagendamiento — motivos que dejó el técnico
const reagendamientosSeed: { folio: string; motivo: string }[] = [
  { folio: "V-2026-00010", motivo: "La tienda estaba en inventario y no dejaron intervenir el acceso principal. Se acordó volver el jueves 20." },
  { folio: "V-2026-00003", motivo: "Local cerrado por corte de energía del mall; no había cómo energizar el pórtico." },
  { folio: "V-2026-00001", motivo: "Faltaba la tarjeta electrónica de repuesto; se reprogramó cuando bodega confirme la llegada." },
];
export const reagendamientosPorVisita: Record<number, Reagendamiento[]> = {};
let reagAutoId = 1;
for (const r of reagendamientosSeed) {
  const visita = findVisita(r.folio);
  reagendamientosPorVisita[visita.id] = [
    {
      id: reagAutoId++,
      visitaId: visita.id,
      fechaAnterior: visita.fechaProgramada,
      horaAnterior: visita.horaProgramada,
      fechaNueva: null,
      horaNueva: null,
      motivo: r.motivo,
      origen: "MOVIL",
    },
  ];
}

// ── Cambios hechos desde el móvil ───────────────────────────────────────────
// Viven en globalThis y no en una variable de módulo: en `next dev` el HMR
// puede re-evaluar este archivo y eso reiniciaría los cambios a los seeds,
// haciendo ver como que "reagendar" no guardó nada. Cuando lib/db esté
// conectado, esto se reemplaza por UPDATE dmc.visita + INSERT dmc.reagendamiento.
interface CambioVisita {
  estado?: Visita["estado"];
  fechaProgramada?: string;
  horaProgramada?: string | null;
  motivoPendiente?: string | null;
  reagendamientos?: Reagendamiento[];
  clienteId?: number;
  sucursalId?: number;
  tecnicoId?: number;
  motivoCodigo?: string;
  trabajoSolicitado?: string;
  indicacionesAcceso?: string | null;
  responsableNombre?: string | null;
  responsableTelefono?: string | null;
}

/** Estado del problema y reclasificación de tipo hechos desde el panel. */
interface CambioProblema {
  estado?: Problema["estado"];
  tipoCodigo?: string;
}

const almacen = globalThis as unknown as {
  __dmcCambiosVisita?: Map<number, CambioVisita>;
  __dmcVisitasNuevas?: Visita[];
  __dmcCambiosProblema?: Map<number, CambioProblema>;
  __dmcActasEnviadas?: Map<string, { para: string; cc: string; adjuntos: number }>;
};
const cambios: Map<number, CambioVisita> = (almacen.__dmcCambiosVisita ??= new Map());

/** Visitas creadas desde el panel o desde el celular del técnico. */
const visitasNuevas: Visita[] = (almacen.__dmcVisitasNuevas ??= []);
const cambiosProblema: Map<number, CambioProblema> = (almacen.__dmcCambiosProblema ??= new Map());
const actasEnviadas: Map<string, { para: string; cc: string; adjuntos: number }> = (almacen.__dmcActasEnviadas ??=
  new Map());

/** Todas las visitas base: las del seed más las creadas en esta sesión. */
function visitasBase(): Visita[] {
  return [...visitasNuevas, ...visitas];
}

function aplicarCambios(base: Visita): Visita {
  const c = cambios.get(base.id);
  if (!c) return base;
  return {
    ...base,
    estado: c.estado ?? base.estado,
    fechaProgramada: c.fechaProgramada ?? base.fechaProgramada,
    horaProgramada: c.horaProgramada !== undefined ? c.horaProgramada : base.horaProgramada,
    motivoPendiente: c.motivoPendiente !== undefined ? c.motivoPendiente : base.motivoPendiente,
    clienteId: c.clienteId ?? base.clienteId,
    sucursalId: c.sucursalId ?? base.sucursalId,
    tecnicoId: c.tecnicoId ?? base.tecnicoId,
    motivoCodigo: c.motivoCodigo ?? base.motivoCodigo,
    trabajoSolicitado: c.trabajoSolicitado ?? base.trabajoSolicitado,
    indicacionesAcceso: c.indicacionesAcceso !== undefined ? c.indicacionesAcceso : base.indicacionesAcceso,
    responsableNombre: c.responsableNombre !== undefined ? c.responsableNombre : base.responsableNombre,
    responsableTelefono: c.responsableTelefono !== undefined ? c.responsableTelefono : base.responsableTelefono,
  };
}

function aplicarCambiosProblema(p: Problema): Problema {
  const c = cambiosProblema.get(p.id);
  if (!c) return p;
  return { ...p, estado: c.estado ?? p.estado, tipoCodigo: c.tipoCodigo ?? p.tipoCodigo };
}

/** Devuelve la visita con todas sus relaciones resueltas, lista para la UI. */
export function getVisitaCompleta(id: number): Visita | undefined {
  const original = visitasBase().find((v) => v.id === id);
  if (!original) return undefined;
  const base = aplicarCambios(original);
  return {
    ...base,
    cliente: getClienteById(base.clienteId),
    sucursal: getSucursalById(base.sucursalId),
    tecnico: getTecnicoById(base.tecnicoId),
    motivo: getCatalogoMotivoByCodigo(base.motivoCodigo),
    ejecucion: ejecuciones[base.id],
    trabajos: trabajosPorVisita[base.id] ?? [],
    problemas: (problemasPorVisita[base.id] ?? []).map(aplicarCambiosProblema),
    fotos: fotosPorVisita[base.id] ?? [],
    firmas: firmasPorVisita[base.id] ?? [],
    reagendamientos: [...(cambios.get(base.id)?.reagendamientos ?? []), ...(reagendamientosPorVisita[base.id] ?? [])],
  };
}

export function getVisitasCompletas(): Visita[] {
  return visitasBase().map((v) => getVisitaCompleta(v.id)!);
}

export function getVisitasPorTecnico(tecnicoId: number): Visita[] {
  return getVisitasCompletas().filter((v) => v.tecnicoId === tecnicoId);
}

export function getVisitaCompletaPorFolio(folio: string): Visita | undefined {
  const base = visitasBase().find((v) => v.folio === folio);
  return base ? getVisitaCompleta(base.id) : undefined;
}

/** Problemas con el estado/tipo que tengan tras los cambios del panel. */
export function getTodosLosProblemas(): Problema[] {
  return todosLosProblemas.map(aplicarCambiosProblema);
}

/** Marca la visita EN_CURSO al tocar "Iniciar visita" en el detalle. */
export function iniciarVisitaMock(folio: string): boolean {
  const v = getVisitaCompletaPorFolio(folio);
  if (!v) return false;
  if (v.estado === "PROGRAMADA") {
    cambios.set(v.id, { ...cambios.get(v.id), estado: "EN_CURSO" });
  }
  return true;
}

/** Reagendar / dejar pendiente / cancelar desde "Otras acciones de la visita". */
export function cambiarEstadoVisitaMock(
  folio: string,
  estado: Visita["estado"],
  motivo: string,
  fechaNueva?: string | null,
  horaNueva?: string | null
): boolean {
  const v = getVisitaCompletaPorFolio(folio);
  if (!v) return false;

  const previo = cambios.get(v.id) ?? {};
  const siguiente: CambioVisita = { ...previo, estado };

  if (estado === "REAGENDADA") {
    siguiente.reagendamientos = [
      {
        id: Date.now(),
        visitaId: v.id,
        fechaAnterior: v.fechaProgramada,
        horaAnterior: v.horaProgramada,
        fechaNueva: fechaNueva ?? null,
        horaNueva: horaNueva ?? null,
        motivo,
        origen: "MOVIL",
      },
      ...(previo.reagendamientos ?? []),
    ];
    if (fechaNueva) siguiente.fechaProgramada = fechaNueva;
    siguiente.horaProgramada = horaNueva || null;
  }

  if (estado === "PENDIENTE" || estado === "CANCELADA") {
    siguiente.motivoPendiente = motivo;
  }

  cambios.set(v.id, siguiente);
  return true;
}

// ── Acciones del panel de coordinación ──────────────────────────────────────

export interface DatosVisita {
  clienteId: number;
  sucursalId: number;
  tecnicoId: number;
  motivoCodigo: string;
  fechaProgramada: string;
  horaProgramada: string | null;
  trabajoSolicitado: string;
  indicacionesAcceso: string | null;
  responsableNombre: string | null;
  responsableTelefono: string | null;
  problemaOrigenId?: number | null;
  creadaEnTerreno?: boolean;
}

function siguienteFolio(): string {
  const nums = visitasBase().map((v) => Number(v.folio.replace(/\D/g, "").slice(-5)) || 0);
  return `V-2026-${String(Math.max(0, ...nums) + 1).padStart(5, "0")}`;
}

/** "Nueva visita" del panel y "Agregar visita" del celular. Nace PROGRAMADA. */
export function crearVisitaMock(datos: DatosVisita): Visita {
  const id = Math.max(0, ...visitasBase().map((v) => v.id)) + 1;
  const nueva: Visita = {
    id,
    folio: siguienteFolio(),
    clienteId: datos.clienteId,
    sucursalId: datos.sucursalId,
    tecnicoId: datos.tecnicoId,
    motivoCodigo: datos.motivoCodigo,
    estado: "PROGRAMADA",
    fechaProgramada: datos.fechaProgramada,
    horaProgramada: datos.horaProgramada,
    trabajoSolicitado: datos.trabajoSolicitado,
    indicacionesAcceso: datos.indicacionesAcceso,
    responsableNombre: datos.responsableNombre,
    responsableTelefono: datos.responsableTelefono,
    motivoPendiente: null,
    problemaOrigenId: datos.problemaOrigenId ?? null,
    creadaEnTerreno: datos.creadaEnTerreno ?? false,
    creadoEn: new Date().toISOString(),
  };
  visitasNuevas.unshift(nueva);
  return nueva;
}

/** "Corregir visita" del acta. Si venía REAGENDADA vuelve a PROGRAMADA. */
export function editarVisitaMock(folio: string, datos: DatosVisita): boolean {
  const v = visitasBase().find((x) => x.folio === folio);
  if (!v) return false;
  const actual = getVisitaCompleta(v.id)!;
  const previo = cambios.get(v.id) ?? {};
  cambios.set(v.id, {
    ...previo,
    clienteId: datos.clienteId,
    sucursalId: datos.sucursalId,
    tecnicoId: datos.tecnicoId,
    motivoCodigo: datos.motivoCodigo,
    fechaProgramada: datos.fechaProgramada,
    horaProgramada: datos.horaProgramada,
    trabajoSolicitado: datos.trabajoSolicitado,
    indicacionesAcceso: datos.indicacionesAcceso,
    responsableNombre: datos.responsableNombre,
    responsableTelefono: datos.responsableTelefono,
    estado: actual.estado === "REAGENDADA" ? "PROGRAMADA" : previo.estado ?? actual.estado,
    motivoPendiente: actual.estado === "REAGENDADA" ? null : previo.motivoPendiente,
  });
  return true;
}

/**
 * "Cambiar fecha y técnico" del acta: se usa en las visitas reagendadas,
 * pendientes y canceladas. La visita vuelve a PROGRAMADA con la fecha nueva.
 */
export function reprogramarVisitaMock(
  folio: string,
  tecnicoId: number,
  fecha: string,
  hora: string | null
): boolean {
  const v = getVisitaCompletaPorFolio(folio);
  if (!v) return false;
  const previo = cambios.get(v.id) ?? {};
  cambios.set(v.id, {
    ...previo,
    tecnicoId,
    fechaProgramada: fecha,
    horaProgramada: hora,
    estado: "PROGRAMADA",
    motivoPendiente: null,
    reagendamientos: [
      {
        id: Date.now(),
        visitaId: v.id,
        fechaAnterior: v.fechaProgramada,
        horaAnterior: v.horaProgramada,
        fechaNueva: fecha,
        horaNueva: hora,
        motivo: v.motivoPendiente ?? "Reprogramada desde coordinación.",
        origen: "WEB",
      },
      ...(previo.reagendamientos ?? []),
    ],
  });
  return true;
}

/** Cambio de estado y/o reclasificación de tipo desde "Problemas". */
export function actualizarProblemaMock(
  problemaId: number,
  estado: Problema["estado"],
  tipoCodigo: string
): boolean {
  const p = todosLosProblemas.find((x) => x.id === problemaId);
  if (!p) return false;
  cambiosProblema.set(problemaId, { estado, tipoCodigo });
  return true;
}

/** Deja el acta marcada como enviada (sin SMTP todavía). */
export function marcarActaEnviadaMock(folio: string, para: string, cc: string, adjuntos: number) {
  actasEnviadas.set(folio, { para, cc, adjuntos });
}

export function getActaEnviada(folio: string) {
  return actasEnviadas.get(folio) ?? null;
}
