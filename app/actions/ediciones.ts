"use server";

import { revalidatePath } from "next/cache";
import { getSesion, sesionCon } from "@/lib/auth";
import { tiene } from "@/lib/permisos";
import { editarActa, type EdicionActaEntrada, type ResultadoEdicion } from "@/lib/data/ediciones";

// Edición del acta ya cerrada. Dos puertas, una regla distinta en cada una:
// el técnico corrige la suya desde el celular hasta un día después de cerrarla;
// quien tenga el permiso «Editar el acta ya cerrada» la corrige desde el panel
// sin plazo. Las dos dejan el mismo registro (ver lib/data/ediciones).

function revalidar(folio: string) {
  revalidatePath("/tecnico", "layout");
  revalidatePath("/admin", "layout");
  revalidatePath(`/admin/visitas/${folio}`);
}

function comoError(err: unknown, contexto: string): ResultadoEdicion {
  const texto = err instanceof Error ? err.message : String(err);
  if (/fk_vis_trab_catalogo|fk_vis_trab_motivo|fk_problema_tipo|fk_ejecucion_motivo|fk_visita_motivo_catalogo/i.test(texto)) {
    return {
      ok: false,
      error: "El checklist cambió mientras editabas el acta. Vuelve a abrirla y revisa lo marcado.",
    };
  }
  console.error(`[dmc] ${contexto}:`, err);
  return { ok: false, error: "No se pudo guardar en el servidor. Revisa la conexión e inténtalo otra vez." };
}

/** El técnico corrige su acta desde el celular, dentro del plazo. */
export async function editarActaTecnicoAction(entrada: EdicionActaEntrada): Promise<ResultadoEdicion> {
  const sesion = await getSesion();
  if (!sesion?.tecnico) return { ok: false, error: "Tu cuenta no tiene un técnico asociado." };
  if (!tiene(sesion.permisos, "celular.editarActa")) {
    return { ok: false, error: "Tu rol no puede editar actas ya cerradas. Pídeselo a coordinación." };
  }

  try {
    const res = await editarActa(entrada, {
      usuarioId: sesion.usuario.id,
      tecnicoId: sesion.tecnico.id,
      origen: "MOVIL",
      sinPlazo: false,
    });
    if (res.ok) revalidar(entrada.folio);
    return res;
  } catch (err) {
    return comoError(err, "editarActa (técnico)");
  }
}

/** Administración corrige el acta desde el panel, sin plazo. */
export async function editarActaAdminAction(entrada: EdicionActaEntrada): Promise<ResultadoEdicion> {
  const sesion = await sesionCon("visitas.editarActa");
  if (!sesion) return { ok: false, error: "No tienes permiso para editar un acta ya cerrada." };

  try {
    const res = await editarActa(entrada, {
      usuarioId: sesion.usuario.id,
      tecnicoId: null,
      origen: "WEB",
      sinPlazo: true,
    });
    if (res.ok) revalidar(entrada.folio);
    return res;
  } catch (err) {
    return comoError(err, "editarActa (panel)");
  }
}
