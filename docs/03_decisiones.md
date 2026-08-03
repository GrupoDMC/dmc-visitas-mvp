# Decisiones de implementación

Cosas que se resolvieron distinto a lo pedido, o que quedaron abiertas.
Léase junto con `01_esquema.sql`.

---

## 1. El ingreso se hace con Server Actions, no con el cliente de navegador

**Qué pedía el encargo.** Dos cosas que, juntas, no se pueden cumplir:

- "El único uso del cliente browser es el signIn/signOut de Auth."
- "Sesión en cookies httpOnly."

**Por qué chocan.** Una cookie `httpOnly` es, por definición, invisible para el
JavaScript de la página. `createBrowserClient` de `@supabase/ssr` escribe la
cookie de sesión desde el navegador, así que esa cookie **nunca** puede ser
`httpOnly` — si lo fuera, el propio cliente no podría leerla de vuelta.

**Qué se hizo.** Se priorizó `httpOnly`, que es el requisito de seguridad:

- `signIn` y `signOut` son Server Actions (`lib/acciones/sesion.ts`).
- Las cookies las escribe el servidor y pasan por `endurecer()`
  (`lib/supabase/opciones-cookie.ts`), que fuerza `httpOnly`, `sameSite: lax`
  y `secure` en producción.
- **El proyecto no crea ningún cliente de Supabase en el navegador.** Ni para
  datos ni para auth. `createBrowserClient` no se importa en ninguna parte.

El resultado es más estricto que la regla original, no menos: la superficie de
Supabase expuesta al navegador pasó de "solo auth" a "ninguna". Si preferís el
camino contrario — cliente de navegador para auth y resignar `httpOnly` — se
cambia en un solo archivo, pero conviene decidirlo antes de sumar pantallas.

---

## 2. Faltan dos colores de estado

`cat_estado_visita` tiene **seis** códigos. La dirección visual definió cuatro:

| Código       | Color definido       |
| ------------ | -------------------- |
| `PROGRAMADA` | `#6B7280` gris       |
| `EN_CURSO`   | `#B45309` ámbar      |
| `REALIZADA`  | `#15803D` verde      |
| `PENDIENTE`  | `#B91C1C` rojo       |
| `REAGENDADA` | **sin definir**      |
| `CANCELADA`  | **sin definir**      |

Provisoriamente `REAGENDADA` va en gris `#6B7280` y `CANCELADA` en gris claro
`#9CA3AF` (`components/ui/badge-estado.tsx`). No rompe nada porque el badge
siempre muestra el texto del estado junto al punto, pero hoy `REAGENDADA` y
`PROGRAMADA` se ven idénticas. **Decidilo antes de construir el listado de
visitas**, que es donde se van a ver las seis juntas.

---

## 3. El esquema estaba en `docs/`, no en la raíz

El encargo decía "el archivo `esquema.sql` en la raíz del repo". El archivo real
es `docs/01_esquema.sql`. Se usó ese. No se inventó ninguna columna.

---

## 4. `middleware.ts` ahora se llama `proxy.ts`

El proyecto corre sobre **Next.js 16.2.12**, no 15. Desde Next 16 el archivo
`middleware.ts` se llama `proxy.ts` y la función exportada es `proxy`. El
comportamiento es el mismo. Está en la raíz: `proxy.ts`.

Otro cambio de Next 16 que ya está aplicado: `cookies()`, `headers()`, `params`
y `searchParams` son **asíncronos**, sin compatibilidad síncrona. Hay que
esperarlos siempre.

---

## 5. Por qué existe `/salir` como Route Handler

Caso: un usuario con sesión válida en Supabase al que le **deshabilitan el
perfil mientras está adentro**.

Sin `/salir` se produce un rebote infinito:

1. Entra a `/` → el layout ve que no hay perfil activo → manda a `/login`.
2. El proxy ve que la cookie de sesión sigue siendo válida → lo manda a `/`.
3. Volver al paso 1.

Un layout no puede escribir cookies, así que no puede cerrar la sesión él mismo.
`app/salir/route.ts` sí puede: borra la cookie y recién ahí manda a
`/login?motivo=deshabilitada`, que muestra el aviso. El botón "Salir" del
encabezado no usa esta ruta — usa la Server Action `salir()`, que va por POST.

---

## 6. Costo por request: dos llamadas a Auth y una consulta

Cada navegación hace hoy:

1. `getUser()` en el proxy — valida el token contra Supabase y lo refresca.
2. `getUser()` en `getSesion()` — vuelve a validarlo antes de decidir permisos.
3. Un `select` sobre `perfil`.

Es el patrón que recomienda Supabase para SSR y es el correcto desde el punto
de vista de seguridad: `getSession()` solo lee la cookie y le cree, así que no
sirve para decidir permisos. Pero son dos viajes de red por navegación, y los
técnicos van a estar en terreno con señal mala.

`getSesion()` está memoizada con `cache` de React, así que dentro de un mismo
request el layout, la página y las acciones comparten una sola lectura. Lo que
no está deduplicado es proxy + render, porque corren en procesos distintos.

Si en marcha blanca se siente lento, la salida es aligerar el proxy para que
solo refresque el token y no valide, dejando toda la decisión en el layout.
No lo hice ahora porque optimizar antes de tener una medición real es adivinar.

---

## 7. Pantallas marcadas como "próxima fase"

La navegación se filtra por rol, así que los ítems tienen que llevar a algún
lado. `/visitas`, `/clientes`, `/sucursales`, `/tecnicos` y `/mis-visitas`
existen como marcadores (`components/ui/proxima-fase.tsx`) en vez de dar 404.

Ya tienen puesto el control de acceso real: las cuatro de coordinación usan
`requerirVerTodas()`, que devuelve un `TECNICO` al inicio si entra por URL
directa. Cuando se construya el contenido, el guardia ya está.
