import type { Metadata } from "next";
import { esTecnico, requerirSesion } from "@/lib/auth";
import VistaTecnico from "@/components/visitas/vista-tecnico";
import VistaCoordinacion from "@/components/visitas/vista-coordinacion";
export const metadata: Metadata = { title: "Visitas" };

type Params = Promise<{ [clave: string]: string | string[] | undefined }>;

export default async function PaginaVisitas({ searchParams }: { searchParams: Params;}) {
  const sesion = await requerirSesion();  
  if (esTecnico(sesion)) {
    return <VistaTecnico sesion={sesion} />;
  } else {
    return <VistaCoordinacion searchParams={searchParams} />
  }
}


