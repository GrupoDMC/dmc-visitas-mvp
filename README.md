# DMC · Formulario de visitas técnicas

App interna y temporal para registrar visitas técnicas en terreno. Corre en
paralelo con la hoja física durante la marcha blanca de agosto 2026.

> **Esto es descartable.** No es el sistema definitivo: es un puente hasta que
> DMC_Core absorba este flujo en septiembre. El traspaso se hace desde
> `/exportar` (CSV crudo) o directo contra las vistas `v_export_*` de
> `docs/01_esquema.sql`. Cuando el traspaso termine, esta app y su base se dan
> de baja — no hay que mantenerla ni evolucionarla más allá de la marcha
> blanca.

- **Técnicos** entran desde el celular y registran lo que hicieron.
- **Coordinación** entra desde el escritorio y programa y consulta.
- **Administración** gestiona usuarios y saca los export para el traspaso.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase · Vercel.

---

## Regla central de acceso a datos

**Todo el acceso a la base va por Server Components y Server Actions usando
`SUPABASE_SERVICE_ROLE_KEY`.** RLS está en deny-all a propósito y verificado:
con la clave anónima, leer devuelve cero filas y escribir es rechazado.

- Todo el acceso queda encapsulado en `lib/db/*.ts`. Los componentes nunca
  llaman a `supabase` directo.
- **No existe ningún cliente de Supabase que corra en el navegador**, ni
  siquiera para Auth. El ingreso y la salida son Server Actions y la cookie de
  sesión es `httpOnly`, así que el JavaScript de la página no puede leerla.
  El porqué está en [`docs/03_decisiones.md`](docs/03_decisiones.md#1).

---

## Levantarlo local

```bash
npm install
cp .env.local.example .env.local   # y completá los tres valores
npm run dev                        # http://localhost:3000
```

Las tres variables salen de Supabase → **Project Settings → API**. Están
documentadas una por una en `.env.local.example`.

El esquema de la base es `docs/01_esquema.sql`, ya aplicado en Supabase.

### Crear el primer admin

Auth y perfil son dos cosas distintas: **no alcanza con crear el usuario en
Supabase Auth**. Sin una fila en `perfil` con `activo = true`, el ingreso lo
rechaza con "Tu cuenta no está habilitada". Este paso a mano hace falta solo
para el primer ADMIN — a partir de ahí, `/usuarios/nuevo` crea el resto sin
tocar Supabase directo.

1. Supabase → Authentication → Add user (marcá "Auto Confirm User").
2. Copiá el UUID y corré en el SQL Editor:

```sql
insert into perfil (id, nombre, rol, tecnico_id, activo)
values ('<uuid-de-auth.users>', 'Nombre Apellido', 'ADMIN', null, true);
```

Para un `TECNICO` el `tecnico_id` es obligatorio (lo exige el check
`ck_perfil_tecnico`): primero creá la fila en `tecnico` y usá su id. Con el
primer ADMIN ya podés entrar y usar `/usuarios/nuevo` para el resto del
equipo, incluidos los técnicos.

---

## Desplegar en Vercel

1. Push del repo y "Import Project" en Vercel. El framework se detecta solo.
2. **Settings → Environment Variables.** Cargá estas tres, marcando los tres
   entornos (Production, Preview, Development):

   | Variable                        | ¿Secreta? | De dónde sale                          |
   | ------------------------------- | --------- | -------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | No        | Supabase → Settings → API → Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No        | Supabase → Settings → API → clave anon / publishable |
   | `SUPABASE_SERVICE_ROLE_KEY`     | **Sí**    | Supabase → Settings → API → clave `service_role` |

3. Deploy.

> **`SUPABASE_SERVICE_ROLE_KEY` saltea RLS por completo.** No lleva el prefijo
> `NEXT_PUBLIC_`, no se pega en el front y no se commitea. Si se filtra, se
> rota desde Supabase y se actualiza en Vercel.

No hace falta ninguna otra variable. `NEXT_PUBLIC_*` se inyecta en el bundle en
tiempo de build: si las cambiás, hay que **redeployar**, no alcanza con
reiniciar.

---

## Mapa del proyecto

```
proxy.ts                     Protege todo salvo /login (en Next 16 esto
                             reemplaza a middleware.ts)
app/
  layout.tsx                 Fuente Inter, es-CL, metadata
  login/                     Ingreso: página + formulario cliente
  salir/route.ts             Cierra sesión (ver decisiones, punto 5)
  (app)/                     Todo lo que requiere sesión
    layout.tsx               Guardia real + shell (sidebar/drawer + header)
    page.tsx                 Inicio: saluda y muestra el rol
    loading.tsx  error.tsx   Estados de carga y de error
    clientes/  tecnicos/     Maestros (ADMIN + COORDINADOR)
    visitas/                 Listado de coordinación + tarjetas de técnico,
                             alta, detalle con formulario de terreno
    usuarios/                Alta y gestión de cuentas (solo ADMIN)
    exportar/                CSV para el traspaso (solo ADMIN) + sus
                             Route Handlers de descarga
lib/
  auth.ts                    getSesion, puedeVerTodas, requerirAdmin
  navegacion.ts              Ítems de navegación y filtro por rol
  env.ts                     Lectura validada de variables de entorno
  csv.ts                     CSV con BOM UTF-8 y separador `;`
  claves.ts                  Contraseña temporal para "Restablecer contraseña"
  acciones/                  Server Actions, una por feature
  db/                        ÚNICO lugar que habla con la base
  supabase/                  admin (service_role) y auth (cookies)
components/
  shell/                     Sidebar, drawer, header, botón salir
  ui/                        Campo, Botón, BadgeEstado, ProximaFase
  maestros/  visitas/  usuarios/   Componentes propios de cada feature
docs/
  01_esquema.sql             Esquema de la base
  03_decisiones.md           Qué se resolvió distinto y qué quedó abierto
```

## Roles

| Rol           | Ve                                                        |
| ------------- | ---------------------------------------------------------- |
| `ADMIN`       | Todo: visitas, mantenedores, Usuarios y Exportar            |
| `COORDINADOR` | Todas las visitas + mantenedores (sin Usuarios ni Exportar) |
| `TECNICO`     | Solo las visitas con su `tecnico_id`                        |

El filtro de navegación vive en `lib/navegacion.ts`. El control de acceso real
está en las páginas (`requerirSesion()` / `requerirVerTodas()` /
`requerirAdmin()`), no en la navegación — esconder un enlace no es un permiso.

## Estado actual

Las cinco fases del encargo están hechas y esta es la última: no quedan
pantallas marcadoras ("próxima fase").

**Fase 1** — ingreso, sesión, roles, shell, estados de error y carga.

**Fase 2** — maestros de clientes, sucursales y técnicos:

| Ruta | Qué es |
| ---- | ------ |
| `/clientes` | Listado, con buscador por razón social o RUT y filtro activo/inactivo |
| `/clientes/nuevo` | Alta |
| `/clientes/[id]` | Ficha: datos + tabla de sucursales |
| `/clientes/[id]/editar` | Edición |
| `/clientes/[id]/sucursales/nueva` | Alta de sucursal |
| `/clientes/[id]/sucursales/[sucursalId]` | Edición de sucursal |
| `/tecnicos` | Listado, con buscador y filtro |
| `/tecnicos/nuevo` | Alta |
| `/tecnicos/[id]` | Edición |

Las sucursales no tienen listado de primer nivel: se administran desde la ficha
de su cliente.

**Fase 3** — visitas: `/visitas` (tabla de coordinación o tarjetas del técnico,
según el rol), `/visitas/nueva`, `/visitas/en-terreno` (alta sin agendar),
`/visitas/[id]` (detalle). Asignación de técnico en lote desde el listado.

**Fase 4** — formulario de terreno dentro de `/visitas/[id]`: datos de la
visita, trabajo realizado, problemas, materiales, firmas en canvas, y el cierre
(realizada / pendiente / reabrir).

**Fase 5** — cierre:

| Ruta | Qué es |
| ---- | ------ |
| `/usuarios` | Listado de perfiles: nombre, correo, rol, técnico vinculado, activo |
| `/usuarios/nuevo` | Crea el usuario en Supabase Auth (Admin API) y su perfil en el mismo paso |
| `/exportar` | CSV de visitas, problemas, materiales, y clientes+sucursales, con filtro de fechas |

En `/usuarios`, "Restablecer contraseña" genera una temporal y la muestra una
sola vez en pantalla, para dictarla por teléfono — nunca por correo.
"Desactivar" apaga `perfil.activo`; la cuenta de Supabase Auth nunca se borra.

Nada se borra nunca, en ningún maestro. "Eliminar" es siempre desactivar
(`activo = false`); los inactivos siguen en los listados detrás del filtro, y
desaparecen solo de los selects para crear cosas nuevas.

Datos de ejemplo opcionales en `docs/04_seed.sql` — no se cargan solos, hay que
pegarlos a mano en el SQL Editor de Supabase.

## Comandos

```bash
npm run dev     # desarrollo
npm run build   # build de producción
npm run lint    # ESLint
```
