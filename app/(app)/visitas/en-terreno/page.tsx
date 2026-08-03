import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { crearVisitaEnTerrenoAccion } from "@/lib/acciones/visitas";
import { clientesActivos } from "@/lib/db/clientes";
import { sucursalesActivasConCliente } from "@/lib/db/sucursales";
import { Encabezado } from "@/components/ui/encabezado";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { FormularioVisita } from "@/components/visitas/formulario-visita";

export const metadata: Metadata = { title: "Visita en terreno" };

/**
 * El técnico llegó a un lugar que no estaba agendado.
 *
 * La visita nace con `fecha_programada` en NULL, asignada a él y en estado
 * PROGRAMADA — la arranca desde el formulario de terreno, igual que cualquier
 * otra. Es un caso normal del trabajo, no una excepción a corregir después.
 */
export default async function PaginaVisitaEnTerreno() {
  const sesion = await requerirSesion();

  // La acción vuelve a verificarlo: esto es solo para no mostrar un formulario
  // que no se puede enviar. Un ADMIN sin técnico vinculado no puede abrir una
  // visita a su propio nombre, tiene que agendarla desde coordinación.
  if (sesion.tecnicoId === null) redirect("/visitas");

  const [clientes, sucursales] = await Promise.all([
    clientesActivos(),
    sucursalesActivasConCliente(),
  ]);

  const conSucursales = new Set(sucursales.map((s) => s.cliente_id));
  const elegibles = clientes.filter((c) => conSucursales.has(c.id));

  const volverA = "/visitas";

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo="Visita en terreno"
        descripcion="Para el lugar al que llegaste sin visita agendada. Queda a tu nombre y sin fecha programada."
        volverA={{ href: volverA, etiqueta: "Mis visitas" }}
      />

      {elegibles.length === 0 ? (
        <EstadoVacio
          titulo="No hay sucursales cargadas para elegir"
          descripcion="La visita tiene que apuntar a una sucursal que exista en el sistema. Avisale a coordinación para que la carguen y volvé a intentar."
          accion={{ href: volverA, etiqueta: "Volver a mis visitas" }}
        />
      ) : (
        <FormularioVisita
          accion={crearVisitaEnTerrenoAccion}
          modo="terreno"
          clientes={elegibles}
          sucursales={sucursales}
          tecnicos={[]}
          volverA={volverA}
        />
      )}
    </div>
  );
}
