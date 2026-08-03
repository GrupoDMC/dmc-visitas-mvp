"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { SIN_ERRORES, type EstadoFormulario } from "@/lib/acciones/formulario";
import { TIPOS_TRABAJO } from "@/lib/catalogos";
import { Alerta } from "@/components/ui/alerta";
import { BotonGuardar } from "@/components/ui/boton";
import { AreaTexto, Campo, Entrada, Selector } from "@/components/ui/campo";
import { useCampos } from "@/components/maestros/usar-campos";

type Accion = (
  previo: EstadoFormulario,
  datos: FormData,
) => Promise<EstadoFormulario>;

export type ClienteElegible = { id: number; razon_social: string };

export type SucursalElegible = {
  id: number;
  cliente_id: number;
  nombre: string;
  direccion: string | null;
  comuna: string | null;
  telefono: string | null;
};

export type TecnicoElegible = {
  id: number;
  nombres: string;
  apellidos: string;
};

/**
 * Alta de visita. Sirve para los dos caminos y cambia poco entre ellos:
 *
 * - `agenda`: coordinación programa la visita. Pide fecha y hora, y puede
 *   dejarla sin técnico — asignarla después, en lote, es lo normal.
 * - `terreno`: el técnico ya está parado en la sucursal. No hay fecha (nace en
 *   NULL, que es la marca de "esta no se agendó") ni select de técnico: es él.
 *
 * LA CASCADA. Las sucursales de todos los clientes llegan enteras desde el
 * servidor y el filtro por cliente pasa en el navegador. No hay una consulta al
 * elegir el cliente porque ningún componente de cliente puede hablar con la
 * base — es la regla central del proyecto — y en un formulario de agendamiento
 * un viaje de red entre dos selects se siente. Ver el comentario de
 * `sucursalesActivasConCliente()`.
 */
export function FormularioVisita({
  accion,
  modo,
  clientes,
  sucursales,
  tecnicos,
  volverA,
}: {
  accion: Accion;
  modo: "agenda" | "terreno";
  clientes: ClienteElegible[];
  sucursales: SucursalElegible[];
  tecnicos: TecnicoElegible[];
  volverA: string;
}) {
  const [estado, enviar] = useActionState(accion, SIN_ERRORES);

  const [clienteId, setClienteId] = useState("");
  const [sucursalId, setSucursalId] = useState("");

  // Todos los campos de texto van controlados. React 19 vacía los no
  // controlados cuando la acción termina, incluso al volver con error: sin
  // esto, una fecha mal escrita se lleva puesta la descripción del trabajo.
  const { valores, alCambiar, fijar } = useCampos({
    tipo_trabajo: "",
    fecha_programada: "",
    hora_programada: "",
    tecnico_id: "",
    descripcion_trabajo: "",
    contacto_nombre: "",
    contacto_email: "",
    contacto_telefono: "",
  });

  // El teléfono de la sucursal se ofrece como sugerencia, no se impone. Si el
  // coordinador lo cambió a mano, cambiar de sucursal no le pisa lo escrito:
  // solo se reemplaza mientras el campo siga teniendo la sugerencia anterior.
  const [sugerido, setSugerido] = useState("");

  const deEsteCliente = useMemo(
    () => sucursales.filter((s) => String(s.cliente_id) === clienteId),
    [sucursales, clienteId],
  );

  const sucursalElegida = deEsteCliente.find(
    (s) => String(s.id) === sucursalId,
  );

  function alElegirCliente(evento: React.ChangeEvent<HTMLSelectElement>) {
    setClienteId(evento.target.value);
    // La sucursal de otro cliente no sirve más. Dejarla puesta es la forma más
    // fácil de agendar una visita a la sucursal equivocada.
    setSucursalId("");
  }

  function alElegirSucursal(evento: React.ChangeEvent<HTMLSelectElement>) {
    const valor = evento.target.value;
    setSucursalId(valor);

    const nueva = deEsteCliente.find((s) => String(s.id) === valor);
    const telefono = nueva?.telefono ?? "";

    if (
      valores.contacto_telefono === "" ||
      valores.contacto_telefono === sugerido
    ) {
      fijar("contacto_telefono", telefono);
    }
    setSugerido(telefono);
  }

  const esAgenda = modo === "agenda";
  const sinClientes = clientes.length === 0;

  return (
    <form action={enviar} noValidate className="flex flex-col gap-5">
      {estado.error ? <Alerta>{estado.error}</Alerta> : null}

      <section className="rounded-card border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
        <h2 className="text-sm font-medium text-texto">Dónde y qué</h2>

        <div className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              htmlFor="cliente_id"
              etiqueta="Cliente"
              error={estado.errores.cliente_id}
            >
              <Selector
                id="cliente_id"
                name="cliente_id"
                value={clienteId}
                onChange={alElegirCliente}
                disabled={sinClientes}
                required
                invalido={Boolean(estado.errores.cliente_id)}
                aria-describedby={
                  estado.errores.cliente_id ? "cliente_id-error" : undefined
                }
              >
                <option value="">Elegí un cliente</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.razon_social}
                  </option>
                ))}
              </Selector>
            </Campo>

            <Campo
              htmlFor="sucursal_id"
              etiqueta="Sucursal"
              ayuda={
                clienteId
                  ? undefined
                  : "Se habilita cuando elijas el cliente."
              }
              error={estado.errores.sucursal_id}
            >
              <Selector
                id="sucursal_id"
                name="sucursal_id"
                value={sucursalId}
                onChange={alElegirSucursal}
                disabled={!clienteId || deEsteCliente.length === 0}
                required
                invalido={Boolean(estado.errores.sucursal_id)}
                aria-describedby={
                  estado.errores.sucursal_id
                    ? "sucursal_id-error"
                    : clienteId
                      ? undefined
                      : "sucursal_id-ayuda"
                }
              >
                <option value="">
                  {!clienteId
                    ? "Elegí primero el cliente"
                    : deEsteCliente.length === 0
                      ? "Este cliente no tiene sucursales activas"
                      : "Elegí una sucursal"}
                </option>
                {deEsteCliente.map((sucursal) => (
                  <option key={sucursal.id} value={sucursal.id}>
                    {sucursal.nombre}
                    {sucursal.comuna ? ` — ${sucursal.comuna}` : ""}
                  </option>
                ))}
              </Selector>
            </Campo>
          </div>

          {clienteId && deEsteCliente.length === 0 ? (
            <Alerta tono="aviso">
              Este cliente no tiene ninguna sucursal activa. Una visita siempre
              se hace en una sucursal, así que hay que cargarle o reactivar al
              menos una antes de poder agendarle trabajo.
            </Alerta>
          ) : null}

          {sucursalElegida?.direccion ? (
            <p className="text-sm text-suave">
              <span className="text-texto">{sucursalElegida.direccion}</span>
              {sucursalElegida.comuna ? `, ${sucursalElegida.comuna}` : ""}
            </p>
          ) : null}

          <Campo
            htmlFor="tipo_trabajo"
            etiqueta="Tipo de trabajo"
            error={estado.errores.tipo_trabajo}
          >
            <Selector
              id="tipo_trabajo"
              name="tipo_trabajo"
              value={valores.tipo_trabajo}
              onChange={alCambiar("tipo_trabajo")}
              required
              invalido={Boolean(estado.errores.tipo_trabajo)}
              aria-describedby={
                estado.errores.tipo_trabajo ? "tipo_trabajo-error" : undefined
              }
            >
              <option value="">Elegí el tipo de trabajo</option>
              {TIPOS_TRABAJO.map((tipo) => (
                <option key={tipo.codigo} value={tipo.codigo}>
                  {tipo.nombre}
                </option>
              ))}
            </Selector>
          </Campo>

          <Campo
            htmlFor="descripcion_trabajo"
            etiqueta="Qué hay que hacer"
            opcional
            ayuda={
              esAgenda
                ? "Lo que el técnico necesita saber antes de llegar."
                : "Para qué te llamaron, o qué encontraste."
            }
            error={estado.errores.descripcion_trabajo}
          >
            <AreaTexto
              id="descripcion_trabajo"
              name="descripcion_trabajo"
              value={valores.descripcion_trabajo}
              onChange={alCambiar("descripcion_trabajo")}
              invalido={Boolean(estado.errores.descripcion_trabajo)}
              aria-describedby="descripcion_trabajo-ayuda"
            />
          </Campo>
        </div>
      </section>

      {esAgenda ? (
        <section className="rounded-card border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
          <h2 className="text-sm font-medium text-texto">Cuándo y quién</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Campo
              htmlFor="fecha_programada"
              etiqueta="Fecha"
              error={estado.errores.fecha_programada}
            >
              <Entrada
                id="fecha_programada"
                name="fecha_programada"
                type="date"
                value={valores.fecha_programada}
                onChange={alCambiar("fecha_programada")}
                required
                invalido={Boolean(estado.errores.fecha_programada)}
                aria-describedby={
                  estado.errores.fecha_programada
                    ? "fecha_programada-error"
                    : undefined
                }
              />
            </Campo>

            <Campo
              htmlFor="hora_programada"
              etiqueta="Hora"
              opcional
              ayuda="Dejala vacía si todavía no hay hora comprometida."
              error={estado.errores.hora_programada}
            >
              <Entrada
                id="hora_programada"
                name="hora_programada"
                type="time"
                value={valores.hora_programada}
                onChange={alCambiar("hora_programada")}
                invalido={Boolean(estado.errores.hora_programada)}
                aria-describedby="hora_programada-ayuda"
              />
            </Campo>

            <div className="sm:col-span-2">
              <Campo
                htmlFor="tecnico_id"
                etiqueta="Técnico"
                opcional
                ayuda="Podés dejarla sin asignar y repartirla después desde el listado."
                error={estado.errores.tecnico_id}
              >
                <Selector
                  id="tecnico_id"
                  name="tecnico_id"
                  value={valores.tecnico_id}
                  onChange={alCambiar("tecnico_id")}
                  invalido={Boolean(estado.errores.tecnico_id)}
                  aria-describedby={
                    estado.errores.tecnico_id
                      ? "tecnico_id-error"
                      : "tecnico_id-ayuda"
                  }
                >
                  <option value="">Sin asignar</option>
                  {tecnicos.map((tecnico) => (
                    <option key={tecnico.id} value={tecnico.id}>
                      {tecnico.apellidos}, {tecnico.nombres}
                    </option>
                  ))}
                </Selector>
              </Campo>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-card border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
        <h2 className="text-sm font-medium text-texto">Contacto en la sucursal</h2>
        <p className="mt-1 text-xs text-suave">
          Quién recibe al técnico en esta visita. Queda guardado en la visita y
          no modifica los datos de la sucursal.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Campo
            htmlFor="contacto_nombre"
            etiqueta="Nombre"
            opcional
            error={estado.errores.contacto_nombre}
          >
            <Entrada
              id="contacto_nombre"
              name="contacto_nombre"
              value={valores.contacto_nombre}
              onChange={alCambiar("contacto_nombre")}
              autoComplete="off"
              invalido={Boolean(estado.errores.contacto_nombre)}
            />
          </Campo>

          <Campo
            htmlFor="contacto_telefono"
            etiqueta="Teléfono"
            opcional
            ayuda={
              sugerido && valores.contacto_telefono === sugerido
                ? "Es el teléfono de la sucursal. Cambialo si el contacto tiene otro."
                : undefined
            }
            error={estado.errores.contacto_telefono}
          >
            <Entrada
              id="contacto_telefono"
              name="contacto_telefono"
              type="tel"
              inputMode="tel"
              value={valores.contacto_telefono}
              onChange={alCambiar("contacto_telefono")}
              invalido={Boolean(estado.errores.contacto_telefono)}
              aria-describedby={
                estado.errores.contacto_telefono
                  ? "contacto_telefono-error"
                  : "contacto_telefono-ayuda"
              }
            />
          </Campo>

          <div className="sm:col-span-2">
            <Campo
              htmlFor="contacto_email"
              etiqueta="Correo"
              opcional
              error={estado.errores.contacto_email}
            >
              <Entrada
                id="contacto_email"
                name="contacto_email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={valores.contacto_email}
                onChange={alCambiar("contacto_email")}
                invalido={Boolean(estado.errores.contacto_email)}
              />
            </Campo>
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Link
          href={volverA}
          className="inline-flex min-h-11 items-center justify-center rounded-base border border-borde bg-superficie px-4 text-sm font-medium text-texto transition-colors hover:bg-fondo sm:min-h-10"
        >
          Cancelar
        </Link>
        <BotonGuardar enviando="Creando…">
          {esAgenda ? "Crear visita" : "Abrir la visita"}
        </BotonGuardar>
      </div>
    </form>
  );
}
