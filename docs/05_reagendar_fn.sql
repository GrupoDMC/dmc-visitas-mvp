-- =====================================================================
-- Reagendamiento (fase 6) · función RPC. Correr en Supabase → SQL Editor,
-- DESPUÉS de 03_reagendamiento.sql (necesita que visita_reagendamiento ya
-- exista).
--
-- El pedido original dice "en una sola transacción": el insert en
-- visita_reagendamiento y el update de visita tienen que caerse juntos si
-- algo falla. supabase-js no expone transacciones multi-statement desde el
-- cliente (dos llamadas .insert()/.update() son dos viajes HTTP separados),
-- así que la atomicidad se resuelve acá, en una función de Postgres: una
-- función completa corre siempre dentro de una única transacción implícita.
--
-- El `for update` bloquea la fila de la visita mientras dura la función, para
-- que dos reagendamientos simultáneos de la misma visita no lean el mismo
-- "fecha_anterior" y pisen uno al otro.
-- =====================================================================

create or replace function fn_reagendar_visita(
  p_visita_id      bigint,
  p_fecha_nueva    date,
  p_hora_nueva     time,
  p_motivo         text,
  p_reagendado_por uuid
) returns void
language plpgsql
as $$
declare
  v_fecha_anterior date;
  v_hora_anterior  time;
  v_estado         text;
begin
  select fecha_programada, hora_programada, estado
    into v_fecha_anterior, v_hora_anterior, v_estado
    from visita
   where id = p_visita_id
     for update;

  if not found then
    raise exception 'La visita % no existe.', p_visita_id;
  end if;

  -- Repite la regla de negocio que ya chequeó la Server Action, por si dos
  -- requests llegan a la vez (p.ej. alguien cierra la visita mientras el
  -- modal de reagendar estaba abierto). Ver docs/03_decisiones.md, Fase 6.
  if v_estado = 'REALIZADA' then
    raise exception 'No se puede reagendar una visita realizada.';
  end if;

  insert into visita_reagendamiento
    (visita_id, fecha_anterior, hora_anterior, fecha_nueva, hora_nueva, motivo, reagendado_por)
  values
    (p_visita_id, v_fecha_anterior, v_hora_anterior, p_fecha_nueva, p_hora_nueva, p_motivo, p_reagendado_por);

  update visita
     set fecha_programada = p_fecha_nueva,
         hora_programada  = p_hora_nueva,
         estado           = 'REAGENDADA'
   where id = p_visita_id;
end;
$$;
