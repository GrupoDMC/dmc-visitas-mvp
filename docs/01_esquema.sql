-- =====================================================================
-- DMC · Formulario de Visitas — BD temporal (marcha blanca agosto 2026)
-- Postgres / Supabase. Espejo simplificado de core.* de DMC_Core.
-- Pegar completo en Supabase → SQL Editor → Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CATÁLOGOS
-- OJO: verificá estos códigos contra tus migraciones Flyway V1–V9 antes
-- de correr. Deben ser IDÉNTICOS a los de core.estado_visita etc. para
-- que el traspaso posterior sea un INSERT directo sin mapeo.
-- ---------------------------------------------------------------------

create table cat_estado_visita (
  codigo text primary key,
  nombre text not null,
  orden  int  not null default 0
);

create table cat_tipo_trabajo (
  codigo text primary key,
  nombre text not null,
  orden  int  not null default 0
);

create table cat_estado_problema (
  codigo text primary key,
  nombre text not null,
  orden  int  not null default 0
);

create table cat_direccion_material (
  codigo text primary key,
  nombre text not null
);

insert into cat_estado_visita (codigo, nombre, orden) values
  ('PROGRAMADA',  'Programada',   1),
  ('EN_CURSO',    'En curso',     2),
  ('REALIZADA',   'Realizada',    3),
  ('PENDIENTE',   'Pendiente',    4),
  ('REAGENDADA',  'Reagendada',   5),
  ('CANCELADA',   'Cancelada',    6);

insert into cat_tipo_trabajo (codigo, nombre, orden) values
  ('INSTALACION',  'Instalación',        1),
  ('MANTENCION',   'Mantención',         2),
  ('REPARACION',   'Reparación',         3),
  ('RETIRO',       'Retiro de equipos',  4),
  ('CAPACITACION', 'Capacitación',       5),
  ('VISITA_TEC',   'Visita técnica',     6);

insert into cat_estado_problema (codigo, nombre, orden) values
  ('ABIERTO',    'Abierto',     1),
  ('EN_GESTION', 'En gestión',  2),
  ('RESUELTO',   'Resuelto',    3);

insert into cat_direccion_material (codigo, nombre) values
  ('INSTALADO', 'Instalado en sucursal'),
  ('RETIRADO',  'Retirado de sucursal');

-- ---------------------------------------------------------------------
-- MAESTROS
-- ---------------------------------------------------------------------

create table cliente (
  id              bigint generated always as identity primary key,
  rut             text not null unique,
  razon_social    text not null,
  nombre_fantasia text,
  telefono        text,
  email           text,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);

create table sucursal (
  id             bigint generated always as identity primary key,
  cliente_id     bigint not null references cliente(id) on delete restrict,
  nombre         text not null,
  codigo_interno text,
  direccion      text,
  comuna         text,
  region         text,
  telefono       text,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now()
);
create index ix_sucursal_cliente on sucursal(cliente_id);

create table tecnico (
  id        bigint generated always as identity primary key,
  rut       text not null unique,
  nombres   text not null,
  apellidos text not null,
  telefono  text,
  email     text,
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Perfil de aplicación. El id ES el id de auth.users de Supabase.
create table perfil (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null,
  rol        text not null check (rol in ('ADMIN','COORDINADOR','TECNICO')),
  tecnico_id bigint references tecnico(id),
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);
-- Un perfil TECNICO obliga a tener tecnico_id
alter table perfil add constraint ck_perfil_tecnico
  check (rol <> 'TECNICO' or tecnico_id is not null);

-- ---------------------------------------------------------------------
-- VISITA + HIJAS
-- ---------------------------------------------------------------------

create sequence seq_folio_visita start 1;

create table visita (
  id           bigint generated always as identity primary key,
  folio        text not null unique
                 default 'V-' || to_char(now(),'YYYY') || '-' ||
                         lpad(nextval('seq_folio_visita')::text, 5, '0'),

  cliente_id   bigint not null references cliente(id),
  sucursal_id  bigint not null references sucursal(id),
  tecnico_id   bigint references tecnico(id),

  estado       text not null references cat_estado_visita(codigo) default 'PROGRAMADA',
  tipo_trabajo text references cat_tipo_trabajo(codigo),

  fecha_programada date,          -- NULL = nació en terreno, sin agendamiento
  hora_programada  time,
  fecha_inicio     timestamptz,
  fecha_termino    timestamptz,

  -- snapshot del contacto: NO son FKs, quien recibe al técnico puede no
  -- estar registrado como contacto de la sucursal
  contacto_nombre           text,
  contacto_email            text,
  contacto_telefono         text,
  responsable_tienda_nombre text,
  responsable_tienda_rut    text,

  descripcion_trabajo  text,      -- qué se va a hacer (lo llena coordinación)
  trabajo_realizado    text,      -- qué se hizo (lo llena el técnico)
  observaciones        text,
  motivo_pendiente     text,      -- si estado = PENDIENTE
  requiere_seguimiento boolean not null default false,

  creado_por     uuid references perfil(id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  migrado_en     timestamptz     -- se marca al traspasar a DMC_Core
);
create index ix_visita_tecnico  on visita(tecnico_id, fecha_programada);
create index ix_visita_sucursal on visita(sucursal_id);
create index ix_visita_estado   on visita(estado);

create table problema (
  id                bigint generated always as identity primary key,
  visita_id         bigint not null references visita(id) on delete cascade,
  sucursal_id       bigint not null references sucursal(id),
  descripcion       text not null,
  solucion_sugerida text,
  estado            text not null references cat_estado_problema(codigo) default 'ABIERTO',
  detectado_en      timestamptz not null default now()
);
create index ix_problema_visita on problema(visita_id);

create table material_terreno (
  id              bigint generated always as identity primary key,
  visita_id       bigint not null references visita(id) on delete cascade,
  descripcion     text not null,           -- nombre libre: no hay inventario aún
  codigo_producto text,
  cantidad        numeric(10,2) not null check (cantidad > 0),
  direccion       text not null references cat_direccion_material(codigo),
  observacion     text
);
create index ix_material_visita on material_terreno(visita_id);

create table firma (
  id              bigint generated always as identity primary key,
  visita_id       bigint not null references visita(id) on delete cascade,
  tipo            text not null check (tipo in ('TECNICO','TIENDA')),
  firmante_nombre text,
  firmante_rut    text,
  imagen          text not null,           -- data URL PNG base64 del canvas
  firmado_en      timestamptz not null default now(),
  unique (visita_id, tipo)
);

-- actualizado_en automático
create or replace function fn_touch() returns trigger
language plpgsql as $$
begin
  new.actualizado_en = now();
  return new;
end $$;

create trigger tg_visita_touch before update on visita
  for each row execute function fn_touch();

-- ---------------------------------------------------------------------
-- RLS: deny-all.
-- Toda la data se lee y escribe desde el servidor de Next.js con la
-- service_role key. Nadie puede pegarle a la BD desde el navegador.
-- ---------------------------------------------------------------------

alter table cliente               enable row level security;
alter table sucursal              enable row level security;
alter table tecnico               enable row level security;
alter table perfil                enable row level security;
alter table visita                enable row level security;
alter table problema              enable row level security;
alter table material_terreno      enable row level security;
alter table firma                 enable row level security;
alter table cat_estado_visita     enable row level security;
alter table cat_tipo_trabajo      enable row level security;
alter table cat_estado_problema   enable row level security;
alter table cat_direccion_material enable row level security;

-- Sin políticas = ningún acceso con anon key. Intencional.

-- ---------------------------------------------------------------------
-- VISTAS DE EXPORTACIÓN (para el traspaso a DMC_Core en septiembre)
-- ---------------------------------------------------------------------

create view v_export_visita as
select v.id, v.folio,
       c.rut as cliente_rut, c.razon_social,
       s.nombre as sucursal, s.direccion, s.comuna,
       t.rut as tecnico_rut, t.nombres || ' ' || t.apellidos as tecnico,
       v.estado, v.tipo_trabajo,
       v.fecha_programada, v.hora_programada, v.fecha_inicio, v.fecha_termino,
       v.contacto_nombre, v.contacto_email, v.contacto_telefono,
       v.responsable_tienda_nombre, v.responsable_tienda_rut,
       v.descripcion_trabajo, v.trabajo_realizado, v.observaciones,
       v.motivo_pendiente, v.requiere_seguimiento, v.creado_en
from visita v
join cliente  c on c.id = v.cliente_id
join sucursal s on s.id = v.sucursal_id
left join tecnico t on t.id = v.tecnico_id;
