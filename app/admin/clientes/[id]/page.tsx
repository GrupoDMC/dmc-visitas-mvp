import { notFound } from "next/navigation";
import SinAcceso from "@/components/admin/SinAcceso";
import FichaVisitas from "@/components/admin/maestros/FichaVisitas";
import { aFilas, type DatoFicha } from "@/components/admin/maestros/FichaPartes";
import { listarClientes, listarMalls, listarSucursales } from "@/lib/data/maestros";
import { getVisitasPorCliente } from "@/lib/data/visitas";
import { sesionCon } from "@/lib/auth";
import { hoyISO } from "@/lib/ui/fecha";

export const dynamic = "force-dynamic";

export default async function ClienteFichaPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await sesionCon("clientes.ver"))) return <SinAcceso />;
  const { id } = await params;
  const clienteId = Number(id);
  if (!Number.isInteger(clienteId)) notFound();

  const verVisitas = Boolean(await sesionCon("visitas.ver"));
  const verTiendas = Boolean(await sesionCon("sucursales.ver"));
  const [clientes, sucursales, malls, visitas] = await Promise.all([
    listarClientes(),
    listarSucursales(),
    listarMalls(),
    verVisitas ? getVisitasPorCliente(clienteId) : Promise.resolve([]),
  ]);
  const c = clientes.find((x) => x.id === clienteId);
  if (!c) notFound();
  const tiendas = sucursales.filter((s) => s.clienteId === c.id);
  const activas = tiendas.filter((s) => s.activo);
  const nMalls = new Set(activas.map((s) => s.mallId).filter(Boolean)).size;
  const enGarantia = activas.filter((s) => s.enGarantia === true).length;

  const datos: DatoFicha[] = [
    { label: "Razón social", valor: c.razonSocial },
    { label: "RUT", valor: c.rut },
    { label: "Locales activos", valor: `${activas.length} en ${nMalls} ${nMalls === 1 ? "mall" : "malls"}` },
    { label: "Locales inactivos", valor: tiendas.length - activas.length ? String(tiendas.length - activas.length) : "" },
    { label: "En garantía", valor: enGarantia ? `${enGarantia} ${enGarantia === 1 ? "local" : "locales"}` : "" },
    { label: "Plan de calibración", valor: c.planCalibracion === true ? "En plan" : c.planCalibracion === false ? "Sin plan" : "" },
    { label: "Por qué está inactivo", valor: c.activo ? "" : (c.motivoInactivo ?? "") },
  ].filter((d) => d.valor);

  return (
    <FichaVisitas
      kicker="Maestros · ficha de cliente"
      titulo={c.nombreFantasia}
      subtitulo={`${c.razonSocial !== c.nombreFantasia ? `${c.razonSocial} · ` : ""}RUT ${c.rut}`}
      activo={c.activo}
      volver={{ href: "/admin/clientes", label: "Clientes" }}
      acciones={verTiendas ? [{ href: `/admin/sucursales?cliente=${c.id}`, label: "Editar sus locales" }] : undefined}
      datos={datos}
      notas={c.notas ?? null}
      filas={aFilas(visitas, malls, sucursales)}
      tiendas={
        verTiendas
          ? tiendas.map((s) => ({
              id: s.id,
              nombre: s.nombre,
              mall: malls.find((m) => m.id === s.mallId)?.nombre ?? null,
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
