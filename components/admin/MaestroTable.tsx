"use client";

import { useMemo, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import FiltrosBar from "@/components/admin/FiltrosBar";
import Dialogo, { type CampoDef, type FormValores } from "@/components/admin/Dialogo";
import { Toast, useToast } from "@/components/ui/Toast";

export interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render?: (row: T) => React.ReactNode;
}

export interface FieldConfig extends CampoDef {
  /** Oculta el campo según lo que se haya elegido en otro (rol, por ejemplo). */
  visible?: (form: FormValores) => boolean;
}

/**
 * Tabla de un maestro con su diálogo de alta y edición — el mismo patrón del
 * mockup para Técnicos, Usuarios, Clientes y Sucursales. La fila no abre nada:
 * el diálogo se abre solo desde el lápiz.
 */
export default function MaestroTable<T extends { id: number }>({
  kicker,
  title,
  addLabel,
  editLabel,
  dialogoKicker,
  nota,
  columns,
  initialRows,
  fields,
  searchKeys,
  phBusqueda,
  toFormValues,
  fromFormValues,
  emptyRow,
  validar,
}: {
  kicker: string;
  title: string;
  addLabel: string;
  editLabel: string;
  dialogoKicker: string;
  nota?: string;
  columns: Column<T>[];
  initialRows: T[];
  fields: FieldConfig[];
  searchKeys: (row: T) => string;
  phBusqueda: string;
  toFormValues: (row: T) => FormValores;
  fromFormValues: (form: FormValores, id: number) => T;
  emptyRow: FormValores;
  /** Devuelve el texto del error, o null si el formulario está correcto. */
  validar?: (form: FormValores) => string | null;
}) {
  const { toast, aviso } = useToast();
  const [rows, setRows] = useState(initialRows);
  const [busqueda, setBusqueda] = useState("");
  const [dialogo, setDialogo] = useState<{ id: number | null; form: FormValores } | null>(null);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => searchKeys(r).toLowerCase().includes(q));
  }, [rows, busqueda, searchKeys]);

  function guardar() {
    if (!dialogo) return;
    const error = validar?.(dialogo.form);
    if (error) return aviso(error);

    if (dialogo.id === null) {
      const nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;
      setRows((prev) => [fromFormValues(dialogo.form, nextId), ...prev]);
      aviso("Registro creado");
    } else {
      setRows((prev) => prev.map((r) => (r.id === dialogo.id ? fromFormValues(dialogo.form, r.id) : r)));
      aviso("Cambios guardados");
    }
    setDialogo(null);
  }

  const camposVisibles = dialogo ? fields.filter((f) => !f.visible || f.visible(dialogo.form)) : [];

  return (
    <>
      <AdminHeader kicker={kicker} title={title}>
        <button onClick={() => setDialogo({ id: null, form: emptyRow })} className="btn btn-primary">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>{addLabel}</span>
        </button>
      </AdminHeader>

      <div className="pb-10 animate-fade-in">
        <FiltrosBar
          busqueda={busqueda}
          phBusqueda={phBusqueda}
          onBusqueda={setBusqueda}
          campos={[]}
          chips={[]}
          onLimpiar={() => setBusqueda("")}
          conteo={`${filtradas.length} ${filtradas.length === 1 ? "registro" : "registros"}`}
        />

        <div className="px-7">
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} style={{ textAlign: c.align ?? "left" }}>
                    {c.label}
                  </th>
                ))}
                <th style={{ width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {filtradas.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align ?? "left" }}>
                      {c.render ? c.render(row) : String((row as unknown as Record<string, unknown>)[c.key] ?? "")}
                    </td>
                  ))}
                  <td className="text-right">
                    <button
                      onClick={() => setDialogo({ id: row.id, form: toFormValues(row) })}
                      className="btn btn-icon w-8 h-8 border border-black/[.3]"
                      aria-label={`Editar ${title.toLowerCase()}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 20h4l10-10-4-4L4 16v4z" />
                        <path d="M14 6l4 4" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtradas.length === 0 ? (
            <div className="py-14 text-center">
              <div className="font-extrabold text-[17px] mb-1.5">Nada que mostrar</div>
              <div className="text-[13px] opacity-66">Ajusta la búsqueda.</div>
            </div>
          ) : null}
        </div>
      </div>

      {dialogo ? (
        <Dialogo
          kicker={dialogoKicker}
          titulo={dialogo.id === null ? addLabel : editLabel}
          cta={dialogo.id === null ? addLabel.replace(/^Nuev[oa]/, "Crear") : "Guardar cambios"}
          nota={nota}
          campos={camposVisibles}
          form={dialogo.form}
          onCampo={(k, v) => setDialogo({ ...dialogo, form: { ...dialogo.form, [k]: v } })}
          onCerrar={() => setDialogo(null)}
          onGuardar={guardar}
        />
      ) : null}

      <Toast texto={toast} variante="panel" />
    </>
  );
}
