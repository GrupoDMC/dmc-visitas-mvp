-- =====================================================================
-- Agrega historial de reagendamiento. Correr en Supabase → SQL Editor.
-- Espeja core.visita_reagendamiento de DMC_Core (misma lógica: guarda
-- la fecha anterior, motivo obligatorio, la fecha nueva va a visita).
-- =====================================================================

create table visita_reagendamiento (
  id               bigint generated always as identity primary key,
  visita_id        bigint not null references visita(id) on delete cascade,
  fecha_anterior   date,
  hora_anterior    time,
  fecha_nueva      date not null,
  hora_nueva       time,
  motivo           text not null,
  reagendado_por   uuid references perfil(id),
  reagendado_en    timestamptz not null default now()
);
create index ix_reagendamiento_visita on visita_reagendamiento(visita_id);

alter table visita_reagendamiento enable row level security;
-- deny-all, igual que el resto: se accede solo con service_role desde el servidor

create view v_export_reagendamiento as
select r.id, v.folio,
       r.fecha_anterior, r.hora_anterior,
       r.fecha_nueva, r.hora_nueva,
       r.motivo, r.reagendado_en
from visita_reagendamiento r
join visita v on v.id = r.visita_id;
