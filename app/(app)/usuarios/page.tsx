import Link from "next/link";
import type { Metadata } from "next";
import { nombreRol, requerirAdmin } from "@/lib/auth";
import { listarUsuarios } from "@/lib/db/usuarios";
import { BadgeActivo } from "@/components/ui/badge-activo";
import { Encabezado, EnlaceBoton } from "@/components/ui/encabezado";
import { Fila, SinDato, Tabla, Td, Th } from "@/components/ui/tabla";

export const metadata: Metadata = { title: "Usuarios" };

export default async function PaginaUsuarios() {
  await requerirAdmin();

  const usuarios = await listarUsuarios();

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado
        titulo="Usuarios"
        descripcion="Quién puede entrar a la app y con qué rol. Restablecer contraseña y desactivar se hacen desde la ficha de cada uno."
        acciones={<EnlaceBoton href="/usuarios/nuevo">Nuevo usuario</EnlaceBoton>}
      />

      <Tabla
        cabecera={
          <>
            <Th>Nombre</Th>
            <Th soloAncha>Correo</Th>
            <Th>Rol</Th>
            <Th soloAncha>Técnico vinculado</Th>
            <Th>Estado</Th>
          </>
        }
      >
        {usuarios.map((usuario) => (
          <Fila key={usuario.id}>
            <Td>
              <Link
                href={`/usuarios/${usuario.id}`}
                className="font-medium text-acento hover:underline"
              >
                {usuario.nombre}
              </Link>
              <span className="block truncate text-xs text-suave sm:hidden">
                {usuario.correo}
              </span>
            </Td>
            <Td soloAncha className="max-w-[16rem] truncate">
              {usuario.correo}
            </Td>
            <Td>{nombreRol(usuario.rol)}</Td>
            <Td soloAncha>
              {usuario.tecnico ? (
                `${usuario.tecnico.apellidos}, ${usuario.tecnico.nombres}`
              ) : (
                <SinDato />
              )}
            </Td>
            <Td>
              <BadgeActivo activo={usuario.activo} />
            </Td>
          </Fila>
        ))}
      </Tabla>
    </div>
  );
}
