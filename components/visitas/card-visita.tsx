import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle, } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ClienteDeVisita, EstadoVisita, SucursalDeVisita, TecnicoDeVisita, TipoTrabajo } from "@/lib/db/tipos"
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
    <Card className="relative w-full max-w-sm pt-0 flex-col justify-between">
      <div className="absolute inset-0 z-30 aspect-video" />

      <img src="/maui-sons-logo.png" alt={`${data.sucursal?.nombre ?? ''} ${data.cliente?.razon_social ?? ''}`} className="relative z-20 aspect-video w-full object-cover brightness-60 dark:brightness-40" />

      <CardHeader>
        <CardAction>
          <Badge variant="secondary">{data.tipo_trabajo}</Badge>
        </CardAction>

        <CardDescription>
          {data.cliente?.razon_social}

        </CardDescription>
      </CardHeader>
      {/* <CardContent> */}
        <CardTitle className="text-xl px-4">
          {data.sucursal?.nombre}
        </CardTitle>
      {/* </CardContent> */}
      <CardFooter className="grid">
        <Link href={`/visitas/${data.id}`} >
          <Button className="w-full ">Ver detalles</Button>
        </Link>
      </CardFooter>
    </Card>
  )
}