"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { guardarFirmaAccion } from "@/lib/acciones/visitas";
import { SIN_ERRORES } from "@/lib/acciones/formulario";
import { esRutValido, formatearRut } from "@/lib/rut";
import type { FirmaRow, TipoFirma } from "@/lib/db/tipos";
import { Alerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/boton";
import { Campo, Entrada } from "@/components/ui/campo";
import { TituloSeccion } from "@/components/ui/titulo-seccion";
import { CampoRutControlado } from "./campo-rut-controlado";
import { CanvasFirma, type ManejadorCanvasFirma } from "./canvas-firma";

function BotonGuardarFirma({
  onClick,
  disabled,
}: {
  onClick: (evento: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Boton type="submit" onClick={onClick} disabled={disabled || pending}>
      {pending ? "Guardando…" : "Guardar firma"}
    </Boton>
  );
}

function PanelFirma({
  visitaId,
  tipo,
  etiqueta,
  firmaExistente,
  soloLectura,
}: {
  visitaId: number;
  tipo: TipoFirma;
  etiqueta: string;
  firmaExistente: FirmaRow | null;
  soloLectura: boolean;
}) {
  const [estado, enviar, enviando] = useActionState(guardarFirmaAccion, SIN_ERRORES);
  const [rehaciendo, setRehaciendo] = useState(false);
  const [nombre, setNombre] = useState("");
  const [rut, setRut] = useState("");
  const [errorCanvas, setErrorCanvas] = useState<string | null>(null);

  const canvasRef = useRef<ManejadorCanvasFirma>(null);
  const imagenInputRef = useRef<HTMLInputElement>(null);
  const previoEnviando = useRef(false);

  // Al terminar de guardar sin error, la firma nueva llega por props (la
  // página se revalida): acá solo hace falta volver a la vista de imagen y
  // limpiar el formulario de identidad para la próxima vez.
  useEffect(() => {
    if (previoEnviando.current && !enviando && !estado.error) {
      setRehaciendo(false);
      setErrorCanvas(null);
      setNombre("");
      setRut("");
    }
    previoEnviando.current = enviando;
  }, [enviando, estado.error]);

  const mostrarCanvas = rehaciendo || !firmaExistente;
  const identidadOk = tipo !== "TIENDA" || (nombre.trim() !== "" && esRutValido(rut));
  const controlesDeshabilitados = soloLectura || !identidadOk;

  function alClickGuardar(evento: React.MouseEvent<HTMLButtonElement>) {
    if (!identidadOk) {
      evento.preventDefault();
      return;
    }
    if (canvasRef.current?.estaVacio()) {
      evento.preventDefault();
      setErrorCanvas("Dibujá la firma antes de guardar.");
      return;
    }

    setErrorCanvas(null);
    const png = canvasRef.current?.exportarPng() ?? "";
    if (imagenInputRef.current) imagenInputRef.current.value = png;
    // Sin preventDefault: el <form> sigue su curso normal y manda el hidden
    // input recién escrito, junto con el resto de los campos.
  }

  const errorFirma = estado.errores[`firma_${tipo}`];

  return (
    <div className="rounded-base border border-borde p-4">
      <p className="text-sm font-medium text-texto">{etiqueta}</p>

      {!mostrarCanvas && firmaExistente ? (
        <div className="mt-3 flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={firmaExistente.imagen}
            alt={`Firma de ${etiqueta.toLowerCase()}`}
            className="max-w-[280px] rounded-base border border-borde bg-white"
          />
          <p className="text-xs text-suave">
            {firmaExistente.firmante_nombre ?? "Sin nombre registrado"}
            {firmaExistente.firmante_rut
              ? ` · ${formatearRut(firmaExistente.firmante_rut)}`
              : ""}
          </p>
          {!soloLectura ? (
            <div>
              <Boton
                type="button"
                variante="secundario"
                onClick={() => setRehaciendo(true)}
              >
                Rehacer firma
              </Boton>
            </div>
          ) : null}
        </div>
      ) : (
        <form action={enviar} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="visita_id" value={visitaId} />
          <input type="hidden" name="tipo" value={tipo} />
          <input ref={imagenInputRef} type="hidden" name="imagen" defaultValue="" />

          {estado.error ? <Alerta>{estado.error}</Alerta> : null}
          {errorFirma ? <Alerta>{errorFirma}</Alerta> : null}
          {errorCanvas ? <Alerta>{errorCanvas}</Alerta> : null}

          {tipo === "TIENDA" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                htmlFor="firmante_nombre"
                etiqueta="Nombre de quien firma"
                error={estado.errores.firmante_nombre}
              >
                <Entrada
                  id="firmante_nombre"
                  name="firmante_nombre"
                  value={nombre}
                  onChange={(evento) => setNombre(evento.target.value)}
                  disabled={soloLectura}
                  invalido={Boolean(estado.errores.firmante_nombre)}
                />
              </Campo>
              <CampoRutControlado
                id="firmante_rut"
                name="firmante_rut"
                etiqueta="RUT de quien firma"
                value={rut}
                onChange={setRut}
                disabled={soloLectura}
                error={estado.errores.firmante_rut}
              />
            </div>
          ) : null}

          {tipo === "TIENDA" && !identidadOk ? (
            <p className="text-xs text-suave">
              Completá el nombre y el RUT para habilitar la firma.
            </p>
          ) : null}

          <CanvasFirma ref={canvasRef} disabled={controlesDeshabilitados} />

          <div className="flex flex-wrap gap-2">
            <Boton
              type="button"
              variante="secundario"
              disabled={controlesDeshabilitados}
              onClick={() => {
                canvasRef.current?.limpiar();
                setErrorCanvas(null);
              }}
            >
              Limpiar
            </Boton>
            {!soloLectura ? (
              <BotonGuardarFirma onClick={alClickGuardar} disabled={!identidadOk} />
            ) : null}
            {firmaExistente && rehaciendo ? (
              <Boton type="button" variante="texto" onClick={() => setRehaciendo(false)}>
                Cancelar
              </Boton>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}

export function SeccionFirmas({
  visitaId,
  firmas,
  soloLectura,
  nombreTecnicoAsignado,
}: {
  visitaId: number;
  firmas: FirmaRow[];
  soloLectura: boolean;
  nombreTecnicoAsignado: string | null;
}) {
  const firmaTecnico = firmas.find((f) => f.tipo === "TECNICO") ?? null;
  const firmaTienda = firmas.find((f) => f.tipo === "TIENDA") ?? null;

  return (
    <section
      aria-labelledby="seccion-firmas"
      className="rounded-card border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5"
    >
      <TituloSeccion
        numero={5}
        id="seccion-firmas"
        titulo="Firmas"
        guardado={firmaTecnico !== null && firmaTienda !== null}
      />

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <PanelFirma
          visitaId={visitaId}
          tipo="TECNICO"
          etiqueta={
            nombreTecnicoAsignado
              ? `Firma del técnico — ${nombreTecnicoAsignado}`
              : "Firma del técnico"
          }
          firmaExistente={firmaTecnico}
          soloLectura={soloLectura}
        />
        <PanelFirma
          visitaId={visitaId}
          tipo="TIENDA"
          etiqueta="Firma de tienda"
          firmaExistente={firmaTienda}
          soloLectura={soloLectura}
        />
      </div>
    </section>
  );
}
