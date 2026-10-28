"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Dialogo, { type FormValores } from "@/components/admin/Dialogo";
import Confirmar, { type ConfirmarCfg } from "@/components/ui/Confirmar";
import SelectBuscable, { type OpcionSelect } from "@/components/ui/SelectBuscable";
import { guardarClienteAction, guardarMallAction, guardarMarcaAction, guardarSucursalAction } from "@/app/actions/maestros";
import { conMismaDireccion } from "@/lib/ui/direcciones";
import { mensajeRut, rutLimpio, sinTildes } from "@/lib/ui/formato";
import { puede, useReferencias } from "@/lib/ui/referencias";
import { REGIONES } from "@/lib/ui/regiones";

export type TipoAlta = "cliente" | "marca" | "mall" | "sucursal";

const MODULO: Record<TipoAlta, string> = { cliente: "clientes", marca: "marcas", mall: "malls", sucursal: "sucursales" };

const NOMBRE_TIPO: Record<TipoAlta, string> = { cliente: "cliente", marca: "marca", mall: "mall", sucursal: "sucursal" };

/**
 * `SelectBuscable` con la opción «Agregar nuevo» al final de la lista.
 *
 * Lo que falta (un cliente, un mall, una sucursal) se crea en un diálogo que se
 * abre encima del formulario: el formulario no se desmonta, así que nada de lo
 * escrito se pierde, y al guardar el valor nuevo queda elegido. La opción solo
 * aparece si quien mira puede crear ese tipo de registro.
 */
export default function SelectConAlta({
  alta,
  clienteId,
  onChange,
  ...resto
}: React.ComponentProps<typeof SelectBuscable> & {
  /** Qué se puede crear desde la lista. Sin esto es un `SelectBuscable` normal. */
  alta?: TipoAlta;
  /** Para una marca o una sucursal nueva: el cliente al que se le crea. */
  clienteId?: string;
}) {
  const router = useRouter();
  const ref = useReferencias();
  const [abierto, setAbierto] = useState<{ sugerido: string } | null>(null);
  const permitido = alta !== undefined && puede(ref, `${MODULO[alta]}.crear`);

  return (
    <>
      <SelectBuscable
        {...resto}
        onChange={onChange}
        onAgregar={permitido ? (escrito) => setAbierto({ sugerido: escrito }) : undefined}
        textoAgregar={`Agregar ${alta ? NOMBRE_TIPO[alta] : ""} nuevo`}
      />
      {abierto && alta
        ? createPortal(
            // Los eventos de un portal suben por el árbol de React: sin esto un
            // clic acá cerraría la hoja o el diálogo que está debajo.
            <div onClick={(e) => e.stopPropagation()}>
            <AltaRapidaDialogo
              tipo={alta}
              sugerido={abierto.sugerido}
              clienteId={clienteId}
              onCerrar={() => setAbierto(null)}
              onCreado={(id) => {
                setAbierto(null);
                onChange(String(id));
                // Las listas del formulario vienen del servidor: se piden de nuevo
                // para que el registro recién creado aparezca en ellas.
                router.refresh();
              }}
            />
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function AltaRapidaDialogo({
  tipo,
  sugerido,
  clienteId,
  onCerrar,
  onCreado,
}: {
  tipo: TipoAlta;
  sugerido: string;
  clienteId?: string;
  onCerrar: () => void;
  onCreado: (id: number) => void;
}) {
  const ref = useReferencias();
  const [form, setForm] = useState<FormValores>(() => ({
    nombre: sugerido,
    razonSocial: "",
    rut: "",
    clienteId: clienteId || String(ref.clientes.find((c) => c.activo)?.id ?? ""),
    marcaId: "",
    mallId: "",
    codigo: "",
    direccion: "",
    comuna: "",
    region: REGIONES[0],
  }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<ConfirmarCfg | null>(null);

  const texto = (k: string) => String(form[k] ?? "").trim();

  function cambiar(k: string, v: string | boolean) {
    setError(null);
    setForm((prev) => {
      const sig = { ...prev, [k]: v };
      // Otro cliente, otras marcas: la elegida ya no vale.
      if (k === "clienteId" && tipo === "sucursal") {
        sig.marcaId = String(ref.marcas.find((m) => m.activo && String(m.clienteId) === v)?.id ?? "");
      }
      if (k === "mallId" && tipo === "sucursal") {
        // Como en el alta de una sucursal: el mall le pone nombre y ubicación.
        const mall = ref.malls.find((m) => String(m.id) === v);
        if (mall) {
          sig.nombre = mall.nombre;
          sig.direccion = mall.direccion;
          if (mall.comuna) sig.comuna = mall.comuna;
          if (mall.region) sig.region = mall.region;
        }
      }
      return sig;
    });
  }

  const campos =
    tipo === "cliente"
      ? [
          { k: "razonSocial", label: "Razón social", span: 2 as const },
          { k: "rut", label: "RUT", tipo: "rut" as const, ph: "76.123.456-7" },
          { k: "nombre", label: "Nombre fantasía" },
        ]
      : tipo === "marca"
        ? [
            {
              k: "clienteId",
              label: "Cliente",
              tipo: "select" as const,
              buscable: true,
              opciones: ref.clientes.filter((c) => c.activo).map((c) => ({ v: String(c.id), t: c.nombreFantasia })),
            },
            { k: "nombre", label: "Nombre de la marca" },
          ]
      : tipo === "mall"
        ? [
            { k: "nombre", label: "Nombre del mall", span: 2 as const },
            { k: "direccion", label: "Dirección", span: 2 as const },
            { k: "comuna", label: "Comuna" },
            { k: "region", label: "Región", tipo: "select" as const, opciones: REGIONES.map((r) => ({ v: r, t: r })) },
          ]
        : [
            {
              k: "clienteId",
              label: "Cliente",
              tipo: "select" as const,
              buscable: true,
              opciones: ref.clientes.filter((c) => c.activo).map((c) => ({ v: String(c.id), t: c.nombreFantasia })),
            },
            {
              k: "marcaId",
              label: "Marca",
              tipo: "select" as const,
              buscable: true,
              alta: "marca" as const,
              opcionesSegun: (f: FormValores) =>
                ref.marcas
                  .filter((m) => m.activo && String(m.clienteId) === String(f.clienteId))
                  .map((m) => ({ v: String(m.id), t: m.nombre })),
            },
            {
              k: "mallId",
              label: "Mall (opcional)",
              tipo: "select" as const,
              buscable: true,
              opciones: [
                { v: "", t: "Sin mall (a la calle)" },
                ...ref.malls.filter((m) => m.activo).map((m) => ({ v: String(m.id), t: m.nombre })),
              ],
            },
            { k: "nombre", label: "Nombre de la sucursal" },
            { k: "codigo", label: "Código interno (opcional)", ph: "MS-118" },
            { k: "direccion", label: "Dirección", span: 2 as const },
            { k: "comuna", label: "Comuna" },
            { k: "region", label: "Región", tipo: "select" as const, opciones: REGIONES.map((r) => ({ v: r, t: r })) },
          ];

  /** El texto del primer problema, o null si todo está listo para guardar. */
  function problema(): string | null {
    if (tipo === "cliente") {
      if (!texto("razonSocial") || !texto("rut")) return "Razón social y RUT son obligatorios.";
      const errorRut = mensajeRut(texto("rut"));
      if (errorRut) return errorRut;
      const repetido = ref.clientes.find((c) => rutLimpio(c.rut) === rutLimpio(texto("rut")));
      return repetido ? `Ese RUT ya es de «${repetido.nombreFantasia || repetido.razonSocial}».` : null;
    }
    if (tipo === "marca") {
      if (!texto("clienteId")) return "Elige el cliente.";
      if (!texto("nombre")) return "El nombre de la marca es obligatorio.";
      const repetida = ref.marcas.find(
        (m) => String(m.clienteId) === texto("clienteId") && sinTildes(m.nombre) === sinTildes(texto("nombre"))
      );
      return repetida ? `Ese cliente ya tiene la marca «${repetida.nombre}».` : null;
    }
    if (tipo === "mall") {
      return texto("nombre") && texto("direccion") && texto("comuna") ? null : "Nombre, dirección y comuna son obligatorios.";
    }
    if (!texto("clienteId")) return "Elige el cliente.";
    if (!texto("marcaId")) return "Elige la marca.";
    if (!texto("nombre") || !texto("direccion") || !texto("comuna")) return "Nombre, dirección y comuna son obligatorios.";
    return null;
  }

  /** Avisa si ya hay otro registro del mismo tipo en esa dirección. */
  function advertencia(): string | null {
    if (tipo === "cliente" || tipo === "marca") return null;
    if (tipo === "mall") {
      const otro = conMismaDireccion(ref.malls, texto("direccion"), texto("comuna"));
      return otro ? `El mall «${otro.nombre}» ya está en «${otro.direccion}».` : null;
    }
    const delCliente = ref.sucursales.filter((s) => String(s.clienteId) === texto("clienteId"));
    const otra = conMismaDireccion(delCliente, texto("direccion"), texto("comuna"));
    return otra ? `El cliente ya tiene la sucursal «${otra.nombre}» en «${otra.direccion}».` : null;
  }

  async function guardar() {
    const fallo = problema();
    if (fallo) return setError(fallo);
    setGuardando(true);
    const res =
      tipo === "cliente"
        ? await guardarClienteAction(null, {
            rut: texto("rut"),
            razonSocial: texto("razonSocial"),
            nombreFantasia: texto("nombre") || texto("razonSocial"),
            activo: true,
            motivoInactivo: null,
            notas: null,
            planCalibracion: null,
          })
        : tipo === "marca"
          ? await guardarMarcaAction(null, { clienteId: Number(texto("clienteId")), nombre: texto("nombre"), activo: true })
        : tipo === "mall"
          ? await guardarMallAction(null, {
              nombre: texto("nombre"),
              direccion: texto("direccion"),
              comuna: texto("comuna"),
              region: texto("region"),
              activo: true,
            })
          : await guardarSucursalAction(null, {
              clienteId: Number(texto("clienteId")),
              marcaId: Number(texto("marcaId")),
              mallId: Number(texto("mallId")) || null,
              nombre: texto("nombre"),
              codigo: texto("codigo") || null,
              direccion: texto("direccion"),
              comuna: texto("comuna"),
              region: texto("region"),
              telefono: null,
              activo: true,
              motivoInactivo: null,
              notas: null,
              fechaInstalacion: null,
              remota: null,
              enGarantia: null,
              planCalibracion: null,
            });
    setGuardando(false);
    if (!res.ok || !res.id) return setError(res.error ?? "No se pudo guardar.");
    onCreado(res.id);
  }

  function intentar() {
    const fallo = problema();
    if (fallo) return setError(fallo);
    const aviso = advertencia();
    if (!aviso) return void guardar();
    setConfirmar({
      titulo: "Ya existe esa dirección",
      texto: `${aviso} ¿Quieres crear uno nuevo de todas formas?`,
      cta: "Crear de todas formas",
      accion: guardar,
    });
  }

  const nombreTipo = NOMBRE_TIPO[tipo];

  return (
    <>
      <Dialogo
        kicker="Alta rápida"
        titulo={`Nuevo ${nombreTipo}`}
        cta={`Crear ${nombreTipo}`}
        nota="Se crea ahora y queda elegido en el formulario donde estabas: lo que habías escrito sigue ahí."
        campos={campos}
        form={form}
        onCampo={cambiar}
        onCerrar={onCerrar}
        onGuardar={intentar}
        guardando={guardando}
      >
        {error ? (
          <p role="alert" className="mt-4 mb-0 text-[13px] font-extrabold text-[var(--color-accent-800)]">
            {error}
          </p>
        ) : null}
      </Dialogo>
      {confirmar ? <Confirmar cfg={confirmar} onCerrar={() => setConfirmar(null)} /> : null}
    </>
  );
}

export type { OpcionSelect };
