# Plan de contingencia — Formulario de Visitas DMC

**Objetivo:** app web funcional para marcha blanca de agosto, en paralelo con la hoja física.
Vida útil ~4-6 semanas. Se descarta cuando el módulo `visita` de DMC_Core esté listo.

**Regla que manda sobre todas:** esto es desechable. Nada de acá se reutiliza en
DMC_Core. Lo único que sobrevive son los **datos**. Cualquier decisión que agregue
elegancia a costa de tiempo, se descarta.

---

## Stack

| Capa | Elección | Por qué |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Deploy 1-click en Vercel, server actions evitan escribir API |
| Estilos | Tailwind CSS v4 | Cero configuración, velocidad |
| BD | Supabase (Postgres) | Gratis, ya conectado, Auth incluido |
| Auth | Supabase Auth (email + password) | Login básico resuelto sin código propio |
| Deploy | Vercel | Ya definido |

**Acceso a datos:** todo pasa por Server Components y Server Actions usando la
`SUPABASE_SERVICE_ROLE_KEY`. RLS queda en deny-all para que nadie pueda consultar
la BD desde el navegador. Las reglas de alcance (técnico ve solo lo suyo) van en
código, en una capa `lib/db/*.ts`. Es la ruta más corta y más segura para 4 semanas.

**Qué NO se hace:** offline, PWA, inventario real, instalaciones/antenas/red,
reagendamiento con historial, fotos, notificaciones, reportes, QR, exportar PDF.

---

## Roles

| Rol | Puede |
|---|---|
| `ADMIN` | Todo, incluido crear usuarios y técnicos |
| `COORDINADOR` | Clientes, sucursales, crear y asignar visitas, ver todas |
| `TECNICO` | Ver solo sus visitas asignadas, llenar el formulario, cerrarlas |

---

## Pasos previos (los haces tú, ~30 min, antes de tocar Claude Code)

**1. Verificar los códigos de catálogo.**
Abrí `01_esquema.sql` y comparalo con tus migraciones Flyway de `core.estado_visita`,
`core.tipo_trabajo_visita`, `core.estado_problema` y `core.direccion_material_terreno`.
Los códigos tienen que ser **idénticos** a los de DMC_Core. Si no lo son, el traspaso
de septiembre pasa de un `INSERT ... SELECT` a una tabla de mapeo y medio día perdido.
Este es el único paso del plan que no se puede improvisar después.

**2. Crear el proyecto Supabase.**
- Región: `South America (São Paulo)` — la más cercana a Chile.
- Nombre: `dmc-visitas-temporal`
- Guardá la password de la BD.
- SQL Editor → pegar `01_esquema.sql` completo → Run.
- Settings → API → copiar `Project URL`, `anon key` y `service_role key`.

**3. Crear el repo.**
`GrupoDMC/dmc-visitas-mvp`, privado. Sin branch protection — para esto vas a
commitear directo a `main`.

**4. Crear el primer usuario admin.**
Supabase → Authentication → Users → Add user → tu email + password, marcá
"Auto Confirm User". Copiá el UUID que queda y corré:

```sql
insert into perfil (id, nombre, rol)
values ('<UUID-QUE-COPIASTE>', 'Tu Nombre', 'ADMIN');
```

---

## Fases de Claude Code

Cinco sesiones separadas. Entre cada una: probás en local, commiteás, seguís.
No juntes fases — el contexto se degrada y empieza a reescribir lo que ya funcionaba.

| Fase | Qué entrega | Tiempo estimado |
|---|---|---|
| 1 | Scaffold, login, layout, deploy en Vercel funcionando | 45 min |
| 2 | Clientes, sucursales, técnicos (CRUD) | 60 min |
| 3 | Visitas: crear, asignar, listar, detalle | 75 min |
| 4 | Formulario de terreno: problemas, materiales, firma, cierre | 90 min |
| 5 | Usuarios, export CSV, pulido | 45 min |

**La fase 1 termina con un deploy real en Vercel.** No la des por cerrada hasta ver
la URL pública funcionando con el login. Si el pipeline de deploy falla, querés
saberlo hoy y no el jueves con los técnicos esperando.

---

# PROMPTS

## Fase 1 — Scaffold, auth y layout

```
Vamos a construir una app web temporal para registrar visitas técnicas en terreno.
Es un MVP desechable de 4-6 semanas que corre en paralelo con una hoja física.
Va a ser usado por técnicos desde el celular y por coordinadores desde el escritorio.

STACK OBLIGATORIO
- Next.js 15 App Router + TypeScript, Tailwind CSS v4
- Supabase para BD y Auth
- Deploy en Vercel

REGLA CENTRAL DE ACCESO A DATOS
Todo el acceso a la base va por Server Components y Server Actions usando
SUPABASE_SERVICE_ROLE_KEY. RLS está en deny-all en Supabase a propósito.
NUNCA crees un cliente de Supabase que corra en el navegador para leer o escribir
datos de negocio. El único uso del cliente browser es el signIn/signOut de Auth.
Encapsulá todo el acceso en lib/db/*.ts — los componentes nunca llaman a supabase
directo.

ESQUEMA
La BD ya está creada en Supabase. Las tablas son:
cliente, sucursal, tecnico, perfil, visita, problema, material_terreno, firma,
y los catálogos cat_estado_visita, cat_tipo_trabajo, cat_estado_problema,
cat_direccion_material.
Leé el archivo esquema.sql que dejé en la raíz del repo para los campos exactos.
No inventes columnas. Si necesitás una que no existe, pará y avisame.

ROLES
La tabla perfil tiene id (= auth.users.id), nombre, rol ('ADMIN'|'COORDINADOR'|
'TECNICO') y tecnico_id. Un TECNICO ve solo las visitas donde
visita.tecnico_id = perfil.tecnico_id. ADMIN y COORDINADOR ven todas.

QUÉ CONSTRUIR EN ESTA FASE
1. Proyecto Next.js inicializado, con .env.local.example documentando las 3
   variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
   SUPABASE_SERVICE_ROLE_KEY.
2. /login — email + password contra Supabase Auth. Mensajes de error en español
   y concretos ("Correo o contraseña incorrectos", nunca "Error 400").
   Después de entrar, si el perfil no existe o activo = false, cerrar sesión y
   mostrar "Tu cuenta no está habilitada. Contactá a administración."
3. Middleware que protege todo salvo /login. Sesión en cookies httpOnly.
4. lib/auth.ts con getSesion() que devuelve { userId, nombre, rol, tecnicoId }
   leído del perfil, y helpers esTecnico() / puedeVerTodas().
5. Layout de aplicación:
   - Escritorio: sidebar fija a la izquierda con la navegación, header delgado
     arriba con el nombre del usuario, su rol y botón de salir.
   - Móvil: sidebar colapsa en un drawer con botón hamburguesa.
   - La navegación se filtra por rol: un TECNICO solo ve "Mis visitas".
6. Página / que por ahora solo saluda y muestra el rol.
7. Una página de error y una de carga decentes.

DIRECCIÓN VISUAL
Es una herramienta de trabajo interna, no un sitio de marketing. Densa, legible,
rápida de escanear. Nada de gradientes, ilustraciones, ni animaciones de entrada.

- Paleta: fondo #F7F8FA, superficies #FFFFFF, borde #E2E5EA, texto #1A1D21,
  texto secundario #6B7280, acento #1F5FA8 (azul institucional, se usa solo en
  acciones primarias y estado activo de navegación).
- Estados: programada #6B7280, en curso #B45309, realizada #15803D,
  pendiente #B91C1C. Se muestran como badge con punto de color, no como fondo
  saturado. El color nunca es el único portador de la información: siempre va
  acompañado del texto del estado.
- Tipografía: Inter vía next/font. Escala corta: 12/14/16/20/24. Los números
  (folios, cantidades, RUT) en tabular-nums.
- Radio de borde 6px, uniforme. Sombras: solo una, sutil, en tarjetas y drawer.
- Densidad: filas de tabla de 44px, inputs de 40px de alto. En móvil los targets
  táctiles nunca bajan de 44px.
- Formularios: label arriba del campo siempre, nunca placeholder como label.
  Errores debajo del campo en rojo, con texto que dice qué corregir.

CALIDAD MÍNIMA
Responsive real hasta 360px de ancho. Foco de teclado visible. Todo el texto de
interfaz en español de Chile, sentence case, verbos activos ("Guardar cambios",
no "Enviar"). Los estados vacíos son una invitación a actuar, no un "No hay datos".

Cuando termines: dejá el proyecto listo para hacer push y conectarlo a Vercel, y
decime exactamente qué variables de entorno tengo que cargar allá.
```

---

## Fase 2 — Clientes, sucursales y técnicos

```
Continuamos con la app de visitas. La fase 1 está lista y desplegada.
Respetá todo lo definido antes: acceso solo por Server Actions con service role,
lib/db/*.ts, la dirección visual y los roles.

Ahora construí los maestros. Todo esto es visible para ADMIN y COORDINADOR.
Un TECNICO no accede a estas rutas — el middleware debe rebotarlo a /visitas.

CLIENTES
/clientes            listado con buscador por razón social o RUT, y filtro activo/inactivo
/clientes/nuevo      formulario
/clientes/[id]       ficha: datos del cliente + tabla de sus sucursales + botón
                     "Agregar sucursal"
Campos: rut, razon_social, nombre_fantasia, telefono, email, activo.
Validá el RUT chileno con dígito verificador, y guardalo normalizado sin puntos
y con guión (formato 76123456-7). Mostralo formateado con puntos en la interfaz.
El RUT es único: si ya existe, el error dice qué cliente lo tiene.

SUCURSALES
Se crean y editan desde la ficha del cliente, no tienen listado propio de primer
nivel. Campos: nombre, codigo_interno, direccion, comuna, region, telefono, activo.
Comuna y región son texto libre por ahora (en DMC_Core son FK a core.comuna, acá
no las replicamos). Poné la región como select con las 16 regiones de Chile y la
comuna como texto libre.

TÉCNICOS
/tecnicos            listado
/tecnicos/nuevo      formulario
/tecnicos/[id]       edición
Campos: rut (validado igual que cliente), nombres, apellidos, telefono, email, activo.

REGLAS TRANSVERSALES
- Nada se borra. "Eliminar" es siempre desactivar (activo = false). Los inactivos
  no aparecen en los selects de creación de visitas, pero sí en los listados con
  un filtro.
- Antes de desactivar un cliente o un técnico, avisá si tiene visitas abiertas
  y cuántas.
- Todos los formularios validan en el servidor dentro de la Server Action, no
  solo en el cliente. Usá zod.
- Al guardar, revalidatePath de la ruta afectada y redirect con un toast de
  confirmación.
- Los listados paginan de a 25 y ordenan alfabéticamente por defecto.

Cargá también 2 clientes de ejemplo con 2 sucursales cada uno y 2 técnicos, en un
script seed.sql aparte que yo pueda correr o no. No los insertes automáticamente.
```

---

## Fase 3 — Visitas: crear, asignar, listar

```
Continuamos. Fases 1 y 2 listas. Esta es la fase central.

CREAR VISITA (COORDINADOR / ADMIN)
/visitas/nueva
Flujo en cascada: seleccionar cliente → se cargan sus sucursales → seleccionar
sucursal. Al elegir sucursal, precargá teléfono en contacto_telefono como
sugerencia editable.
Campos: cliente, sucursal, tipo_trabajo, fecha_programada, hora_programada,
tecnico (opcional, puede quedar sin asignar), descripcion_trabajo,
contacto_nombre, contacto_email, contacto_telefono.
El estado nace en PROGRAMADA. El folio lo genera la BD sola, no lo toques.

Importante: los campos de contacto son un SNAPSHOT de esa visita. No actualizan
ni leen ningún dato maestro. Son columnas planas a propósito.

ASIGNAR
Desde el listado, acción "Asignar técnico" en cada fila sin técnico, y también
"Reasignar" en las que ya tienen. Modal con select de técnicos activos.
Debe poder asignarse en lote: seleccionar varias filas con checkbox y asignar
todas al mismo técnico de una vez. Esto es lo que más se va a usar los lunes.

LISTADO DE COORDINACIÓN
/visitas
Tabla con: folio, fecha programada, cliente, sucursal, comuna, tipo de trabajo,
técnico, estado.
Filtros arriba, en una barra: rango de fechas, estado, técnico, cliente, y un
buscador libre que pegue contra folio, razón social y nombre de sucursal.
Los filtros viven en la URL como search params para que el coordinador pueda
compartir un link filtrado. Paginado de 25.
Fila sin técnico asignado: marcala visualmente, es la acción pendiente más común.

LISTADO DEL TÉCNICO
/visitas para un rol TECNICO muestra otra cosa: sus visitas, agrupadas en
"Hoy", "Esta semana" y "Pendientes de cerrar". Nada de tabla — tarjetas apiladas,
optimizadas para el pulgar. Cada tarjeta: hora, cliente, sucursal, dirección,
tipo de trabajo, estado. Tap en la tarjeta abre el formulario.
Agregá un botón fijo abajo "Nueva visita en terreno" que crea una visita con
fecha_programada NULL — es el caso del técnico que llega a un lugar sin
agendamiento previo. Es un caso válido, no un error.

DETALLE
/visitas/[id]
Cabecera con folio, estado, y la ficha de la sucursal: dirección, comuna,
teléfono, contacto. Debajo, el formulario (fase 4).
Control de acceso: si un TECNICO abre una visita que no es suya, devolvé 404, no
403. No queremos confirmarle que ese folio existe.

HISTORIAL DE LA SUCURSAL
En el detalle, un panel lateral (o acordeón en móvil) con las últimas 5 visitas
de esa misma sucursal: fecha, técnico, tipo de trabajo, estado. Es lo primero que
un técnico quiere saber al llegar.
```

---

## Fase 4 — Formulario de terreno

```
Continuamos. Esta es la parte que llenan los técnicos en la calle, con una mano,
con mala señal y con el encargado de tienda mirando. Prioridad absoluta:
que sea rápido de llenar y que no se pierda nada.

El formulario vive en /visitas/[id]. Se edita en secciones independientes, cada
una con su propio "Guardar". Nunca un solo botón gigante al final: si se corta la
señal a la mitad, no puede perder 10 minutos de tipeo.

Guardá también un borrador automático en localStorage por sección, y restauralo
al volver a entrar si hay cambios sin guardar. Avisá con una franja discreta
"Tenés cambios sin guardar de hace X minutos" con opción de recuperar o descartar.

SECCIÓN 1 · Datos de la visita
Editable: tipo_trabajo, contacto_nombre, contacto_email, contacto_telefono,
responsable_tienda_nombre, responsable_tienda_rut (validá el RUT).
Botón "Iniciar visita" que setea estado = EN_CURSO y fecha_inicio = now().

SECCIÓN 2 · Trabajo realizado
trabajo_realizado (textarea), observaciones (textarea),
requiere_seguimiento (switch).

SECCIÓN 3 · Problemas detectados
Lista de problemas de esta visita, con agregar y editar en línea.
Campos: descripcion, solucion_sugerida, estado (default ABIERTO).
sucursal_id se copia de la visita automáticamente, no se pregunta.

SECCIÓN 4 · Materiales
Tabla editable, agregar filas. Campos: descripcion (texto libre — todavía no hay
inventario), codigo_producto (opcional), cantidad, direccion (Instalado/Retirado),
observacion.
En móvil no uses tabla: usá tarjetas apiladas con un botón "Agregar material".

SECCIÓN 5 · Firmas
Dos firmas: TECNICO y TIENDA. Canvas de dibujo a dedo.
- Debe funcionar con touch y con mouse. Usá pointer events.
- Trazo suave, grosor 2.5px, color #1A1D21, fondo blanco.
- Botón "Limpiar" y botón "Guardar firma".
- Al guardar, exportá el canvas a PNG data URL y mandalo a la Server Action.
  Antes de guardar, redimensioná a máximo 600px de ancho y comprimí — no
  guardes un PNG de 2MB en una columna de texto.
- Para la firma de TIENDA, pedí firmante_nombre y firmante_rut antes de habilitar
  el canvas.
- Si ya existe una firma de ese tipo, mostrala como imagen con opción "Rehacer
  firma", no un canvas vacío.
- El canvas debe bloquear el scroll de la página mientras se dibuja encima.

CIERRE DE LA VISITA
Al pie, dos acciones:
- "Cerrar visita": valida que trabajo_realizado no esté vacío y que exista la
  firma del técnico. Setea estado = REALIZADA y fecha_termino = now().
  Si falta algo, no cierres: mostrá exactamente qué falta.
- "Marcar como pendiente": pide motivo_pendiente obligatorio, setea estado =
  PENDIENTE. Sin exigir firma.
Una visita REALIZADA queda en solo lectura para el TECNICO. Un COORDINADOR o
ADMIN sí puede reabrirla, con confirmación.

Probá el canvas en un viewport de 390x844 antes de darlo por listo.
```

---

## Fase 5 — Usuarios, exportación y cierre

```
Última fase. Cerramos.

USUARIOS (solo ADMIN)
/usuarios — listado de perfiles con nombre, correo, rol, técnico vinculado, activo.
/usuarios/nuevo — crea el usuario en Supabase Auth con la Admin API desde el
servidor y en el mismo paso inserta el perfil. Si el rol es TECNICO, el select de
técnico es obligatorio.
Acción "Restablecer contraseña" que setea una contraseña temporal y me la muestra
una sola vez para dictársela por teléfono. Nada de correos de recuperación.
Acción "Desactivar" que pone perfil.activo = false. No borres usuarios de Auth.

EXPORTACIÓN
/exportar — solo ADMIN.
Botones que descargan CSV con UTF-8 BOM (para que Excel en Windows no rompa las
tildes) y separador punto y coma:
- Visitas (desde la vista v_export_visita)
- Problemas
- Materiales
- Clientes y sucursales
Con filtro de rango de fechas. Esto es lo que voy a usar para traspasar todo a
SQL Server, así que las columnas tienen que salir crudas y completas, sin formatear
fechas a texto bonito: ISO 8601.

REVISIÓN FINAL
Antes de terminar, recorré la app y arreglá:
1. Cualquier pantalla que se rompa a 360px de ancho.
2. Estados vacíos genéricos — reescribilos con una acción concreta.
3. Mensajes de error que muestren detalles técnicos al usuario.
4. Cualquier lugar donde se llame a supabase desde un componente cliente para
   leer datos de negocio. No debe existir ninguno.
5. Verificá que un usuario TECNICO no pueda entrar por URL directa a /clientes,
   /tecnicos, /usuarios, /exportar ni a una visita ajena.

Dejá un README.md con: cómo correr en local, las variables de entorno, cómo crear
el primer admin, y una nota clara de que esto es temporal y se descarta.
```

---

## Después de la fase 1: conectar Vercel

1. Push a `GrupoDMC/dmc-visitas-mvp`.
2. Vercel → Add New → Project → importar el repo.
3. Environment Variables → cargar las tres. La `SUPABASE_SERVICE_ROLE_KEY`
   **nunca** con prefijo `NEXT_PUBLIC_`.
4. Deploy. Verificá el login en la URL pública desde el celular, no desde el
   escritorio.
5. Supabase → Authentication → URL Configuration → agregá el dominio de Vercel
   a las redirect URLs.

---

## Riesgos y qué hacer

| Riesgo | Mitigación |
|---|---|
| Los códigos de catálogo no calzan con DMC_Core | Paso previo 1. Es el único que no se arregla después barato. |
| Un técnico pierde señal a mitad de formulario | Guardado por sección + borrador en localStorage (fase 4) |
| La firma no se registra en algún celular | Probar con 2 celulares distintos el lunes antes de repartir |
| El MVP se vuelve permanente | Fecha de corte explícita en el README y en el footer de la app |
| Alguien pide "una cosita más" | La respuesta es no hasta septiembre. El alcance está cerrado. |

---

## El traspaso a DMC_Core (septiembre)

Cuando el módulo `visita` esté listo:
1. Exportar los CSV desde /exportar.
2. `BULK INSERT` a tablas staging en SQL Server (`stg.visita`, `stg.problema`, etc.).
3. Resolver los IDs: los clientes, sucursales y técnicos hay que cargarlos primero
   en `core` y mapear por RUT y nombre de sucursal.
4. `INSERT ... SELECT` desde staging a `core.*`.
5. Marcar `migrado_en` en la BD temporal y dejarla en solo lectura un mes por si acaso.

Estimado: 4-6 horas para un mes de datos.
