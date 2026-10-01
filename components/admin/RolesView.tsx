"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import Confirmar, { type ConfirmarCfg } from "@/components/admin/Confirmar";
import Dialogo, { type CampoDef, type FormValores } from "@/components/admin/Dialogo";
import Tag from "@/components/Tag";
import { Toast, useToast } from "@/components/ui/Toast";
import { eliminarRolAction, guardarRolAction } from "@/app/actions/maestros";
import { MODULOS, TODOS_LOS_PERMISOS, VER, type ModuloPermiso } from "@/lib/permisos";
import type { Rol } from "@/lib/types";

/**
 * "Roles y permisos": qué puede hacer cada rol del panel, módulo por módulo y
 * acción por acción.
 *
 * Los permisos son del rol, no de la persona: a cada usuario se le asigna un
 * rol en la pestaña Cuentas y hereda lo que ese rol tenga marcado acá. El
 * cambio corre en la siguiente pantalla que abra, sin volver a iniciar sesión.
 *
 * Administrador y Técnico son fijos: el primero puede todo —para que nadie se
 * quede afuera quitándole permisos— y el segundo entra por el celular.
 */
export default function RolesView({ roles, pestanas }: { roles: Rol[] | null; pestanas?: React.ReactNode }) {
  const router = useRouter();
  const { toast, aviso } = useToast();
  const [dialogo, setDialogo] = useState<{ id: number | null; form: FormValores; permisos: string[] } | null>(null);
  const [confirmar, setConfirmar] = useState<ConfirmarCfg | null>(null);
  const [guardando, setGuardando] = useState(false);

  const campos: CampoDef[] = [
    { k: "nombre", label: "Nombre del rol", span: 2, ph: "Ej: Supervisor, Solo lectura, Agendamiento" },
    { k: "descripcion", label: "Descripción (opcional)", span: 2, ph: "Para qué es este rol" },
  ];

  function alternar(modulo: ModuloPermiso, accion: string) {
    if (!dialogo) return;
    const clave = `${modulo.clave}.${accion}`;
    const marcado = dialogo.permisos.includes(clave);
    let permisos: string[];
    if (marcado) {
      // Sin "ver" el módulo no se abre: se van todas sus acciones.
      permisos =
        accion === VER
          ? dialogo.permisos.filter((p) => !p.startsWith(`${modulo.clave}.`))
          : dialogo.permisos.filter((p) => p !== clave);
    } else {
      permisos = [...new Set([...dialogo.permisos, clave, `${modulo.clave}.${VER}`])];
    }
    setDialogo({ ...dialogo, permisos });
  }

  function alternarModulo(modulo: ModuloPermiso) {
    if (!dialogo) return;
    const todas = modulo.acciones.map((a) => `${modulo.clave}.${a.clave}`);
    const completo = todas.every((p) => dialogo.permisos.includes(p));
    const resto = dialogo.permisos.filter((p) => !p.startsWith(`${modulo.clave}.`));
    setDialogo({ ...dialogo, permisos: completo ? resto : [...resto, ...todas] });
  }

  async function guardar() {
    if (!dialogo) return;
    if (!String(dialogo.form.nombre).trim()) return aviso("El rol necesita un nombre");
    if (dialogo.permisos.length === 0) return aviso("Marca al menos un permiso");

    setGuardando(true);
    const res = await guardarRolAction(dialogo.id, {
      nombre: String(dialogo.form.nombre),
      descripcion: String(dialogo.form.descripcion) || null,
      permisos: dialogo.permisos,
    });
    setGuardando(false);

    if (!res.ok) return aviso(res.error ?? "No se pudo guardar.");
    aviso(dialogo.id === null ? "Rol creado" : "Permisos guardados · corren de inmediato");
    setDialogo(null);
    router.refresh();
  }

  function pedirEliminar(rol: Rol) {
    setConfirmar({
      titulo: `Eliminar el rol «${rol.nombre}»`,
      texto: "El rol y sus permisos se borran. Solo se puede si ningún usuario lo tiene asignado.",
      cta: "Eliminar rol",
      accion: async () => {
        const res = await eliminarRolAction(rol.id);
        if (!res.ok) return aviso(res.error ?? "No se pudo eliminar.");
        aviso(`Rol «${rol.nombre}» eliminado`);
        router.refresh();
      },
    });
  }

  return (
    <>
      <AdminHeader kicker="Maestros · quién puede hacer qué" title="Usuarios" pestanas={pestanas}>
        {roles ? (
          <button
            onClick={() => setDialogo({ id: null, form: { nombre: "", descripcion: "" }, permisos: [] })}
            className="btn btn-primary"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Nuevo rol</span>
          </button>
        ) : null}
      </AdminHeader>

      <div className="px-7 pt-6 pb-10 animate-fade-in">
        {roles === null ? (
          <div className="px-4 py-3.5 bg-[var(--color-accent-200)] border-l-4 border-[var(--color-accent)] text-[13px] text-[var(--color-accent-800)] max-w-[80ch]">
            La base de datos todavía no tiene las tablas de roles. Hay que correr{" "}
            <b>sql/migracion-008-roles-y-permisos.sql</b>; hasta entonces el panel sigue como antes: el
            administrador puede todo y los coordinadores todo menos cancelar por admin y eliminar visitas.
          </div>
        ) : (
          <>
            <p className="m-0 mb-4 text-[13px] opacity-66 max-w-[80ch]">
              Cada usuario del panel tiene un rol y puede hacer lo que su rol tenga marcado. El rol se le asigna en
              la pestaña Cuentas.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Rol</th>
                  <th>Descripción</th>
                  <th>Usuarios</th>
                  <th>Permisos</th>
                  <th style={{ width: 84 }} />
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-semibold">Administrador</td>
                  <td className="opacity-70">Acceso total al panel. No se edita: así nadie queda afuera.</td>
                  <td className="opacity-45">—</td>
                  <td>
                    <Tag variant="outline">Todos</Tag>
                  </td>
                  <td />
                </tr>
                {roles.map((r) => (
                  <tr key={r.id}>
                    <td className="font-semibold">{r.nombre}</td>
                    <td className="opacity-70">{r.descripcion ?? ""}</td>
                    <td className="tabular-nums">{r.usuarios}</td>
                    <td className="tabular-nums">
                      {r.permisos.length} de {TODOS_LOS_PERMISOS.length}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {!r.esSistema ? (
                        <button
                          onClick={() => pedirEliminar(r)}
                          className="btn btn-icon w-8 h-8 border border-black/[.3] mr-1.5"
                          aria-label={`Eliminar el rol ${r.nombre}`}
                          title="Eliminar rol"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                          </svg>
                        </button>
                      ) : null}
                      <button
                        onClick={() =>
                          setDialogo({
                            id: r.id,
                            form: { nombre: r.nombre, descripcion: r.descripcion ?? "" },
                            permisos: r.permisos,
                          })
                        }
                        className="btn btn-icon w-8 h-8 border border-black/[.3]"
                        aria-label={`Editar el rol ${r.nombre}`}
                        title="Editar nombre y permisos"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 20h4l10-10-4-4L4 16v4z" />
                          <path d="M14 6l4 4" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="font-semibold">Técnico</td>
                  <td className="opacity-70">Entra por el celular y ve solo sus visitas. No usa el panel.</td>
                  <td className="opacity-45">—</td>
                  <td>
                    <Tag variant="neutral">Celular</Tag>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </>
        )}
      </div>

      {dialogo ? (
        <Dialogo
          kicker="Maestro · rol"
          titulo={dialogo.id === null ? "Nuevo rol" : `Permisos de ${dialogo.form.nombre}`}
          cta={dialogo.id === null ? "Crear rol" : "Guardar permisos"}
          nota="Marcar cualquier acción de un módulo marca también «Ver»; quitar «Ver» quita todo el módulo. El cambio corre de inmediato para quienes tengan este rol."
          campos={campos}
          form={dialogo.form}
          onCampo={(k, v) => setDialogo({ ...dialogo, form: { ...dialogo.form, [k]: v } })}
          onCerrar={() => setDialogo(null)}
          onGuardar={guardar}
          guardando={guardando}
        >
          <div className="mt-5 border border-black/[.3]">
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--color-surface)] border-b border-[var(--color-divider-soft)]">
              <div className="font-extrabold text-[11px] tracking-[.11em] uppercase">Qué puede hacer</div>
              <div className="ml-auto text-[11px] tracking-[.06em] uppercase opacity-66 tabular-nums">
                {dialogo.permisos.length} de {TODOS_LOS_PERMISOS.length} permisos
              </div>
            </div>
            {MODULOS.map((m) => {
              const marcadas = m.acciones.filter((a) => dialogo.permisos.includes(`${m.clave}.${a.clave}`)).length;
              return (
                <div key={m.clave} className="px-3.5 py-3 border-b border-black/[.18] last:border-b-0">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="font-extrabold text-[13px]">{m.label}</div>
                    <div className="text-[11px] opacity-62 tabular-nums">
                      {marcadas} de {m.acciones.length}
                    </div>
                    {m.acciones.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => alternarModulo(m)}
                        className="ml-auto min-h-7 px-2.5 bg-transparent border border-black/[.35] text-[11px] tracking-[.06em] uppercase cursor-pointer text-[var(--color-text)] hover:bg-black/[.07]"
                      >
                        {marcadas === m.acciones.length ? "Quitar todo" : "Marcar todo"}
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {m.acciones.map((a) => {
                      const activo = dialogo.permisos.includes(`${m.clave}.${a.clave}`);
                      return (
                        <button
                          key={a.clave}
                          type="button"
                          role="checkbox"
                          aria-checked={activo}
                          onClick={() => alternar(m, a.clave)}
                          className="flex items-center gap-2 min-h-9 px-2.5 border border-black/[.35] text-[13px] leading-[1.2] cursor-pointer text-left"
                          style={{
                            background: activo ? "var(--color-text)" : "var(--color-bg)",
                            color: activo ? "var(--color-bg)" : "var(--color-text)",
                            fontWeight: activo ? 800 : 400,
                          }}
                        >
                          <span className="w-3.5 h-3.5 flex-none border-2 border-current grid place-items-center">
                            {activo ? (
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                                <path d="M4 12l5 5L20 6" />
                              </svg>
                            ) : null}
                          </span>
                          <span>{a.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Dialogo>
      ) : null}

      {confirmar ? <Confirmar cfg={confirmar} onCerrar={() => setConfirmar(null)} /> : null}
      <Toast texto={toast} variante="panel" />
    </>
  );
}
