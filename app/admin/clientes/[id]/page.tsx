import Link from "next/link";
import { notFound } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import SinAcceso from "@/components/admin/SinAcceso";
import { Cifra, Datos, Seccion, TablaVisitas, resumenVisitas } from "@/components/admin/maestros/FichaPartes";
import Tag from "@/components/Tag";
import { listarClientes, listarMalls, listarSucursales } from "@/lib/data/maestros";
import { getVisitasPorCliente } from "@/lib/data/visitas";
import { sesionCon } from "@/lib/auth";

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
  const r = resumenVisitas(visitas);

  return (
    <div className="pb-10 animate-fade-in">
      <AdminHeader kicker="Maestros · cliente" title={c.nombreFantasia}>
        <Link href="/admin/clientes" className="btn btn-secondary">
          ← Clientes
        </Link>
        {verTiendas ? (
          <Link href={`/admin/sucursales?cliente=${c.id}`} className="btn btn-secondary">
            Ver sus locales
          </Link>
        ) : null}
      </AdminHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 border-b-2 border-[var(--color-divider)]">
        <Cifra label="Locales activos" n={activas.length} sub={`en ${nMalls} ${nMalls === 1 ? "mall" : "malls"} · ${tiendas.length - activas.length} inactivos`} />
        <Cifra label="Visitas" n={verVisitas ? r.total : "—"} sub={verVisitas ? `${r.completadas} completadas` : "Sin permiso para verlas"} />
        <Cifra label="En espera" n={verVisitas ? r.abiertas : "—"} sub="Programadas, en curso, pendientes o reagendadas" />
        <Cifra label="Última hecha" n={<span className="text-[22px] md:text-[26px]">{r.ultima ?? "—"}</span>} />
      </div>

      <Seccion titulo="Datos del cliente">
        <Datos
          filas={[
            ["Razón social", c.razonSocial],
            ["RUT", c.rut],
            [
              "Plan de calibración",
              c.planCalibracion === true ? "En plan" : c.planCalibracion === false ? "Sin plan" : null,
            ],
            [
              "Estado",
              <Tag key="e" variant={c.activo ? "accent" : "neutral"}>
                {c.activo ? "Activo" : "Inactivo"}
              </Tag>,
            ],
            ["Por qué está inactivo", c.motivoInactivo],
            ["Notas", c.notas],
          ]}
        />
      </Seccion>

      {verTiendas && tiendas.length ? (
        <Seccion titulo={`Sus tiendas · ${tiendas.length}`}>
          <div className="px-4 md:px-7 overflow-x-auto">
            <table className="table min-w-[560px]">
              <thead>
                <tr>
                  <th>Tienda</th>
                  <th>Mall</th>
                  <th>Comuna</th>
                  <th>Visitas</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {tiendas.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/admin/sucursales/${s.id}`} className="font-extrabold underline underline-offset-2">
                        {s.nombre}
                      </Link>
                    </td>
                    <td>{malls.find((m) => m.id === s.mallId)?.nombre ?? "—"}</td>
                    <td>{s.comuna}</td>
                    <td className="tabular-nums">{verVisitas ? visitas.filter((v) => v.sucursalId === s.id).length : "—"}</td>
                    <td>
                      <Tag variant={s.activo ? "accent" : "neutral"}>{s.activo ? "Activa" : "Inactiva"}</Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      ) : null}

      <Seccion titulo={`Visitas del cliente${verVisitas ? ` · ${r.total}` : ""}`}>
        {verVisitas ? (
          <TablaVisitas visitas={visitas} malls={malls} sucursales={sucursales} conTienda />
        ) : (
          <p className="px-4 md:px-7 py-6 m-0 text-[14px] opacity-66">Tu rol no tiene acceso a las visitas.</p>
        )}
      </Seccion>
    </div>
  );
}
