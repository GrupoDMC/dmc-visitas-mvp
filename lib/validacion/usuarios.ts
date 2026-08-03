import { z } from "zod";
import { textoRequerido } from "./campos";

/**
 * Alta de usuario. Vive aparte de `maestros.ts` porque no es un maestro de
 * negocio: es una cuenta de acceso a la app, y el flujo de creación pasa por
 * la Admin API de Supabase Auth, no por una tabla propia con RUT único.
 */
export const esquemaUsuario = z
  .object({
    nombre: textoRequerido(
      150,
      "Escribí el nombre del usuario.",
      "El nombre no puede pasar de 150 caracteres.",
    ),
    correo: z
      .string()
      .trim()
      .min(1, "Escribí el correo.")
      .refine(
        (valor) => z.email().safeParse(valor).success,
        "Revisá el correo: parece que le falta el @ o el dominio.",
      ),
    // Sale de un <select> cerrado: si llega otra cosa es un FormData armado a
    // mano, y el mensaje genérico de zod alcanza para ese caso.
    rol: z.enum(["ADMIN", "COORDINADOR", "TECNICO"]),
    tecnico_id: z.string(),
  })
  .transform((valores) => ({
    ...valores,
    tecnico_id:
      valores.tecnico_id && Number.isInteger(Number(valores.tecnico_id))
        ? Number(valores.tecnico_id)
        : null,
  }))
  .refine(
    (valores) =>
      valores.rol !== "TECNICO" ||
      (valores.tecnico_id !== null && valores.tecnico_id > 0),
    {
      message: "Si el rol es Técnico, elegí a qué técnico corresponde.",
      path: ["tecnico_id"],
    },
  );

export type DatosUsuarioValidados = z.output<typeof esquemaUsuario>;
