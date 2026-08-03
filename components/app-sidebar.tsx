"use client"

import * as React from "react"
import Image from "next/image"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuItem, } from "@/components/ui/sidebar"
import { LayoutDashboardIcon, ListIcon, ChartBarIcon, UsersIcon, Settings2Icon, FileChartColumnIcon,  } from "lucide-react"

const data = {
  user: {
    name: "Santiago lópez",
    email: "slopez@grupodmc.cl",
    avatar: "https://avatars.githubusercontent.com/u/292798018?v=4&size=64",
  },
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

  navSecondary: [
    {
      title: "Settings",
      url: "/configuracion",
      icon: (
        <Settings2Icon
        />
      ),
    }
  ],

}
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Image className="w-1/2 h-auto" src={"/DMC-logo.png"} alt="logo de la empresa DMC" width={"130"} height={"80"} loading="eager"/>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
