import { notFound } from "next/navigation";
import SinAcceso from "@/components/admin/SinAcceso";
import FichaVisitas from "@/components/admin/maestros/FichaVisitas";
import { aFilas, type DatoFicha } from "@/components/admin/maestros/FichaPartes";
import { listarClientes, listarMalls, listarSucursales } from "@/lib/data/maestros";
import { getVisitasPorSucursal } from "@/lib/data/visitas";
import { sesionCon } from "@/lib/auth";
import { hoyISO } from "@/lib/ui/fecha";
import { calibracionDeSucursal } from "@/lib/ui/sino";

export const dynamic = "force-dynamic";

const siNo = (v: boolean | null | undefined, si: string, no: string) => (v === true ? si : v === false ? no : "");

export default async function SucursalFichaPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await sesionCon("sucursales.ver"))) return <SinAcceso />;
  const { id } = await params;
  const sucursalId = Number(id);
  if (!Number.isInteger(sucursalId)) notFound();

  const verVisitas = Boolean(await sesionCon("visitas.ver"));
  const verClientes = Boolean(await sesionCon("clientes.ver"));
  const [sucursales, clientes, malls, visitas] = await Promise.all([
    listarSucursales(),
    listarClientes(),
    listarMalls(),
    verVisitas ? getVisitasPorSucursal(sucursalId) : Promise.resolve([]),
  ]);
  const s = sucursales.find((x) => x.id === sucursalId);
  if (!s) notFound();
  const cliente = clientes.find((c) => c.id === s.clienteId);
  const mall = malls.find((m) => m.id === s.mallId);
  const cal = calibracionDeSucursal(s, cliente);

  const datos: DatoFicha[] = [
    { label: "Cliente", valor: cliente?.nombreFantasia ?? "—", href: cliente && verClientes ? `/admin/clientes/${cliente.id}` : undefined },
    { label: "Mall", valor: mall?.nombre ?? "Sin mall" },
    { label: "Código", valor: s.codigo ?? "" },
    { label: "Dirección", valor: s.direccion },
    { label: "Comuna · región", valor: [s.comuna, s.region].filter(Boolean).join(" · ") },
    { label: "Teléfono", valor: s.telefono ?? "" },
    { label: "Instalada el", valor: s.fechaInstalacion ?? "" },
    { label: "Modalidad", valor: siNo(s.remota, "Remota", "Presencial") },
    { label: "Garantía", valor: siNo(s.enGarantia, "En garantía", "Sin garantía") },
    {
      label: "Plan de calibración",
      valor: cal.valor === null ? "" : cal.valor ? (cal.porCliente ? "Sí, por su cliente" : "Sí") : "No",
    },
    { label: "Por qué está inactiva", valor: s.activo ? "" : (s.motivoInactivo ?? "") },
  ].filter((d) => d.valor);

  return (
    <FichaVisitas
      modo="sucursal"
      kicker="Maestros · ficha de sucursal"
      titulo={s.nombre}
      subtitulo={[cliente?.nombreFantasia, mall?.nombre, s.comuna].filter(Boolean).join(" · ")}
      activo={s.activo}
      volver={{ href: "/admin/sucursales", label: "Sucursales" }}
      datos={datos}
      notas={s.notas ?? null}
      filas={aFilas(visitas, malls, sucursales)}
      verVisitas={verVisitas}
      hoy={hoyISO()}
    />
  );
}
