"use client";

import { useRef, useState } from "react";
import Dialogo from "@/components/admin/Dialogo";
import SelectBuscable from "@/components/ui/SelectBuscable";
import { crearSucursalesLoteAction } from "@/app/actions/maestros";
import { sinTildes } from "@/lib/ui/formato";
import { REGIONES } from "@/lib/ui/regiones";
import type { Cliente, Mall, Sucursal } from "@/lib/types";

/** Una sucursal por crear, todavía en pantalla. `mallId` "" = sin mall. */
interface Nueva {
  key: number;
  mallId: string;
  nombre: string;
  codigo: string;
  direccion: string;
  comuna: string;
  region: string;
}

/**
 * Alta masiva de sucursales de un cliente. Mismos campos y misma forma que el
 * formulario de una sucursal, repetidos en una tarjeta por tienda. Nada se
 * guarda hasta confirmar: ahí entran todas juntas.
 */
export default function SucursalesLoteDialogo({
  sucursales,
  clientes,
  malls,
  clienteInicial,
  onCerrar,
  onHecho,
}: {
  sucursales: Sucursal[];
  clientes: Cliente[];
  malls: Mall[];
  clienteInicial: string;
  onCerrar: () => void;
  onHecho: (mensaje: string, guardado: boolean) => void;
}) {
  const contador = useRef(0);
  const vacia = (): Nueva => ({
    key: ++contador.current,
    mallId: "",
    nombre: "",
    codigo: "",
    direccion: "",
    comuna: "",
    region: REGIONES[0],
  });

  const opcClientes = clientes
    .filter((c) => c.activo)
    .map((c) => ({ v: String(c.id), t: c.nombreFantasia }));
  const opcMalls = [
    { v: "", t: "Sin mall" },
    ...malls.filter((m) => m.activo).map((m) => ({ v: String(m.id), t: m.nombre })),
  ];
  const opcRegiones = REGIONES.map((r) => ({ v: r, t: r }));

  const [clienteSel, setClienteSel] = useState(
    opcClientes.some((o) => o.v === clienteInicial) ? clienteInicial : (opcClientes[0]?.v ?? "")
  );
  const [nuevas, setNuevas] = useState<Nueva[]>(() => [vacia()]);
  const [guardando, setGuardando] = useState(false);

  const delCliente = sucursales.filter((s) => String(s.clienteId) === clienteSel);

  function cambiar(key: number, campo: keyof Nueva, valor: string) {
    setNuevas((prev) =>
      prev.map((n) => {
        if (n.key !== key) return n;
        if (campo !== "mallId") return { ...n, [campo]: valor };
        // Como en el alta de una sucursal: el mall le pone nombre y ubicación.
        const mall = malls.find((m) => String(m.id) === valor);
        if (!mall) return { ...n, mallId: valor };
        return {
          ...n,
          mallId: valor,
          nombre: mall.nombre,
          direccion: mall.direccion,
          ...(mall.comuna ? { comuna: mall.comuna } : null),
          ...(mall.region ? { region: mall.region } : null),
        };
      })
    );
  }

  /** El texto del primer problema, o null si todo está listo para guardar. */
  function problema(): string | null {
    if (!clienteSel) return "Elige el cliente.";
    if (nuevas.length === 0) return "Agrega al menos una sucursal.";
    const nombres = new Set(delCliente.map((s) => sinTildes(s.nombre.trim())));
    const codigos = new Set(delCliente.map((s) => (s.codigo ?? "").trim().toLowerCase()).filter(Boolean));
    for (const [i, n] of nuevas.entries()) {
      const cual = `Sucursal ${i + 1}`;
      if (!n.nombre.trim()) return `${cual}: falta el nombre.`;
      if (!n.direccion.trim() || !n.comuna.trim()) return `${cual}: faltan la dirección o la comuna.`;
      const nombre = sinTildes(n.nombre.trim());
      if (nombres.has(nombre)) return `${cual}: el cliente ya tiene (o repites) «${n.nombre.trim()}».`;
      nombres.add(nombre);
      const codigo = n.codigo.trim().toLowerCase();
      if (codigo) {
        if (codigos.has(codigo)) return `${cual}: el código ${n.codigo.trim()} ya existe (o está repetido).`;
        codigos.add(codigo);
      }
    }
    return null;
  }

  async function guardar() {
    const error = problema();
    if (error) return onHecho(error, false);
    setGuardando(true);
    const res = await crearSucursalesLoteAction(
      Number(clienteSel),
      nuevas.map((n) => ({
        mallId: Number(n.mallId) || null,
        nombre: n.nombre.trim(),
        codigo: n.codigo.trim() || null,
        direccion: n.direccion.trim(),
        comuna: n.comuna.trim(),
        region: n.region,
      }))
    );
    setGuardando(false);
    if (!res.ok) return onHecho(res.error ?? "No se pudo guardar.", false);
    onHecho(`${nuevas.length} ${nuevas.length === 1 ? "sucursal creada" : "sucursales creadas"}`, true);
    onCerrar();
  }

  return (
    <Dialogo
      kicker="Maestro · alta masiva"
      titulo="Nuevas sucursales"
      cta={
        nuevas.length > 1
          ? `Crear ${nuevas.length} sucursales`
          : "Crear sucursal"
      }
      nota="Al elegir un mall, la sucursal toma su nombre, dirección, comuna y región. Nada se guarda hasta confirmar: entonces se crean todas juntas."
      campos={[]}
      form={{}}
      onCampo={() => {}}
      onCerrar={onCerrar}
      onGuardar={guardar}
      guardando={guardando}
    >
      <div className="field min-w-0">
        <label htmlFor="sl-cliente">Cliente</label>
        <SelectBuscable
          id="sl-cliente"
          valor={clienteSel}
          opciones={opcClientes}
          onChange={setClienteSel}
          ariaLabel="Cliente"
        />
        {clienteSel ? (
          <div className="text-[11px] leading-[1.4] opacity-66 mt-1.5">
            {delCliente.length === 0
              ? "Todavía no tiene sucursales."
              : `Ya tiene ${delCliente.length} ${delCliente.length === 1 ? "sucursal" : "sucursales"}: no se pueden repetir nombres ni códigos.`}
          </div>
        ) : null}
      </div>

      {nuevas.map((n, i) => (
        <div key={n.key} className="mt-5 border border-black/[.3]">
          <div className="flex items-center gap-2.5 px-3.5 py-2 bg-[var(--color-surface)] border-b border-[var(--color-divider-soft)]">
            <div className="font-extrabold text-[11px] tracking-[.11em] uppercase">Sucursal {i + 1}</div>
            {nuevas.length > 1 ? (
              <button
                type="button"
                onClick={() => setNuevas((prev) => prev.filter((x) => x.key !== n.key))}
                className="ml-auto flex items-center gap-1.5 min-h-8 px-2 bg-transparent border-0 cursor-pointer text-[var(--color-text)] text-[11px] tracking-[.06em] uppercase opacity-72 hover:opacity-100"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
                <span>Quitar</span>
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 sm:p-4">
            {malls.length > 0 ? (
              <div className="field min-w-0 sm:col-span-2">
                <label htmlFor={`sl-mall-${n.key}`}>Mall (opcional)</label>
                <SelectBuscable
                  id={`sl-mall-${n.key}`}
                  valor={n.mallId}
                  opciones={opcMalls}
                  onChange={(v) => cambiar(n.key, "mallId", v)}
                  ariaLabel="Mall"
                />
              </div>
            ) : null}
            <div className="field min-w-0">
              <label htmlFor={`sl-n-${n.key}`}>Nombre de la sucursal</label>
              <input
                id={`sl-n-${n.key}`}
                className="input"
                value={n.nombre}
                onChange={(e) => cambiar(n.key, "nombre", e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="field min-w-0">
              <label htmlFor={`sl-c-${n.key}`}>Código interno (opcional)</label>
              <input
                id={`sl-c-${n.key}`}
                className="input"
                value={n.codigo}
                onChange={(e) => cambiar(n.key, "codigo", e.target.value)}
                placeholder="MS-118"
                autoComplete="off"
              />
            </div>
            <div className="field min-w-0 sm:col-span-2">
              <label htmlFor={`sl-d-${n.key}`}>Dirección</label>
              <input
                id={`sl-d-${n.key}`}
                className="input"
                value={n.direccion}
                onChange={(e) => cambiar(n.key, "direccion", e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="field min-w-0">
              <label htmlFor={`sl-m-${n.key}`}>Comuna</label>
              <input
                id={`sl-m-${n.key}`}
                className="input"
                value={n.comuna}
                onChange={(e) => cambiar(n.key, "comuna", e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="field min-w-0">
              <label htmlFor={`sl-r-${n.key}`}>Región</label>
              <SelectBuscable
                id={`sl-r-${n.key}`}
                valor={n.region}
                opciones={opcRegiones}
                onChange={(v) => cambiar(n.key, "region", v)}
                ariaLabel="Región"
              />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setNuevas((prev) => [...prev, vacia()])}
        className="btn btn-secondary w-full min-h-11 mt-4 justify-center"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>Agregar otra sucursal</span>
      </button>
    </Dialogo>
  );
}
