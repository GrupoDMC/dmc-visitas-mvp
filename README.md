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
- [Configuración](#configuración)
- [Base de datos](#base-de-datos)
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

---

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm start` | Sirve el build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | Verificación de tipos (`tsc --noEmit`) |
| `npm run secreto` | Genera un valor aleatorio apto para secretos |
| `npm run hash-password` | Genera el hash de una contraseña por consola |

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
  types.ts      Tipos del dominio
middleware.ts   Control de acceso a las rutas
scripts/        Utilidades de consola
sql/            Esquema y migraciones
```

---

## Convenciones

- Dominio, nombres de archivo y comentarios en **español**.
- Toda escritura pasa por Server Actions en `app/actions/*`; no hay API REST para el CRUD.
- Los componentes de `components/mobile/*` están pensados para uso táctil en terreno; los de
  `components/admin/*`, para escritorio.
- Antes de subir cambios: `npm run lint` y `npm run typecheck`.

---

## Seguridad

- **No subir** credenciales, cadenas de conexión, hosts, IP, respaldos de base de datos, planillas
  ni datos personales de clientes, tiendas o trabajadores.
- Las contraseñas se almacenan con hash; la sesión va en una cookie firmada y solo accesible por el
  servidor.
- Si detectas una vulnerabilidad o un dato expuesto, avisa directamente al responsable del proyecto;
  no abras un issue público.
