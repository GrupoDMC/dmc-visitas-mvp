"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

type Registro = Record<string, string>;

export type Borrador<T> = { valores: T; guardadoEn: number };

const DEMORA_GUARDADO_MS = 500;

/**
 * Campos de texto de una sección del formulario de terreno, con borrador
 * automático en localStorage.
 *
 * Por qué existe: el técnico llena esto en la calle, con una mano y con mala
 * señal. Si el navegador se cierra o la conexión se corta antes de apretar
 * "Guardar", lo tipeado no puede perderse. Cada tecla se refleja en
 * localStorage (con una demora corta, para no escribir en cada carácter), y
 * al volver a montar el formulario se detecta si hay un borrador más nuevo
 * que lo que ya está guardado en el servidor.
 *
 * No se aplica solo: pisar en silencio lo que el servidor tiene sería el
 * mismo error que esto existe para evitar, solo que al revés. Se ofrece con
 * `borrador` y el componente que use el hook muestra la franja de
 * recuperar/descartar.
 *
 * `clave` tiene que ser única por visita y por sección, por ejemplo
 * `visita:42:datos`.
 */
export function useCamposConBorrador<T extends Registro>(clave: string, iniciales: T) {
  const [valores, setValores] = useState<T>(iniciales);
  const [borrador, setBorrador] = useState<Borrador<T> | null>(null);
  const montado = useRef(false);
  // Los valores "de arranque", para poder volver a ellos con `reiniciar()`
  // después de crear un ítem nuevo (un problema, un material). Solo importa
  // la primera referencia: en un formulario de alta `iniciales` es siempre el
  // mismo objeto en blanco.
  const inicialesRef = useRef(iniciales);

  // Se lee una sola vez, al montar. `iniciales` cambia de referencia en cada
  // render del padre y no queremos releer localStorage todo el tiempo.
  //
  // La lectura no puede pasar a un `useState` perezoso: localStorage no
  // existe en el server, y leerlo durante el render del cliente produciría
  // un HTML distinto al que ya mandó el servidor (mismatch de hidratación).
  // Por eso va en un efecto, y el `queueMicrotask` de adentro es a propósito:
  // separa la lectura de la sincronización de React con el efecto en sí, que
  // es justamente lo que evita el patrón de "cascading render" que se quiere
  // prevenir en general.
  useEffect(() => {
    let vigente = true;

    queueMicrotask(() => {
      if (!vigente) return;

      try {
        const crudo = window.localStorage.getItem(clave);
        if (!crudo) return;

        const leido = JSON.parse(crudo) as Borrador<T>;
        const distinto = Object.keys(iniciales).some(
          (campo) => leido.valores[campo] !== iniciales[campo],
        );

        if (distinto) setBorrador(leido);
        else window.localStorage.removeItem(clave);
      } catch {
        window.localStorage.removeItem(clave);
      } finally {
        montado.current = true;
      }
    });

    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // Autoguardado. No corre antes de terminar la lectura inicial: si no,
  // el primer render pisaría el borrador que todavía no se ofreció.
  useEffect(() => {
    if (!montado.current) return;

    const id = setTimeout(() => {
      try {
        const registro: Borrador<T> = { valores, guardadoEn: Date.now() };
        window.localStorage.setItem(clave, JSON.stringify(registro));
      } catch {
        // Cuota llena o localStorage inhabilitado. El borrador es una
        // comodidad, no una garantía: seguir sin él es mejor que romper el
        // formulario por esto.
      }
    }, DEMORA_GUARDADO_MS);

    return () => clearTimeout(id);
  }, [clave, valores]);

  function alCambiar(campo: keyof T) {
    return (
      evento: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
    ) => {
      const valor = evento.target.value;
      setValores((previos) => ({ ...previos, [campo]: valor }));
    };
  }

  function fijar(campo: keyof T, valor: string) {
    setValores((previos) => ({ ...previos, [campo]: valor }));
  }

  function limpiarBorrador() {
    setBorrador(null);
    try {
      window.localStorage.removeItem(clave);
    } catch {
      // Ver arriba.
    }
  }

  function recuperar() {
    if (!borrador) return;
    setValores(borrador.valores);
    limpiarBorrador();
  }

  /** Vuelve a los valores en blanco y borra el borrador. Para formularios de alta. */
  function reiniciar() {
    setValores(inicialesRef.current);
    limpiarBorrador();
  }

  return {
    valores,
    alCambiar,
    fijar,
    borrador,
    recuperar,
    descartar: limpiarBorrador,
    limpiarBorrador,
    reiniciar,
  };
}

/**
 * Limpia el borrador apenas una acción termina de guardar sin error.
 *
 * `pending` es el tercer valor de `useActionState` (React 19). Se dispara
 * solo en la transición true→false: así no se limpia el borrador de arranque,
 * en el primer render, cuando todavía no se mandó nada.
 */
export function useLimpiarBorradorAlGuardar(
  pending: boolean,
  error: string | null,
  limpiar: () => void,
) {
  const previoPendiente = useRef(false);

  useEffect(() => {
    if (previoPendiente.current && !pending && !error) limpiar();
    previoPendiente.current = pending;
  }, [pending, error, limpiar]);
}
