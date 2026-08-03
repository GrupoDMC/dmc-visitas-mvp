"use client";

import { useActionState } from "react";
import {
  guardarDatosVisitaAccion,
  iniciarVisitaAccion,
} from "@/lib/acciones/visitas";
import { SIN_ERRORES } from "@/lib/acciones/formulario";
import { TIPOS_TRABAJO } from "@/lib/catalogos";
import type { EstadoVisita, TipoTrabajo } from "@/lib/db/tipos";
import { Alerta } from "@/components/ui/alerta";
import { BotonGuardar } from "@/components/ui/boton";
import { Campo, Entrada, Selector } from "@/components/ui/campo";
import { CampoRutControlado } from "./campo-rut-controlado";
import { FranjaBorrador } from "./franja-borrador";
import { useCamposConBorrador, useLimpiarBorradorAlGuardar } from "./usar-borrador";

export type VisitaParaDatos = {
  id: number;
  estado: EstadoVisita;
  tipo_trabajo: TipoTrabajo | null;
  contacto_nombre: string | null;
  contacto_email: string | null;
  contacto_telefono: string | null;
  responsable_tienda_nombre: string | null;
  responsable_tienda_rut: string | null;
};

/**
 * Sección 1 · Datos de la visita. Dos formularios independientes en la misma
 * tarjeta: guardar los campos y, aparte, "Iniciar visita" — no comparten
 * botón porque son dos acciones distintas y el técnico puede querer arrancar
 * el reloj sin haber tocado los demás campos todavía.
 */
export function SeccionDatosVisita({
  visita,
  soloLectura,
}: {
  visita: VisitaParaDatos;
  soloLectura: boolean;
}) {
  const [estado, enviar, enviando] = useActionState(guardarDatosVisitaAccion, SIN_ERRORES);

  const { valores, alCambiar, fijar, borrador, recuperar, descartar, limpiarBorrador } =
    useCamposConBorrador(`visita:${visita.id}:datos`, {
      tipo_trabajo: visita.tipo_trabajo ?? "",
      contacto_nombre: visita.contacto_nombre ?? "",
      contacto_email: visita.contacto_email ?? "",
      contacto_telefono: visita.contacto_telefono ?? "",
      responsable_tienda_nombre: visita.responsable_tienda_nombre ?? "",
      responsable_tienda_rut: visita.responsable_tienda_rut
        ? visita.responsable_tienda_rut
        : "",
    });

  useLimpiarBorradorAlGuardar(enviando, estado.error, limpiarBorrador);

  const [estadoInicio, enviarInicio] = useActionState(iniciarVisitaAccion, SIN_ERRORES);

  const puedeIniciar =
    visita.estado !== "EN_CURSO" &&
    visita.estado !== "REALIZADA" &&
    visita.estado !== "CANCELADA";

  return (
    <section
      aria-labelledby="seccion-datos"
      className="rounded-base border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="seccion-datos" className="text-sm font-medium text-texto">
          Datos de la visita
        </h2>

        {puedeIniciar ? (
          <form action={enviarInicio}>
            <input type="hidden" name="visita_id" value={visita.id} />
            <BotonGuardar enviando="Iniciando…">Iniciar visita</BotonGuardar>
          </form>
        ) : null}
      </div>

      {estadoInicio.error ? (
        <div className="mt-3">
          <Alerta>{estadoInicio.error}</Alerta>
        </div>
      ) : null}

      {borrador && !soloLectura ? (
        <div className="mt-3">
          <FranjaBorrador
            guardadoEn={borrador.guardadoEn}
            onRecuperar={recuperar}
            onDescartar={descartar}
          />
        </div>
      ) : null}

      <form action={enviar} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="visita_id" value={visita.id} />

        {estado.error ? <Alerta>{estado.error}</Alerta> : null}

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
            disabled={soloLectura}
            required
            invalido={Boolean(estado.errores.tipo_trabajo)}
          >
            <option value="">Elegí el tipo de trabajo</option>
            {TIPOS_TRABAJO.map((tipo) => (
              <option key={tipo.codigo} value={tipo.codigo}>
                {tipo.nombre}
              </option>
            ))}
          </Selector>
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            htmlFor="contacto_nombre"
            etiqueta="Nombre del contacto"
            opcional
            error={estado.errores.contacto_nombre}
          >
            <Entrada
              id="contacto_nombre"
              name="contacto_nombre"
              value={valores.contacto_nombre}
              onChange={alCambiar("contacto_nombre")}
              disabled={soloLectura}
              autoComplete="off"
              invalido={Boolean(estado.errores.contacto_nombre)}
            />
          </Campo>

          <Campo
            htmlFor="contacto_telefono"
            etiqueta="Teléfono del contacto"
            opcional
            error={estado.errores.contacto_telefono}
          >
            <Entrada
              id="contacto_telefono"
              name="contacto_telefono"
              type="tel"
              inputMode="tel"
              value={valores.contacto_telefono}
              onChange={alCambiar("contacto_telefono")}
              disabled={soloLectura}
              invalido={Boolean(estado.errores.contacto_telefono)}
            />
          </Campo>

          <div className="sm:col-span-2">
            <Campo
              htmlFor="contacto_email"
              etiqueta="Correo del contacto"
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
                disabled={soloLectura}
                invalido={Boolean(estado.errores.contacto_email)}
              />
            </Campo>
          </div>
        </div>

        <div className="border-t border-borde pt-4">
          <p className="text-xs font-medium text-suave">
            Responsable de tienda en esta visita
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Campo
              htmlFor="responsable_tienda_nombre"
              etiqueta="Nombre"
              opcional
              error={estado.errores.responsable_tienda_nombre}
            >
              <Entrada
                id="responsable_tienda_nombre"
                name="responsable_tienda_nombre"
                value={valores.responsable_tienda_nombre}
                onChange={alCambiar("responsable_tienda_nombre")}
                disabled={soloLectura}
                autoComplete="off"
                invalido={Boolean(estado.errores.responsable_tienda_nombre)}
              />
            </Campo>

            <CampoRutControlado
              id="responsable_tienda_rut"
              name="responsable_tienda_rut"
              etiqueta="RUT"
              opcional
              value={valores.responsable_tienda_rut}
              onChange={(valor) => fijar("responsable_tienda_rut", valor)}
              disabled={soloLectura}
              error={estado.errores.responsable_tienda_rut}
            />
          </div>
        </div>

        {!soloLectura ? (
          <div>
            <BotonGuardar>Guardar datos de la visita</BotonGuardar>
          </div>
        ) : null}
      </form>
    </section>
  );
}
