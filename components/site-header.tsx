"use client"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { usePathname } from "next/navigation"

interface PageData {
  titulo: string
  descripcion?: string
}

const pageMap: Record<string, PageData> = {
  "/": { titulo: "Inicio", descripcion: "Resumen general" },
  "/visitas": { titulo: "Visitas", descripcion: "Todo lo agendado. Las filas marcadas al costado todavía no tienen técnico." },
  "/documentos": { titulo: "Documentos", descripcion: "Archivos y expedientes" },
  "/configuracion": { titulo: "Configuración", descripcion: "Ajustes de la cuenta" },
}

function getPageMeta(pathname: string): PageData {
  if (pageMap[pathname]) return pageMap[pathname]

  // fallback: toma el último segmento y lo capitaliza, sin descripción
  const segments = pathname.split("/").filter(Boolean)
  const last = segments[segments.length - 1] ?? ""
  const titulo = last.charAt(0).toUpperCase() + last.slice(1)
  return { titulo }
}

export function SiteHeader() {
  const pathname = usePathname()
  const { titulo, descripcion } = getPageMeta(pathname)

  return (
    <header className="sticky  top-0 z-40 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4 data-vertical:self-auto" />
        <div className="flex flex-col justify-center">
          <h1 className="font-medium leading-tight">{titulo}</h1>
          {descripcion && (
            <p className="text-sm text-muted-foreground leading-tight">
              {descripcion}
            </p>
          )}
        </div>
      </div>
    </header>
  )
}