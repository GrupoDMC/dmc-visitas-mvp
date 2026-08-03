import type { Metadata } from "next";
import { requerirAdmin } from "@/lib/auth";
import { unico } from "@/lib/paginacion";
import { Boton } from "@/components/ui/boton";
import { Campo, Entrada } from "@/components/ui/campo";
import { Encabezado } from "@/components/ui/encabezado";

export const metadata: Metadata = { title: "Exportar" };

type Params = Promise<{ [clave: string]: string | string[] | undefined }>;

/**
 * Botones que descargan CSV crudo para el traspaso a SQL Server. Es un
 * formulario GET nativo — sin JavaScript: cada botón manda a su propio Route
 * Handler con `formAction`, y el navegador dispara la descarga solo porque el
 * handler responde con `Content-Disposition: attachment`.
 */
export default async function PaginaExportar({
  searchParams,
}: {
  searchParams: Params;
}) {
  await requerirAdmin();

  const params = await searchParams;
  const desde = unico(params.desde);
  const hasta = unico(params.hasta);

  return (
    <div className="mx-auto max-w-2xl">
      <Encabezado
        titulo="Exportar"
        descripcion="CSV crudo, con BOM UTF-8 y separador punto y coma, listo para Excel en Windows. Las fechas salen en ISO 8601, sin formatear."
      />

      <form className="flex flex-col gap-5 rounded-card border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
        <div>
          <p className="text-sm font-medium text-texto">Rango de fechas</p>
          <p className="mt-1 text-xs text-suave">
            Filtra por la fecha en que se cargó cada registro en la app. Dejá
            los dos campos vacíos para exportar todo.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Campo htmlFor="desde" etiqueta="Desde" opcional>
              <Entrada id="desde" name="desde" type="date" defaultValue={desde} />
            </Campo>
            <Campo htmlFor="hasta" etiqueta="Hasta" opcional>
              <Entrada id="hasta" name="hasta" type="date" defaultValue={hasta} />
            </Campo>
          </div>
        </div>

        <div className="grid gap-2 border-t border-borde pt-4 sm:grid-cols-2">
          <Boton formAction="/exportar/visitas" variante="secundario">
            Visitas (CSV)
          </Boton>
          <Boton formAction="/exportar/problemas" variante="secundario">
            Problemas (CSV)
          </Boton>
          <Boton formAction="/exportar/materiales" variante="secundario">
            Materiales (CSV)
          </Boton>
          <Boton formAction="/exportar/clientes" variante="secundario">
            Clientes y sucursales (CSV)
          </Boton>
        </div>
      </form>
    </div>
  );
}
