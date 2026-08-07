import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BadgeEstado } from "@/components/ui/badge-estado"
import { ClienteDeVisita, EstadoVisita, SucursalDeVisita, TecnicoDeVisita, TipoTrabajo } from "@/lib/db/tipos"
import { ShieldCheckIcon } from "lucide-react"
import Link from "next/link"

interface InfoVisitaProps {
 id: number
 folio: string
 estado: EstadoVisita
 tipo_trabajo: TipoTrabajo | null
 fecha_programada: string | null
 hora_programada: string | null
 tecnico_id: number | null
 cliente: ClienteDeVisita | null
 sucursal: SucursalDeVisita | null
 tecnico: TecnicoDeVisita | null
 key: number

}

export function CardVisita(data: InfoVisitaProps) {
  return (
    <Card className="w-full max-w-sm gap-0 pt-0">
      {/* <div className="flex aspect-video w-full items-center justify-center bg-linear-to-br from-[var(--color-acento)] to-[var(--color-acento-hover)]">
      </div> */}
            <img
        src="/maui-sons-logo.png"
        alt="Event cover"
        className="relative z-20 aspect-video w-full object-cover"
      />

      <CardHeader className="mt-4 flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm text-muted-foreground">
          {data.cliente?.razon_social ?? "Cliente sin nombre"}
        </p>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {data.tipo_trabajo ? (
            <Badge variant="secondary">{data.tipo_trabajo}</Badge>
          ) : null}
          <BadgeEstado estado={data.estado} />
        </div>
      </CardHeader>

      <CardContent>
        <h3 className="truncate text-xl font-semibold text-foreground">
          {data.sucursal?.nombre ?? "Sucursal sin nombre"}
        </h3>
      </CardContent>

      <CardFooter className="mt-2">
        <Link href={`/visitas/${data.id}`} className="w-full">
          <Button className="w-full">Ver detalles</Button>
        </Link>
      </CardFooter>
    </Card>
  )
}
