"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Dialogo, { type FormValores } from "@/components/admin/Dialogo";
import Tag from "@/components/Tag";
import { guardarMarcaAction } from "@/app/actions/maestros";
import { sinTildes } from "@/lib/ui/formato";
import { puede, useReferencias } from "@/lib/ui/referencias";
import type { Marca } from "@/lib/types";

/**
 * Las marcas de un cliente, en su ficha: Cliente → Marca → Sucursal. Se agregan,
 * se renombran y se desactivan aquí. La marca por defecto que creó la migración
 * lleva el nombre del cliente: este es el lugar para corregirla o repartir sus
 * tiendas entre las marcas de verdad.
 */
export default function MarcasSeccion({
  clienteId,
  marcas,
  tiendasPorMarca,
}: {
  clienteId: number;
  marcas: Marca[];
  /** Cuántas sucursales tiene cada marca (por id). */
  tiendasPorMarca: Record<number, number>;
}) {
  const router = useRouter();
  const ref = useReferencias();
  const [dialogo, setDialogo] = useState<{ marca: Marca | null; form: FormValores } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function abrir(marca: Marca | null) {
    setError(null);
    setDialogo({ marca, form: { nombre: marca?.nombre ?? "", activo: marca?.activo ?? true } });
  }

  async function guardar() {
    if (!dialogo) return;
    const nombre = String(dialogo.form.nombre).trim();
    if (!nombre) return setError("El nombre de la marca es obligatorio.");
    const repetida = marcas.find((m) => m.id !== dialogo.marca?.id && sinTildes(m.nombre) === sinTildes(nombre));
    if (repetida) return setError(`Este cliente ya tiene la marca «${repetida.nombre}».`);
    setGuardando(true);
    const res = await guardarMarcaAction(dialogo.marca?.id ?? null, {
      clienteId,
      nombre,
      activo: dialogo.form.activo !== false,
    });
    setGuardando(false);
    if (!res.ok) return setError(res.error ?? "No se pudo guardar.");
    setDialogo(null);
    router.refresh();
  }

  return (
    <div className="p-4 md:p-6 border-b border-black/[.12]">
      <div className="flex items-center gap-2.5 flex-wrap">
        <h2 className="font-extrabold text-[17px] m-0">Marcas</h2>
        <span className="text-[11px] tracking-[.08em] uppercase opacity-60">{marcas.length}</span>
        {puede(ref, "marcas.crear") ? (
          <button type="button" className="btn btn-secondary ml-auto" onClick={() => abrir(null)}>
            Agregar marca
          </button>
        ) : null}
      </div>
      {marcas.length === 0 ? (
        <p className="mt-3 mb-0 text-[13px] opacity-62">Este cliente todavía no tiene marcas.</p>
      ) : (
        <ul className="list-none m-0 mt-2 p-0">
          {marcas.map((m) => {
            const n = tiendasPorMarca[m.id] ?? 0;
            return (
              <li key={m.id} className="flex items-center gap-3 py-2.5 border-b border-black/[.1]">
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-[14px]">{m.nombre}</span>{" "}
                  <span className="text-[12px] opacity-62">
                    · {n} {n === 1 ? "sucursal" : "sucursales"}
                  </span>
                </div>
                {!m.activo ? <Tag variant="neutral">Inactiva</Tag> : null}
                {puede(ref, "marcas.editar") ? (
                  <button type="button" className="btn btn-ghost flex-none" onClick={() => abrir(m)}>
                    Editar
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {dialogo ? (
        <Dialogo
          kicker="Maestro · marca"
          titulo={dialogo.marca ? "Editar marca" : "Nueva marca"}
          cta={dialogo.marca ? "Guardar cambios" : "Crear marca"}
          nota="Las sucursales de la marca se eligen al crearlas o al editarlas."
          campos={[
            { k: "nombre", label: "Nombre de la marca", span: 2 },
            { k: "activo", label: "Estado", tipo: "toggle" },
          ]}
          form={dialogo.form}
          onCampo={(k, v) => {
            setError(null);
            setDialogo((d) => (d ? { ...d, form: { ...d.form, [k]: v } } : d));
          }}
          onCerrar={() => setDialogo(null)}
          onGuardar={guardar}
          guardando={guardando}
        >
          {error ? (
            <p role="alert" className="mt-4 mb-0 text-[13px] font-extrabold text-[var(--color-accent-800)]">
              {error}
            </p>
          ) : null}
        </Dialogo>
      ) : null}
    </div>
  );
}
