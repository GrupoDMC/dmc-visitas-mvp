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

---

# Fase 2 — Maestros

---

## 8. El rebote del técnico no puede apuntar a una ruta que también rebota

El encargo dice: "Un TECNICO no accede a estas rutas — el middleware debe
rebotarlo a `/visitas`". Hecho, con una salvedad que importa.

`/visitas` **no puede** estar en la lista de rutas que el proxy rebota. Si lo
estuviera, un técnico entrando a `/visitas` sería redirigido a `/visitas`, que
lo redirigiría a `/visitas`: bucle infinito y el navegador cortando con
`ERR_TOO_MANY_REDIRECTS`. La lista (`RUTAS_MAESTROS` en `lib/navegacion.ts`)
tiene entonces solo `/clientes` y `/tecnicos`.

Eso es además lo correcto a futuro: en la fase 3 `/visitas` pasa a mostrarle al
técnico sus propias visitas, así que es una pantalla compartida.

**Lo que pasa hoy, y hay que saberlo.** `/visitas` sigue siendo el marcador de
la fase 1 y todavía llama a `requerirVerTodas()`, que manda al técnico a `/`.
Entonces un TECNICO que hoy escriba `/clientes` en la barra hace dos saltos:

```
/clientes  →  (proxy)  →  /visitas  →  (página)  →  /
```

Termina en el inicio, que es un lugar razonable, pero pasa por `/visitas` sin
quedarse. **Se arregla solo en la fase 3**, cuando `/visitas` deje de usar
`requerirVerTodas()` y muestre el listado del técnico. No le puse un parche
ahora porque el parche sería borrar el guardia de una pantalla que todavía no
tiene contenido propio.

---

## 9. El proxy ahora sí lee el perfil, pero solo en dos rutas

La decisión 6 dice que el proxy no consulta la base. Para rebotar por rol hay
que saber el rol, así que eso cambió — acotado:

- La consulta corre **únicamente** si el path es `/clientes` o `/tecnicos`.
  Un técnico navegando sus visitas no paga ningún viaje de red extra, que era
  la preocupación original (gente en terreno con mala señal).
- Va por `fetch` directo a PostgREST y no por `lib/supabase/admin.ts`. La
  documentación de Next pide no compartir módulos con estado entre el proxy y
  el render, porque son runtimes distintos.
- **Si la consulta falla, deja pasar.** El rebote es comodidad de navegación,
  no la barrera. La barrera es `requerirVerTodas()` en la página, que además
  cubre las Server Actions — y las Server Actions no pasan por el proxy, son
  POST directos a otro endpoint. Toda acción de maestros la llama primero.

---

## 10. `/sucursales` dejó de existir como pantalla

El encargo es explícito: las sucursales "no tienen listado propio de primer
nivel", se crean y editan desde la ficha del cliente. Así que se borró
`app/(app)/sucursales/page.tsx` (era un marcador de "próxima fase") y se sacó
el ítem de la navegación.

Viven en rutas anidadas bajo el cliente:

| Ruta | Qué es |
|---|---|
| `/clientes/[id]/sucursales/nueva` | Alta |
| `/clientes/[id]/sucursales/[sucursalId]` | Edición |

Son rutas y no un modal a propósito: andan sin JavaScript, se puede volver con
el botón atrás, y el link a una sucursal se puede pegar en un chat. La
edición verifica que la sucursal sea **de ese cliente** y devuelve 404 si no,
para que no haya URLs armadas a mano con migas que mienten.

---

## 11. El RUT de ejemplo del encargo no es un RUT válido

El brief pide guardar "formato `76123456-7`". Ese número no pasa la validación
que el mismo brief pide: el dígito verificador de `76123456` es **0**, no 7.

El **formato** se respetó tal cual (cuerpo sin puntos, guión, DV en mayúscula).
Lo que se cambió es el ejemplo que se le muestra al usuario en la ayuda del
campo, que ahora dice `76.123.456-0`. Un ejemplo que la app rechaza si lo
copiás es una trampa.

Los cuatro RUT del `04_seed.sql` están verificados y pasan la validación.

---

## 12. Dónde se edita un cliente

El encargo define `/clientes/[id]` como "ficha: datos + tabla de sucursales +
botón Agregar sucursal". No dice dónde se edita el cliente. Se agregó
`/clientes/[id]/editar`, con el botón "Editar datos" en la ficha.

La ficha quedó de solo lectura. Mezclar un formulario editable con la tabla de
sucursales en la misma pantalla hace que "Guardar" sea ambiguo: no se sabe si
guarda el cliente o algo de la tabla.

---

## 13. El aviso antes de desactivar está en dos lugares, no en uno

"Antes de desactivar un cliente o un técnico, avisá si tiene visitas abiertas y
cuántas." Hay dos maneras de desactivar, y las dos avisan:

1. **Botón "Desactivar"** de la ficha → diálogo con la cuenta y una casilla de
   confirmación obligatoria.
2. **Casilla "Activo"** del formulario de edición → al desmarcarla aparece el
   mismo aviso con la misma confirmación obligatoria.

Sin (2) el aviso se esquiva solo: desmarcás la casilla, guardás, y quedó
desactivado sin haber leído nada.

Las dos rutas terminan en el mismo chequeo **del lado del servidor**: la acción
vuelve a contar las visitas abiertas antes de escribir y rechaza el guardado si
hay visitas y no vino la confirmación. Es necesario porque una Server Action es
un endpoint POST que se puede llamar sin pasar por la pantalla, y porque el
número pudo cambiar mientras el diálogo estaba abierto.

Las **sucursales** no llevan este aviso: el encargo lo pide para clientes y
técnicos, y una sucursal inactiva no deja a nadie con trabajo asignado.

---

## 14. Región cerrada, comuna abierta

Como pide el encargo: región es un `select` con las 16 regiones y comuna es
texto libre. Vale la pena decir por qué la región **también se valida en el
servidor** contra la lista, aunque la columna sea `text`:

El traspaso a DMC_Core mapea la región por nombre contra `core.region`. Un "RM"
o un "Región Metropolitana" escritos a mano no calzan con nada y hay que
resolverlos a ojo en septiembre. Los 16 nombres de `lib/regiones.ts` son los
oficiales, sin abreviar.

La comuna queda sin validar y es deuda conocida: en septiembre hay que mapear
346 comunas escritas a mano. Replicar `core.comuna` acá no se paga para seis
semanas, pero conviene saber que la factura llega.

---

## 15. El toast viaja en la URL

"Al guardar, revalidatePath de la ruta afectada y redirect con un toast de
confirmación."

Un toast en memoria no sobrevive a un `redirect()`: el árbol de React se
reemplaza entero. Así que la acción redirige a `?ok=<clave>`, y el componente
`Toast` del layout traduce la clave (`lib/avisos.ts`), la muestra y **saca el
parámetro de la URL** con `router.replace`. Sin eso, recargar o compartir el
link vuelve a mostrar un "Cliente creado" de hace media hora.

Sin librería de toasts y sin estado global. Las claves son un objeto cerrado:
un `?ok=` inventado desde la barra de direcciones no muestra nada.

---

## 16. Se sumó `zod` como dependencia

El encargo la pide explícitamente. Es la única dependencia nueva de esta fase.
Versión 4 — la API cambió respecto de la 3 en cosas que importan acá
(`z.email()` en vez de `z.string().email()`).

Los esquemas viven en `lib/validacion/` y no dentro de cada Server Action, para
que el formulario y la acción no puedan divergir. La validación que manda es la
del servidor: los formularios van con `noValidate` para que los mensajes sean
los nuestros, en español y diciendo qué corregir.

---

## 17. Dos trampas de React 19 / App Router que aparecieron probando

Las dos se encontraron recorriendo la app con el navegador, no compilando: el
build pasaba limpio con los dos bugs adentro. Van acá porque las dos se van a
volver a cruzar en las fases 3 y 4.

### React 19 vacía los campos no controlados cuando termina la acción

Un `<form action={serverAction}>` **resetea sus campos no controlados** en
cuanto la acción devuelve — también cuando devuelve un error de validación.

El efecto era éste: escribías RUT, razón social, teléfono y correo, el RUT
estaba repetido, y volvías a un formulario con el error correcto y **todos los
demás campos en blanco**. Había que tipear todo de nuevo para corregir un
carácter.

Por eso todos los campos de texto de los maestros van controlados, con
`useCampos` (`components/maestros/usar-campos.ts`). No es preferencia de
estilo: con `defaultValue` el formulario pierde los datos.

La fase 1 ya se había cruzado con esto en el campo de correo del ingreso y lo
resolvió a mano; acá está generalizado.

**Para la fase 4:** el formulario de terreno tiene textareas largas escritas en
la calle. Si alguna queda no controlada, un error de validación borra diez
minutos de tipeo del técnico.

### `defaultValue` no se reaplica en una navegación del lado del cliente

La barra de filtros mostraba "Solo activos" aunque la URL dijera
`?estado=inactivos` y la tabla mostrara los inactivos.

Motivo: pasar de `/clientes` a `/clientes?estado=inactivos` es una transición
cliente. React reconcilia el **mismo** `<select>`, y `defaultValue` solo se
aplica al montar — cambiarlo sobre un campo ya montado no hace nada.

La solución es el `key={\`${busqueda}|${estado}\`}` del `<Form>` en
`components/ui/barra-filtros.tsx`, que lo remonta cuando cambian los filtros.

**Para la fase 3:** la barra de filtros de `/visitas` tiene rango de fechas,
estado, técnico, cliente y buscador, todos en la URL. Van a tener exactamente
este problema.

---

## 18. Tres estados vacíos, no dos

El listado filtra por activos por defecto. Con el único cliente desactivado, la
pantalla decía "Todavía no hay clientes cargados" y ofrecía "Crear el primer
cliente" — mentira, y además una trampa: crearlo terminaba en un error de RUT
repetido contra el cliente que sí existía, apagado.

Los listados distinguen ahora tres casos, cada uno con su acción:

| Situación | Qué dice | Qué ofrece |
|---|---|---|
| Hay filtro puesto y no coincide nada | "Ninguno coincide con esa búsqueda" | Limpiar la búsqueda |
| No hay filtro, pero los que hay están inactivos | "No hay clientes activos" | Ver los inactivos |
| No hay ninguno, en ningún estado | "Todavía no hay clientes cargados" | Crear el primero |

La consulta extra (`hayAlgunCliente()` / `hayAlgunTecnico()`) es un `count`
con `head: true`, y corre **solo** cuando el listado ya salió vacío. En el
camino normal no cuesta nada.
