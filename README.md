# Sistema de Contingencia — Grupo DMC

Aplicación web para gestionar **visitas de contingencia en terreno**. El coordinador programa las
visitas desde un panel de escritorio; el técnico las ejecuta desde el móvil —checklist de trabajos,
registro de problemas, fotos, firmas— hasta cerrar el acta.

> [!IMPORTANT]
> **Estado: todo sale de SQL Server.** No queda ningún dato de demostración: login, visitas,
> problemas, maestros y checklist leen y escriben en el esquema `dmc`. La app no arranca sin las
> variables `DB_*`. Ver [Estado y pendientes](#estado-y-pendientes).

---

## Índice

- [Stack](#stack)
- [Puesta en marcha](#puesta-en-marcha)
- [Scripts](#scripts)
- [Variables de entorno](#variables-de-entorno)
- [Despliegue](#despliegue)
- [Base de datos](#base-de-datos)
- [Seguridad](#seguridad)
- [Arquitectura](#arquitectura)
- [Estado y pendientes](#estado-y-pendientes)
- [Convenciones](#convenciones)

---

## Stack

| Pieza | Versión / detalle |
| --- | --- |
| Framework | Next.js 15 (App Router, Server Actions) |
| UI | React 19 + Tailwind CSS 4 |
| Lenguaje | TypeScript 5 |
| Base de datos | SQL Server vía `mssql@11` (driver `tedious`) — esquema `dmc` |
| Contraseñas | bcrypt (`bcryptjs`, costo 12) |

**Requisitos:** Node.js 20+ y npm.

---

## Puesta en marcha

```bash
npm install
cp .env.example .env.development
npm run secreto            # genera SESSION_SECRET; pégalo en .env.development
# rellena DB_SERVER, DB_NAME, DB_USER y DB_PASSWORD en .env.development
npm run sembrar-catalogos  # solo la primera vez, contra una base recién creada
npm run dev
```

No hay modo sin base de datos: la app siempre habla con SQL Server. `.env.development` apunta la
sesión local a la base que quieras (la de producción incluida — lo que guardes ahí se guarda de
verdad).

`npm run sembrar-catalogos` repone las tres listas de fábrica (motivos, tipos de problema y trabajos
con sus subdetalles). **Es obligatorio en una base nueva**: sin motivos no se puede programar una
visita, porque `dmc.visita` tiene una FK contra `dmc.catalogo_motivo`. Es idempotente y también se
puede hacer desde el panel, en *Maestros › Checklist › Restaurar catálogo por defecto*.

Abrir <http://localhost:3000>. La raíz redirige según el rol de la sesión:

| Situación | Destino |
| --- | --- |
| Sin sesión | `/login` |
| Rol `TECNICO` | `/tecnico` |
| Rol `ADMIN` o `COORDINADOR` | `/admin` |

---

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo (carga `.env.development`) |
| `npm run build` | Build de producción |
| `npm start` | Sirve el build de producción |
| `npm run lint` | ESLint (`eslint-config-next`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run secreto` | Genera un valor apto para `SESSION_SECRET` o `HEALTHCHECK_TOKEN` |
| `npm run hash-password [correo]` | Pide una contraseña por consola y devuelve su bcrypt (y el `UPDATE` si le pasas el correo) |
| `npm run sembrar-catalogos` | Repone las tres listas de fábrica en la base de `.env.development` |
| `npm run sembrar-catalogos:prod` | Lo mismo, contra la base de `.env.production` |

---

## Variables de entorno

Todas se leen server-side, en `lib/env.ts` y `lib/db/config.ts`. **Ninguna debe llevar prefijo
`NEXT_PUBLIC_`**: eso las publicaría en el bundle del navegador junto con la contraseña de la base
de datos.

### Archivos

| Archivo | Se carga con | Versionado | Contenido |
| --- | --- | --- | --- |
| `.env.example` | nunca | **sí** | plantilla documentada, sin valores reales |
| `.env.development` | `npm run dev` | no | tu entorno local |
| `.env.production` | `npm run build` / `npm start` **en servidor propio** | no | host y TLS, sin secretos |

En un despliegue gestionado (Vercel y similares) **`.env.production` no interviene**: el repositorio
no lo lleva y el build no lo ve. Las variables se definen en el panel del proveedor.

En un servidor propio, `SESSION_SECRET`, `DB_USER` y `DB_PASSWORD` se definen como variables de
entorno del proceso (servicio de Windows, PM2, Docker, IIS): tienen precedencia sobre los `.env*`,
así que el secreto no queda en disco dentro del proyecto.

### Variables

| Variable | Default | Notas |
| --- | --- | --- |
| `SESSION_SECRET` | — | **Obligatoria.** Firma la cookie de sesión. Mínimo 32 caracteres |
| `DB_SERVER` | — | **Obligatoria.** Host o IP. Para instancia con nombre, host + `DB_PORT` |
| `DB_PORT` | `1433` | Puerto TCP |
| `DB_NAME` | — | **Obligatoria** |
| `DB_USER` / `DB_PASSWORD` | — | **Obligatorias.** Cuenta acotada al esquema `dmc` |
| `DB_ENCRYPT` | `true` | En producción, `false` aborta el arranque |
| `DB_TRUST_SERVER_CERT` | `false` | `true` solo en local (cert autofirmado) |
| `DB_POOL_MAX` | `4` | Conexiones por instancia |
| `DB_CONNECT_TIMEOUT_MS` | `15000` | Espera máxima al conectar |
| `DB_REQUEST_TIMEOUT_MS` | `15000` | Espera máxima por consulta |
| `HEALTHCHECK_TOKEN` | — | Habilita `GET /api/salud`. Sin ella, la ruta responde 404 |

> [!WARNING]
> **`DB_TRUST_SERVER_CERT=true` anula la protección del cifrado.** El canal va cifrado, pero no se
> valida contra quién se habla, lo que deja la conexión expuesta a man-in-the-middle. Es aceptable
> en local; en producción debe quedar en `false`, con un certificado emitido por una CA de
> confianza. Si se deja en `true` en producción, el arranque lo registra como advertencia.

> [!NOTE]
> **Windows Integrated Security no está soportado.** `options.trustedConnection` es exclusiva del
> driver `msnodesqlv8`; este proyecto usa `mssql@11` sobre `tedious`, que la ignora e intenta
> conectar sin credenciales. `DB_TRUSTED_CONNECTION=true` ahora lanza un error explícito en vez de
> fallar de forma silenciosa. Usa autenticación SQL.

---

## Despliegue

### Requisitos de red

La app corre en el servidor (o en funciones serverless) y abre una conexión TCP a SQL Server. Con un
proveedor en la nube eso implica:

- El SQL Server debe aceptar conexiones desde fuera de la red de la empresa.
- Su firewall debe permitir el puerto TCP desde las direcciones del proveedor.
- Debe presentar un certificado TLS de una CA de confianza, para poder usar
  `DB_TRUST_SERVER_CERT=false`.

Si la instancia vive solo en la red interna, no hay conexión posible desde la nube: hay que
desplegar en un servidor de la propia red o montar un túnel.

### Pasos

1. Definir las variables de entorno del despliegue: `SESSION_SECRET`, las `DB_*` y, opcionalmente,
   `HEALTHCHECK_TOKEN`. Marcarlas como secretas donde el proveedor lo permita.
2. Desplegar. El build no necesita base de datos: la conexión se abre en la primera petición.
3. Comprobar la conexión sin iniciar sesión:

   ```bash
   curl -H "Authorization: Bearer $HEALTHCHECK_TOKEN" https://<dominio>/api/salud
   ```

   Responde `200` con la latencia si llega a la base, `503` con el error del driver si no. El campo
   `catalogo.listo` avisa si faltan las listas de fábrica.
4. Sembrar los catálogos si la base es nueva: `npm run sembrar-catalogos:prod`, o desde el panel en
   *Maestros › Checklist › Restaurar catálogo por defecto*.
5. Sembrar las contraseñas reales con `npm run hash-password <correo>` y aplicar el `UPDATE` que
   imprime.

### Vercel

Las variables van en **Project → Settings → Environment Variables**, marcando el entorno
*Production* (y *Preview* si se usa). `.env.production` **no** llega al despliegue: está en
`.gitignore` y el build no lo ve.

| Variable | Valor |
| --- | --- |
| `SESSION_SECRET` | uno propio, distinto del local (`npm run secreto`) |
| `DB_SERVER` | host o IP pública del SQL Server |
| `DB_PORT` | puerto TCP (`1433` si no se define) |
| `DB_NAME` | nombre de la base |
| `DB_USER` / `DB_PASSWORD` | cuenta acotada al esquema `dmc`, nunca `sa` |
| `DB_ENCRYPT` | `true` |
| `DB_TRUST_SERVER_CERT` | `false` con certificado de CA; `true` solo si sigue autofirmado |
| `DB_POOL_MAX` | `2`–`4` (cada instancia serverless abre su propio pool) |
| `HEALTHCHECK_TOKEN` | opcional, para poder consultar `/api/salud` |

Cambiar una variable **no** re-despliega solo: hay que volver a desplegar para que el runtime la
tome. El firewall del SQL Server tiene que aceptar las IP de salida de Vercel, que son dinámicas
salvo que se contrate IP fija.

### Notas de rendimiento

Cada instancia serverless abre su propio pool de conexiones, así que conviene mantener `DB_POOL_MAX`
bajo (2–4) para no agotar las conexiones del servidor SQL. Desplegar en la región geográficamente
más cercana al SQL Server reduce de forma notable la latencia de cada consulta.

---

## Base de datos

El esquema completo vive en [`sql/dmc_contingencia_sqlserver.sql`](sql/dmc_contingencia_sqlserver.sql)
(esquema `dmc`):

| Grupo | Tablas |
| --- | --- |
| Maestros | `cliente`, `sucursal`, `tecnico`, `usuario` |
| Catálogos | `catalogo_motivo`, `catalogo_problema` (+ `_opcion`), `catalogo_trabajo` (+ `_subtrabajo`) |
| Visitas | `visita`, `visita_ejecucion`, `visita_estado_historial`, `reagendamiento`, `visita_trabajo` (+ `_subtrabajo`), `visita_foto`, `visita_firma` |
| Problemas | `problema`, `problema_item`, `problema_historial`, `problema_visita_resolucion` |
| Acta y sincronización | `acta_envio` (+ `_adjunto`), `visita_borrador`, `sincronizacion_cola` |

Aplicarlo con `sqlcmd -S <host>,<puerto> -i sql/dmc_contingencia_sqlserver.sql`.

Los tipos de `lib/types.ts` están hechos 1:1 con ese esquema; `lib/data/*` los devuelve ya con los
nombres en camelCase y las fechas como texto ISO. Las fechas y horas se convierten **en SQL**
(`CONVERT(varchar, …)`) y no en JS: un `date` que el driver entrega como `Date` queda en medianoche
UTC y en un servidor con otro huso se corre un día.

El pool (`lib/db/pool.ts`) es **perezoso**: no abre ninguna conexión hasta la primera llamada a
`getPool()`. Si la conexión falla, o el servidor la corta, se descarta la promesa para que el
siguiente intento reconecte.

> [!CAUTION]
> La **sección 12 del DDL contiene datos de ejemplo** —nombres, RUT, teléfonos y correos— y siembra
> contraseñas con un `HASHBYTES('SHA2_512', …)` sin sal, pensado solo para poblar la tabla. No la
> ejecutes en la base de producción: crea los usuarios reales y asígnales su hash con
> `npm run hash-password`. La app acepta esos hashes heredados para no dejar fuera a una base ya
> sembrada, pero los reescribe a bcrypt en el primer inicio de sesión correcto de cada usuario.

> [!IMPORTANT]
> La **sección 11 sí hay que aplicarla**: son los catálogos de fábrica, no datos de demo. Si la base
> se creó sin ella, `npm run sembrar-catalogos` los repone (misma lista, en
> `lib/data/catalogo-fabrica.json`) sin tocar nada más.

---

## Seguridad

Lo que ya está resuelto:

- **Contraseñas** — bcrypt con costo 12 contra `dmc.usuario.password_hash`. Los hashes heredados
  del DDL de ejemplo se migran a bcrypt de forma transparente al primer acceso.
- **Sesión** — cookie `httpOnly`, `sameSite=lax`, `secure` en producción, con un token firmado
  (HMAC-SHA256) que lleva el id de usuario y su vencimiento. Alterar la cookie invalida la firma.
  Vigencia: 12 h.
- **Verificación en dos capas** — `middleware.ts` comprueba la firma antes de renderizar nada;
  `lib/auth.getSesion()` vuelve a leer el usuario en cada petición, así que desactivar una cuenta
  corta la sesión sin esperar a que expire la cookie.
- **Mensajes de error** — el login responde siempre lo mismo ante correo inexistente, contraseña
  incorrecta o cuenta desactivada, y consume el mismo tiempo en los tres casos, para no revelar qué
  correos están dados de alta.
- **Cabeceras** — `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` y HSTS
  (`next.config.ts`).
- **Fallo cerrado** — ya no existe un modo con datos de demostración: sin credenciales de base de
  datos la app falla con un mensaje explícito, no con un login de prueba.
- **Contraseñas de un solo sentido** — el maestro de usuarios no muestra la contraseña actual (el
  bcrypt no se puede revertir): solo permite reemplazarla.

Lo que falta:

- **Límite de intentos de login.** No hay throttling; en serverless un contador en memoria no sirve,
  hace falta apoyarse en la base o en el WAF del proveedor.
- **Recuperación de contraseña.** El enlace del login no está implementado.
- **Rotación de `SESSION_SECRET`.** Cambiarlo invalida todas las sesiones de golpe; no hay soporte
  para dos claves en paralelo.

---

## Arquitectura

```
app/
  actions/          Server Actions (auth, visitas, admin)
  admin/            Panel de escritorio: dashboard, visitas, maestros, catálogos
  tecnico/          App móvil: listado, detalle, formulario, revisión, perfil
  login/            Pantalla de acceso
  api/salud/        Diagnóstico de conexión, protegido por token
components/
  admin/            Tablas, diálogos, editor de checklist, vista de acta
  admin/maestros/   Tablas de clientes, sucursales, técnicos y usuarios
  mobile/           Shell móvil, sheets (cámara, firma, nueva visita), formulario
  ui/               Compartidos (Toast, Tag)
lib/
  auth.ts           Autenticación y sesión
  session.ts        Firma y verificación del token (Web Crypto: sirve en Node y en Edge)
  password.ts       bcrypt + compatibilidad con los hashes heredados
  env.ts            Lectura y validación de variables de entorno
  db/               config.ts (getSqlConfig) + pool.ts (getPool)
  data/             Capa de consultas a SQL Server
    sql.ts            Helpers: parámetros, CONVERT de fechas, agrupación
    maestros.ts       cliente, sucursal, tecnico, usuario (lectura y escritura)
    catalogos.ts      Las tres listas + restauración del catálogo de fábrica
    visitas.ts        Visitas con todas sus hijas + mutaciones
    queries.ts        Agregados del panel (usa las vistas v_* del esquema)
    historial.ts      "Última visita al local" del detalle móvil
    usuarios.ts       Consultas del inicio de sesión
  types.ts          Tipos alineados al esquema dmc
  ui/
    referencias.tsx   Contexto con maestros y catálogos para los componentes cliente
    fecha.ts          "Hoy" en America/Santiago
    formato.ts        Formato de RUT, teléfono y fechas
    estado.ts         Etiquetas y colores por estado
    panel-data.ts     Datos derivados del panel
middleware.ts       Puerta de entrada: token inválido → /login
scripts/            Utilidades de consola
sql/                DDL de SQL Server
```

Los componentes cliente no pueden consultar SQL Server. Los maestros y catálogos que necesitan
(`VisitasTable`, `VisitaDialogos`, `ProblemasView`, `ActaView`, `NuevaVisitaSheet`,
`PerfilHistorial`) se cargan una vez por petición en `app/admin/layout.tsx` y `app/tecnico/layout.tsx`
y bajan por el contexto de `lib/ui/referencias.tsx`.

---

## Estado y pendientes

Hecho:

- **Lectura** — todas las pantallas consultan SQL Server. `lib/mock/*` ya no existe.
- **Escritura** — visitas, problemas, maestros y checklist persisten en la base a través de las
  Server Actions de `app/actions/*`. Nada vive en memoria del proceso, así que funciona en
  serverless, donde cada instancia tendría su propia copia.
- **Catálogos de fábrica** — `npm run sembrar-catalogos` y el botón *Restaurar catálogo por defecto*
  del panel reponen las tres listas de forma idempotente.

Lo que falta:

1. **Cargar los maestros reales** — `dmc.cliente` y `dmc.sucursal` están vacías. Sin ellas no se
   puede programar ninguna visita. Se dan de alta desde *Maestros › Clientes* y *› Sucursales*.
2. **Contraseñas reales** — los usuarios sembrados traen el hash `sha512$` sin sal del DDL. La app lo
   acepta y lo reescribe a bcrypt en el primer acceso correcto de cada uno, pero conviene fijarlas
   con `npm run hash-password <correo>`.
3. **El formulario móvil todavía no guarda** — `components/mobile/FormularioVisita.tsx` arma el acta
   (trabajos, problemas, fotos, firma) en estado local; falta la Server Action que la escriba en
   `visita_ejecucion`, `visita_trabajo`, `problema`, `visita_foto` y `visita_firma`.
4. **Almacenamiento de fotos y firmas** — hoy son `dataUrl` en memoria (`CamaraSheet`) y no se
   guardan en ninguna parte. Definir destino (blob storage o columna `varbinary`) y su respaldo. El
   `.gitignore` ya reserva `/public/uploads` por si se opta por disco local, opción que **no sirve
   en serverless**: el sistema de archivos es efímero.
5. **Envío del acta por correo** — `enviarActaAction` registra la fila en `dmc.acta_envio` con estado
   `ENCOLADO`; falta el SMTP que la despache y la marque `ENVIADO`.
6. **Certificado del SQL Server** — la instancia presenta uno autofirmado, así que en producción hay
   que dejar `DB_TRUST_SERVER_CERT=true` hasta instalar uno de una CA de confianza. Mientras tanto la
   conexión va cifrada pero sin validar el servidor.

---

## Convenciones

- Dominio, nombres de archivo y comentarios en **español**; los tipos siguen la nomenclatura del
  esquema `dmc` (singular, `snake_case`).
- Toda mutación pasa por Server Actions en `app/actions/*` — nada de rutas API para el CRUD. La
  única ruta HTTP es `/api/salud`, que es diagnóstico, no datos.
- Los componentes de `components/mobile/*` están pensados para uso en terreno (táctil, una mano);
  los de `components/admin/*`, para escritorio.
