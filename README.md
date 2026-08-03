# DMC · Formulario de visitas técnicas

App interna y temporal para registrar visitas técnicas en terreno. Corre en
paralelo con la hoja física durante la marcha blanca. Es un MVP desechable: el
traspaso a DMC_Core se hace después con las vistas `v_export_*`.

- **Técnicos** entran desde el celular y registran lo que hicieron.
- **Coordinación** entra desde el escritorio y programa y consulta.

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

### Crear el primer usuario

Auth y perfil son dos cosas distintas: **no alcanza con crear el usuario en
Supabase Auth**. Sin una fila en `perfil` con `activo = true`, el ingreso lo
rechaza con "Tu cuenta no está habilitada".

1. Supabase → Authentication → Add user (marcá "Auto Confirm User").
2. Copiá el UUID y corré en el SQL Editor:

```sql
insert into perfil (id, nombre, rol, tecnico_id, activo)
values ('<uuid-de-auth.users>', 'Nombre Apellido', 'ADMIN', null, true);
```

Para un `TECNICO` el `tecnico_id` es obligatorio (lo exige el check
`ck_perfil_tecnico`): primero creá la fila en `tecnico` y usá su id.

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
lib/
  auth.ts                    getSesion, esTecnico, puedeVerTodas
  navegacion.ts              Ítems de navegación y filtro por rol
  env.ts                     Lectura validada de variables de entorno
  acciones/sesion.ts         Server Actions de ingreso y salida
  db/                        ÚNICO lugar que habla con la base
  supabase/                  admin (service_role) y auth (cookies)
components/
  shell/                     Sidebar, drawer, header, botón salir
  ui/                        Campo, Botón, BadgeEstado, ProximaFase
docs/
  01_esquema.sql             Esquema de la base
  03_decisiones.md           Qué se resolvió distinto y qué quedó abierto
```

## Roles

| Rol           | Ve                                            |
| ------------- | --------------------------------------------- |
| `ADMIN`       | Todas las visitas + mantenedores              |
| `COORDINADOR` | Todas las visitas + mantenedores              |
| `TECNICO`     | Solo las visitas con su `tecnico_id`          |

El filtro de navegación vive en `lib/navegacion.ts`. El control de acceso real
está en las páginas (`requerirSesion()` / `requerirVerTodas()`), no en la
navegación — esconder un enlace no es un permiso.

## Estado actual

Hecho: ingreso, sesión, roles, shell, estados de error y carga.
`/visitas`, `/clientes`, `/sucursales`, `/tecnicos` y `/mis-visitas` existen
como marcadores con el control de acceso ya puesto, pendientes de contenido.

## Comandos

```bash
npm run dev     # desarrollo
npm run build   # build de producción
npm run lint    # ESLint
```
