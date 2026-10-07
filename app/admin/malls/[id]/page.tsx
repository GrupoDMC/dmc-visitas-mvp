import { notFound } from "next/navigation";
import SinAcceso from "@/components/admin/SinAcceso";
import FichaVisitas from "@/components/admin/maestros/FichaVisitas";
import { aFilas, type DatoFicha } from "@/components/admin/maestros/FichaPartes";
import { listarClientes, listarMalls, listarSucursales } from "@/lib/data/maestros";
import { getVisitasPorMall } from "@/lib/data/visitas";
import { sesionCon } from "@/lib/auth";
import { hoyISO } from "@/lib/ui/fecha";

export const dynamic = "force-dynamic";

export default async function MallFichaPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await sesionCon("malls.ver"))) return <SinAcceso />;
  const { id } = await params;
  const mallId = Number(id);
  if (!Number.isInteger(mallId)) notFound();

  const verVisitas = Boolean(await sesionCon("visitas.ver"));
  const verTiendas = Boolean(await sesionCon("sucursales.ver"));
  const [malls, sucursales, clientes, visitas] = await Promise.all([
    listarMalls(),
    listarSucursales(),
    listarClientes(),
    verVisitas ? getVisitasPorMall(mallId) : Promise.resolve([]),
  ]);
  const m = malls.find((x) => x.id === mallId);
  if (!m) notFound();
  const tiendas = sucursales.filter((s) => s.mallId === m.id);
  const activas = tiendas.filter((s) => s.activo);
  const nClientes = new Set(activas.map((s) => s.clienteId)).size;
  const nombreCliente = (id: number) => clientes.find((c) => c.id === id)?.nombreFantasia ?? "—";

  const datos: DatoFicha[] = [
    { label: "Dirección", valor: m.direccion },
    { label: "Comuna · región", valor: [m.comuna, m.region].filter(Boolean).join(" · ") },
    { label: "Tiendas activas", valor: `${activas.length} · de ${nClientes} ${nClientes === 1 ? "cliente" : "clientes"}` },
    { label: "Tiendas inactivas", valor: tiendas.length - activas.length ? String(tiendas.length - activas.length) : "" },
  ].filter((d) => d.valor);

  return (
    <FichaVisitas
      modo="mall"
      kicker="Maestros · ficha de mall"
      titulo={m.nombre}
      subtitulo={[m.direccion, m.comuna, m.region].filter(Boolean).join(" · ")}
      activo={m.activo}
      volver={{ href: "/admin/malls", label: "Malls" }}
      datos={datos}
      notas={null}
      filas={aFilas(visitas, malls, sucursales)}
      tiendas={
        verTiendas
          ? tiendas.map((s) => ({
              id: s.id,
              nombre: s.nombre,
              mall: m.nombre,
              cliente: nombreCliente(s.clienteId),
              comuna: s.comuna,
              activo: s.activo,
            }))
          : undefined
      }
      verVisitas={verVisitas}
      hoy={hoyISO()}
    />
  );
}
