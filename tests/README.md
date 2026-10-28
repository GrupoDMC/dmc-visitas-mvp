# Pruebas automáticas

Todo se ejecuta con `npm run <script>`. **Ningún test se conecta a producción ni a una base compartida.**

| Script | Qué corre |
| --- | --- |
| `npm test` | Vitest completo: unidad, acciones/API, componentes y BD. |
| `npm run test:unit` | Lo anterior **sin** la base de datos (no necesita SQL Server). |
| `npm run test:bd` | Solo los tests contra SQL Server local. |
| `npm run test:e2e` | Playwright (Chromium) contra la app real y una base desechable. |
| `npm run test:coverage` | Vitest completo con reporte de cobertura en `coverage/` (`coverage/index.html`). |

## Organización

```
tests/
  unidad/       lógica pura: fechas, formato, validaciones, estados, zip, CSP, PDF, proxy, env…
  acciones/     Server Actions con la capa de datos simulada (sesión, permisos, validación, errores)
  api/          rutas /api/* (evidencia por rangos, PDF del acta, salud, CSP)
  componentes/  React Testing Library sobre jsdom (dropdowns, listado + filtros, formularios, acta móvil, panel)
  bd/           contra SQL Server real en una base desechable (restricciones, triggers, transacciones…)
  e2e/          Playwright: login, permisos y el flujo agendar → acta móvil → panel → PDF
  setup/        barreras de seguridad y base desechable
  helpers/      sesión simulada y fixtures
```

## Seguridad de los datos (lo importante)

* `tests/setup/seguridad.ts` (unidad, acciones, API, componentes): borra del entorno cualquier `DB_*` y
  reemplaza el pool de `mssql` por uno que **rechaza** toda conexión. Un test que olvide simular la capa
  de datos falla con un mensaje claro en vez de conectarse.
* Los tests de BD y los E2E solo usan una base `dmc_test_*` creada y borrada por ellos mismos, en
  **localhost**. `tests/setup/guarda-bd.ts` aborta si el servidor no es la propia máquina o el nombre de
  la base no cumple el patrón; nunca tocan `DMC_Contingencia`, `DMC_Tecnicos_dev` ni otra base.
* El E2E además verifica con `/api/salud` que la app levantada apunta a la base desechable antes de
  ejecutar el primer test.
* Todos los datos son ficticios (`@example.com`, RUT de ejemplo). El login se hace siempre por la pantalla
  real: no hay atajos con cookies fabricadas.

## Base de datos de pruebas (una sola vez)

Copia `.env.test.example` a `.env.test` (git lo ignora) y crea el login en tu SQL Server local:

```sql
CREATE LOGIN dmc_test_runner WITH PASSWORD = N'<clave>', CHECK_POLICY = OFF;
ALTER SERVER ROLE dbcreator ADD MEMBER dmc_test_runner;
```

Sin `.env.test`, `npm run test:bd` y `npm run test:e2e` no corren (el resto sí).

## E2E

`playwright.config.ts` construye la app en `.next-e2e` (no pisa tu `.next`), la levanta en el puerto 3100
y crea `dmc_test_e2e0001` con catálogos, un cliente, una tienda, un técnico y tres cuentas conocidas.
El primer arranque tarda lo que tarda un `next build`. El reporte HTML queda en `playwright-report/`.
