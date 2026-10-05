"use client";

import { useCallback, useState } from "react";
import MaestroTable from "@/components/admin/MaestroTable";
import Tag from "@/components/Tag";
import { guardarSucursalAction } from "@/app/actions/maestros";
import { REGIONES } from "@/lib/ui/regiones";
import { OPCIONES_SI_NO, formASiNo, siNoAForm } from "@/lib/ui/sino";
import type { Cliente, Mall, Sucursal } from "@/lib/types";

/** El filtro de una marca opcional: "" = todas, y si no, sí / no / sin indicar. */
const OPCIONES_FILTRO_SI_NO = [
  { v: "", t: "Todas" },
  { v: "si", t: "Sí" },
  { v: "no", t: "No" },
  { v: "nd", t: "Sin indicar" },
];
const pasaSiNo = (filtro: string, v: boolean | null | undefined) =>
  !filtro || (filtro === "nd" ? v === null || v === undefined : siNoAForm(v) === filtro);
const textoSiNo = (filtro: string) => OPCIONES_FILTRO_SI_NO.find((o) => o.v === filtro)?.t ?? "";

export default function SucursalesTable({
  sucursales,
  clientes,
  malls,
  clienteInicial = "",
}: {
  sucursales: Sucursal[];
  clientes: Cliente[];
  malls: Mall[];
  /** Llega con «Ver locales» desde Clientes: la lista abre filtrada a ese cliente. */
  clienteInicial?: string;
}) {
  const nombreCliente = (id: number) => clientes.find((c) => c.id === id)?.nombreFantasia ?? "—";
  const nombreMall = (id?: number | null) => malls.find((m) => m.id === id)?.nombre ?? "";

  const [fCliente, setFCliente] = useState(clientes.some((c) => String(c.id) === clienteInicial) ? clienteInicial : "");
  const [fGarantia, setFGarantia] = useState("");
  const [fRemota, setFRemota] = useState("");
  const pasa = useCallback(
    (s: Sucursal) =>
      (!fCliente || String(s.clienteId) === fCliente) && pasaSiNo(fGarantia, s.enGarantia) && pasaSiNo(fRemota, s.remota),
    [fCliente, fGarantia, fRemota]
  );

  return (
    <MaestroTable<Sucursal>
      kicker="Maestros"
      title="Sucursales"
      modulo="sucursales"
      addLabel="Nueva sucursal"
      editLabel="Editar sucursal"
      dialogoKicker="Maestro · sucursal"
      nota="La sucursal siempre pertenece a un cliente y no se puede dejar sin él. El mall es opcional: elegirlo le pone a la sucursal la ubicación del mall y, si es nueva, también su nombre."
      phBusqueda="Buscar sucursal, comuna, mall, código…"
      rows={sucursales}
      filtros={{
        campos: [
          {
            id: "f-cliente",
            label: "Cliente",
            valor: fCliente,
            opciones: [{ v: "", t: "Todos" }, ...clientes.map((c) => ({ v: String(c.id), t: c.nombreFantasia }))],
            onChange: setFCliente,
          },
          { id: "f-garantia", label: "En garantía", valor: fGarantia, opciones: OPCIONES_FILTRO_SI_NO, onChange: setFGarantia },
          { id: "f-remota", label: "Remota", valor: fRemota, opciones: OPCIONES_FILTRO_SI_NO, onChange: setFRemota },
        ],
        chips: [
          ...(fCliente ? [{ label: `Cliente: ${nombreCliente(Number(fCliente))}`, onQuitar: () => setFCliente("") }] : []),
          ...(fGarantia ? [{ label: `Garantía: ${textoSiNo(fGarantia)}`, onQuitar: () => setFGarantia("") }] : []),
          ...(fRemota ? [{ label: `Remota: ${textoSiNo(fRemota)}`, onQuitar: () => setFRemota("") }] : []),
        ],
        pasa,
        limpiar: () => {
          setFCliente("");
          setFGarantia("");
          setFRemota("");
        },
      }}
      searchKeys={(s) => `${s.nombre} ${s.codigo ?? ""} ${s.comuna} ${s.direccion} ${nombreCliente(s.clienteId)} ${nombreMall(s.mallId)}`}
      columns={[
        { key: "nombre", label: "Sucursal" },
        { key: "cliente", label: "Cliente", render: (s) => nombreCliente(s.clienteId) },
        { key: "mall", label: "Mall", render: (s) => nombreMall(s.mallId) || "—" },
        { key: "codigo", label: "Código", render: (s) => s.codigo ?? "—" },
        { key: "direccion", label: "Dirección" },
        { key: "comuna", label: "Comuna" },
        {
          key: "detalle",
          label: "Detalle",
          render: (s) =>
            s.fechaInstalacion || (s.remota ?? null) !== null || (s.enGarantia ?? null) !== null ? (
              <div className="flex flex-wrap gap-1 max-w-[220px]">
                {s.enGarantia === true ? <Tag variant="accent">En garantía</Tag> : null}
                {s.enGarantia === false ? <Tag variant="outline">Sin garantía</Tag> : null}
                {s.remota === true ? <Tag variant="dark">Remota</Tag> : null}
                {s.remota === false ? <Tag variant="outline">Presencial</Tag> : null}
                {s.fechaInstalacion ? (
                  <div className="basis-full text-[11px] opacity-66 tabular-nums">Instalada el {s.fechaInstalacion}</div>
                ) : null}
              </div>
            ) : (
              <span className="opacity-50">—</span>
            ),
        },
        {
          key: "activo",
          label: "Estado",
          render: (s) => (
            <>
              <Tag variant={s.activo ? "accent" : "neutral"}>{s.activo ? "Activa" : "Inactiva"}</Tag>
              {!s.activo && s.motivoInactivo ? (
                <div className="text-[11px] leading-[1.4] opacity-66 mt-1 max-w-[260px]">{s.motivoInactivo}</div>
              ) : null}
            </>
          ),
        },
      ]}
      fields={[
        {
          k: "clienteId",
          label: "Cliente",
          tipo: "select",
          opciones: clientes.map((c) => ({ v: String(c.id), t: c.nombreFantasia })),
        },
        {
          k: "mallId",
          label: "Mall (opcional)",
          tipo: "select",
          buscable: true,
          opciones: [
            { v: "", t: "Sin mall" },
            ...malls.map((m) => ({ v: String(m.id), t: m.activo ? m.nombre : `${m.nombre} · inactivo` })),
          ],
          ayuda: "Al elegirlo, la sucursal toma la dirección, la comuna y la región del mall. Al crearla, también el nombre.",
          visible: () => malls.length > 0,
        },
        { k: "nombre", label: "Nombre de la sucursal" },
        { k: "codigo", label: "Código interno (opcional)", ph: "MS-118" },
        { k: "telefono", label: "Teléfono", tipo: "tel", ph: "+56 2 2299 4100" },
        { k: "direccion", label: "Dirección", span: 2 },
        { k: "comuna", label: "Comuna" },
        { k: "region", label: "Región", tipo: "select", opciones: REGIONES.map((r) => ({ v: r, t: r })) },
        { k: "fechaInstalacion", label: "Fecha de instalación (opcional)", tipo: "date" },
        { k: "remota", label: "¿Es remota? (opcional)", tipo: "select", opciones: OPCIONES_SI_NO },
        { k: "enGarantia", label: "¿Está en garantía? (opcional)", tipo: "select", opciones: OPCIONES_SI_NO },
        { k: "activo", label: "Estado", tipo: "toggle" },
        {
          k: "motivoInactivo",
          label: "¿Por qué se desactiva?",
          tipo: "area",
          span: 2,
          ph: "Cierre de la tienda, cambio de local, término de contrato…",
          ayuda: "Obligatorio para dejar la sucursal inactiva. Se borra si se reactiva.",
          visible: (f) => f.activo === false,
        },
        { k: "notas", label: "Notas", tipo: "area", span: 2, ph: "Lo que conviene saber de esta tienda" },
      ]}
      validar={(f) => {
        if (!String(f.nombre).trim() || !f.clienteId) return "Nombre y cliente son obligatorios";
        if (f.activo === false && !String(f.motivoInactivo ?? "").trim()) {
          return "Explica por qué se desactiva la sucursal";
        }
        return null;
      }}
      // La ubicación sigue al mall siempre. El nombre solo en un alta: una
      // sucursal que ya existe no cambia de nombre por moverla de mall.
      alCambiar={(k, v, _f, id) => {
        if (k !== "mallId") return null;
        const mall = malls.find((m) => String(m.id) === v);
        if (!mall) return null;
        // Los malls de antes de la migración 012 no tienen comuna ni región: ahí se deja lo escrito.
        return {
          ...(id === null ? { nombre: mall.nombre } : null),
          direccion: mall.direccion,
          ...(mall.comuna ? { comuna: mall.comuna } : null),
          ...(mall.region ? { region: mall.region } : null),
        };
      }}
      toFormValues={(s) => ({
        clienteId: String(s.clienteId),
        mallId: s.mallId ? String(s.mallId) : "",
        nombre: s.nombre,
        codigo: s.codigo ?? "",
        direccion: s.direccion,
        comuna: s.comuna,
        region: s.region,
        telefono: s.telefono ?? "",
        activo: s.activo,
        motivoInactivo: s.motivoInactivo ?? "",
        notas: s.notas ?? "",
        fechaInstalacion: s.fechaInstalacion ?? "",
        remota: siNoAForm(s.remota),
        enGarantia: siNoAForm(s.enGarantia),
      })}
      guardarAction={(id, f) =>
        guardarSucursalAction(id, {
          clienteId: Number(f.clienteId),
          mallId: Number(f.mallId) || null,
          nombre: String(f.nombre).trim(),
          codigo: String(f.codigo ?? "").trim() || null,
          direccion: String(f.direccion).trim(),
          comuna: String(f.comuna).trim(),
          region: String(f.region),
          telefono: String(f.telefono).trim() || null,
          activo: f.activo !== false,
          motivoInactivo: String(f.motivoInactivo ?? "").trim() || null,
          notas: String(f.notas ?? "").trim() || null,
          fechaInstalacion: String(f.fechaInstalacion ?? "") || null,
          remota: formASiNo(f.remota),
          enGarantia: formASiNo(f.enGarantia),
        })
      }
      emptyRow={{
        clienteId: String(clientes[0]?.id ?? ""),
        mallId: "",
        nombre: "",
        codigo: "",
        direccion: "",
        comuna: "",
        region: REGIONES[0],
        telefono: "",
        activo: true,
        motivoInactivo: "",
        notas: "",
        fechaInstalacion: "",
        remota: "",
        enGarantia: "",
      }}
    />
  );
}
