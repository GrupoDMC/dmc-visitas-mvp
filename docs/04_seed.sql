-- =====================================================================
-- DMC · Formulario de Visitas — datos de ejemplo (OPCIONAL)
--
-- 2 clientes con 2 sucursales cada uno, y 2 técnicos.
-- Sirve para tener con qué probar las pantallas antes de cargar lo real.
--
-- NO se corre solo. Pegalo en Supabase → SQL Editor → Run solo si lo querés.
-- Si vas a cargar los datos de verdad de una, saltealo entero.
--
-- Es idempotente: corrértelo dos veces no duplica nada.
-- Los RUT son inventados pero tienen el dígito verificador correcto, así que
-- pasan la misma validación que usa la aplicación.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CLIENTES
-- ---------------------------------------------------------------------

insert into cliente (rut, razon_social, nombre_fantasia, telefono, email, activo)
values
  ('76543210-3', 'Comercial Andes Sur SpA',      'Andes Sur',   '+56 2 2345 6789', 'contacto@andessur.cl',      true),
  ('77123456-9', 'Distribuidora Pacífico Ltda.', 'DisPacífico', '+56 2 2987 6543', 'operaciones@dispacifico.cl', true)
on conflict (rut) do nothing;

-- ---------------------------------------------------------------------
-- SUCURSALES
--
-- El cliente se resuelve por RUT y no por id: la columna es `generated always
-- as identity`, así que los ids dependen de qué más se haya insertado antes y
-- no se pueden dar por sabidos.
-- ---------------------------------------------------------------------

insert into sucursal (cliente_id, nombre, codigo_interno, direccion, comuna, region, telefono, activo)
select c.id, v.nombre, v.codigo_interno, v.direccion, v.comuna, v.region, v.telefono, v.activo
from (values
  ('76543210-3', 'Casa Matriz Providencia', 'AS-001', 'Av. Providencia 1234',   'Providencia', 'Metropolitana de Santiago', '+56 2 2345 6790', true),
  ('76543210-3', 'Sucursal Concepción',     'AS-002', 'Barros Arana 567',       'Concepción',  'Biobío',                    '+56 41 234 5678', true),
  ('77123456-9', 'Centro de Distribución',  'DP-100', 'Av. Américo Vespucio 900','Quilicura',  'Metropolitana de Santiago', '+56 2 2987 6544', true),
  ('77123456-9', 'Sucursal Valparaíso',     'DP-200', 'Errázuriz 890',          'Valparaíso',  'Valparaíso',                '+56 32 987 6543', true)
) as v(rut_cliente, nombre, codigo_interno, direccion, comuna, region, telefono, activo)
join cliente c on c.rut = v.rut_cliente
-- No hay índice único sobre (cliente_id, nombre), así que el `on conflict` no
-- aplica: el resguardo contra duplicados es este NOT EXISTS.
where not exists (
  select 1 from sucursal s
  where s.cliente_id = c.id and s.nombre = v.nombre
);

-- ---------------------------------------------------------------------
-- TÉCNICOS
-- ---------------------------------------------------------------------

insert into tecnico (rut, nombres, apellidos, telefono, email, activo)
values
  ('15678234-3', 'Camila Andrea',  'Rojas Pinto',   '+56 9 8765 4321', 'camila.rojas@dmc.cl',   true),
  ('13456789-9', 'Sebastián Alonso','Muñoz Vera',   '+56 9 7654 3210', 'sebastian.munoz@dmc.cl', true)
on conflict (rut) do nothing;

-- ---------------------------------------------------------------------
-- Para deshacerlo:
--
--   delete from sucursal where cliente_id in (
--     select id from cliente where rut in ('76543210-3','77123456-9'));
--   delete from cliente where rut in ('76543210-3','77123456-9');
--   delete from tecnico where rut in ('15678234-3','13456789-9');
--
-- Ojo: si ya les creaste visitas encima, el delete de cliente va a fallar por
-- la FK. Eso es a propósito — acá nada se borra en cascada.
-- ---------------------------------------------------------------------
