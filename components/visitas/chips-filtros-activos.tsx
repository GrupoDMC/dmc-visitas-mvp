import Link from "next/link";
import { ESTADOS_VISITA } from "@/lib/catalogos";
import { fechaCorta } from "@/lib/fechas";
import { SIN_TECNICO, type FiltrosVisitas } from "@/lib/db/visitas";

type Clave = keyof FiltrosVisitas;

const PARAM: Record<Clave, string> = {
  busqueda: "q",
  desde: "desde",
  hasta: "hasta",
  estado: "estado",
  tecnico: "tecnico",
  cliente: "cliente",
};

/**
 * Un chip removible por cada filtro activo del listado de coordinación —
 * para que se lean de un vistazo, sin tener que abrir el formulario de
 * filtros para saber qué está aplicado.
 *
 * Cada chip enlaza a la misma URL sin ese único parámetro; el resto de los
 * filtros vigentes se mantiene.
 */
export function ChipsFiltrosActivos({
  filtros,
  clientes,
  tecnicos,
}: {
  filtros: FiltrosVisitas;
  clientes: { id: number; razon_social: string }[];
  tecnicos: { id: number; nombres: string; apellidos: string }[];
}) {
  function href(sinClave: Clave): string {
    const params = new URLSearchParams();
    for (const clave of Object.keys(PARAM) as Clave[]) {
      if (clave === sinClave) continue;
      const valor = filtros[clave];
      if (valor) params.set(PARAM[clave], valor);
    }
    const cadena = params.toString();
    return cadena ? `/visitas?${cadena}` : "/visitas";
  }

  const etiquetas: { clave: Clave; texto: string }[] = [];

  if (filtros.busqueda) {
    etiquetas.push({ clave: "busqueda", texto: `Buscar: "${filtros.busqueda}"` });
  }
  if (filtros.desde) {
    etiquetas.push({ clave: "desde", texto: `Desde ${fechaCorta(filtros.desde) ?? filtros.desde}` });
  }
  if (filtros.hasta) {
    etiquetas.push({ clave: "hasta", texto: `Hasta ${fechaCorta(filtros.hasta) ?? filtros.hasta}` });
  }
  if (filtros.estado) {
    const nombre = ESTADOS_VISITA.find((e) => e.codigo === filtros.estado)?.nombre ?? filtros.estado;
    etiquetas.push({ clave: "estado", texto: `Estado: ${nombre}` });
  }
  if (filtros.tecnico) {
    const nombre =
      filtros.tecnico === SIN_TECNICO
        ? "Sin asignar"
        : (() => {
            const t = tecnicos.find((t) => String(t.id) === filtros.tecnico);
            return t ? `${t.apellidos}, ${t.nombres}` : filtros.tecnico;
          })();
    etiquetas.push({ clave: "tecnico", texto: `Técnico: ${nombre}` });
  }
  if (filtros.cliente) {
    const nombre =
      clientes.find((c) => String(c.id) === filtros.cliente)?.razon_social ?? filtros.cliente;
    etiquetas.push({ clave: "cliente", texto: `Cliente: ${nombre}` });
  }

  if (etiquetas.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {etiquetas.map(({ clave, texto }) => (
        <Link
          key={clave}
          href={href(clave)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-base bg-acento-suave px-3 text-xs font-medium text-acento transition-colors hover:bg-borde sm:min-h-10"
        >
          {texto}
          <svg
            width="12"
            height="12"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </Link>
      ))}
    </div>
  );
}
