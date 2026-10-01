"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MaestroTable from "@/components/admin/MaestroTable";
import Dialogo from "@/components/admin/Dialogo";
import SelectBuscable from "@/components/ui/SelectBuscable";
import Tag from "@/components/Tag";
import { Toast, useToast } from "@/components/ui/Toast";
import { guardarMallAction, guardarTiendasMallAction } from "@/app/actions/maestros";
import { puede, useReferencias } from "@/lib/ui/referencias";
import { REGIONES } from "@/lib/ui/regiones";
import type { Cliente, Mall, Sucursal } from "@/lib/types";

export default function MallsTable({
  malls,
  sucursales,
  clientes,
}: {
  malls: Mall[];
  sucursales: Sucursal[];
  clientes: Cliente[];
}) {
  const router = useRouter();
  const ref = useReferencias();
  const { toast, aviso } = useToast();
  const [tiendasDe, setTiendasDe] = useState<Mall | null>(null);
  const nTiendas = (mallId: number) => sucursales.filter((s) => s.mallId === mallId).length;

  return (
    <>
      <MaestroTable<Mall>
        kicker="Maestros"
        title="Malls"
        modulo="malls"
        addLabel="Nuevo mall"
        editLabel="Editar mall"
        dialogoKicker="Maestro · mall"
        nota="Las tiendas del mall se agregan desde el botón de la fila, una vez creado."
        phBusqueda="Buscar mall, dirección o comuna…"
        rows={malls}
        searchKeys={(m) => `${m.nombre} ${m.direccion} ${m.comuna} ${m.region}`}
        columns={[
          { key: "nombre", label: "Mall" },
          { key: "direccion", label: "Dirección" },
          { key: "comuna", label: "Comuna", render: (m) => m.comuna || "—" },
          { key: "tiendas", label: "Tiendas", align: "right", render: (m) => nTiendas(m.id) },
          {
            key: "activo",
            label: "Estado",
            render: (m) => <Tag variant={m.activo ? "accent" : "neutral"}>{m.activo ? "Activo" : "Inactivo"}</Tag>,
          },
        ]}
        fields={[
          { k: "nombre", label: "Nombre del mall", span: 2, ph: "Mall Plaza Vespucio" },
          { k: "direccion", label: "Dirección", span: 2, ph: "Av. Vicuña Mackenna 7110" },
          { k: "comuna", label: "Comuna", ph: "La Florida" },
          { k: "region", label: "Región", tipo: "select", opciones: REGIONES.map((r) => ({ v: r, t: r })) },
          { k: "activo", label: "Estado", tipo: "toggle", span: 2 },
        ]}
        validar={(f) =>
          String(f.nombre).trim() && String(f.direccion).trim() && String(f.comuna).trim()
            ? null
            : "Nombre, dirección y comuna son obligatorios"
        }
        toFormValues={(m) => ({
          nombre: m.nombre,
          direccion: m.direccion,
          comuna: m.comuna,
          // Los malls de antes de la migración 012 no tienen región: el select parte en la primera.
          region: m.region || REGIONES[0],
          activo: m.activo,
        })}
        guardarAction={(id, f) =>
          guardarMallAction(id, {
            nombre: String(f.nombre).trim(),
            direccion: String(f.direccion).trim(),
            comuna: String(f.comuna).trim(),
            region: String(f.region),
            activo: f.activo !== false,
          })
        }
        emptyRow={{ nombre: "", direccion: "", comuna: "", region: REGIONES[0], activo: true }}
        accionFila={
          puede(ref, "malls.editar")
            ? (m) => (
                <button
                  onClick={() => setTiendasDe(m)}
                  className="btn btn-icon w-8 h-8 border border-black/[.3]"
                  aria-label={`Tiendas de ${m.nombre}`}
                  title="Tiendas del mall"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6" />
                  </svg>
                </button>
              )
            : undefined
        }
      />

      {tiendasDe ? (
        <TiendasDialogo
          mall={tiendasDe}
          malls={malls}
          sucursales={sucursales}
          clientes={clientes}
          onCerrar={() => setTiendasDe(null)}
          onHecho={(mensaje, guardado) => {
            aviso(mensaje);
            if (guardado) router.refresh();
          }}
        />
      ) : null}

      <Toast texto={toast} variante="panel" />
    </>
  );
}

/** Para comparar sin tildes ni mayúsculas: «egana» también encuentra «Egaña». */
function sinTildes(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * "Tiendas del mall": las sucursales que están en él.
 *
 * Una tienda es una sucursal de un cliente, la misma de Maestros › Sucursales:
 * acá solo se dice en qué mall queda. Se elige el cliente y se van agregando
 * sus sucursales; nada se guarda hasta confirmar.
 */
function TiendasDialogo({
  mall,
  malls,
  sucursales,
  clientes,
  onCerrar,
  onHecho,
}: {
  mall: Mall;
  malls: Mall[];
  sucursales: Sucursal[];
  clientes: Cliente[];
  onCerrar: () => void;
  onHecho: (mensaje: string, guardado: boolean) => void;
}) {
  const [ids, setIds] = useState<number[]>(() => sucursales.filter((s) => s.mallId === mall.id).map((s) => s.id));
  const opcClientes = clientes.filter((c) => c.activo).map((c) => ({ v: String(c.id), t: c.nombreFantasia }));
  const [clienteSel, setClienteSel] = useState(opcClientes[0]?.v ?? "");
  const [guardando, setGuardando] = useState(false);
  const [porPalabra, setPorPalabra] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const nombreCliente = (id: number) => clientes.find((c) => c.id === id)?.nombreFantasia ?? "—";
  const tiendas = ids
    .map((id) => sucursales.find((s) => s.id === id))
    .filter((s): s is Sucursal => Boolean(s))
    .sort((a, b) => `${nombreCliente(a.clienteId)} ${a.nombre}`.localeCompare(`${nombreCliente(b.clienteId)} ${b.nombre}`));

  // Las sucursales del cliente elegido que todavía no están en la lista. Si
  // una ya es de otro mall se avisa: agregarla acá la saca de allá.
  const libres = sucursales
    .filter((s) => s.activo && String(s.clienteId) === clienteSel && !ids.includes(s.id))
    .map((s) => {
      const otro = s.mallId && s.mallId !== mall.id ? malls.find((m) => m.id === s.mallId)?.nombre : null;
      return { v: String(s.id), t: otro ? `${s.nombre} · hoy en ${otro}` : s.nombre };
    });

  // Búsqueda por palabra: todas las sucursales, de cualquier cliente, que la
  // traigan en el nombre («Egaña» encuentra las de Plaza Egaña de cada marca).
  const palabra = sinTildes(busqueda.trim());
  const encontradas = palabra
    ? sucursales
        .filter((s) => s.activo && !ids.includes(s.id) && sinTildes(s.nombre).includes(palabra))
        .sort((a, b) => `${nombreCliente(a.clienteId)} ${a.nombre}`.localeCompare(`${nombreCliente(b.clienteId)} ${b.nombre}`))
    : [];

  async function guardar() {
    setGuardando(true);
    const res = await guardarTiendasMallAction(mall.id, ids);
    setGuardando(false);
    if (!res.ok) return onHecho(res.error ?? "No se pudo guardar.", false);
    onHecho(`${mall.nombre}: ${ids.length} ${ids.length === 1 ? "tienda" : "tiendas"}`, true);
    onCerrar();
  }

  return (
    <Dialogo
      kicker="Maestro · tiendas del mall"
      titulo={mall.nombre}
      cta="Guardar tiendas"
      nota="Cada tienda es una sucursal de un cliente. Si todavía no existe, créala primero en Maestros › Sucursales. Una sucursal está en un solo mall: al agregarla acá sale del que tenía."
      campos={[]}
      form={{}}
      onCampo={() => {}}
      onCerrar={onCerrar}
      onGuardar={guardar}
      guardando={guardando}
    >
      <div className="border border-black/[.3]">
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--color-surface)] border-b border-[var(--color-divider-soft)]">
          <div className="font-extrabold text-[11px] tracking-[.11em] uppercase">Tiendas del mall</div>
          <div className="ml-auto text-[11px] tracking-[.06em] uppercase opacity-66 tabular-nums">
            {tiendas.length} {tiendas.length === 1 ? "tienda" : "tiendas"}
          </div>
        </div>

        <label className="flex items-center gap-2 px-3.5 py-2.5 text-[13px] cursor-pointer border-b border-[var(--color-divider-soft)]">
          <input type="checkbox" checked={porPalabra} onChange={(e) => setPorPalabra(e.target.checked)} />
          Buscar por palabra en todas las sucursales
        </label>

        {porPalabra ? (
          <div className="border-b border-[var(--color-divider-soft)]">
            <div className="field min-w-0 px-3.5 py-3.5">
              <label htmlFor="mt-palabra">Palabra en el nombre de la sucursal</label>
              <input
                id="mt-palabra"
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Egaña"
                autoFocus
              />
            </div>
            {palabra && encontradas.length === 0 ? (
              <div className="px-3.5 pb-3.5 text-[13px] opacity-66">Ninguna sucursal por agregar con esa palabra.</div>
            ) : null}
            {encontradas.length ? (
              <div className="max-h-56 overflow-y-auto border-t border-black/[.18]">
                {encontradas.map((s) => {
                  const otro = s.mallId && s.mallId !== mall.id ? malls.find((m) => m.id === s.mallId)?.nombre : null;
                  return (
                    <div key={s.id} className="flex items-center gap-2 px-3.5 py-2 border-b border-black/[.18] last:border-b-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] truncate">
                          {nombreCliente(s.clienteId)} · {s.nombre}
                        </div>
                        <div className="text-[11px] opacity-66 truncate">{otro ? `Hoy en ${otro} · ${s.direccion}` : s.direccion}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIds((prev) => [...prev, s.id])}
                        className="btn btn-icon w-8 h-8 flex-none border border-black/[.3]"
                        aria-label={`Agregar ${s.nombre} al mall`}
                        title="Agregar al mall"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-3.5 py-3.5 border-b border-[var(--color-divider-soft)]">
            <div className="field min-w-0">
              <label htmlFor="mt-cliente">Cliente</label>
              <SelectBuscable
                id="mt-cliente"
                valor={clienteSel}
                opciones={opcClientes}
                onChange={setClienteSel}
                ariaLabel="Cliente"
              />
            </div>
            <div className="field min-w-0">
              <label htmlFor="mt-sucursal">Agregar tienda</label>
              <SelectBuscable
                id="mt-sucursal"
                valor=""
                opciones={libres}
                onChange={(v) => {
                  if (v) setIds((prev) => [...prev, Number(v)]);
                }}
                placeholder={libres.length ? "Elige y se agrega al mall…" : "No quedan sucursales por agregar"}
                ariaLabel="Agregar tienda"
              />
            </div>
          </div>
        )}

        {tiendas.length === 0 ? (
          <div className="px-3.5 py-5 text-[13px] opacity-66">
            Este mall todavía no tiene tiendas. Elige el cliente y ve agregando sus sucursales.
          </div>
        ) : null}

        {tiendas.map((s) => (
          <div key={s.id} className="flex items-center gap-2 px-3.5 py-2 border-b border-black/[.18] last:border-b-0">
            <div className="flex-1 min-w-0">
              <div className="text-[14px] truncate">
                {nombreCliente(s.clienteId)} · {s.nombre}
              </div>
              <div className="text-[11px] opacity-66 truncate">{s.direccion}</div>
            </div>
            {!s.activo ? <span className="tag tag-neutral flex-none">Inactiva</span> : null}
            <button
              type="button"
              onClick={() => setIds((prev) => prev.filter((x) => x !== s.id))}
              className="btn btn-icon w-8 h-8 flex-none border border-black/[.3]"
              aria-label={`Quitar ${s.nombre} del mall`}
              title="Quitar del mall"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </Dialogo>
  );
}
