# Sistema de Contingencia

Aplicación web para gestionar visitas técnicas en terreno: un panel de escritorio para programar y
dar seguimiento, y una vista móvil para que el técnico registre el trabajo y cierre el acta.

> [!IMPORTANT]
> **Software propietario de uso interno.** Este repositorio no es un proyecto de código abierto: no
> se concede licencia de uso, copia, modificación ni distribución. La documentación operativa
> (infraestructura, credenciales, datos y procedimientos) se mantiene fuera del repositorio y se
> entrega solo al equipo autorizado.

---

## Índice

- [Stack](#stack)
- [Puesta en marcha](#puesta-en-marcha)
- [Scripts](#scripts)
- [Calidad: tests e integración continua](#calidad-tests-e-integración-continua)
- [Configuración](#configuración)
- [Base de datos](#base-de-datos)
- [Base de datos de desarrollo](#base-de-datos-de-desarrollo)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Convenciones](#convenciones)
- [Seguridad](#seguridad)

---

## Stack

| Pieza | Detalle |
| --- | --- |
| Framework | Next.js 15 (App Router, Server Actions) |
| UI | React 19 + Tailwind CSS 4 |
| Lenguaje | TypeScript 5 |
| Base de datos | SQL Server (`mssql`) |

**Requisitos:** Node.js 20+ y npm, y acceso a una instancia de SQL Server con el esquema aplicado.

---

## Puesta en marcha

```bash
npm install
cp .env.example .env.development   # completar con los valores entregados por el equipo
npm run secreto                    # genera SESSION_SECRET
npm run dev
```

La aplicación no tiene modo de demostración: sin las variables de conexión no arranca. Abrir
<http://localhost:3000>; la raíz redirige al login o a la vista que corresponda según el rol.

Para desarrollo, apunta `.env.development` a **tu propia base** (ver
[Base de datos de desarrollo](#base-de-datos-de-desarrollo)), nunca a la de producción.

---

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm start` | Sirve el build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | Verificación de tipos (`tsc --noEmit`) |
| `npm test` | Tests (Vitest) |
| `npm run test:cobertura` | Tests con informe de cobertura |
| `npm run secreto` | Genera un valor aleatorio apto para secretos |
| `npm run hash-password` | Genera el hash de una contraseña por consola |

---

## Calidad: tests e integración continua

Los tests (`tests/`) cubren la lógica pura y crítica —sesión firmada, permisos, validación de
contraseñas y de entradas, imágenes, formatos— y usan la capa de datos simulada: **ninguno abre una
conexión a la base**.

En cada push y pull request a `main`, GitHub Actions (`.github/workflows/ci.yml`) corre: `npm ci`,
typecheck, lint, tests, `npm audit --omit=dev --audit-level=high` y `npm run build` (este último con
variables de entorno de relleno: el workflow no usa ningún secreto).

---

## Configuración

Todas las variables se leen **solo en el servidor**. La lista completa, con su descripción, está en
[`.env.example`](.env.example), que es el único archivo de entorno versionado y no contiene valores
reales.

- Ninguna variable debe llevar el prefijo `NEXT_PUBLIC_`: eso la publicaría en el navegador.
- Los archivos `.env*` locales están en `.gitignore` y **nunca** se suben al repositorio.
- En producción las variables se definen en el panel del proveedor de despliegue, marcadas como
  secretas, y no en archivos.

---

## Base de datos

- El esquema base está en `sql/` y los cambios posteriores en archivos numerados
  `sql/migracion-NNN-*.sql`.
- Las migraciones son idempotentes y se aplican **en orden** con una cuenta con permisos de DDL.
  La cuenta que usa la aplicación solo lee y escribe datos.
- Cada migración nueva también se refleja en el script del esquema base.
- `sql/dmc_contingencia_sqlserver.sql` contiene solo el esquema y lo mínimo que la aplicación necesita
  (estados de problema y el rol «Coordinador»). Los datos de ejemplo, **ficticios**, están aparte en
  `sql/semillas-demo.sql`.

---

## Base de datos de desarrollo

Para trabajar sin tocar producción, levanta una instancia propia de SQL Server (local, en un
contenedor o la edición Developer) y prepárala así:

1. Crea la base y el esquema con una cuenta con permisos de DDL. El script ya incluye todas las
   migraciones numeradas hasta su fecha: en una base nueva no se aplica ninguna aparte.

   ```bash
   sqlcmd -S <servidor> -U <usuario> -P <clave> -i sql/dmc_contingencia_sqlserver.sql
   ```

2. (Opcional) Carga los datos de demostración ficticios: `sql/semillas-demo.sql`. Sin ellos el
   checklist arranca vacío y hay que cargar los motivos desde el panel antes de agendar visitas.

3. Crea el primer administrador. La contraseña se pide por consola y no queda en ningún archivo:

   ```bash
   npm run hash-password -- admin@example.com --admin
   ```

   Ejecuta en tu base el `INSERT` que imprime.

4. Crea un usuario SQL para la aplicación solo con lectura y escritura sobre el esquema `dmc`, y
   déjalo en `.env.development` (`DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`; y `SESSION_SECRET`
   con `npm run secreto`).

---

## Estructura del proyecto

```
app/
  actions/      Server Actions (toda mutación pasa por aquí)
  admin/        Panel de escritorio
  tecnico/      Vista móvil del técnico
  login/        Acceso
  api/          Rutas internas protegidas por sesión
components/
  admin/        Componentes del panel
  mobile/       Componentes de la vista móvil
  ui/           Compartidos
lib/
  data/         Capa de acceso a datos
  db/           Configuración y pool de conexión
  ui/           Utilidades de cliente (formato, fechas, estados)
  auth.ts       Autenticación y sesión
  log.ts        Registro de eventos en JSON
  types.ts      Tipos del dominio
middleware.ts   Control de acceso a las rutas
scripts/        Utilidades de consola
sql/            Esquema, migraciones y datos de demostración
tests/          Tests (Vitest)
```

---

## Convenciones

- Dominio, nombres de archivo y comentarios en **español**.
- Toda escritura pasa por Server Actions en `app/actions/*`; no hay API REST para el CRUD.
- Los componentes de `components/mobile/*` están pensados para uso táctil en terreno; los de
  `components/admin/*`, para escritorio.
- Antes de subir cambios: `npm run lint`, `npm run typecheck` y `npm test`.
- Lo que se pueda probar sin base de datos se escribe como función pura, fuera de las consultas SQL.
- Los errores del servidor se registran con `lib/log.ts` (una línea JSON); las acciones sensibles se
  anotan además en la tabla de auditoría (`lib/data/auditoria.ts`).

---

## Seguridad

- **No subir** credenciales, cadenas de conexión, hosts, IP, respaldos de base de datos, planillas
  ni datos personales de clientes, tiendas o trabajadores.
- Las contraseñas se almacenan con hash; la sesión va en una cookie firmada y solo accesible por el
  servidor.
- Si detectas una vulnerabilidad o un dato expuesto, avisa directamente al responsable del proyecto;
  no abras un issue público.
