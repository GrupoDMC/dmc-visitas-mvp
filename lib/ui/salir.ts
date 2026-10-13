"use client";

import { borrarBorradoresDelUsuario, pendientesAlSalir } from "@/lib/ui/borrador";
import { borrarBorradorPapel } from "@/lib/ui/borrador-papel";

/**
 * Deja limpio el equipo antes de cerrar sesión: borra los borradores del
 * usuario. Devuelve false si el usuario prefirió no salir.
 *
 * Las actas en cola NO se borran nunca: son actas cerradas que no se pudieron
 * enviar. Si hay, se avisa y se pide confirmar. Si confirma, quedan en el equipo
 * a su nombre y solo él las ve y las envía cuando vuelva a entrar.
 */
export function prepararSalida(uid: number): boolean {
  const n = pendientesAlSalir(uid);
  if (n > 0) {
    const texto = n === 1 ? "Tienes 1 acta sin enviar" : `Tienes ${n} actas sin enviar`;
    const seguir = window.confirm(
      `${texto} por falta de señal.\n\nSi cierras sesión no se pierden: quedan guardadas en este equipo y se ` +
        "envían cuando vuelvas a entrar con tu cuenta y haya señal. Hasta entonces no estarán en el sistema.\n\n" +
        "¿Cerrar sesión igual?"
    );
    if (!seguir) return false;
  }
  borrarBorradoresDelUsuario(uid);
  borrarBorradorPapel(uid);
  return true;
}
