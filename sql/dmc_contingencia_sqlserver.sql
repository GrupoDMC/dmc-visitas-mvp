/* =====================================================================
   DMC Contingencia · base de datos completa — Microsoft SQL Server 2022
   Esquema + catálogos editables + datos de ejemplo que reproducen lo que
   muestran las dos vistas del prototipo:
     · app móvil del técnico  (agenda, ficha, motivo, trabajos realizados,
                               problemas, fotos, video, firma, mis visitas
                               realizadas)
     · panel de coordinación  (visitas, reagendas, problemas, checklist, actas,
                               cierre administrativo de visitas viejas)

   Uso:   sqlcmd -S servidor -d DMC_Contingencia -i dmc_contingencia_sqlserver.sql
   Notas: singular, snake_case, uq_/ck_/fk_/ix_/df_, esquema dmc,
          FKs NO ACTION en maestros y CASCADE en tablas hijas de visita.
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/* ---------------------------------------------------------------------
   0. BASE DE DATOS Y ESQUEMA
   --------------------------------------------------------------------- */
IF DB_ID('DMC_Contingencia') IS NULL
    CREATE DATABASE DMC_Contingencia;
GO
USE DMC_Contingencia;
GO
ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
GO
IF SCHEMA_ID('dmc') IS NULL EXEC ('CREATE SCHEMA dmc');
GO

/* Para reinstalar desde cero, descomenta este bloque:
DECLARE @sql nvarchar(max) = N'';
SELECT @sql += N'ALTER TABLE ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(OBJECT_NAME(parent_object_id))
             + N' DROP CONSTRAINT ' + QUOTENAME(name) + N';'
FROM sys.foreign_keys WHERE SCHEMA_NAME(schema_id) = 'dmc';
SELECT @sql += N'DROP VIEW ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N';'
FROM sys.views WHERE SCHEMA_NAME(schema_id) = 'dmc';
SELECT @sql += N'DROP TABLE ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N';'
FROM sys.tables WHERE SCHEMA_NAME(schema_id) = 'dmc';
SELECT @sql += N'DROP SEQUENCE ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N';'
FROM sys.sequences WHERE SCHEMA_NAME(schema_id) = 'dmc';
EXEC sp_executesql @sql;   -- y a continuacion, un GO

   Ojo: al descomentar, el GO va escrito solo en su linea. Aca no puede
   estar asi porque sqlcmd corta el lote en cualquier GO que ocupe la
   linea entera, aunque este dentro de un comentario, y partia este
   bloque en dos dando dos errores de sintaxis en cada corrida.
*/

/* =====================================================================
   1. MAESTROS
   ===================================================================== */
CREATE TABLE dmc.cliente (
    id               bigint        IDENTITY(1,1) NOT NULL,
    rut              varchar(12)   NOT NULL,
    razon_social     nvarchar(160) NOT NULL,
    nombre_fantasia  nvarchar(80)  NOT NULL,
    activo           bit           NOT NULL CONSTRAINT df_cliente_activo DEFAULT (1),
    creado_en        datetime2(0)  NOT NULL CONSTRAINT df_cliente_creado DEFAULT (SYSDATETIME()),
    actualizado_en   datetime2(0)  NOT NULL CONSTRAINT df_cliente_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_cliente     PRIMARY KEY (id),
    CONSTRAINT uq_cliente_rut UNIQUE (rut)
);
GO

CREATE TABLE dmc.sucursal (
    id              bigint        IDENTITY(1,1) NOT NULL,
    cliente_id      bigint        NOT NULL,
    nombre          nvarchar(120) NOT NULL,
    codigo          varchar(20)   NOT NULL,
    direccion       nvarchar(180) NOT NULL,
    comuna          nvarchar(80)  NOT NULL,
    region          nvarchar(80)  NOT NULL,
    telefono        varchar(30)   NULL,
    activo          bit           NOT NULL CONSTRAINT df_sucursal_activo DEFAULT (1),
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_sucursal_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_sucursal_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_sucursal                PRIMARY KEY (id),
    CONSTRAINT uq_sucursal_codigo         UNIQUE (codigo),
    CONSTRAINT uq_sucursal_cliente_nombre UNIQUE (cliente_id, nombre),
    CONSTRAINT fk_sucursal_cliente FOREIGN KEY (cliente_id) REFERENCES dmc.cliente (id)
);
GO
CREATE INDEX ix_sucursal_cliente ON dmc.sucursal (cliente_id) WHERE activo = 1;
GO

CREATE TABLE dmc.tecnico (
    id                bigint        IDENTITY(1,1) NOT NULL,
    rut               varchar(12)   NOT NULL,          -- formato 12.345.678-9
    nombres           nvarchar(80)  NOT NULL,
    apellido_paterno  nvarchar(80)  NOT NULL,
    apellido_materno  nvarchar(80)  NULL,
    email             nvarchar(160) NOT NULL,
    telefono          varchar(30)   NULL,              -- formato +56 9 1234 5678
    activo            bit           NOT NULL CONSTRAINT df_tecnico_activo DEFAULT (1),
    creado_en         datetime2(0)  NOT NULL CONSTRAINT df_tecnico_creado DEFAULT (SYSDATETIME()),
    actualizado_en    datetime2(0)  NOT NULL CONSTRAINT df_tecnico_actualizado DEFAULT (SYSDATETIME()),
    nombre_completo   AS (CONCAT(nombres, N' ', apellido_paterno)) PERSISTED,
    CONSTRAINT pk_tecnico       PRIMARY KEY (id),
    CONSTRAINT uq_tecnico_rut   UNIQUE (rut),
    CONSTRAINT uq_tecnico_email UNIQUE (email)
);
GO
-- Todos los técnicos salen desde la oficina central: no se asigna zona.

CREATE TABLE dmc.usuario (
    id                bigint         IDENTITY(1,1) NOT NULL,
    email             nvarchar(160)  NOT NULL,
    password_hash     nvarchar(200)  NOT NULL,
    rol               varchar(12)    NOT NULL,
    tecnico_id        bigint         NULL,
    activo            bit            NOT NULL CONSTRAINT df_usuario_activo DEFAULT (1),
    ultimo_acceso_en  datetime2(0)   NULL,
    creado_en         datetime2(0)   NOT NULL CONSTRAINT df_usuario_creado DEFAULT (SYSDATETIME()),
    actualizado_en    datetime2(0)   NOT NULL CONSTRAINT df_usuario_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_usuario         PRIMARY KEY (id),
    CONSTRAINT uq_usuario_email   UNIQUE (email),
    CONSTRAINT fk_usuario_tecnico FOREIGN KEY (tecnico_id) REFERENCES dmc.tecnico (id),
    CONSTRAINT ck_usuario_rol     CHECK (rol IN ('ADMIN','COORDINADOR','TECNICO')),
    CONSTRAINT ck_usuario_tecnico CHECK (
        (rol =  'TECNICO' AND tecnico_id IS NOT NULL) OR
        (rol <> 'TECNICO' AND tecnico_id IS NULL))
);
GO
CREATE UNIQUE INDEX uq_usuario_tecnico ON dmc.usuario (tecnico_id) WHERE tecnico_id IS NOT NULL;
GO

/* =====================================================================
   2. CHECKLIST — las tres listas que el panel edita y el móvil consume
      Lista 1 · Motivos de la visita
      Lista 2 · Tipos de problema  (+ sus opciones de detalle)
      Lista 3 · Trabajos realizados (+ sus subtrabajos)
   ===================================================================== */
CREATE TABLE dmc.catalogo_motivo (
    id              bigint        IDENTITY(1,1) NOT NULL,
    codigo          varchar(40)   NOT NULL,     -- CALIBRACION, INSTALACION…
    nombre          nvarchar(80)  NOT NULL,     -- "Calibración de las antenas"
    orden           smallint      NOT NULL CONSTRAINT df_cat_motivo_orden DEFAULT (0),
    activo          bit           NOT NULL CONSTRAINT df_cat_motivo_activo DEFAULT (1),
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_cat_motivo_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_cat_motivo_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_catalogo_motivo        PRIMARY KEY (id),
    CONSTRAINT uq_catalogo_motivo_codigo UNIQUE (codigo),
    CONSTRAINT uq_catalogo_motivo_nombre UNIQUE (nombre)
);
GO

CREATE TABLE dmc.catalogo_problema (
    id              bigint        IDENTITY(1,1) NOT NULL,
    codigo          varchar(40)   NOT NULL,     -- ANTENA_NO_DETECTA, OTRO…
    nombre          nvarchar(80)  NOT NULL,     -- "Antena no detecta etiquetas"
    grupo_label     nvarchar(60)  NULL,         -- "Antena afectada" (título del paso 2)
    singular        nvarchar(30)  NULL,         -- "antena", "modelo", "cable"…
    ayuda           nvarchar(160) NULL,
    orden           smallint      NOT NULL CONSTRAINT df_cat_prob_orden DEFAULT (0),
    activo          bit           NOT NULL CONSTRAINT df_cat_prob_activo DEFAULT (1),
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_cat_prob_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_cat_prob_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_catalogo_problema        PRIMARY KEY (id),
    CONSTRAINT uq_catalogo_problema_codigo UNIQUE (codigo),
    CONSTRAINT uq_catalogo_problema_nombre UNIQUE (nombre)
);
GO

CREATE TABLE dmc.catalogo_problema_opcion (
    id           bigint       IDENTITY(1,1) NOT NULL,
    problema_id  bigint       NOT NULL,
    etiqueta     nvarchar(80) NOT NULL,        -- "Pórtico 1", "Master 9000"…
    orden        smallint     NOT NULL CONSTRAINT df_cat_prob_op_orden DEFAULT (0),
    -- 0 = el técnico solo la marca; 1 = la marca y le pone cantidad.
    permite_cantidad bit      NOT NULL CONSTRAINT df_cat_prob_op_cantidad DEFAULT (0),
    activo       bit          NOT NULL CONSTRAINT df_cat_prob_op_activo DEFAULT (1),
    CONSTRAINT pk_catalogo_problema_opcion PRIMARY KEY (id),
    CONSTRAINT uq_catalogo_problema_opcion UNIQUE (problema_id, etiqueta),
    CONSTRAINT fk_cat_prob_opcion FOREIGN KEY (problema_id)
        REFERENCES dmc.catalogo_problema (id) ON DELETE CASCADE
);
GO

CREATE TABLE dmc.catalogo_trabajo (
    id              bigint        IDENTITY(1,1) NOT NULL,
    codigo          varchar(40)   NOT NULL,     -- CALIBRACION_ANTENAS, CAPACITACION…
    nombre          nvarchar(80)  NOT NULL,     -- "Calibración de antenas"
    grupo_label     nvarchar(60)  NULL,         -- "Antena calibrada" (título del paso 2)
    singular        nvarchar(30)  NULL,         -- "antena", "repuesto", "tarea"…
    orden           smallint      NOT NULL CONSTRAINT df_cat_trab_orden DEFAULT (0),
    activo          bit           NOT NULL CONSTRAINT df_cat_trab_activo DEFAULT (1),
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_cat_trab_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_cat_trab_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_catalogo_trabajo        PRIMARY KEY (id),
    CONSTRAINT uq_catalogo_trabajo_codigo UNIQUE (codigo),
    CONSTRAINT uq_catalogo_trabajo_nombre UNIQUE (nombre)
);
GO

-- Un trabajo sin subtrabajos se agrega directo en el celular, con detalle escrito opcional.
CREATE TABLE dmc.catalogo_trabajo_subtrabajo (
    id          bigint       IDENTITY(1,1) NOT NULL,
    trabajo_id  bigint       NOT NULL,
    etiqueta    nvarchar(80) NOT NULL,          -- "Pórtico 1", "Fuente de poder"…
    orden       smallint     NOT NULL CONSTRAINT df_cat_sub_orden DEFAULT (0),
    -- 0 = el técnico solo lo marca; 1 = lo marca y le pone cantidad.
    permite_cantidad bit     NOT NULL CONSTRAINT df_cat_sub_cantidad DEFAULT (0),
    activo      bit          NOT NULL CONSTRAINT df_cat_sub_activo DEFAULT (1),
    CONSTRAINT pk_catalogo_trabajo_subtrabajo PRIMARY KEY (id),
    CONSTRAINT uq_catalogo_trabajo_subtrabajo UNIQUE (trabajo_id, etiqueta),
    CONSTRAINT fk_cat_trabajo_sub FOREIGN KEY (trabajo_id)
        REFERENCES dmc.catalogo_trabajo (id) ON DELETE CASCADE
);
GO

/* =====================================================================
   3. VISITAS
   ===================================================================== */
CREATE SEQUENCE dmc.seq_folio_visita AS bigint START WITH 1 INCREMENT BY 1;
GO

CREATE TABLE dmc.visita (
    id                    bigint        IDENTITY(1,1) NOT NULL,
    folio                 varchar(16)   NOT NULL
        CONSTRAINT df_visita_folio DEFAULT (CONCAT('V-', FORMAT(SYSDATETIME(),'yyyy'), '-',
                                                   FORMAT(NEXT VALUE FOR dmc.seq_folio_visita, '00000'))),
    cliente_id            bigint        NOT NULL,
    sucursal_id           bigint        NOT NULL,
    tecnico_id            bigint        NOT NULL,
    motivo_codigo         varchar(40)   NOT NULL,   -- FK al catálogo editable (Lista 1)
    estado                varchar(16)   NOT NULL CONSTRAINT df_visita_estado DEFAULT ('PROGRAMADA'),
    fecha_programada      date          NOT NULL,
    hora_programada       time(0)       NULL,       -- opcional salvo instalación
    trabajo_solicitado    nvarchar(max) NOT NULL,
    indicaciones_acceso   nvarchar(max) NULL,
    responsable_nombre    nvarchar(120) NULL,
    responsable_telefono  varchar(30)   NULL,
    problema_origen_id    bigint        NULL,       -- visita nacida de un problema abierto
    creada_en_terreno     bit           NOT NULL CONSTRAINT df_visita_terreno DEFAULT (0),
    creada_por            bigint        NULL,
    creado_en             datetime2(0)  NOT NULL CONSTRAINT df_visita_creado DEFAULT (SYSDATETIME()),
    actualizado_en        datetime2(0)  NOT NULL CONSTRAINT df_visita_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita          PRIMARY KEY (id),
    CONSTRAINT uq_visita_folio    UNIQUE (folio),
    CONSTRAINT fk_visita_cliente    FOREIGN KEY (cliente_id)    REFERENCES dmc.cliente  (id),
    CONSTRAINT fk_visita_sucursal   FOREIGN KEY (sucursal_id)   REFERENCES dmc.sucursal (id),
    CONSTRAINT fk_visita_tecnico    FOREIGN KEY (tecnico_id)    REFERENCES dmc.tecnico  (id),
    CONSTRAINT fk_visita_motivo     FOREIGN KEY (motivo_codigo) REFERENCES dmc.catalogo_motivo (codigo),
    CONSTRAINT fk_visita_creada_por FOREIGN KEY (creada_por)    REFERENCES dmc.usuario  (id),
    -- CANCELADA_ADMIN la pone administracion desde el panel sobre una visita
    -- vieja o que ya no sirve; CANCELADA la deja el tecnico parado en la tienda.
    CONSTRAINT ck_visita_estado CHECK (estado IN
        ('PROGRAMADA','EN_CURSO','COMPLETADA','PENDIENTE','REAGENDADA','CANCELADA','CANCELADA_ADMIN')),
    CONSTRAINT ck_visita_hora_instalacion CHECK (motivo_codigo <> 'INSTALACION' OR hora_programada IS NOT NULL)
);
GO
CREATE INDEX ix_visita_fecha    ON dmc.visita (fecha_programada DESC);
CREATE INDEX ix_visita_tecnico  ON dmc.visita (tecnico_id, fecha_programada DESC) INCLUDE (estado, sucursal_id);
CREATE INDEX ix_visita_sucursal ON dmc.visita (sucursal_id, fecha_programada DESC);
CREATE INDEX ix_visita_estado   ON dmc.visita (estado, fecha_programada DESC);
GO

-- Una visita puede tener varios motivos: motivo_codigo de arriba es el
-- principal (el primero marcado, del que cuelgan la FK y el CHECK de la hora
-- en instalación) y acá va la selección completa.
--   ambito = PLAN  -> lo que marcó coordinación al agendar
--   ambito = REAL  -> lo que confirmó el técnico en terreno
CREATE TABLE dmc.visita_motivo (
    id             bigint       IDENTITY(1,1) NOT NULL,
    visita_id      bigint       NOT NULL,
    motivo_codigo  varchar(40)  NOT NULL,
    ambito         varchar(4)   NOT NULL CONSTRAINT df_visita_motivo_ambito DEFAULT ('PLAN'),
    orden          smallint     NOT NULL CONSTRAINT df_visita_motivo_orden  DEFAULT (0),
    creado_en      datetime2(0) NOT NULL CONSTRAINT df_visita_motivo_creado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita_motivo PRIMARY KEY (id),
    CONSTRAINT uq_visita_motivo UNIQUE (visita_id, ambito, motivo_codigo),
    CONSTRAINT fk_visita_motivo_visita   FOREIGN KEY (visita_id)     REFERENCES dmc.visita (id) ON DELETE CASCADE,
    CONSTRAINT fk_visita_motivo_catalogo FOREIGN KEY (motivo_codigo) REFERENCES dmc.catalogo_motivo (codigo),
    CONSTRAINT ck_visita_motivo_ambito   CHECK (ambito IN ('PLAN','REAL'))
);
GO
CREATE INDEX ix_visita_motivo ON dmc.visita_motivo (visita_id, ambito, orden);
GO

CREATE TABLE dmc.visita_ejecucion (
    visita_id             bigint        NOT NULL,
    hora_inicio           datetime2(0)  NOT NULL,
    hora_termino          datetime2(0)  NULL,
    responsable_nombre    nvarchar(120) NOT NULL,
    responsable_rut       varchar(12)   NULL,
    responsable_telefono  varchar(30)   NULL,
    motivo_real_codigo    varchar(40)   NULL,      -- el motivo que el técnico confirma en terreno
    observaciones         nvarchar(max) NULL,      -- las ve el cliente en el acta
    comentario_interno    nvarchar(max) NULL,      -- solo coordinación
    dispositivo           nvarchar(60)  NULL,
    app_version           varchar(20)   NULL,
    registrado_offline    bit           NOT NULL CONSTRAINT df_ejec_offline DEFAULT (0),
    sincronizado_en       datetime2(0)  NULL,
    creado_en             datetime2(0)  NOT NULL CONSTRAINT df_ejec_creado DEFAULT (SYSDATETIME()),
    actualizado_en        datetime2(0)  NOT NULL CONSTRAINT df_ejec_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita_ejecucion PRIMARY KEY (visita_id),
    CONSTRAINT fk_ejecucion_visita FOREIGN KEY (visita_id) REFERENCES dmc.visita (id) ON DELETE CASCADE,
    CONSTRAINT fk_ejecucion_motivo FOREIGN KEY (motivo_real_codigo) REFERENCES dmc.catalogo_motivo (codigo),
    CONSTRAINT ck_ejecucion_horas  CHECK (hora_termino IS NULL OR hora_termino >= hora_inicio)
);
GO

CREATE TABLE dmc.visita_estado_historial (
    id           bigint       IDENTITY(1,1) NOT NULL,
    visita_id    bigint       NOT NULL,
    estado       varchar(16)  NOT NULL,
    motivo       nvarchar(max) NULL,
    origen       varchar(6)   NOT NULL CONSTRAINT df_hist_origen DEFAULT ('WEB'),
    usuario_id   bigint       NULL,
    tecnico_id   bigint       NULL,
    ocurrido_en  datetime2(0) NOT NULL CONSTRAINT df_hist_ocurrido DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita_estado_historial PRIMARY KEY (id),
    CONSTRAINT fk_hist_visita  FOREIGN KEY (visita_id)  REFERENCES dmc.visita  (id) ON DELETE CASCADE,
    CONSTRAINT fk_hist_usuario FOREIGN KEY (usuario_id) REFERENCES dmc.usuario (id),
    CONSTRAINT fk_hist_tecnico FOREIGN KEY (tecnico_id) REFERENCES dmc.tecnico (id),
    CONSTRAINT ck_hist_origen  CHECK (origen IN ('MOVIL','WEB')),
    CONSTRAINT ck_hist_estado  CHECK (estado IN
        ('PROGRAMADA','EN_CURSO','COMPLETADA','PENDIENTE','REAGENDADA','CANCELADA','CANCELADA_ADMIN'))
);
GO
CREATE INDEX ix_hist_visita ON dmc.visita_estado_historial (visita_id, ocurrido_en);
GO

CREATE TABLE dmc.reagendamiento (
    id              bigint        IDENTITY(1,1) NOT NULL,
    visita_id       bigint        NOT NULL,
    fecha_anterior  date          NOT NULL,
    hora_anterior   time(0)       NULL,
    fecha_nueva     date          NULL,
    hora_nueva      time(0)       NULL,
    motivo          nvarchar(max) NOT NULL,
    origen          varchar(6)    NOT NULL,      -- MOVIL = técnico, WEB = coordinación
    tecnico_id      bigint        NULL,
    usuario_id      bigint        NULL,
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_reag_creado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_reagendamiento PRIMARY KEY (id),
    CONSTRAINT fk_reag_visita  FOREIGN KEY (visita_id)  REFERENCES dmc.visita  (id) ON DELETE CASCADE,
    CONSTRAINT fk_reag_tecnico FOREIGN KEY (tecnico_id) REFERENCES dmc.tecnico (id),
    CONSTRAINT fk_reag_usuario FOREIGN KEY (usuario_id) REFERENCES dmc.usuario (id),
    CONSTRAINT ck_reag_origen  CHECK (origen IN ('MOVIL','WEB'))
);
GO
CREATE INDEX ix_reag_visita ON dmc.reagendamiento (visita_id, creado_en DESC);
GO

/* =====================================================================
   4. TRABAJOS REALIZADOS  (sección 2 del formulario móvil)
   ===================================================================== */
CREATE TABLE dmc.visita_trabajo (
    id              bigint        IDENTITY(1,1) NOT NULL,
    visita_id       bigint        NOT NULL,
    trabajo_codigo  varchar(40)   NOT NULL,      -- FK al catálogo editable (Lista 3)
    detalle         nvarchar(max) NULL,          -- texto libre opcional del técnico
    orden           smallint      NOT NULL CONSTRAINT df_vis_trab_orden DEFAULT (1),
    -- Nada se borra: quitar un trabajo del acta lo deja inactivo.
    activo          bit           NOT NULL CONSTRAINT df_vis_trab_activo DEFAULT (1),
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_vis_trab_creado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita_trabajo PRIMARY KEY (id),
    CONSTRAINT fk_vis_trab_visita  FOREIGN KEY (visita_id)      REFERENCES dmc.visita (id) ON DELETE CASCADE,
    CONSTRAINT fk_vis_trab_catalogo FOREIGN KEY (trabajo_codigo) REFERENCES dmc.catalogo_trabajo (codigo)
);
GO
CREATE INDEX ix_vis_trab_visita ON dmc.visita_trabajo (visita_id, orden);
GO

-- La etiqueta se copia al registrar: el acta no debe cambiar si luego editan el catálogo.
CREATE TABLE dmc.visita_trabajo_subtrabajo (
    id                 bigint       IDENTITY(1,1) NOT NULL,
    visita_trabajo_id  bigint       NOT NULL,
    etiqueta           nvarchar(80) NOT NULL,
    cantidad           smallint     NOT NULL CONSTRAINT df_vis_sub_cantidad DEFAULT (1),
    orden              smallint     NOT NULL CONSTRAINT df_vis_sub_orden DEFAULT (0),
    CONSTRAINT pk_visita_trabajo_subtrabajo PRIMARY KEY (id),
    CONSTRAINT uq_visita_trabajo_subtrabajo UNIQUE (visita_trabajo_id, etiqueta),
    CONSTRAINT fk_vis_sub_trabajo FOREIGN KEY (visita_trabajo_id)
        REFERENCES dmc.visita_trabajo (id) ON DELETE CASCADE,
    CONSTRAINT ck_vis_sub_cantidad CHECK (cantidad BETWEEN 1 AND 99)
);
GO

/* =====================================================================
   5. PROBLEMAS LEVANTADOS
   ===================================================================== */
CREATE TABLE dmc.problema (
    id              bigint        IDENTITY(1,1) NOT NULL,
    visita_id       bigint        NOT NULL,      -- visita donde se levantó
    tipo_codigo     varchar(40)   NOT NULL,      -- FK al catálogo editable (Lista 2)
    estado          varchar(10)   NOT NULL CONSTRAINT df_problema_estado DEFAULT ('ABIERTO'),
    descripcion     nvarchar(max) NULL,          -- qué encontró el técnico
    solucion        nvarchar(max) NULL,          -- qué hizo o qué sugiere
    orden           smallint      NOT NULL CONSTRAINT df_problema_orden DEFAULT (1),
    resuelto_en     datetime2(0)  NULL,
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_problema_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_problema_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_problema         PRIMARY KEY (id),
    CONSTRAINT fk_problema_visita  FOREIGN KEY (visita_id)   REFERENCES dmc.visita (id) ON DELETE CASCADE,
    CONSTRAINT fk_problema_tipo    FOREIGN KEY (tipo_codigo) REFERENCES dmc.catalogo_problema (codigo),
    CONSTRAINT ck_problema_estado  CHECK (estado IN ('ABIERTO','PENDIENTE','RESUELTO')),
    CONSTRAINT ck_problema_otro_desc CHECK (
        tipo_codigo <> 'OTRO' OR (descripcion IS NOT NULL AND LEN(LTRIM(RTRIM(descripcion))) > 0)),
    CONSTRAINT ck_problema_resuelto CHECK (
        (estado =  'RESUELTO' AND resuelto_en IS NOT NULL) OR
        (estado <> 'RESUELTO' AND resuelto_en IS NULL))
);
GO
CREATE INDEX ix_problema_visita ON dmc.problema (visita_id);
CREATE INDEX ix_problema_tipo   ON dmc.problema (tipo_codigo);
CREATE INDEX ix_problema_abierto ON dmc.problema (estado, creado_en DESC) WHERE estado <> 'RESUELTO';
GO

CREATE TABLE dmc.problema_item (
    id           bigint       IDENTITY(1,1) NOT NULL,
    problema_id  bigint       NOT NULL,
    etiqueta     nvarchar(80) NOT NULL,          -- "Master 9000", "Pórtico 2"…
    cantidad     smallint     NOT NULL CONSTRAINT df_item_cantidad DEFAULT (1),
    CONSTRAINT pk_problema_item PRIMARY KEY (id),
    CONSTRAINT uq_item_problema UNIQUE (problema_id, etiqueta),
    CONSTRAINT fk_item_problema FOREIGN KEY (problema_id) REFERENCES dmc.problema (id) ON DELETE CASCADE,
    CONSTRAINT ck_item_cantidad CHECK (cantidad BETWEEN 1 AND 99)
);
GO

CREATE TABLE dmc.problema_historial (
    id              bigint        IDENTITY(1,1) NOT NULL,
    problema_id     bigint        NOT NULL,
    campo           varchar(20)   NOT NULL,      -- 'ESTADO' | 'TIPO'
    valor_anterior  nvarchar(40)  NOT NULL,
    valor_nuevo     nvarchar(40)  NOT NULL,
    motivo          nvarchar(max) NULL,
    usuario_id      bigint        NULL,
    ocurrido_en     datetime2(0)  NOT NULL CONSTRAINT df_probhist_ocurrido DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_problema_historial PRIMARY KEY (id),
    CONSTRAINT fk_probhist_problema FOREIGN KEY (problema_id) REFERENCES dmc.problema (id) ON DELETE CASCADE,
    CONSTRAINT fk_probhist_usuario  FOREIGN KEY (usuario_id)  REFERENCES dmc.usuario  (id),
    CONSTRAINT ck_probhist_campo    CHECK (campo IN ('ESTADO','TIPO'))
);
GO
CREATE INDEX ix_probhist_problema ON dmc.problema_historial (problema_id, ocurrido_en DESC);
GO

CREATE TABLE dmc.problema_visita_resolucion (
    id            bigint       IDENTITY(1,1) NOT NULL,
    problema_id   bigint       NOT NULL,
    visita_id     bigint       NOT NULL,        -- visita agendada para resolverlo
    agendado_por  bigint       NULL,
    creado_en     datetime2(0) NOT NULL CONSTRAINT df_pvr_creado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_problema_visita_resolucion PRIMARY KEY (id),
    CONSTRAINT uq_pvr UNIQUE (problema_id, visita_id),
    CONSTRAINT fk_pvr_problema FOREIGN KEY (problema_id)  REFERENCES dmc.problema (id) ON DELETE CASCADE,
    CONSTRAINT fk_pvr_visita   FOREIGN KEY (visita_id)    REFERENCES dmc.visita   (id),
    CONSTRAINT fk_pvr_usuario  FOREIGN KEY (agendado_por) REFERENCES dmc.usuario  (id)
);
GO

ALTER TABLE dmc.visita ADD CONSTRAINT fk_visita_problema_origen
    FOREIGN KEY (problema_origen_id) REFERENCES dmc.problema (id);
GO

/* =====================================================================
   6. EVIDENCIA
   ===================================================================== */
CREATE TABLE dmc.visita_foto (
    id           bigint        IDENTITY(1,1) NOT NULL,
    visita_id    bigint        NOT NULL,
    problema_id  bigint        NULL,
    etiqueta     nvarchar(40)  NULL,            -- "Antes", "Durante", "Después"…
    archivo_url  nvarchar(400) NOT NULL,      -- ruta interna: /api/visita/foto/<id>
    contenido    varbinary(max) NULL,         -- los bytes del JPEG, en color
    mime         varchar(40)   NOT NULL CONSTRAINT df_foto_mime DEFAULT ('image/jpeg'),
    bytes        int           NULL,
    orden        smallint      NOT NULL CONSTRAINT df_foto_orden DEFAULT (0),
    activo       bit           NOT NULL CONSTRAINT df_foto_activo DEFAULT (1),
    tomada_en    datetime2(0)  NULL,
    subida_en    datetime2(0)  NOT NULL CONSTRAINT df_foto_subida DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita_foto   PRIMARY KEY (id),
    CONSTRAINT fk_foto_visita   FOREIGN KEY (visita_id)   REFERENCES dmc.visita   (id) ON DELETE CASCADE,
    CONSTRAINT fk_foto_problema FOREIGN KEY (problema_id) REFERENCES dmc.problema (id)
);
GO
CREATE INDEX ix_foto_visita ON dmc.visita_foto (visita_id, orden);
GO

-- El video del trabajo. Mismo trato que la foto: los bytes viven en la fila y
-- archivo_url es la ruta interna con la que la app lo sirve. Los tres limites
-- del formulario quedan escritos aca y no solo en el celular:
--   duracion 60 s  ·  resolucion 720p  ·  25 MB por clip
--
-- El clip no cabe en un solo request (el cuerpo de una Server Action se corta
-- en 4,5 MB en produccion), asi que la fila nace vacia y se le van pegando
-- trozos. subida_completa separa el clip utilizable del que se quedo a medias
-- porque se corto la senal: hasta que no llega el ultimo trozo, la fila existe
-- pero el acta no la muestra.
CREATE TABLE dmc.visita_video (
    id              bigint         IDENTITY(1,1) NOT NULL,
    visita_id       bigint         NOT NULL,
    problema_id     bigint         NULL,
    etiqueta        nvarchar(40)   NULL,
    archivo_url     nvarchar(400)  NOT NULL CONSTRAINT df_video_url DEFAULT (''),  -- /api/visita/video/<id>
    contenido       varbinary(max) NULL,           -- los bytes del clip
    mime            varchar(40)    NOT NULL CONSTRAINT df_video_mime DEFAULT ('video/mp4'),
    bytes           int            NULL,           -- lo que declaro el celular
    bytes_recibidos int            NOT NULL CONSTRAINT df_video_recibidos DEFAULT (0),
    duracion_seg    smallint       NULL,
    ancho           smallint       NULL,
    alto            smallint       NULL,
    orden           smallint       NOT NULL CONSTRAINT df_video_orden DEFAULT (0),
    subida_completa bit            NOT NULL CONSTRAINT df_video_completa DEFAULT (0),
    activo          bit            NOT NULL CONSTRAINT df_video_activo DEFAULT (1),
    grabado_en      datetime2(0)   NULL,
    subido_en       datetime2(0)   NOT NULL CONSTRAINT df_video_subido DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita_video   PRIMARY KEY (id),
    CONSTRAINT fk_video_visita   FOREIGN KEY (visita_id)   REFERENCES dmc.visita   (id) ON DELETE CASCADE,
    CONSTRAINT fk_video_problema FOREIGN KEY (problema_id) REFERENCES dmc.problema (id),
    CONSTRAINT ck_video_mime     CHECK (mime IN ('video/mp4','video/webm','video/quicktime')),
    CONSTRAINT ck_video_duracion CHECK (duracion_seg IS NULL OR (duracion_seg > 0 AND duracion_seg <= 60)),
    -- 720p: el lado mayor no pasa de 1280 y el menor no pasa de 720, en
    -- horizontal (1280x720) o en vertical (720x1280).
    CONSTRAINT ck_video_resolucion CHECK (
        (ancho IS NULL AND alto IS NULL) OR
        (ancho BETWEEN 1 AND 1280 AND alto BETWEEN 1 AND 1280 AND (ancho <= 720 OR alto <= 720))),
    CONSTRAINT ck_video_bytes     CHECK (bytes IS NULL OR (bytes > 0 AND bytes <= 26214400)),
    CONSTRAINT ck_video_recibidos CHECK (bytes_recibidos >= 0 AND bytes_recibidos <= 26214400),
    CONSTRAINT ck_video_completa  CHECK (
        subida_completa = 0 OR (bytes IS NOT NULL AND bytes_recibidos = bytes))
);
GO
CREATE INDEX ix_video_visita ON dmc.visita_video (visita_id, orden)
    WHERE activo = 1 AND subida_completa = 1;
-- Los clips que nunca terminaron de subir: se limpian aparte.
CREATE INDEX ix_video_incompleto ON dmc.visita_video (subido_en) WHERE subida_completa = 0;
GO

CREATE TABLE dmc.visita_firma (
    id          bigint        IDENTITY(1,1) NOT NULL,
    visita_id   bigint        NOT NULL,
    rol         varchar(8)    NOT NULL CONSTRAINT df_firma_rol DEFAULT ('TIENDA'),
    nombre      nvarchar(120) NOT NULL,
    rut         varchar(12)   NULL,
    imagen_url  nvarchar(400) NOT NULL,         -- ruta interna: /api/visita/firma/<id>
    contenido   varbinary(max) NULL,            -- el PNG capturado en el canvas
    firmado_en  datetime2(0)  NOT NULL CONSTRAINT df_firma_firmado DEFAULT (SYSDATETIME()),
    actualizado_en datetime2(0) NOT NULL CONSTRAINT df_firma_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita_firma     PRIMARY KEY (id),
    CONSTRAINT uq_firma_visita_rol UNIQUE (visita_id, rol),
    CONSTRAINT fk_firma_visita FOREIGN KEY (visita_id) REFERENCES dmc.visita (id) ON DELETE CASCADE,
    CONSTRAINT ck_firma_rol    CHECK (rol IN ('TIENDA','TECNICO'))
);
GO

/* =====================================================================
   7. ENVÍO DEL ACTA POR CORREO
   ===================================================================== */
CREATE TABLE dmc.acta_envio (
    id             bigint        IDENTITY(1,1) NOT NULL,
    visita_id      bigint        NOT NULL,
    para           nvarchar(600) NOT NULL,      -- uno o varios, separados por coma
    cc             nvarchar(600) NULL,
    cco            nvarchar(600) NULL,
    asunto         nvarchar(240) NOT NULL,      -- "<Sucursal> · <Motivo> · <fecha>"
    cuerpo         nvarchar(max) NOT NULL,
    estado         varchar(10)   NOT NULL CONSTRAINT df_envio_estado DEFAULT ('ENCOLADO'),
    error_detalle  nvarchar(max) NULL,
    enviado_por    bigint        NULL,
    enviado_en     datetime2(0)  NULL,
    creado_en      datetime2(0)  NOT NULL CONSTRAINT df_envio_creado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_acta_envio    PRIMARY KEY (id),
    CONSTRAINT fk_envio_visita  FOREIGN KEY (visita_id)   REFERENCES dmc.visita  (id) ON DELETE CASCADE,
    CONSTRAINT fk_envio_usuario FOREIGN KEY (enviado_por) REFERENCES dmc.usuario (id),
    CONSTRAINT ck_envio_estado  CHECK (estado IN ('ENCOLADO','ENVIADO','ERROR')),
    CONSTRAINT ck_envio_para    CHECK (CHARINDEX('@', para) > 1)
);
GO
CREATE INDEX ix_envio_visita ON dmc.acta_envio (visita_id, creado_en DESC);
GO

CREATE TABLE dmc.acta_envio_adjunto (
    id               bigint        IDENTITY(1,1) NOT NULL,
    envio_id         bigint        NOT NULL,
    tipo             varchar(9)    NOT NULL,
    visita_foto_id   bigint        NULL,
    visita_firma_id  bigint        NULL,
    visita_video_id  bigint        NULL,
    nombre_archivo   nvarchar(160) NOT NULL,
    archivo_url      nvarchar(400) NULL,
    CONSTRAINT pk_acta_envio_adjunto PRIMARY KEY (id),
    CONSTRAINT fk_adj_envio FOREIGN KEY (envio_id)        REFERENCES dmc.acta_envio   (id) ON DELETE CASCADE,
    CONSTRAINT fk_adj_foto  FOREIGN KEY (visita_foto_id)  REFERENCES dmc.visita_foto  (id),
    CONSTRAINT fk_adj_firma FOREIGN KEY (visita_firma_id) REFERENCES dmc.visita_firma (id),
    CONSTRAINT fk_adj_video FOREIGN KEY (visita_video_id) REFERENCES dmc.visita_video (id),
    CONSTRAINT ck_adj_tipo   CHECK (tipo IN ('FOTO','FIRMA','VIDEO','PDF_ACTA')),
    CONSTRAINT ck_adj_origen CHECK (
        (tipo = 'FOTO'  AND visita_foto_id  IS NOT NULL) OR
        (tipo = 'FIRMA' AND visita_firma_id IS NOT NULL) OR
        (tipo = 'VIDEO' AND visita_video_id IS NOT NULL) OR
        (tipo = 'PDF_ACTA'))
);
GO

/* =====================================================================
   8. TERRENO SIN SEÑAL
   ===================================================================== */
CREATE TABLE dmc.visita_borrador (
    id           bigint        IDENTITY(1,1) NOT NULL,
    visita_id    bigint        NOT NULL,
    usuario_id   bigint        NOT NULL,
    payload      nvarchar(max) NOT NULL,        -- secciones guardadas en el equipo
    guardado_en  datetime2(0)  NOT NULL CONSTRAINT df_borrador_guardado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita_borrador PRIMARY KEY (id),
    CONSTRAINT uq_borrador        UNIQUE (visita_id, usuario_id),
    CONSTRAINT fk_borrador_visita  FOREIGN KEY (visita_id)  REFERENCES dmc.visita  (id) ON DELETE CASCADE,
    CONSTRAINT fk_borrador_usuario FOREIGN KEY (usuario_id) REFERENCES dmc.usuario (id),
    CONSTRAINT ck_borrador_json    CHECK (ISJSON(payload) = 1)
);
GO

CREATE TABLE dmc.sincronizacion_cola (
    id             uniqueidentifier NOT NULL CONSTRAINT df_cola_id DEFAULT (NEWSEQUENTIALID()),
    usuario_id     bigint           NOT NULL,
    visita_id      bigint           NULL,
    entidad        varchar(40)      NOT NULL,   -- 'visita', 'visita_trabajo', 'problema', 'foto', 'firma'…
    operacion      varchar(10)      NOT NULL,   -- 'INSERT' | 'UPDATE' | 'DELETE'
    payload        nvarchar(max)    NOT NULL,
    estado         varchar(10)      NOT NULL CONSTRAINT df_cola_estado DEFAULT ('PENDIENTE'),
    intentos       smallint         NOT NULL CONSTRAINT df_cola_intentos DEFAULT (0),
    error_detalle  nvarchar(max)    NULL,
    creado_en      datetime2(0)     NOT NULL CONSTRAINT df_cola_creado DEFAULT (SYSDATETIME()),
    procesado_en   datetime2(0)     NULL,
    CONSTRAINT pk_sincronizacion_cola PRIMARY KEY (id),
    CONSTRAINT fk_cola_usuario FOREIGN KEY (usuario_id) REFERENCES dmc.usuario (id),
    CONSTRAINT fk_cola_visita  FOREIGN KEY (visita_id)  REFERENCES dmc.visita  (id) ON DELETE CASCADE,
    CONSTRAINT ck_cola_estado    CHECK (estado    IN ('PENDIENTE','ENVIADO','ERROR')),
    CONSTRAINT ck_cola_operacion CHECK (operacion IN ('INSERT','UPDATE','DELETE')),
    CONSTRAINT ck_cola_json      CHECK (ISJSON(payload) = 1)
);
GO
CREATE INDEX ix_cola_pendiente ON dmc.sincronizacion_cola (usuario_id, creado_en) WHERE estado = 'PENDIENTE';
GO

/* =====================================================================
   8b. PLANTILLA DEL CHECKLIST Y RECUPERACIÓN DE CONTRASEÑA
   ===================================================================== */

-- Las tres listas del checklist arrancan vacías. El panel guarda una foto de
-- cómo quedaron armadas y el botón Reiniciar vuelve a esa foto.
CREATE TABLE dmc.checklist_plantilla (
    id              bigint        IDENTITY(1,1) NOT NULL,
    nombre          nvarchar(80)  NOT NULL,
    payload         nvarchar(max) NOT NULL,     -- JSON con las tres listas
    creado_por      bigint        NULL,
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_plantilla_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_plantilla_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_checklist_plantilla PRIMARY KEY (id),
    CONSTRAINT uq_checklist_plantilla UNIQUE (nombre),
    CONSTRAINT fk_plantilla_usuario   FOREIGN KEY (creado_por) REFERENCES dmc.usuario (id),
    CONSTRAINT ck_plantilla_json      CHECK (ISJSON(payload) = 1)
);
GO

-- No hay servidor de correo: la solicitud queda registrada y el administrador
-- la atiende desde el panel. Se guarda el correo tal cual se escribió aunque no
-- exista ningún usuario con él, para que el login no delate qué correos están
-- dados de alta.
CREATE TABLE dmc.solicitud_password (
    id            bigint        IDENTITY(1,1) NOT NULL,
    email         nvarchar(160) NOT NULL,
    usuario_id    bigint        NULL,
    mensaje       nvarchar(400) NULL,
    estado        varchar(10)   NOT NULL CONSTRAINT df_solpass_estado DEFAULT ('PENDIENTE'),
    atendido_por  bigint        NULL,
    atendido_en   datetime2(0)  NULL,
    creado_en     datetime2(0)  NOT NULL CONSTRAINT df_solpass_creado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_solicitud_password PRIMARY KEY (id),
    CONSTRAINT fk_solpass_usuario    FOREIGN KEY (usuario_id)   REFERENCES dmc.usuario (id),
    CONSTRAINT fk_solpass_atendido   FOREIGN KEY (atendido_por) REFERENCES dmc.usuario (id),
    CONSTRAINT ck_solpass_estado     CHECK (estado IN ('PENDIENTE','ATENDIDA','DESCARTADA'))
);
GO
CREATE INDEX ix_solpass_pendiente ON dmc.solicitud_password (creado_en DESC) WHERE estado = 'PENDIENTE';
GO

/* =====================================================================
   9. TRIGGERS
   ===================================================================== */
CREATE OR ALTER TRIGGER dmc.tg_cliente_actualizado ON dmc.cliente AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE c SET actualizado_en = SYSDATETIME() FROM dmc.cliente c JOIN inserted i ON i.id = c.id;
END;
GO
CREATE OR ALTER TRIGGER dmc.tg_sucursal_actualizado ON dmc.sucursal AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE s SET actualizado_en = SYSDATETIME() FROM dmc.sucursal s JOIN inserted i ON i.id = s.id;
END;
GO
CREATE OR ALTER TRIGGER dmc.tg_tecnico_actualizado ON dmc.tecnico AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE t SET actualizado_en = SYSDATETIME() FROM dmc.tecnico t JOIN inserted i ON i.id = t.id;
END;
GO
CREATE OR ALTER TRIGGER dmc.tg_usuario_actualizado ON dmc.usuario AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE u SET actualizado_en = SYSDATETIME() FROM dmc.usuario u JOIN inserted i ON i.id = u.id;
END;
GO
CREATE OR ALTER TRIGGER dmc.tg_cat_motivo_actualizado ON dmc.catalogo_motivo AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE c SET actualizado_en = SYSDATETIME() FROM dmc.catalogo_motivo c JOIN inserted i ON i.id = c.id;
END;
GO
CREATE OR ALTER TRIGGER dmc.tg_cat_problema_actualizado ON dmc.catalogo_problema AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE c SET actualizado_en = SYSDATETIME() FROM dmc.catalogo_problema c JOIN inserted i ON i.id = c.id;
END;
GO
CREATE OR ALTER TRIGGER dmc.tg_cat_trabajo_actualizado ON dmc.catalogo_trabajo AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE c SET actualizado_en = SYSDATETIME() FROM dmc.catalogo_trabajo c JOIN inserted i ON i.id = c.id;
END;
GO
CREATE OR ALTER TRIGGER dmc.tg_ejecucion_actualizado ON dmc.visita_ejecucion AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE e SET actualizado_en = SYSDATETIME()
    FROM dmc.visita_ejecucion e JOIN inserted i ON i.visita_id = e.visita_id;
END;
GO

-- Sello de cambio + bitácora de estado de la visita en un solo trigger.
CREATE OR ALTER TRIGGER dmc.tg_visita_cambio ON dmc.visita AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
        UPDATE v SET actualizado_en = SYSDATETIME() FROM dmc.visita v JOIN inserted i ON i.id = v.id;

    INSERT INTO dmc.visita_estado_historial (visita_id, estado, tecnico_id)
    SELECT i.id, i.estado, i.tecnico_id
    FROM inserted i
    LEFT JOIN deleted d ON d.id = i.id
    WHERE d.id IS NULL OR d.estado <> i.estado;
END;
GO

-- resuelto_en se llena y se limpia solo, según el estado del problema.
CREATE OR ALTER TRIGGER dmc.tg_problema_cambio ON dmc.problema AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE p
       SET resuelto_en    = CASE WHEN i.estado = 'RESUELTO' THEN COALESCE(p.resuelto_en, SYSDATETIME()) END,
           actualizado_en = SYSDATETIME()
    FROM dmc.problema p
    JOIN inserted i ON i.id = p.id
    WHERE (i.estado =  'RESUELTO' AND p.resuelto_en IS NULL)
       OR (i.estado <> 'RESUELTO' AND p.resuelto_en IS NOT NULL)
       OR EXISTS (SELECT 1 FROM deleted d WHERE d.id = i.id);
END;
GO

/* =====================================================================
   10. VISTAS DE APOYO
   ===================================================================== */
CREATE OR ALTER VIEW dmc.v_problema_abierto AS
SELECT p.id, p.tipo_codigo, cp.nombre AS tipo, p.estado, p.descripcion, p.solucion,
       v.folio, v.fecha_programada, cm.nombre AS motivo,
       s.nombre AS sucursal, s.comuna, c.nombre_fantasia AS cliente,
       t.nombre_completo AS tecnico,
       CAST(CASE WHEN EXISTS (SELECT 1 FROM dmc.problema_visita_resolucion r WHERE r.problema_id = p.id)
                 THEN 1 ELSE 0 END AS bit) AS agendado
FROM dmc.problema p
JOIN dmc.visita   v  ON v.id  = p.visita_id
JOIN dmc.sucursal s  ON s.id  = v.sucursal_id
JOIN dmc.cliente  c  ON c.id  = v.cliente_id
JOIN dmc.tecnico  t  ON t.id  = v.tecnico_id
JOIN dmc.catalogo_problema cp ON cp.codigo = p.tipo_codigo
JOIN dmc.catalogo_motivo   cm ON cm.codigo = v.motivo_codigo
WHERE p.estado <> 'RESUELTO';
GO

CREATE OR ALTER VIEW dmc.v_carga_tecnico AS
SELECT t.id AS tecnico_id, t.nombre_completo AS tecnico, v.fecha_programada,
       COUNT(*) AS programadas,
       SUM(CASE WHEN v.estado = 'COMPLETADA' THEN 1 ELSE 0 END) AS realizadas,
       SUM(CASE WHEN v.estado IN ('REAGENDADA','PENDIENTE','CANCELADA','CANCELADA_ADMIN')
                THEN 1 ELSE 0 END) AS no_realizadas
FROM dmc.visita v
JOIN dmc.tecnico t ON t.id = v.tecnico_id
GROUP BY t.id, t.nombre_completo, v.fecha_programada;
GO

CREATE OR ALTER VIEW dmc.v_cumplimiento_dia AS
SELECT fecha_programada,
       COUNT(*) AS programadas,
       SUM(CASE WHEN estado = 'COMPLETADA' THEN 1 ELSE 0 END) AS cerradas,
       CAST(ROUND(100.0 * SUM(CASE WHEN estado = 'COMPLETADA' THEN 1 ELSE 0 END)
                  / NULLIF(COUNT(*), 0), 0) AS int) AS pct
FROM dmc.visita
GROUP BY fecha_programada;
GO

CREATE OR ALTER VIEW dmc.v_sucursal_fallas AS
SELECT s.id AS sucursal_id, s.nombre AS sucursal, s.comuna, c.nombre_fantasia AS cliente,
       COUNT(p.id) AS total,
       SUM(CASE WHEN p.estado <> 'RESUELTO' THEN 1 ELSE 0 END) AS sin_cerrar
FROM dmc.problema p
JOIN dmc.visita   v ON v.id = p.visita_id
JOIN dmc.sucursal s ON s.id = v.sucursal_id
JOIN dmc.cliente  c ON c.id = v.cliente_id
GROUP BY s.id, s.nombre, s.comuna, c.nombre_fantasia;
GO

-- Alimenta "Mi cuenta › Mis visitas realizadas" del móvil (filtros Hoy / Semana / Mes).
CREATE OR ALTER VIEW dmc.v_visita_realizada AS
SELECT v.id AS visita_id, v.folio, v.tecnico_id, t.nombre_completo AS tecnico,
       v.fecha_programada, v.estado,
       c.nombre_fantasia AS cliente, s.nombre AS sucursal, s.direccion, s.comuna,
       cm.nombre AS motivo,
       e.hora_inicio, e.hora_termino, e.responsable_nombre, e.observaciones,
       DATEDIFF(minute, e.hora_inicio, e.hora_termino) AS duracion_min,
       (SELECT COUNT(*) FROM dmc.problema p WHERE p.visita_id = v.id) AS problemas,
       (SELECT COUNT(*) FROM dmc.visita_trabajo w WHERE w.visita_id = v.id) AS trabajos
FROM dmc.visita v
JOIN dmc.tecnico  t ON t.id = v.tecnico_id
JOIN dmc.sucursal s ON s.id = v.sucursal_id
JOIN dmc.cliente  c ON c.id = v.cliente_id
JOIN dmc.catalogo_motivo cm ON cm.codigo = v.motivo_codigo
LEFT JOIN dmc.visita_ejecucion e ON e.visita_id = v.id
WHERE v.estado IN ('COMPLETADA','PENDIENTE');
GO

-- Quien cerro la visita desde el panel, cuando y con que explicacion. El motivo
-- no vive en dmc.visita: lo deja la bitacora, igual que el de una visita
-- PENDIENTE o CANCELADA.
CREATE OR ALTER VIEW dmc.v_visita_cancelada_admin AS
SELECT v.id AS visita_id, v.folio, v.fecha_programada, v.tecnico_id,
       t.nombre_completo AS tecnico,
       s.nombre AS sucursal, c.nombre_fantasia AS cliente,
       h.motivo, h.ocurrido_en AS cancelada_en,
       h.usuario_id AS cancelada_por, u.email AS cancelada_por_email
FROM dmc.visita v
JOIN dmc.tecnico  t ON t.id = v.tecnico_id
JOIN dmc.sucursal s ON s.id = v.sucursal_id
JOIN dmc.cliente  c ON c.id = v.cliente_id
CROSS APPLY (SELECT TOP 1 x.motivo, x.ocurrido_en, x.usuario_id
               FROM dmc.visita_estado_historial x
              WHERE x.visita_id = v.id AND x.estado = 'CANCELADA_ADMIN'
              ORDER BY x.ocurrido_en DESC, x.id DESC) h
LEFT JOIN dmc.usuario u ON u.id = h.usuario_id
WHERE v.estado = 'CANCELADA_ADMIN';
GO

/* =====================================================================
   11. CATÁLOGOS DE FÁBRICA (los tres checklists del panel)
   ===================================================================== */
INSERT INTO dmc.catalogo_motivo (codigo, nombre, orden) VALUES
 ('CALIBRACION',     N'Calibración de las antenas',    1),
 ('INSTALACION',     N'Instalación de las antenas',    2),
 ('RE_INSTALACION',  N'Reinstalación de las antenas',  3),
 ('DES_INSTALACION', N'Desinstalación de las antenas', 4),
 ('VISITA',          N'Visita preventiva',             5),
 ('REVISION',        N'Revisión de condiciones',       6);
GO

INSERT INTO dmc.catalogo_problema (codigo, nombre, grupo_label, singular, ayuda, orden) VALUES
 ('ANTENA_NO_DETECTA',   N'Antena no detecta etiquetas',      N'Antena afectada',              N'antena', N'Marca las antenas que no están detectando.',        1),
 ('FALSA_ALARMA',        N'Falsa alarma / falso positivo',    N'Dónde suena la falsa alarma',  N'punto',  N'Marca los puntos donde ocurre.',                    2),
 ('SIN_ENERGIA',         N'Sin alimentación eléctrica',       N'Qué quedó sin energía',        N'equipo', N'Marca los equipos sin alimentación.',               3),
 ('CABLE_DANADO',        N'Cable dañado o cortado',           N'Cable dañado',                 N'cable',  N'Marca el o los cables afectados.',                  4),
 ('PLACAS_DANADAS',      N'Placas dañadas',                   N'Modelo de placa',              N'modelo', N'Marca los modelos dañados y ajusta las cantidades.',5),
 ('DESCALIBRACION',      N'Antena descalibrada',              N'Antena a calibrar',            N'antena', N'Marca las antenas descalibradas.',                  6),
 ('CONTADOR_FALLA',      N'Contador de personas con falla',   N'Parte con falla',              N'parte',  N'Marca la parte del contador con falla.',            7),
 ('ETIQUETA_DEFECTUOSA', N'Etiqueta AM defectuosa',           N'Tipo de etiqueta',             N'tipo',   N'Marca el tipo de etiqueta y la cantidad revisada.', 8),
 ('OTRO',                N'Otro',                             NULL,                            NULL,      N'Describe el problema en el detalle escrito.',       9);
GO

INSERT INTO dmc.catalogo_problema_opcion (problema_id, etiqueta, orden)
SELECT cp.id, x.etiqueta, x.orden
FROM (VALUES
 ('ANTENA_NO_DETECTA',   N'Pórtico 1',1),('ANTENA_NO_DETECTA',N'Pórtico 2',2),('ANTENA_NO_DETECTA',N'Pórtico 3',3),
 ('ANTENA_NO_DETECTA',   N'Antena AM',4),('ANTENA_NO_DETECTA',N'Antena RF',5),
 ('FALSA_ALARMA',        N'Pórtico 1',1),('FALSA_ALARMA',N'Pórtico 2',2),('FALSA_ALARMA',N'Pórtico 3',3),
 ('FALSA_ALARMA',        N'Zona de cajas',4),('FALSA_ALARMA',N'Bodega',5),
 ('SIN_ENERGIA',         N'Pórtico completo',1),('SIN_ENERGIA',N'Fuente de poder',2),
 ('SIN_ENERGIA',         N'Transformador',3),('SIN_ENERGIA',N'Enchufe o toma',4),
 ('CABLE_DANADO',        N'Cable de poder',1),('CABLE_DANADO',N'Cable de antena',2),
 ('CABLE_DANADO',        N'Cable de red',3),('CABLE_DANADO',N'Cable de sincronía',4),
 ('PLACAS_DANADAS',      N'Master 9000',1),('PLACAS_DANADAS',N'Slave 9000',2),
 ('PLACAS_DANADAS',      N'TX MDG',3),('PLACAS_DANADAS',N'RX MDG',4),
 ('DESCALIBRACION',      N'Pórtico 1',1),('DESCALIBRACION',N'Pórtico 2',2),('DESCALIBRACION',N'Pórtico 3',3),
 ('CONTADOR_FALLA',      N'Sensor',1),('CONTADOR_FALLA',N'Display',2),
 ('CONTADOR_FALLA',      N'Cableado',3),('CONTADOR_FALLA',N'Fuente',4),
 ('ETIQUETA_DEFECTUOSA', N'Etiqueta AM dura',1),('ETIQUETA_DEFECTUOSA',N'Etiqueta AM blanda',2),
 ('ETIQUETA_DEFECTUOSA', N'Etiqueta RF',3)
) AS x(codigo, etiqueta, orden)
JOIN dmc.catalogo_problema cp ON cp.codigo = x.codigo;
GO

INSERT INTO dmc.catalogo_trabajo (codigo, nombre, grupo_label, singular, orden) VALUES
 ('CALIBRACION_ANTENAS', N'Calibración de antenas',    N'Antena calibrada',     N'antena',   1),
 ('CAMBIO_REPUESTO',     N'Cambio de repuesto',        N'Repuesto cambiado',    N'repuesto', 2),
 ('INSTALACION_EQUIPO',  N'Instalación de equipo',     N'Equipo instalado',     N'equipo',   3),
 ('MANTENCION',          N'Mantención preventiva',     N'Tarea de mantención',  N'tarea',    4),
 ('RETIRO_EQUIPO',       N'Retiro de equipo',          N'Equipo retirado',      N'equipo',   5),
 ('CAPACITACION',        N'Capacitación al personal',  NULL,                    NULL,        6);
GO

INSERT INTO dmc.catalogo_trabajo_subtrabajo (trabajo_id, etiqueta, orden)
SELECT ct.id, x.etiqueta, x.orden
FROM (VALUES
 ('CALIBRACION_ANTENAS', N'Pórtico 1',1),('CALIBRACION_ANTENAS',N'Pórtico 2',2),('CALIBRACION_ANTENAS',N'Pórtico 3',3),
 ('CALIBRACION_ANTENAS', N'Antena AM',4),('CALIBRACION_ANTENAS',N'Antena RF',5),
 ('CAMBIO_REPUESTO',     N'Tarjeta electrónica',1),('CAMBIO_REPUESTO',N'Fuente de poder',2),
 ('CAMBIO_REPUESTO',     N'Cable de slave a master',3),('CAMBIO_REPUESTO',N'Antena completa',4),
 ('CAMBIO_REPUESTO',     N'Sensor de conteo',5),
 ('INSTALACION_EQUIPO',  N'Pórtico nuevo',1),('INSTALACION_EQUIPO',N'Desactivador',2),
 ('INSTALACION_EQUIPO',  N'Contador de personas',3),('INSTALACION_EQUIPO',N'Alarma sonora',4),
 ('MANTENCION',          N'Limpieza interna',1),('MANTENCION',N'Revisión de conexiones',2),
 ('MANTENCION',          N'Ajuste de sensibilidad',3),('MANTENCION',N'Prueba con etiqueta patrón',4),
 ('RETIRO_EQUIPO',       N'Pórtico completo',1),('RETIRO_EQUIPO',N'Desactivador',2),
 ('RETIRO_EQUIPO',       N'Contador de personas',3)
) AS x(codigo, etiqueta, orden)
JOIN dmc.catalogo_trabajo ct ON ct.codigo = x.codigo;
GO

/* =====================================================================
   12. DATOS DE EJEMPLO (los mismos de las dos vistas del prototipo)
   ===================================================================== */
INSERT INTO dmc.cliente (rut, razon_social, nombre_fantasia, activo) VALUES
 ('96.812.330-7', N'Comercial Maui and Sons SpA',  N'Maui and Sons', 1),
 ('77.401.220-4', N'Adidas Chile Ltda.',           N'Adidas Chile',  1),
 ('81.239.055-2', N'Comercializadora Tricot S.A.', N'Tricot',        1),
 ('79.550.114-9', N'Preunic S.A.',                 N'Preunic',       1),
 ('76.998.043-1', N'Deportes Sparta SpA',          N'Sparta',        0);
GO

INSERT INTO dmc.sucursal (cliente_id, nombre, codigo, direccion, comuna, region, telefono, activo)
SELECT c.id, x.nombre, x.codigo, x.direccion, x.comuna, x.region, x.telefono, x.activo
FROM (VALUES
 (N'Sparta',       N'Parque Arauco',        'SP-241', N'Av. Kennedy 5413',                       N'Las Condes',       N'Metropolitana', '+56 2 2299 4100', 1),
 (N'Maui and Sons',N'Mall Plaza Tobalaba',  'MS-118', N'Av. Camilo Henríquez 3296',              N'Puente Alto',      N'Metropolitana', '+56 2 2871 5522', 1),
 (N'Adidas Chile', N'Costanera Center',     'AD-002', N'Andrés Bello 2425',                      N'Providencia',      N'Metropolitana', '+56 2 2618 9040', 1),
 (N'Tricot',       N'Paseo Ahumada',        'TR-055', N'Ahumada 131',                            N'Santiago',         N'Metropolitana', '+56 2 2632 7788', 1),
 (N'Maui and Sons',N'Mall Marina Arauco',   'MS-330', N'14 Norte 961',                           N'Viña del Mar',     N'Valparaíso',    '+56 32 268 4410', 1),
 (N'Preunic',      N'Mall Plaza Oeste',     'PR-076', N'Av. Américo Vespucio 1501',              N'Cerrillos',        N'Metropolitana', '+56 2 2544 9021', 0),
 (N'Preunic',      N'Mall Plaza Norte',     'PR-031', N'Av. Américo Vespucio 1737',              N'Huechuraba',       N'Metropolitana', '+56 2 2733 1180', 1),
 (N'Adidas Chile', N'Mall Plaza Vespucio',  'AD-014', N'Froilán Roa 7205',                       N'La Florida',       N'Metropolitana', '+56 2 2510 4420', 1),
 (N'Tricot',       N'Portal Ñuñoa',         'TR-090', N'Irarrázaval 2698',                       N'Ñuñoa',            N'Metropolitana', '+56 2 2277 6611', 1),
 (N'Preunic',      N'Mall Arauco Maipú',    'PR-112', N'Av. Américo Vespucio 399',               N'Maipú',            N'Metropolitana', '+56 2 2531 7745', 1),
 (N'Maui and Sons',N'Mall Plaza Trébol',    'MS-402', N'Av. Jorge Alessandri 3177',              N'Talcahuano',       N'Biobío',        '+56 41 248 9930', 1),
 (N'Adidas Chile', N'Mall Alto Las Condes', 'AD-021', N'Av. Kennedy 9001',                       N'Las Condes',       N'Metropolitana', '+56 2 2213 5560', 1),
 (N'Sparta',       N'Mall Plaza Egaña',     'SP-160', N'Av. Larraín 5862',                       N'La Reina',         N'Metropolitana', '+56 2 2277 9021', 1),
 (N'Preunic',      N'Mall Arauco Estación', 'PR-140', N'Av. Libertador Bernardo O''Higgins 3470',N'Estación Central', N'Metropolitana', '+56 2 2681 4410', 1)
) AS x(cliente, nombre, codigo, direccion, comuna, region, telefono, activo)
JOIN dmc.cliente c ON c.nombre_fantasia = x.cliente;
GO

INSERT INTO dmc.tecnico (rut, nombres, apellido_paterno, apellido_materno, email, telefono, activo) VALUES
 ('16.402.771-8', N'Harold',  N'Peralta', NULL,      N'hperalta@grupodmc.cl',           '+56 9 7712 4408', 1),
 ('17.884.102-3', N'Daniela', N'Fuentes', N'Rojas',  N'daniela.fuentes@grupodmc.cl',    '+56 9 6640 1122', 1),
 ('15.221.907-K', N'Rodrigo', N'Pinto',   N'Cádiz',  N'rodrigo.pinto@grupodmc.cl',      '+56 9 9004 3312', 1),
 ('18.330.554-1', N'Camila',  N'Torres',  N'Vera',   N'camila.torres@grupodmc.cl',      '+56 9 5512 8890', 1),
 ('14.007.663-5', N'Ignacio', N'Salas',   N'Muñoz',  N'ignacio.salas@grupodmc.cl',      '+56 9 3391 5540', 0);
GO

/* Hashes de ejemplo. En producción los genera la aplicación (bcrypt / Argon2);
   aquí se guarda un SHA2_512 en hexadecimal solo para poblar la tabla. */
INSERT INTO dmc.usuario (email, password_hash, rol, tecnico_id, activo)
SELECT x.email,
       CONCAT(N'sha512$', CONVERT(varchar(200), x.h, 2)),
       x.rol,
       (SELECT t.id FROM dmc.tecnico t WHERE t.email = x.email),
       x.activo
FROM (VALUES
 (N'camila.vergara@grupodmc.cl', HASHBYTES('SHA2_512', N'Dmc.Coord2026'), 'COORDINADOR', 1),
 (N'admin@grupodmc.cl',          HASHBYTES('SHA2_512', N'Dmc.Admin2026'), 'ADMIN',       1),
 (N'hperalta@grupodmc.cl',       HASHBYTES('SHA2_512', N'contingencia'),  'TECNICO',     1),
 (N'daniela.fuentes@grupodmc.cl',HASHBYTES('SHA2_512', N'Terreno.2026'),  'TECNICO',     1),
 (N'ignacio.salas@grupodmc.cl',  HASHBYTES('SHA2_512', N'Terreno.2026'),  'TECNICO',     0)
) AS x(email, h, rol, activo);
GO

-- Visitas V-2026-00001 … V-2026-00015 (13-08-2026 es "hoy" en el prototipo)
INSERT INTO dmc.visita (folio, cliente_id, sucursal_id, tecnico_id, motivo_codigo, estado,
                        fecha_programada, hora_programada, trabajo_solicitado,
                        responsable_nombre, responsable_telefono, creada_por)
SELECT x.folio, s.cliente_id, s.id, t.id, x.motivo, x.estado,
       CAST(x.fecha AS date), CAST(x.hora AS time(0)), x.trabajo, x.responsable, x.telefono,
       (SELECT id FROM dmc.usuario WHERE email = N'camila.vergara@grupodmc.cl')
FROM (VALUES
 ('V-2026-00001', N'Mall Arauco Estación', N'Rodrigo Pinto',   'REVISION',        'REAGENDADA', '2026-08-07', NULL,    N'Revisión de condiciones del pórtico principal.',                                   N'Felipe Araya',   '+56 9 6620 4417'),
 ('V-2026-00002', N'Mall Alto Las Condes', N'Camila Torres',   'CALIBRACION',     'COMPLETADA', '2026-08-08', '10:00', N'Calibrar pórtico del acceso principal tras detección intermitente.',               N'Carolina Díaz',  '+56 9 7741 2093'),
 ('V-2026-00003', N'Mall Plaza Norte',     N'Daniela Fuentes', 'REVISION',        'REAGENDADA', '2026-08-09', NULL,    N'Revisar pórtico sin energía tras corte del mall.',                                 N'Paulina Vera',   '+56 9 8123 4455'),
 ('V-2026-00004', N'Mall Plaza Trébol',    N'Ignacio Salas',   'REVISION',        'COMPLETADA', '2026-08-10', '14:00', N'Revisar detección de etiquetas blandas en acceso sur.',                            N'Rodrigo Muñoz',  '+56 9 5512 8890'),
 ('V-2026-00005', N'Mall Arauco Maipú',    N'Ignacio Salas',   'CALIBRACION',     'COMPLETADA', '2026-08-10', '09:45', N'Recalibrar pórtico principal después de mover el mueble de cajas.',                N'Felipe Araya',   '+56 9 6620 4417'),
 ('V-2026-00006', N'Mall Plaza Egaña',     N'Camila Torres',   'DES_INSTALACION', 'CANCELADA',  '2026-08-11', NULL,    N'Desinstalar pórtico por cierre de local.',                                         N'Carolina Díaz',  '+56 9 7741 2093'),
 ('V-2026-00007', N'Portal Ñuñoa',         N'Camila Torres',   'VISITA',          'COMPLETADA', '2026-08-11', '11:30', N'Preventiva trimestral: limpieza, prueba de etiquetas y conteo de alarmas.',        N'Paulina Vera',   '+56 9 8123 4455'),
 ('V-2026-00008', N'Mall Plaza Vespucio',  N'Rodrigo Pinto',   'INSTALACION',     'COMPLETADA', '2026-08-12', '15:00', N'Instalar 2 pórticos AM en acceso principal.',                                      N'Rodrigo Muñoz',  '+56 9 5512 8890'),
 ('V-2026-00009', N'Mall Marina Arauco',   N'Rodrigo Pinto',   'RE_INSTALACION',  'PENDIENTE',  '2026-08-12', '10:15', N'Reinstalar pórtico retirado por obras del mall.',                                  N'Felipe Araya',   '+56 9 6620 4417'),
 ('V-2026-00010', N'Mall Plaza Oeste',     N'Daniela Fuentes', 'REVISION',        'REAGENDADA', '2026-08-12', NULL,    N'Revisar alarmas falsas en caja 3.',                                                N'Carolina Díaz',  '+56 9 7741 2093'),
 ('V-2026-00011', N'Mall Plaza Norte',     N'Daniela Fuentes', 'CALIBRACION',     'COMPLETADA', '2026-08-13', '08:30', N'Calibrar antenas y revisar contador de personas.',                                 N'Paulina Vera',   '+56 9 8123 4455'),
 ('V-2026-00012', N'Mall Plaza Tobalaba',  N'Harold Peralta',  'CALIBRACION',     'PROGRAMADA', '2026-08-13', NULL,    N'3 antenas EAS con falsa alarma cada 10 min. Calibrar y registrar la ganancia.',    N'Paulina Vera',   '+56 9 8123 4455'),
 ('V-2026-00013', N'Costanera Center',     N'Harold Peralta',  'INSTALACION',     'PROGRAMADA', '2026-08-13', '11:00', N'Instalar 2 pórticos AM en acceso principal y 1 contador de personas en caja.',     N'Rodrigo Muñoz',  '+56 9 5512 8890'),
 ('V-2026-00014', N'Paseo Ahumada',        N'Harold Peralta',  'VISITA',          'PROGRAMADA', '2026-08-13', NULL,    N'Preventiva trimestral: limpieza de pórticos y prueba de etiquetas.',               N'Carolina Díaz',  '+56 9 7741 2093'),
 ('V-2026-00015', N'Parque Arauco',        N'Harold Peralta',  'REVISION',        'EN_CURSO',   '2026-08-13', '09:00', N'Revisar los 2 pórticos del acceso oriente: alarmas sin producto.',                 N'Felipe Araya',   '+56 9 6620 4417')
) AS x(folio, sucursal, tecnico, motivo, estado, fecha, hora, trabajo, responsable, telefono)
JOIN dmc.sucursal s ON s.nombre = x.sucursal
JOIN dmc.tecnico  t ON t.nombre_completo = x.tecnico;
GO
ALTER SEQUENCE dmc.seq_folio_visita RESTART WITH 16;
GO

-- Ejecución en terreno de las visitas que el técnico sí abrió
INSERT INTO dmc.visita_ejecucion (visita_id, hora_inicio, hora_termino, responsable_nombre,
                                  responsable_rut, responsable_telefono, motivo_real_codigo,
                                  observaciones, comentario_interno, dispositivo, app_version, sincronizado_en)
SELECT v.id,
       DATEADD(minute, DATEDIFF(minute, 0, COALESCE(v.hora_programada, '09:30')), CAST(v.fecha_programada AS datetime2(0))),
       CASE WHEN v.estado = 'EN_CURSO' THEN NULL
            ELSE DATEADD(minute, 65 + DATEDIFF(minute, 0, COALESCE(v.hora_programada, '09:30')),
                         CAST(v.fecha_programada AS datetime2(0))) END,
       v.responsable_nombre, '17.004.556-K', v.responsable_telefono, v.motivo_codigo,
       CASE WHEN v.estado = 'COMPLETADA'
            THEN N'Trabajo recibido conforme por la tienda. Se dejó el sector limpio y se explicó al encargado el uso del control de prueba.'
            ELSE N'Observaciones aún no cerradas por el técnico.' END,
       CASE WHEN v.folio IN ('V-2026-00009','V-2026-00015')
            THEN N'El encargado pide avisar con una hora de anticipación: el acceso de servicio se cierra a las 18:00.'
            ELSE NULL END,
       N'Android · app 1.4.2', '1.4.2',
       CASE WHEN v.estado = 'COMPLETADA' THEN SYSDATETIME() ELSE NULL END
FROM dmc.visita v
WHERE v.estado <> 'PROGRAMADA';
GO

-- Trabajos realizados que quedaron registrados en la sección 2 del formulario
INSERT INTO dmc.visita_trabajo (visita_id, trabajo_codigo, detalle, orden)
SELECT v.id, x.trabajo, x.detalle, x.orden
FROM (VALUES
 ('V-2026-00002','CALIBRACION_ANTENAS', N'Ganancia dejada en 66% tras cambiar el cable de antena.', 1),
 ('V-2026-00002','CAMBIO_REPUESTO',     NULL, 2),
 ('V-2026-00004','MANTENCION',          N'Prueba con etiqueta patrón en los tres accesos.', 1),
 ('V-2026-00005','CALIBRACION_ANTENAS', NULL, 1),
 ('V-2026-00005','CAPACITACION',        N'Se explicó al encargado el uso del control de prueba.', 2),
 ('V-2026-00007','MANTENCION',          NULL, 1),
 ('V-2026-00008','INSTALACION_EQUIPO',  N'2 pórticos AM en el acceso principal, fijados a piso.', 1),
 ('V-2026-00008','CALIBRACION_ANTENAS', NULL, 2),
 ('V-2026-00009','RETIRO_EQUIPO',       N'El pórtico quedó en bodega de la tienda por obras del mall.', 1),
 ('V-2026-00011','CALIBRACION_ANTENAS', NULL, 1),
 ('V-2026-00011','MANTENCION',          N'Se revisó el contador antes de dejarlo en observación.', 2),
 ('V-2026-00015','MANTENCION',          NULL, 1)
) AS x(folio, trabajo, detalle, orden)
JOIN dmc.visita v ON v.folio = x.folio;
GO

INSERT INTO dmc.visita_trabajo_subtrabajo (visita_trabajo_id, etiqueta, cantidad, orden)
SELECT w.id, x.etiqueta, x.cantidad, x.orden
FROM (VALUES
 ('V-2026-00002','CALIBRACION_ANTENAS', N'Pórtico 1',1,1),
 ('V-2026-00002','CAMBIO_REPUESTO',     N'Antena completa',1,1),
 ('V-2026-00004','MANTENCION',          N'Prueba con etiqueta patrón',1,1),
 ('V-2026-00005','CALIBRACION_ANTENAS', N'Pórtico 1',1,1),
 ('V-2026-00007','MANTENCION',          N'Limpieza interna',1,1),
 ('V-2026-00007','MANTENCION',          N'Revisión de conexiones',1,2),
 ('V-2026-00007','MANTENCION',          N'Prueba con etiqueta patrón',1,3),
 ('V-2026-00008','INSTALACION_EQUIPO',  N'Pórtico nuevo',2,1),
 ('V-2026-00008','CALIBRACION_ANTENAS', N'Pórtico 1',1,1),
 ('V-2026-00008','CALIBRACION_ANTENAS', N'Pórtico 2',1,2),
 ('V-2026-00009','RETIRO_EQUIPO',       N'Pórtico completo',1,1),
 ('V-2026-00011','CALIBRACION_ANTENAS', N'Antena AM',1,1),
 ('V-2026-00011','MANTENCION',          N'Ajuste de sensibilidad',1,1),
 ('V-2026-00015','MANTENCION',          N'Revisión de conexiones',1,1)
) AS x(folio, trabajo, etiqueta, cantidad, orden)
JOIN dmc.visita v         ON v.folio = x.folio
JOIN dmc.visita_trabajo w ON w.visita_id = v.id AND w.trabajo_codigo = x.trabajo;
GO

-- Firma de la tienda en las visitas cerradas
INSERT INTO dmc.visita_firma (visita_id, rol, nombre, rut, imagen_url, firmado_en)
SELECT v.id, 'TIENDA', v.responsable_nombre, '17.004.556-K',
       CONCAT(N'/media/firmas/', v.folio, N'.png'),
       DATEADD(minute, 65 + DATEDIFF(minute, 0, COALESCE(v.hora_programada, '09:30')),
               CAST(v.fecha_programada AS datetime2(0)))
FROM dmc.visita v WHERE v.estado = 'COMPLETADA';
GO

-- Fotos (3 por visita ejecutada)
INSERT INTO dmc.visita_foto (visita_id, etiqueta, archivo_url, orden, tomada_en)
SELECT v.id, x.etiqueta, CONCAT(N'/media/fotos/', v.folio, N'-', x.i, N'.jpg'), x.i,
       DATEADD(minute, x.i * 11 + DATEDIFF(minute, 0, COALESCE(v.hora_programada, '09:30')),
               CAST(v.fecha_programada AS datetime2(0)))
FROM dmc.visita v
CROSS JOIN (VALUES (1, N'Antes'), (2, N'Durante'), (3, N'Después')) AS x(i, etiqueta)
WHERE v.estado <> 'PROGRAMADA';
GO

-- Problemas levantados en terreno
INSERT INTO dmc.problema (visita_id, tipo_codigo, estado, descripcion, solucion, orden, resuelto_en)
SELECT v.id, x.tipo, x.estado, x.descripcion, x.solucion, x.orden,
       CASE WHEN x.estado = 'RESUELTO'
            THEN DATEADD(minute, 60 + DATEDIFF(minute, 0, COALESCE(v.hora_programada, '09:30')),
                         CAST(v.fecha_programada AS datetime2(0))) END
FROM (VALUES
 ('V-2026-00015','FALSA_ALARMA',      'ABIERTO',   N'Pórtico del acceso oriente suena sin producto cada 10 minutos desde el lunes.', N'Bajar ganancia y reubicar el sensor derecho; queda en revisión con la tienda.',        1),
 ('V-2026-00011','DESCALIBRACION',    'RESUELTO',  N'Antena izquierda con ganancia sobre el rango recomendado.',                     N'Ganancia ajustada a 68% y prueba con etiqueta patrón conforme.',                      1),
 ('V-2026-00011','CONTADOR_FALLA',    'PENDIENTE', N'Contador de personas marca la mitad del flujo real en horario punta.',          N'Se solicitó sensor de recambio a bodega; queda cotizado.',                            2),
 ('V-2026-00010','FALSA_ALARMA',      'ABIERTO',   N'Alarmas falsas en caja 3 cada vez que pasa el carro de reposición.',            N'No se pudo intervenir: la tienda estaba en inventario. Se reagendó.',                 1),
 ('V-2026-00009','PLACAS_DANADAS',    'PENDIENTE', N'Placa Master del pórtico 2 quemada; el equipo no enciende.',                    N'Tarjeta cotizada el 06-08, sin llegada a bodega. La visita queda pendiente.',         1),
 ('V-2026-00009','ANTENA_NO_DETECTA', 'ABIERTO',   N'Pórtico 1 no detecta etiquetas AM a menos de 40 cm.',                           N'Depende del cambio de tarjeta del pórtico 2 para poder recalibrar.',                  2),
 ('V-2026-00008','CABLE_DANADO',      'RESUELTO',  N'Tramo de 40 cm de cable a la vista en zona de cajas, con riesgo de tirón.',     N'Se cubrió con canaleta de 20 mm y se dejó registro fotográfico.',                     1),
 ('V-2026-00008','ANTENA_NO_DETECTA', 'RESUELTO',  N'Antena nueva sin detección tras la instalación.',                               N'Se corrigió el conector del lazo y se validó con etiqueta patrón.',                   2),
 ('V-2026-00007','CONTADOR_FALLA',    'PENDIENTE', N'Contador de personas se reinicia solo dos veces al día.',                       N'Se sugiere cambio de fuente; queda a la espera de aprobación del cliente.',           1),
 ('V-2026-00005','DESCALIBRACION',    'RESUELTO',  N'Pórtico principal descalibrado tras mover el mueble de cajas.',                 N'Recalibrado y fijado; se explicó al encargado el uso del control de prueba.',         1),
 ('V-2026-00005','FALSA_ALARMA',      'ABIERTO',   N'Falsos positivos con carros metálicos en el acceso norte.',                     N'Se sugiere reubicar el pórtico 60 cm hacia el interior; requiere obra menor.',        2),
 ('V-2026-00004','ANTENA_NO_DETECTA', 'ABIERTO',   N'Pórtico del acceso sur no detecta etiquetas blandas.',                          N'Se sugiere cambio de lazo receptor; cotización enviada a coordinación.',              1),
 ('V-2026-00003','SIN_ENERGIA',       'ABIERTO',   N'El pórtico quedó sin alimentación tras el corte de energía del mall.',          N'Requiere que el mall habilite el circuito; visita reagendada.',                       1),
 ('V-2026-00002','ANTENA_NO_DETECTA', 'RESUELTO',  N'Detección intermitente en el pórtico del acceso principal.',                    N'Se reemplazó el cable de antena y se recalibró.',                                     1),
 ('V-2026-00001','PLACAS_DANADAS',    'PENDIENTE', N'Placa del contador con falla intermitente.',                                    N'Repuesto solicitado; se dejó el contador desconectado para evitar datos erróneos.',   1)
) AS x(folio, tipo, estado, descripcion, solucion, orden)
JOIN dmc.visita v ON v.folio = x.folio;
GO

-- Detalle jerárquico del problema (modelo / pieza + cantidad)
INSERT INTO dmc.problema_item (problema_id, etiqueta, cantidad)
SELECT p.id, x.etiqueta, x.cantidad
FROM (VALUES
 ('V-2026-00009','PLACAS_DANADAS', N'Master 9000',1),
 ('V-2026-00009','PLACAS_DANADAS', N'TX MDG',2),
 ('V-2026-00001','PLACAS_DANADAS', N'Slave 9000',1),
 ('V-2026-00015','FALSA_ALARMA',   N'Pórtico 1',1),
 ('V-2026-00011','DESCALIBRACION', N'Pórtico 1',1),
 ('V-2026-00011','CONTADOR_FALLA', N'Sensor',1)
) AS x(folio, tipo, etiqueta, cantidad)
JOIN dmc.visita   v ON v.folio = x.folio
JOIN dmc.problema p ON p.visita_id = v.id AND p.tipo_codigo = x.tipo;
GO

-- Motivos de reagendamiento que dejó el técnico
INSERT INTO dmc.reagendamiento (visita_id, fecha_anterior, hora_anterior, motivo, origen, tecnico_id)
SELECT v.id, v.fecha_programada, v.hora_programada, x.motivo, 'MOVIL', v.tecnico_id
FROM (VALUES
 ('V-2026-00010', N'La tienda estaba en inventario y no dejaron intervenir el acceso principal. Se acordó volver el jueves 20.'),
 ('V-2026-00003', N'Local cerrado por corte de energía del mall; no había cómo energizar el pórtico.'),
 ('V-2026-00001', N'Faltaba la tarjeta electrónica de repuesto; se reprogramó cuando bodega confirme la llegada.')
) AS x(folio, motivo)
JOIN dmc.visita v ON v.folio = x.folio;
GO

/* =====================================================================
   Comprobación rápida
     SELECT * FROM dmc.v_cumplimiento_dia ORDER BY fecha_programada;
     SELECT * FROM dmc.v_problema_abierto ORDER BY sucursal;
     SELECT * FROM dmc.v_sucursal_fallas  ORDER BY sin_cerrar DESC;
     SELECT * FROM dmc.v_visita_realizada WHERE tecnico_id = 1 ORDER BY fecha_programada DESC;
   ===================================================================== */

