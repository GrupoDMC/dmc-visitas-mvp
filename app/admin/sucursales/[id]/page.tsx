import Link from "next/link";
import { notFound } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import SinAcceso from "@/components/admin/SinAcceso";
import { Cifra, Datos, Seccion, TablaVisitas, resumenVisitas } from "@/components/admin/maestros/FichaPartes";
import Tag from "@/components/Tag";
import { listarClientes, listarMalls, listarSucursales } from "@/lib/data/maestros";
import { getVisitasPorSucursal } from "@/lib/data/visitas";
import { sesionCon } from "@/lib/auth";
import { calibracionDeSucursal } from "@/lib/ui/sino";

export const dynamic = "force-dynamic";

const siNo = (v: boolean | null | undefined, si: string, no: string) => (v === true ? si : v === false ? no : null);

export default async function SucursalFichaPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await sesionCon("sucursales.ver"))) return <SinAcceso />;
  const { id } = await params;
  const sucursalId = Number(id);
  if (!Number.isInteger(sucursalId)) notFound();

  const verVisitas = Boolean(await sesionCon("visitas.ver"));
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
  const r = resumenVisitas(visitas);

  return (
    <>
      <AdminHeader kicker="Maestros · sucursal" title={s.nombre}>
        <Link href="/admin/sucursales" className="btn btn-secondary">
          ← Sucursales
        </Link>
      </AdminHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 border-b-2 border-[var(--color-divider)]">
        <Cifra label="Visitas" n={verVisitas ? r.total : "—"} sub={verVisitas ? "en total" : "Sin permiso para verlas"} />
        <Cifra label="Completadas" n={verVisitas ? r.completadas : "—"} />
        <Cifra label="En espera" n={verVisitas ? r.abiertas : "—"} sub="Programadas, en curso, pendientes o reagendadas" />
        <Cifra label="Última hecha" n={<span className="text-[22px] md:text-[26px]">{r.ultima ?? "—"}</span>} />
      </div>

      <Seccion titulo="Datos de la tienda">
        <Datos
          filas={[
            [
              "Cliente",
              cliente ? (
                <Link href={`/admin/clientes/${cliente.id}`} className="underline underline-offset-2">
                  {cliente.nombreFantasia}
                </Link>
              ) : null,
            ],
            ["Mall", mall?.nombre ?? "Sin mall"],
            ["Código", s.codigo],
            ["Dirección", s.direccion],
            ["Comuna", s.comuna],
            ["Región", s.region],
            ["Teléfono", s.telefono],
            ["Instalada el", s.fechaInstalacion],
            ["Modalidad", siNo(s.remota, "Remota", "Presencial")],
            ["Garantía", siNo(s.enGarantia, "En garantía", "Sin garantía")],
            [
              "Plan de calibración",
              cal.valor === null ? null : cal.valor ? (cal.porCliente ? "Sí, por su cliente" : "Sí") : "No",
            ],
            [
              "Estado",
              <Tag key="e" variant={s.activo ? "accent" : "neutral"}>
                {s.activo ? "Activa" : "Inactiva"}
              </Tag>,
            ],
            ["Por qué está inactiva", s.motivoInactivo],
            ["Notas", s.notas],
          ]}
        />
      </Seccion>

      <Seccion titulo={`Visitas de la tienda${verVisitas ? ` · ${r.total}` : ""}`}>
        {verVisitas ? (
          <TablaVisitas visitas={visitas} malls={malls} sucursales={sucursales} conTienda={false} />
        ) : (
          <p className="px-4 md:px-7 py-6 m-0 text-[14px] opacity-66">Tu rol no tiene acceso a las visitas.</p>
        )}
      </Seccion>
    </>
  );
}
