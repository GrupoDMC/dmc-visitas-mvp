# Sistema de Contingencia — Grupo DMC

Aplicación web para gestionar **visitas de contingencia en terreno**: el coordinador/administrador
programa las visitas desde un panel de escritorio, y el técnico las ejecuta desde el móvil
(checklist de trabajos, registro de problemas, fotos, firmas) hasta cerrar el acta.

> **Estado actual:** la interfaz completa (admin + móvil) está funcionando sobre **datos mock**
> en `lib/mock/*`. La capa de conexión real a SQL Server ya existe (`lib/db/*`) pero **no se invoca
> todavía** — ver [Base de datos](#base-de-datos).

---

## Stack

| Pieza | Versión / detalle |
| --- | --- |
| Framework | Next.js 15 (App Router, Server Actions) |
| UI | React 19 + Tailwind CSS 4 |
| Lenguaje | TypeScript 5 |
| Base de datos | SQL Server 2022 (driver `mssql`) — esquema `dmc` |

---

## Requisitos

- Node.js 20 o superior
- npm
- (Opcional, para la fase con datos reales) SQL Server 2022 local con la base `DMC_Contingencia`

---

## Puesta en marcha

```bash
npm install
npm run dev
```

Abrir <http://localhost:3000>. La raíz redirige según el rol de la sesión:

- sin sesión → `/login`
- rol `TECNICO` → `/tecnico`
- rol `ADMIN` / `COORDINADOR` → `/admin`

### Credenciales de demo

El login valida contra `lib/mock/maestros.ts` (autenticación mock, contraseñas en texto plano
**solo** para la demo).

| Correo | Contraseña | Rol |
| --- | --- | --- |
| `admin@grupodmc.cl` | `Dmc.Admin2026` | ADMIN |
| `camila.vergara@grupodmc.cl` | `Dmc.Coord2026` | COORDINADOR |
| `hperalta@grupodmc.cl` | `contingencia` | TECNICO |
| `daniela.fuentes@grupodmc.cl` | `Terreno.2026` | TECNICO |

(`ignacio.salas@grupodmc.cl` existe pero está inactivo: sirve para probar el bloqueo de acceso.)

---

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm start` | Sirve el build de producción |
| `npm run lint` | ESLint (config `eslint-config-next`) |

---

## Variables de entorno

Se leen desde `.env.local` (no versionado). Ninguna es necesaria mientras la app corra con mocks;
todas aplican al activar la capa real de SQL Server.

```dotenv
DB_SERVER=localhost
DB_PORT=14330            # instancia local SQL2022 — no el 1433 por defecto
DB_NAME=DMC_Contingencia # obligatoria: sin ella getSqlConfig() lanza error
DB_USER=
DB_PASSWORD=
DB_TRUSTED_CONNECTION=false   # true para usar Windows Integrated Security (ignora DB_USER/DB_PASSWORD)
```

En desarrollo la conexión usa `encrypt: true` con `trustServerCertificate: true` (certificado
autofirmado local).

---

## Base de datos

El esquema completo vive en [`sql/dmc_contingencia_sqlserver.sql`](sql/dmc_contingencia_sqlserver.sql)
(base `DMC_Contingencia`, esquema `dmc`). Agrupa:

- **Maestros:** `cliente`, `sucursal`, `tecnico`, `usuario`
- **Catálogos:** `catalogo_motivo`, `catalogo_problema` (+ `_opcion`), `catalogo_trabajo` (+ `_subtrabajo`)
- **Visitas:** `visita`, `visita_ejecucion`, `visita_estado_historial`, `reagendamiento`,
  `visita_trabajo` (+ `_subtrabajo`), `visita_foto`, `visita_firma`
- **Problemas:** `problema`, `problema_item`, `problema_historial`, `problema_visita_resolucion`
- **Acta y sincronización:** `acta_envio` (+ `_adjunto`), `visita_borrador`, `sincronizacion_cola`

Los tipos de `lib/types.ts` están hechos 1:1 con ese esquema, así que son a la vez la forma de los
datos mock y la forma esperada de las filas reales.

**Para pasar de mock a SQL Server:** ejecutar el script SQL, definir las variables de entorno y
reemplazar las lecturas de `lib/mock/*` por consultas vía `getPool()` (`lib/db/pool.ts`). El pool es
perezoso: no abre ninguna conexión hasta la primera llamada.

---

## Estructura

```
app/
  actions/          Server Actions (auth, visitas, admin)
  admin/            Panel de escritorio: dashboard, visitas, maestros, catálogos
  tecnico/          App móvil: listado, detalle, formulario, revisión, perfil
  login/            Pantalla de acceso
components/
  admin/            Tablas, diálogos, editor de checklist, vista de acta
  mobile/           Shell móvil, sheets (cámara, firma, nueva visita), formulario
  ui/               Compartidos (Toast, Tag)
lib/
  auth.ts           Sesión por cookie httpOnly (dmc_session, 12 h)
  db/               config.ts (getSqlConfig) + pool.ts (getPool)
  mock/             Datos de demo: maestros, catálogos, visitas, historial, queries
  types.ts          Tipos alineados al esquema dmc
  ui/               Formato, estados, datos derivados del panel
middleware.ts       Puerta de entrada: sin cookie de sesión → /login
sql/                DDL de SQL Server
```

### Autenticación y rutas

`middleware.ts` es solo el primer filtro: si no hay cookie `dmc_session`, cualquier ruta cae en
`/login`. La validación real de la sesión (usuario existente y activo, técnico asociado) la hace
`getSesion()` en `lib/auth.ts`, y el reparto por rol lo resuelve el login y la raíz.

---

## Convenciones

- Dominio, nombres de archivo y comentarios en **español**; los tipos siguen la nomenclatura del
  esquema `dmc`.
- Toda mutación pasa por Server Actions en `app/actions/*` — nada de rutas API para el CRUD.
- Los componentes de `components/mobile/*` están pensados para uso en terreno (táctil, una mano);
  los de `components/admin/*`, para escritorio.
