import {
  CheckCircle2Icon,
  ClockIcon,
  AlertTriangleIcon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react"
import type { ConteoVisitasPorEstado } from "@/lib/db/visitas"

type Estadistica = {
  etiqueta: string
  valor: number
  Icono: LucideIcon
  punto: string
  fondoIcono: string
  colorIcono: string
}

export function SectionCards({ conteos }: { conteos: ConteoVisitasPorEstado }) {
  const estadisticas: Estadistica[] = [
    {
      etiqueta: "Visitas realizadas",
      valor: conteos.realizadas,
      Icono: CheckCircle2Icon,
      punto: "bg-realizada",
      fondoIcono: "bg-realizada-fondo",
      colorIcono: "text-realizada-texto",
    },
    {
      etiqueta: "Visitas en curso",
      valor: conteos.enCurso,
      Icono: ClockIcon,
      punto: "bg-encurso",
      fondoIcono: "bg-encurso-fondo",
      colorIcono: "text-encurso-texto",
    },
    {
      etiqueta: "Visitas pendientes",
      valor: conteos.pendientes,
      Icono: AlertTriangleIcon,
      punto: "bg-pendiente",
      fondoIcono: "bg-pendiente-fondo",
      colorIcono: "text-pendiente-texto",
    },
    {
      etiqueta: "Visitas canceladas",
      valor: conteos.canceladas,
      Icono: XCircleIcon,
      punto: "bg-cancelada",
      fondoIcono: "bg-cancelada-fondo",
      colorIcono: "text-cancelada-texto",
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {estadisticas.map((stat) => (
        <div
          key={stat.etiqueta}
          className="flex items-center gap-4 rounded-card border border-borde bg-superficie p-4 shadow-tarjeta"
        >
          <div
            className={`flex size-11 shrink-0 items-center justify-center rounded-full ${stat.fondoIcono} ${stat.colorIcono}`}
          >
            <stat.Icono className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-suave">{stat.etiqueta}</p>
            <p className="text-2xl font-semibold tabular-nums text-texto">
              {stat.valor}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
