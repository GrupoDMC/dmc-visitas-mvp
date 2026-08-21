import type { TagVariant } from "@/lib/ui/estado";

// "Última visita al local" — lo que dejó registrado la visita anterior en esa
// misma sucursal. Copiado 1:1 del objeto HISTORIAL del mockup (Claude Design ·
// "DMC Contingencia Movil"), con las claves ajustadas a los nombres de sucursal
// de lib/mock/maestros. En producción esto sale de una consulta al backend:
// la última visita COMPLETADA/PENDIENTE de la sucursal, distinta de la actual.

export interface HistorialProblema {
  tipo: string;
  detalle: string;
  estado: string;
  tag: TagVariant;
}

export interface HistorialLocal {
  fecha: string;
  tecnico: string;
  trabajos: string[];
  obs: string;
  problemas: HistorialProblema[];
}

const HISTORIAL: Record<string, HistorialLocal> = {
  "Parque Arauco": {
    fecha: "24/07/2026",
    tecnico: "Daniela Fuentes",
    trabajos: ["Mantención preventiva", "Calibración de antenas"],
    obs: "Se limpiaron los 2 pórticos y se ajustó la sensibilidad del acceso poniente.",
    problemas: [
      {
        tipo: "Antena no detecta etiquetas",
        detalle:
          "Pórtico 2 (antena AM) detecta a menos de 40 cm. Queda a la espera de tarjeta electrónica cotizada el 25/07.",
        estado: "Pendiente de repuesto",
        tag: "outline",
      },
    ],
  },
  "Mall Plaza Tobalaba": {
    fecha: "02/08/2026",
    tecnico: "Harold Peralta",
    trabajos: ["Cambio de repuesto"],
    obs: "Se cambió la fuente de poder del pórtico principal.",
    problemas: [
      {
        tipo: "Falsa alarma constante",
        detalle:
          "3 antenas EAS siguen alarmando cada 10 min sin producto; se sospecha interferencia del letrero LED instalado por el mall.",
        estado: "Abierto",
        tag: "accent",
      },
    ],
  },
  "Costanera Center": {
    fecha: "11/06/2026",
    tecnico: "Harold Peralta",
    trabajos: ["Retiro de equipo"],
    obs: "Se retiró el pórtico antiguo por remodelación de la tienda.",
    problemas: [],
  },
  "Paseo Ahumada": {
    fecha: "09/05/2026",
    tecnico: "Ignacio Salas",
    trabajos: ["Mantención preventiva"],
    obs: "Preventiva trimestral sin observaciones. Conteo de alarmas dentro de lo normal.",
    problemas: [],
  },
  "Mall Marina Arauco": {
    fecha: "06/08/2026",
    tecnico: "Daniela Fuentes",
    trabajos: ["Retiro de equipo"],
    obs: "El mall pidió retirar el pórtico por obras en el acceso.",
    problemas: [
      {
        tipo: "Equipo fuera de servicio",
        detalle:
          "Pórtico desmontado y guardado en bodega de la tienda; falta tarjeta electrónica para reinstalar.",
        estado: "Pendiente de repuesto",
        tag: "outline",
      },
    ],
  },
  "Mall Plaza Oeste": {
    fecha: "18/07/2026",
    tecnico: "Harold Peralta",
    trabajos: ["Calibración de antenas", "Capacitación al personal"],
    obs: "Se calibraron las 4 antenas y se capacitó al turno de tarde en el uso del desactivador.",
    problemas: [
      {
        tipo: "Desactivador intermitente",
        detalle:
          "El desactivador de la caja 3 falla al desactivar etiquetas duras; queda en observación por el turno de reposición.",
        estado: "Abierto",
        tag: "accent",
      },
    ],
  },
};

export interface HistorialVista {
  hay: boolean;
  encabezado: string;
  trabajos: string[];
  obs: string;
  problemas: HistorialProblema[];
  sinProblemas: boolean;
}

/** Historial del local para el dropdown "Última visita al local". */
export function getHistorialLocal(sucursalNombre: string | undefined): HistorialVista {
  const h = sucursalNombre ? HISTORIAL[sucursalNombre] : undefined;
  if (!h) {
    return { hay: false, encabezado: "Sin historial", trabajos: [], obs: "", problemas: [], sinProblemas: true };
  }
  return {
    hay: true,
    encabezado: `${h.fecha} · ${h.tecnico}`,
    trabajos: h.trabajos,
    obs: h.obs,
    problemas: h.problemas,
    sinProblemas: h.problemas.length === 0,
  };
}
