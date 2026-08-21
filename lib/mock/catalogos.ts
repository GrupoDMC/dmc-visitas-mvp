import type { CatalogoMotivo, CatalogoProblema, CatalogoTrabajo } from "@/lib/types";

// Mismos catálogos de fábrica que sql/dmc_contingencia_sqlserver.sql (sección 11).
// Editables desde el panel admin (maestros) y consumidos por el flujo móvil.

export const catalogoMotivo: CatalogoMotivo[] = [
  { id: 1, codigo: "CALIBRACION", nombre: "Calibración de las antenas", orden: 1, activo: true },
  { id: 2, codigo: "INSTALACION", nombre: "Instalación de las antenas", orden: 2, activo: true },
  { id: 3, codigo: "RE_INSTALACION", nombre: "Reinstalación de las antenas", orden: 3, activo: true },
  { id: 4, codigo: "DES_INSTALACION", nombre: "Desinstalación de las antenas", orden: 4, activo: true },
  { id: 5, codigo: "VISITA", nombre: "Visita preventiva", orden: 5, activo: true },
  { id: 6, codigo: "REVISION", nombre: "Revisión de condiciones", orden: 6, activo: true },
];

export function getCatalogoMotivoByCodigo(codigo: string): CatalogoMotivo | undefined {
  return catalogoMotivo.find((m) => m.codigo === codigo);
}

export const catalogoProblema: CatalogoProblema[] = [
  {
    id: 1, codigo: "ANTENA_NO_DETECTA", nombre: "Antena no detecta etiquetas",
    grupoLabel: "Antena afectada", singular: "antena", ayuda: "Marca las antenas que no están detectando.",
    orden: 1, activo: true,
    opciones: [
      { id: 1, problemaId: 1, etiqueta: "Pórtico 1", orden: 1, activo: true },
      { id: 2, problemaId: 1, etiqueta: "Pórtico 2", orden: 2, activo: true },
      { id: 3, problemaId: 1, etiqueta: "Pórtico 3", orden: 3, activo: true },
      { id: 4, problemaId: 1, etiqueta: "Antena AM", orden: 4, activo: true },
      { id: 5, problemaId: 1, etiqueta: "Antena RF", orden: 5, activo: true },
    ],
  },
  {
    id: 2, codigo: "FALSA_ALARMA", nombre: "Falsa alarma / falso positivo",
    grupoLabel: "Dónde suena la falsa alarma", singular: "punto", ayuda: "Marca los puntos donde ocurre.",
    orden: 2, activo: true,
    opciones: [
      { id: 6, problemaId: 2, etiqueta: "Pórtico 1", orden: 1, activo: true },
      { id: 7, problemaId: 2, etiqueta: "Pórtico 2", orden: 2, activo: true },
      { id: 8, problemaId: 2, etiqueta: "Pórtico 3", orden: 3, activo: true },
      { id: 9, problemaId: 2, etiqueta: "Zona de cajas", orden: 4, activo: true },
      { id: 10, problemaId: 2, etiqueta: "Bodega", orden: 5, activo: true },
    ],
  },
  {
    id: 3, codigo: "SIN_ENERGIA", nombre: "Sin alimentación eléctrica",
    grupoLabel: "Qué quedó sin energía", singular: "equipo", ayuda: "Marca los equipos sin alimentación.",
    orden: 3, activo: true,
    opciones: [
      { id: 11, problemaId: 3, etiqueta: "Pórtico completo", orden: 1, activo: true },
      { id: 12, problemaId: 3, etiqueta: "Fuente de poder", orden: 2, activo: true },
      { id: 13, problemaId: 3, etiqueta: "Transformador", orden: 3, activo: true },
      { id: 14, problemaId: 3, etiqueta: "Enchufe o toma", orden: 4, activo: true },
    ],
  },
  {
    id: 4, codigo: "CABLE_DANADO", nombre: "Cable dañado o cortado",
    grupoLabel: "Cable dañado", singular: "cable", ayuda: "Marca el o los cables afectados.",
    orden: 4, activo: true,
    opciones: [
      { id: 15, problemaId: 4, etiqueta: "Cable de poder", orden: 1, activo: true },
      { id: 16, problemaId: 4, etiqueta: "Cable de antena", orden: 2, activo: true },
      { id: 17, problemaId: 4, etiqueta: "Cable de red", orden: 3, activo: true },
      { id: 18, problemaId: 4, etiqueta: "Cable de sincronía", orden: 4, activo: true },
    ],
  },
  {
    id: 5, codigo: "PLACAS_DANADAS", nombre: "Placas dañadas",
    grupoLabel: "Modelo de placa", singular: "modelo", ayuda: "Marca los modelos dañados y ajusta las cantidades.",
    orden: 5, activo: true,
    opciones: [
      { id: 19, problemaId: 5, etiqueta: "Master 9000", orden: 1, activo: true },
      { id: 20, problemaId: 5, etiqueta: "Slave 9000", orden: 2, activo: true },
      { id: 21, problemaId: 5, etiqueta: "TX MDG", orden: 3, activo: true },
      { id: 22, problemaId: 5, etiqueta: "RX MDG", orden: 4, activo: true },
    ],
  },
  {
    id: 6, codigo: "DESCALIBRACION", nombre: "Antena descalibrada",
    grupoLabel: "Antena a calibrar", singular: "antena", ayuda: "Marca las antenas descalibradas.",
    orden: 6, activo: true,
    opciones: [
      { id: 23, problemaId: 6, etiqueta: "Pórtico 1", orden: 1, activo: true },
      { id: 24, problemaId: 6, etiqueta: "Pórtico 2", orden: 2, activo: true },
      { id: 25, problemaId: 6, etiqueta: "Pórtico 3", orden: 3, activo: true },
    ],
  },
  {
    id: 7, codigo: "CONTADOR_FALLA", nombre: "Contador de personas con falla",
    grupoLabel: "Parte con falla", singular: "parte", ayuda: "Marca la parte del contador con falla.",
    orden: 7, activo: true,
    opciones: [
      { id: 26, problemaId: 7, etiqueta: "Sensor", orden: 1, activo: true },
      { id: 27, problemaId: 7, etiqueta: "Display", orden: 2, activo: true },
      { id: 28, problemaId: 7, etiqueta: "Cableado", orden: 3, activo: true },
      { id: 29, problemaId: 7, etiqueta: "Fuente", orden: 4, activo: true },
    ],
  },
  {
    id: 8, codigo: "ETIQUETA_DEFECTUOSA", nombre: "Etiqueta AM defectuosa",
    grupoLabel: "Tipo de etiqueta", singular: "tipo", ayuda: "Marca el tipo de etiqueta y la cantidad revisada.",
    orden: 8, activo: true,
    opciones: [
      { id: 30, problemaId: 8, etiqueta: "Etiqueta AM dura", orden: 1, activo: true },
      { id: 31, problemaId: 8, etiqueta: "Etiqueta AM blanda", orden: 2, activo: true },
      { id: 32, problemaId: 8, etiqueta: "Etiqueta RF", orden: 3, activo: true },
    ],
  },
  {
    id: 9, codigo: "OTRO", nombre: "Otro",
    grupoLabel: null, singular: null, ayuda: "Describe el problema en el detalle escrito.",
    orden: 9, activo: true, opciones: [],
  },
];

export function getCatalogoProblemaByCodigo(codigo: string): CatalogoProblema | undefined {
  return catalogoProblema.find((p) => p.codigo === codigo);
}

export const catalogoTrabajo: CatalogoTrabajo[] = [
  {
    id: 1, codigo: "CALIBRACION_ANTENAS", nombre: "Calibración de antenas",
    grupoLabel: "Antena calibrada", singular: "antena", orden: 1, activo: true,
    subtrabajos: [
      { id: 1, trabajoId: 1, etiqueta: "Pórtico 1", orden: 1, activo: true },
      { id: 2, trabajoId: 1, etiqueta: "Pórtico 2", orden: 2, activo: true },
      { id: 3, trabajoId: 1, etiqueta: "Pórtico 3", orden: 3, activo: true },
      { id: 4, trabajoId: 1, etiqueta: "Antena AM", orden: 4, activo: true },
      { id: 5, trabajoId: 1, etiqueta: "Antena RF", orden: 5, activo: true },
    ],
  },
  {
    id: 2, codigo: "CAMBIO_REPUESTO", nombre: "Cambio de repuesto",
    grupoLabel: "Repuesto cambiado", singular: "repuesto", orden: 2, activo: true,
    subtrabajos: [
      { id: 6, trabajoId: 2, etiqueta: "Tarjeta electrónica", orden: 1, activo: true },
      { id: 7, trabajoId: 2, etiqueta: "Fuente de poder", orden: 2, activo: true },
      { id: 8, trabajoId: 2, etiqueta: "Cable de slave a master", orden: 3, activo: true },
      { id: 9, trabajoId: 2, etiqueta: "Antena completa", orden: 4, activo: true },
      { id: 10, trabajoId: 2, etiqueta: "Sensor de conteo", orden: 5, activo: true },
    ],
  },
  {
    id: 3, codigo: "INSTALACION_EQUIPO", nombre: "Instalación de equipo",
    grupoLabel: "Equipo instalado", singular: "equipo", orden: 3, activo: true,
    subtrabajos: [
      { id: 11, trabajoId: 3, etiqueta: "Pórtico nuevo", orden: 1, activo: true },
      { id: 12, trabajoId: 3, etiqueta: "Desactivador", orden: 2, activo: true },
      { id: 13, trabajoId: 3, etiqueta: "Contador de personas", orden: 3, activo: true },
      { id: 14, trabajoId: 3, etiqueta: "Alarma sonora", orden: 4, activo: true },
    ],
  },
  {
    id: 4, codigo: "MANTENCION", nombre: "Mantención preventiva",
    grupoLabel: "Tarea de mantención", singular: "tarea", orden: 4, activo: true,
    subtrabajos: [
      { id: 15, trabajoId: 4, etiqueta: "Limpieza interna", orden: 1, activo: true },
      { id: 16, trabajoId: 4, etiqueta: "Revisión de conexiones", orden: 2, activo: true },
      { id: 17, trabajoId: 4, etiqueta: "Ajuste de sensibilidad", orden: 3, activo: true },
      { id: 18, trabajoId: 4, etiqueta: "Prueba con etiqueta patrón", orden: 4, activo: true },
    ],
  },
  {
    id: 5, codigo: "RETIRO_EQUIPO", nombre: "Retiro de equipo",
    grupoLabel: "Equipo retirado", singular: "equipo", orden: 5, activo: true,
    subtrabajos: [
      { id: 19, trabajoId: 5, etiqueta: "Pórtico completo", orden: 1, activo: true },
      { id: 20, trabajoId: 5, etiqueta: "Desactivador", orden: 2, activo: true },
      { id: 21, trabajoId: 5, etiqueta: "Contador de personas", orden: 3, activo: true },
    ],
  },
  {
    id: 6, codigo: "CAPACITACION", nombre: "Capacitación al personal",
    grupoLabel: null, singular: null, orden: 6, activo: true, subtrabajos: [],
  },
];

export function getCatalogoTrabajoByCodigo(codigo: string): CatalogoTrabajo | undefined {
  return catalogoTrabajo.find((t) => t.codigo === codigo);
}
