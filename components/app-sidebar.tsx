"use client"

import * as React from "react"
import Image from "next/image"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuItem, } from "@/components/ui/sidebar"
import { LayoutDashboardIcon, ListIcon, ChartBarIcon, UsersIcon, FileChartColumnIcon,  } from "lucide-react"

const data = {
  navMain: [
    {
      title: "Visitas",
      url: "/visitas",
      icon: (<ChartBarIcon/>),
    },
    {
      title: "Clientes",
      url: "/clientes",
      icon: (<ListIcon />),
    },
    {
      title: "Tecnicos",
      url: "/tecnicos",
      icon: (<LayoutDashboardIcon/>),
    },
    {
      title: "Usuarios",
      url: "/usuarios",
      icon: (<UsersIcon/>),
    },
    {
      title: "Exportar",
      url: "/exportar",
      icon: (<FileChartColumnIcon/>),
    },
  ],
}
type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  user: {
    name: string
    email: string
    avatar?: string
  }
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <Image
              className="h-auto w-28 group-data-[collapsible=icon]:w-8"
              src={"/DMC-log.png.png"}
              alt="Logo Grupo DMC"
              width={130}
              height={80}
              loading="eager"
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <NavUser {...user} />
      </SidebarFooter>
    </Sidebar>
  )
}
