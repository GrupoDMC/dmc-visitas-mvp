import type { Metadata } from "next";
import { requerirVerTodas } from "@/lib/auth";
import { crearVisitaAccion } from "@/lib/acciones/visitas";
import { clientesActivos } from "@/lib/db/clientes";
import { sucursalesActivasConCliente } from "@/lib/db/sucursales";
import { tecnicosActivos } from "@/lib/db/tecnicos";
import { Encabezado } from "@/components/ui/encabezado";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { FormularioVisita } from "@/components/visitas/formulario-visita";

export const metadata: Metadata = { title: "Nueva visita" };

export default async function PaginaNuevaVisita() {
  await requerirVerTodas();

  const [clientes, sucursales, tecnicos] = await Promise.all([
    clientesActivos(),
    sucursalesActivasConCliente(),
    tecnicosActivos(),
  ]);

  // Sin sucursales no hay dónde hacer la visita, y el formulario sería una
  // trampa: dos selects que nunca se pueden completar. Se dice qué falta y se
  // ofrece el camino para resolverlo.
  const conSucursales = new Set(sucursales.map((s) => s.cliente_id));
  const elegibles = clientes.filter((c) => conSucursales.has(c.id));

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo="Nueva visita"
        descripcion="Queda programada. El folio lo pone el sistema."
        volverA={{ href: "/visitas", etiqueta: "Visitas" }}
      />

      {elegibles.length === 0 ? (
        <EstadoVacio
          titulo={
            clientes.length === 0
              ? "Todavía no hay clientes activos"
              : "Ningún cliente activo tiene sucursales activas"
          }
          descripcion="Una visita se agenda siempre a una sucursal. Cargá el cliente y su sucursal, y volvé a esta pantalla."
          accion={{ href: "/clientes", etiqueta: "Ir a clientes" }}
        />
      ) : (
        <FormularioVisita
          accion={crearVisitaAccion}
          modo="agenda"
          clientes={elegibles}
          sucursales={sucursales}
          tecnicos={tecnicos}
          volverA="/visitas"
        />
      )}
    </div>
  );
}
