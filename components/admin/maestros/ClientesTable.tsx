"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import MaestroTable from "@/components/admin/MaestroTable";
import Tag from "@/components/Tag";
import { guardarClienteAction } from "@/app/actions/maestros";
import { mensajeRut, rutLimpio } from "@/lib/ui/formato";
import { puede, useReferencias } from "@/lib/ui/referencias";
import { OPCIONES_SI_NO, formASiNo, siNoAForm } from "@/lib/ui/sino";
import type { Cliente, Sucursal } from "@/lib/types";

/** Lo que tiene cada cliente en locales: es lo que más se mira de él. */
interface Locales {
  activos: number;
  inactivos: number;
  /** En cuántos malls distintos tiene tiendas activas. */
  malls: number;
  /** Tiendas activas en garantía. */
  enGarantia: number;
  /** Tiendas activas en plan de calibración por su cuenta (cuenta si el cliente no está en plan). */
  conCalibracion: number;
}

const SIN_LOCALES: Locales = { activos: 0, inactivos: 0, malls: 0, enGarantia: 0, conCalibracion: 0 };

const OPCIONES_FILTRO_PLAN = [
  { v: "", t: "Todos" },
  { v: "si", t: "En plan" },
  { v: "no", t: "Sin plan" },
  { v: "nd", t: "Sin indicar" },
];
const OPCIONES_FILTRO_GARANTIA = [
  { v: "", t: "Todos" },
  { v: "si", t: "Con locales en garantía" },
  { v: "no", t: "Sin locales en garantía" },
];
const textoDe = (opciones: { v: string; t: string }[], v: string) => opciones.find((o) => o.v === v)?.t ?? "";

export default function ClientesTable({ clientes, sucursales }: { clientes: Cliente[]; sucursales: Sucursal[] }) {
  const ref = useReferencias();
  const verSucursales = puede(ref, "sucursales.ver");

  const locales = useMemo(() => {
    const porCliente = new Map<number, Locales & { idsMall: Set<number> }>();
    for (const s of sucursales) {
      const l = porCliente.get(s.clienteId) ?? { ...SIN_LOCALES, idsMall: new Set<number>() };
      if (s.activo) {
        l.activos++;
        if (s.mallId) l.idsMall.add(s.mallId);
        if (s.enGarantia === true) l.enGarantia++;
        if (s.planCalibracion === true) l.conCalibracion++;
      } else {
        l.inactivos++;
      }
      l.malls = l.idsMall.size;
      porCliente.set(s.clienteId, l);
    }
    return porCliente;
  }, [sucursales]);
  const de = (c: Cliente): Locales => locales.get(c.id) ?? SIN_LOCALES;

  // Los que más locales tienen, arriba; a igual cantidad, por nombre.
  const ordenados = useMemo(
    () =>
      [...clientes].sort(
        (a, b) =>
          Number(b.activo) - Number(a.activo) ||
          (locales.get(b.id)?.activos ?? 0) - (locales.get(a.id)?.activos ?? 0) ||
          a.nombreFantasia.localeCompare(b.nombreFantasia, "es")
      ),
    [clientes, locales]
  );
  const maxLocales = Math.max(1, ...ordenados.map((c) => de(c).activos));

  const activos = clientes.filter((c) => c.activo);
  const localesActivos = activos.reduce((n, c) => n + de(c).activos, 0);
  const sinLocales = activos.filter((c) => de(c).activos === 0).length;
  const enPlan = activos.filter((c) => c.planCalibracion === true).length;

  const [fPlan, setFPlan] = useState("");
  const [fGarantia, setFGarantia] = useState("");
  const pasa = useCallback(
    (c: Cliente) => {
      const plan = c.planCalibracion === true ? "si" : c.planCalibracion === false ? "no" : "nd";
      const garantia = (locales.get(c.id)?.enGarantia ?? 0) > 0 ? "si" : "no";
      return (!fPlan || plan === fPlan) && (!fGarantia || garantia === fGarantia);
    },
    [fPlan, fGarantia, locales]
  );

  return (
    <MaestroTable<Cliente>
      kicker="Maestros"
      title="Clientes"
      modulo="clientes"
      addLabel="Nuevo cliente"
      editLabel="Editar cliente"
      dialogoKicker="Maestro · cliente"
      nota="El RUT no se puede repetir."
      phBusqueda="Buscar cliente o RUT…"
      rows={ordenados}
      searchKeys={(c) => `${c.nombreFantasia} ${c.razonSocial} ${c.rut}`}
      filtros={{
        campos: [
          { id: "f-plan", label: "Plan de calibración", valor: fPlan, opciones: OPCIONES_FILTRO_PLAN, onChange: setFPlan },
          { id: "f-garantia", label: "Garantía", valor: fGarantia, opciones: OPCIONES_FILTRO_GARANTIA, onChange: setFGarantia },
        ],
        chips: [
          ...(fPlan ? [{ label: textoDe(OPCIONES_FILTRO_PLAN, fPlan), onQuitar: () => setFPlan("") }] : []),
          ...(fGarantia ? [{ label: textoDe(OPCIONES_FILTRO_GARANTIA, fGarantia), onQuitar: () => setFGarantia("") }] : []),
        ],
        pasa,
        limpiar: () => {
          setFPlan("");
          setFGarantia("");
        },
      }}
      resumen={
        <div className="grid grid-cols-2 lg:grid-cols-4 border-b-2 border-[var(--color-divider)]">
          <Cifra label="Clientes activos" n={activos.length} sub={`${clientes.length - activos.length} inactivos`} />
          <Cifra
            label="Locales activos"
            n={localesActivos}
            sub={activos.length ? `${(localesActivos / activos.length).toLocaleString("es-CL", { maximumFractionDigits: 1 })} por cliente` : "—"}
          />
          <Cifra label="Clientes sin locales" n={sinLocales} sub="Activos sin ninguna sucursal activa" />
          <Cifra label="En plan de calibración" n={enPlan} sub={`de ${activos.length} clientes activos`} />
        </div>
      }
      columns={[
        {
          key: "cliente",
          label: "Cliente",
          render: (c) => (
            <div className="min-w-[200px]">
              <div className="font-extrabold text-[15px] leading-[1.25]">{c.nombreFantasia}</div>
              <div className="text-xs opacity-66 mt-0.5">
                {c.razonSocial !== c.nombreFantasia ? `${c.razonSocial} · ` : ""}
                <span className="tabular-nums">{c.rut}</span>
              </div>
            </div>
          ),
        },
        {
          key: "locales",
          label: "Locales",
          render: (c) => {
            const l = de(c);
            const detalle = [
              l.malls ? `en ${l.malls} ${l.malls === 1 ? "mall" : "malls"}` : null,
              l.enGarantia ? `${l.enGarantia} en garantía` : null,
              l.inactivos ? `${l.inactivos} ${l.inactivos === 1 ? "inactivo" : "inactivos"}` : null,
            ].filter(Boolean);
            return (
              <div className="flex items-center gap-3 min-w-[220px]">
                <div
                  className={`font-extrabold text-[26px] leading-none tracking-[-.03em] tabular-nums w-[52px] text-right flex-none ${
                    l.activos ? "" : "opacity-40"
                  }`}
                >
                  {l.activos}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="h-1.5 bg-black/[.08]">
                    <div
                      className="h-full bg-[var(--color-accent)]"
                      style={{ width: `${(l.activos / maxLocales) * 100}%` }}
                    />
                  </div>
                  <div className="text-[11px] opacity-66 mt-1.5">
                    {l.activos === 1 ? "local activo" : "locales activos"}
                    {detalle.length ? ` · ${detalle.join(" · ")}` : ""}
                  </div>
                </div>
              </div>
            );
          },
        },
        {
          key: "planCalibracion",
          label: "Plan de calibración",
          render: (c) =>
            c.planCalibracion === true ? (
              <Tag variant="accent">En plan</Tag>
            ) : (
              <>
                {c.planCalibracion === false ? <Tag variant="outline">Sin plan</Tag> : <span className="opacity-50">—</span>}
                {/* Sin el cliente en plan, alguna tienda puede estarlo por su cuenta. */}
                {de(c).conCalibracion ? (
                  <div className="text-[11px] opacity-66 mt-1">
                    {de(c).conCalibracion} {de(c).conCalibracion === 1 ? "local en plan" : "locales en plan"}
                  </div>
                ) : null}
              </>
            ),
        },
        {
          key: "activo",
          label: "Estado",
          render: (c) => (
            <>
              <Tag variant={c.activo ? "accent" : "neutral"}>{c.activo ? "Activo" : "Inactivo"}</Tag>
              {!c.activo && c.motivoInactivo ? (
                <div className="text-[11px] leading-[1.4] opacity-66 mt-1 max-w-[260px]">{c.motivoInactivo}</div>
              ) : null}
            </>
          ),
        },
      ]}
      accionFila={(c) => (
        <>
          <Link
            href={`/admin/clientes/${c.id}`}
            className="btn btn-icon w-8 h-8 border border-black/[.3] mr-1.5"
            aria-label={`Ficha de ${c.nombreFantasia}`}
            title="Ver ficha y visitas"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7" />
            </svg>
          </Link>
          {verSucursales ? (
            <Link
              href={`/admin/sucursales?cliente=${c.id}`}
              className="btn btn-icon w-8 h-8 border border-black/[.3]"
              aria-label={`Locales de ${c.nombreFantasia}`}
              title="Ver sus locales"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6" />
              </svg>
            </Link>
          ) : null}
        </>
      )}
      fields={[
        { k: "razonSocial", label: "Razón social", span: 2 },
        { k: "rut", label: "RUT", tipo: "rut", ph: "76.123.456-7" },
        { k: "nombreFantasia", label: "Nombre fantasía" },
        {
          k: "planCalibracion",
          label: "¿En plan de calibración? (opcional)",
          tipo: "select",
          opciones: OPCIONES_SI_NO,
          ayuda: "Si está en plan, todas sus sucursales lo están. Si no, cada sucursal puede estarlo por su cuenta.",
        },
        { k: "activo", label: "Estado", tipo: "toggle" },
        {
          k: "motivoInactivo",
          label: "¿Por qué se desactiva?",
          tipo: "area",
          span: 2,
          ph: "Término de contrato, deuda, cierre de la empresa…",
          ayuda: "Obligatorio para dejar al cliente inactivo. Se borra si se reactiva.",
          visible: (f) => f.activo === false,
        },
        { k: "notas", label: "Notas", tipo: "area", span: 2, ph: "Lo que conviene saber de este cliente" },
      ]}
      validar={(f, id) => {
        if (!String(f.razonSocial).trim() || !String(f.rut).trim()) return "Razón social y RUT son obligatorios";
        if (f.activo === false && !String(f.motivoInactivo ?? "").trim()) {
          return "Explica por qué se desactiva el cliente";
        }
        // El dígito verificador se valida al crear: un RUT mal tecleado deja al
        // cliente duplicado y sin forma de cruzarlo con la facturación.
        const error = mensajeRut(String(f.rut));
        if (error) return error;
        // El RUT es único entre empresas. Se avisa acá, con la lista que ya
        // está en pantalla, para no hacer el viaje al servidor solo para eso.
        const limpio = rutLimpio(String(f.rut));
        const repetido = clientes.find((c) => c.id !== id && rutLimpio(c.rut) === limpio);
        return repetido
          ? `Ese RUT ya es de «${repetido.nombreFantasia || repetido.razonSocial}». El RUT es único entre empresas.`
          : null;
      }}
      toFormValues={(c) => ({
        nombreFantasia: c.nombreFantasia,
        razonSocial: c.razonSocial,
        rut: c.rut,
        activo: c.activo,
        motivoInactivo: c.motivoInactivo ?? "",
        notas: c.notas ?? "",
        planCalibracion: siNoAForm(c.planCalibracion),
      })}
      guardarAction={(id, f) =>
        guardarClienteAction(id, {
          rut: String(f.rut).trim(),
          razonSocial: String(f.razonSocial).trim(),
          nombreFantasia: String(f.nombreFantasia).trim() || String(f.razonSocial).trim(),
          activo: f.activo !== false,
          motivoInactivo: String(f.motivoInactivo ?? "").trim() || null,
          notas: String(f.notas ?? "").trim() || null,
          planCalibracion: formASiNo(f.planCalibracion),
        })
      }
      emptyRow={{ nombreFantasia: "", razonSocial: "", rut: "", activo: true, motivoInactivo: "", notas: "", planCalibracion: "" }}
    />
  );
}

/** Una cifra del resumen: el mismo bloque de los KPI del panel, sin enlace. */
function Cifra({ label, n, sub }: { label: string; n: number; sub: string }) {
  return (
    <div className="px-4 md:px-6 pt-4 md:pt-[22px] pb-4.5 border-r max-lg:border-b border-black/[.2]">
      <div className="text-[10px] tracking-[.12em] uppercase opacity-66">{label}</div>
      <div className="font-extrabold text-[32px] md:text-[40px] leading-none tracking-[-.03em] tabular-nums mt-3">{n}</div>
      <div className="text-xs opacity-66 mt-2.5">{sub}</div>
    </div>
  );
}
