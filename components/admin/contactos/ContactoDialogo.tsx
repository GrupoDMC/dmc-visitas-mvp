"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Dialogo, { type FormValores } from "@/components/admin/Dialogo";
import SelectBuscable from "@/components/ui/SelectBuscable";
import { guardarContactoAction } from "@/app/actions/contactos";
import { ALCANCES, ETIQUETA_ALCANCE, problemaDeCargos, type AlcanceTipo, type CargoContacto, type Contacto } from "@/lib/ui/contactos";
import { fmtTel } from "@/lib/ui/formato";
import { useReferencias } from "@/lib/ui/referencias";
import { REGIONES } from "@/lib/ui/regiones";

/** Un cargo mientras se edita: el alcance va como texto para poder usarlo en un select. */
interface CargoEnEdicion {
  key: number;
  cargo: string;
  tipo: AlcanceTipo;
  /** El id (cliente, marca, sucursal) o el nombre de la región, según `tipo`. */
  alcance: string;
}

let contador = 0;

const aEdicion = (c: Pick<CargoContacto, "cargo" | "alcanceTipo" | "alcanceId" | "alcanceTexto">): CargoEnEdicion => ({
  key: ++contador,
  cargo: c.cargo,
  tipo: c.alcanceTipo,
  alcance: c.alcanceTipo === "REGION" ? (c.alcanceTexto ?? "") : c.alcanceId ? String(c.alcanceId) : "",
});

/**
 * Alta y edición de un contacto con sus cargos. Cada cargo tiene su propio
 * alcance —un cliente, una marca, una región o una sucursal— y un contacto
 * puede tener varios. `cargoInicial` deja armado el primero (en la ficha de una
 * sucursal, el cargo ya viene con esa sucursal como alcance).
 */
export default function ContactoDialogo({
  contacto,
  cargoInicial,
  onCerrar,
}: {
  contacto: Contacto | null;
  cargoInicial?: Pick<CargoContacto, "alcanceTipo" | "alcanceId" | "alcanceTexto">;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const ref = useReferencias();
  const [form, setForm] = useState<FormValores>(() => ({
    nombre: contacto?.nombre ?? "",
    email: contacto?.email ?? "",
    telefono: contacto?.telefono ?? "",
    activo: contacto?.activo ?? true,
  }));
  const [cargos, setCargos] = useState<CargoEnEdicion[]>(() =>
    contacto?.cargos.length
      ? contacto.cargos.map(aEdicion)
      : [aEdicion({ cargo: "", ...(cargoInicial ?? { alcanceTipo: "CLIENTE", alcanceId: null, alcanceTexto: null }) })]
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nombreCliente = (id: number) => ref.clientes.find((c) => c.id === id)?.nombreFantasia ?? "";
  const opcionesDe = (tipo: AlcanceTipo) => {
    switch (tipo) {
      case "CLIENTE":
        return ref.clientes.filter((c) => c.activo).map((c) => ({ v: String(c.id), t: c.nombreFantasia }));
      case "MARCA":
        return ref.marcas.filter((m) => m.activo).map((m) => ({ v: String(m.id), t: `${m.nombre} · ${nombreCliente(m.clienteId)}` }));
      case "SUCURSAL":
        return ref.sucursales.filter((s) => s.activo).map((s) => ({ v: String(s.id), t: `${s.nombre} · ${nombreCliente(s.clienteId)}` }));
      case "REGION":
        return REGIONES.map((r) => ({ v: r, t: r }));
    }
  };

  function cambiarCargo(key: number, cambio: Partial<CargoEnEdicion>) {
    setError(null);
    setCargos((prev) => prev.map((c) => (c.key === key ? { ...c, ...cambio } : c)));
  }

  async function guardar() {
    const datos = {
      nombre: String(form.nombre).trim(),
      email: String(form.email).trim() || null,
      telefono: String(form.telefono).trim() || null,
      activo: form.activo !== false,
      cargos: cargos.map((c) => ({
        cargo: c.cargo.trim(),
        alcanceTipo: c.tipo,
        alcanceId: c.tipo === "REGION" ? null : Number(c.alcance) || null,
        alcanceTexto: c.tipo === "REGION" ? c.alcance || null : null,
      })),
    };
    if (!datos.nombre) return setError("El nombre del contacto es obligatorio.");
    const fallo = problemaDeCargos(datos.cargos);
    if (fallo) return setError(fallo);
    setGuardando(true);
    const res = await guardarContactoAction(contacto?.id ?? null, datos);
    setGuardando(false);
    if (!res.ok) return setError(res.error ?? "No se pudo guardar.");
    onCerrar();
    router.refresh();
  }

  return (
    <Dialogo
      kicker="Maestro · contacto"
      titulo={contacto ? "Editar contacto" : "Nuevo contacto"}
      cta={contacto ? "Guardar cambios" : "Crear contacto"}
      nota="Un contacto puede tener varios cargos. Cada cargo vale para su propio alcance: un cliente, una marca, una región o una sucursal, y las tiendas que ese alcance contiene lo heredan."
      campos={[
        { k: "nombre", label: "Nombre", span: 2 },
        { k: "email", label: "Correo (opcional)", tipo: "email" },
        { k: "telefono", label: "Teléfono (opcional)", tipo: "tel", ph: "+56 9 1234 5678" },
        { k: "activo", label: "Estado", tipo: "toggle" },
      ]}
      form={form}
      onCampo={(k, v) => {
        setError(null);
        setForm((prev) => ({ ...prev, [k]: k === "telefono" ? fmtTel(String(v)) : v }));
      }}
      onCerrar={onCerrar}
      onGuardar={guardar}
      guardando={guardando}
    >
      <div className="mt-5">
        <div className="text-[11px] tracking-[.11em] uppercase opacity-72 mb-2">Cargos y alcance</div>
        {cargos.map((c, i) => (
          <div key={c.key} className="mb-3 p-3 border border-black/[.2] grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="field min-w-0">
              <label htmlFor={`cg-cargo-${c.key}`}>Cargo {cargos.length > 1 ? i + 1 : ""}</label>
              <input
                id={`cg-cargo-${c.key}`}
                className="input"
                value={c.cargo}
                placeholder="Gerente de marca, Jefe de tienda…"
                onChange={(e) => cambiarCargo(c.key, { cargo: e.target.value })}
              />
            </div>
            <div className="field min-w-0">
              <label htmlFor={`cg-tipo-${c.key}`}>Vale para</label>
              <select
                id={`cg-tipo-${c.key}`}
                className="input"
                value={c.tipo}
                onChange={(e) => cambiarCargo(c.key, { tipo: e.target.value as AlcanceTipo, alcance: "" })}
              >
                {ALCANCES.map((a) => (
                  <option key={a} value={a}>
                    {ETIQUETA_ALCANCE[a]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field min-w-0 sm:col-span-2">
              <label htmlFor={`cg-alcance-${c.key}`}>{ETIQUETA_ALCANCE[c.tipo]}</label>
              <SelectBuscable
                id={`cg-alcance-${c.key}`}
                valor={c.alcance}
                opciones={opcionesDe(c.tipo)}
                onChange={(v) => cambiarCargo(c.key, { alcance: v })}
                ariaLabel={ETIQUETA_ALCANCE[c.tipo]}
              />
            </div>
            {cargos.length > 1 ? (
              <button
                type="button"
                className="btn btn-ghost sm:col-span-2 justify-self-start"
                onClick={() => setCargos((prev) => prev.filter((x) => x.key !== c.key))}
              >
                Quitar este cargo
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setCargos((prev) => [...prev, aEdicion({ cargo: "", alcanceTipo: "CLIENTE", alcanceId: null, alcanceTexto: null })])}
        >
          Agregar otro cargo
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-4 mb-0 text-[13px] font-extrabold text-[var(--color-accent-800)]">
          {error}
        </p>
      ) : null}
    </Dialogo>
  );
}
