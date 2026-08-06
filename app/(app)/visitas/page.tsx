import type { Metadata } from "next";
import { esTecnico, requerirSesion } from "@/lib/auth";
import VistaTecnico from "@/components/visitas/vista-tecnico";
import VistaCoordinacion from "@/components/visitas/vista-coordinacion";
export const metadata: Metadata = { title: "Visitas" };

type Params = Promise<{ [clave: string]: string | string[] | undefined }>;

export default async function PaginaVisitas({ searchParams }: { searchParams: Params;}) {
  const sesion = await requerirSesion();
  console.log(sesion);
  console.log(esTecnico(sesion));
  
  if (esTecnico(sesion)) {
    return <VistaTecnico sesion={sesion} />;
  } else {
    return <VistaCoordinacion searchParams={searchParams} />
  }
}




// ---------------------------------------------------------------------------
// COORDINACIÓN
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// TÉCNICO
// ---------------------------------------------------------------------------


// async function sVistaTecnico({ sesion }: { sesion: Sesion }) {
//   if (sesion.tecnicoId === null) {
//     return (
//       <div className="mx-auto max-w-2xl">
//         <Encabezado titulo="Mis visitas" />
//         <EstadoVacio
//           titulo="Tu usuario no está vinculado a ningún técnico"
//           descripcion="Sin ese vínculo no hay forma de saber qué visitas son tuyas. Pedile a administración que lo corrija."
//         />
//       </div>
//     );
//   }

//   const hoy = hoyEnChile();
//   const visitas = await visitasAbiertasDeTecnico(sesion.tecnicoId);

//   return (
//     // El espacio de abajo es para el botón fijo: sin él, la última tarjeta
//     // queda tapada justo cuando el técnico llega al final de la lista.
//     <div className="pb-20">
//       <Encabezado
//         titulo={`Bienvenido ${sesion.nombre}, estas son las visitas que tienes asignadas para hoy `}
//         descripcion="Lo que tenés abierto. Tocá una para registrar lo que hiciste."
//       />

//       {visitas.length === 0 ? (
//         <EstadoVacio
//           titulo="No tenés visitas pendientes"
//           descripcion="Cuando coordinación te asigne trabajo aparece acá. Si llegaste a un lugar sin visita agendada, abrila vos mismo."
//           accion={{
//             href: "/visitas/en-terreno",
//             etiqueta: "Nueva visita en terreno",
//           }}
//         />
//       ) : (
//         <TarjetasTecnico visitas={visitas} hoy={hoy} />
//       )}
//       {/* Fijo abajo y a mano: el técnico que llega a un lugar sin agendamiento
//           previo no tiene que buscar nada en un menú. */}
//       {/* <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-superficie/95 p-3 backdrop-blur">
//         <div className="mx-auto max-w-2xl">
//           <Link
//             href="/visitas/en-terreno"
//             className="flex min-h-12 w-full items-center justify-center gap-2 rounded-base bg-acento px-4 text-sm font-medium text-white transition-colors hover:bg-acento-hover"
//           >
//             <svg
//               width="18"
//               height="18"
//               viewBox="0 0 20 20"
//               fill="none"
//               stroke="currentColor"
//               strokeWidth="1.75"
//               strokeLinecap="round"
//               aria-hidden
//             >
//               <path d="M10 4v12M4 10h12" />
//             </svg>
//             Nueva visita en terreno
//           </Link>
//         </div>
//       </div> */}
//     </div>
//   );
// }
