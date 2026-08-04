"use client"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TrendingUpIcon, TrendingDownIcon } from "lucide-react"

export function SectionCards() {
  return (
    <div className="grid grid-cols-1 gap-4  *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      
      {/* carta 1 */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Visitas durate el año</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            125
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Aumento en durante el mes
            <TrendingUpIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">
            4 visitas mas que el mes anterior
          </div>
        </CardFooter>
      </Card>
      {/* carta 2 */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Visitas durate el año</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            125
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Aumento en durante el mes
            <TrendingUpIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">
            4 visitas mas que el mes anterior
          </div>
        </CardFooter>
      </Card>
      {/* carta 3 */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Visitas durate el año</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            125
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Aumento en durante el mes
            <TrendingUpIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">
            4 visitas mas que el mes anterior
          </div>
        </CardFooter>
      </Card>
      {/* carta 4 */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Visitas durate el año</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            125
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Aumento en durante el mes
            <TrendingUpIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">
            4 visitas mas que el mes anterior
          </div>
        </CardFooter>
      </Card>

    </div>
  )
}
