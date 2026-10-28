/* =====================================================================
   DMC Contingencia · esquema de la base de datos — Microsoft SQL Server 2022
   Tablas, índices, triggers, vistas, el catálogo de estados de problema y el
   rol «Coordinador». No trae clientes, usuarios ni visitas: los datos de
   demostración (ficticios) están en sql/semillas-demo.sql.

   Después de este archivo se aplican, en orden, las migraciones posteriores
   a esta versión (sql/migracion-NNN-*.sql).

   Uso:   sqlcmd -S servidor -d <base vacía> -i dmc_contingencia_sqlserver.sql
   Notas: singular, snake_case, uq_/ck_/fk_/ix_/df_, esquema dmc,
          FKs NO ACTION en maestros y CASCADE en tablas hijas de visita.
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/* ---------------------------------------------------------------------
   0. BASE DE DATOS Y ESQUEMA
   --------------------------------------------------------------------- */
-- No elige la base: corre en la que la conexión tenga abierta (sqlcmd -d, o la
-- lista de bases de SSMS). Créala antes y comprueba el nombre: este script
-- crea el esquema dmc en la base equivocada si te confundes.
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
    motivo_inactivo  nvarchar(400) NULL,         -- por qué se desactivó; el panel lo exige (migración 009)
    notas            nvarchar(max) NULL,         -- texto libre del panel
    plan_calibracion bit           NULL,         -- en plan de calibración; NULL = no se sabe (migración 017)
    garantia_meses   smallint      NULL,         -- plan de garantía que cubre todos sus locales; NULL = ninguno (migración 029)
    creado_en        datetime2(0)  NOT NULL CONSTRAINT df_cliente_creado DEFAULT (SYSDATETIME()),
    actualizado_en   datetime2(0)  NOT NULL CONSTRAINT df_cliente_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_cliente     PRIMARY KEY (id),
    CONSTRAINT uq_cliente_rut UNIQUE (rut),
    CONSTRAINT ck_cliente_garantia_meses CHECK (garantia_meses IS NULL OR garantia_meses BETWEEN 1 AND 240)
);
GO

-- Cada marca que opera un cliente (migración 029): Cliente → Marca → Sucursal.
CREATE TABLE dmc.marca (
    id              bigint        IDENTITY(1,1) NOT NULL,
    cliente_id      bigint        NOT NULL,
    nombre          nvarchar(80)  NOT NULL,
    activo          bit           NOT NULL CONSTRAINT df_marca_activo DEFAULT (1),
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_marca_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_marca_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_marca                PRIMARY KEY (id),
    CONSTRAINT uq_marca_cliente_nombre UNIQUE (cliente_id, nombre),
    CONSTRAINT uq_marca_id_cliente     UNIQUE (id, cliente_id),   -- destino de la FK compuesta de sucursal
    CONSTRAINT fk_marca_cliente        FOREIGN KEY (cliente_id) REFERENCES dmc.cliente (id)
);
GO

-- El centro comercial. Sus tiendas son sucursales con mall_id (migración 011).
CREATE TABLE dmc.mall (
    id              bigint        IDENTITY(1,1) NOT NULL,
    nombre          nvarchar(120) NOT NULL,
    direccion       nvarchar(180) NOT NULL,
    comuna          nvarchar(80)  NOT NULL CONSTRAINT df_mall_comuna DEFAULT (N''),   -- migración 012
    region          nvarchar(80)  NOT NULL CONSTRAINT df_mall_region DEFAULT (N''),   -- migración 012
    activo          bit           NOT NULL CONSTRAINT df_mall_activo DEFAULT (1),
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_mall_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_mall_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_mall        PRIMARY KEY (id),
    CONSTRAINT uq_mall_nombre UNIQUE (nombre)
);
GO

CREATE TABLE dmc.sucursal (
    id              bigint        IDENTITY(1,1) NOT NULL,
    cliente_id      bigint        NOT NULL,
    marca_id        bigint        NOT NULL,     -- la marca de la tienda; debe ser del mismo cliente (migración 029)
    mall_id         bigint        NULL,         -- el mall donde está la tienda, si está en uno (migración 011)
    nombre          nvarchar(120) NOT NULL,
    codigo          varchar(20)   NULL,         -- código interno opcional
    direccion       nvarchar(180) NOT NULL,
    comuna          nvarchar(80)  NOT NULL,
    region          nvarchar(80)  NOT NULL,
    telefono        varchar(30)   NULL,
    activo          bit           NOT NULL CONSTRAINT df_sucursal_activo DEFAULT (1),
    motivo_inactivo nvarchar(400) NULL,         -- por qué se desactivó; el panel lo exige (migración 009)
    notas           nvarchar(max) NULL,         -- texto libre del panel
    fecha_instalacion date        NULL,         -- cuándo se instaló (migración 017)
    remota          bit           NULL,         -- se atiende en remoto; NULL = no se sabe (migración 017)
    en_garantia     bit           NULL,         -- está en garantía; NULL = no se sabe (migración 017)
    plan_calibracion bit          NULL,         -- en plan por su cuenta; si el cliente lo está, la tienda también (migración 018)
    garantia_meses  smallint      NULL,         -- duración propia de la garantía; manda sobre la del cliente (migración 029)
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_sucursal_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_sucursal_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_sucursal                PRIMARY KEY (id),
    CONSTRAINT uq_sucursal_marca_nombre   UNIQUE (marca_id, nombre),
    CONSTRAINT ck_sucursal_garantia_meses CHECK (garantia_meses IS NULL OR garantia_meses BETWEEN 1 AND 240),
    CONSTRAINT fk_sucursal_cliente FOREIGN KEY (cliente_id) REFERENCES dmc.cliente (id),
    CONSTRAINT fk_sucursal_marca   FOREIGN KEY (marca_id, cliente_id) REFERENCES dmc.marca (id, cliente_id),
    CONSTRAINT fk_sucursal_mall    FOREIGN KEY (mall_id)    REFERENCES dmc.mall (id)
);
GO
CREATE INDEX ix_sucursal_cliente ON dmc.sucursal (cliente_id) WHERE activo = 1;
GO
CREATE INDEX ix_sucursal_mall ON dmc.sucursal (mall_id) WHERE mall_id IS NOT NULL;
GO
CREATE INDEX ix_sucursal_marca ON dmc.sucursal (marca_id) WHERE activo = 1;
GO
-- El código es opcional: único solo entre las sucursales que lo tienen.
CREATE UNIQUE INDEX uq_sucursal_codigo ON dmc.sucursal (codigo) WHERE codigo IS NOT NULL;
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

-- Roles del panel y qué puede hacer cada uno. Un permiso es "<módulo>.<acción>";
-- la lista de permisos que existen vive en la app (lib/permisos.ts).
CREATE TABLE dmc.rol (
    id              bigint         IDENTITY(1,1) NOT NULL,
    nombre          nvarchar(60)   NOT NULL,
    descripcion     nvarchar(240)  NULL,
    es_sistema      bit            NOT NULL CONSTRAINT df_rol_sistema DEFAULT (0),
    creado_en       datetime2(0)   NOT NULL CONSTRAINT df_rol_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)   NOT NULL CONSTRAINT df_rol_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_rol        PRIMARY KEY (id),
    CONSTRAINT uq_rol_nombre UNIQUE (nombre)
);
GO
CREATE TABLE dmc.rol_permiso (
    rol_id   bigint       NOT NULL,
    permiso  varchar(60)  NOT NULL,
    CONSTRAINT pk_rol_permiso     PRIMARY KEY (rol_id, permiso),
    CONSTRAINT fk_rol_permiso_rol FOREIGN KEY (rol_id) REFERENCES dmc.rol (id) ON DELETE CASCADE
);
GO

CREATE TABLE dmc.usuario (
    id                bigint         IDENTITY(1,1) NOT NULL,
    email             nvarchar(160)  NOT NULL,
    password_hash     nvarchar(200)  NOT NULL,
    rol               varchar(12)    NOT NULL,
    -- El rol del panel. Solo las cuentas COORDINADOR: el ADMIN puede todo y el
    -- TECNICO entra por el celular.
    rol_id            bigint         NULL,
    tecnico_id        bigint         NULL,
    activo            bit            NOT NULL CONSTRAINT df_usuario_activo DEFAULT (1),
    ultimo_acceso_en  datetime2(0)   NULL,
    -- Va dentro del token de sesión: subirlo cierra las sesiones abiertas.
    sesion_version    int            NOT NULL CONSTRAINT df_usuario_sesion_version DEFAULT (0),
    -- La clave la puso otra persona: al entrar se pide una nueva.
    debe_cambiar_password bit        NOT NULL CONSTRAINT df_usuario_debe_cambiar DEFAULT (0),
    creado_en         datetime2(0)   NOT NULL CONSTRAINT df_usuario_creado DEFAULT (SYSDATETIME()),
    actualizado_en    datetime2(0)   NOT NULL CONSTRAINT df_usuario_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_usuario         PRIMARY KEY (id),
    CONSTRAINT uq_usuario_email   UNIQUE (email),
    CONSTRAINT fk_usuario_tecnico FOREIGN KEY (tecnico_id) REFERENCES dmc.tecnico (id),
    CONSTRAINT fk_usuario_rol     FOREIGN KEY (rol_id) REFERENCES dmc.rol (id),
    CONSTRAINT ck_usuario_rol_id  CHECK (rol_id IS NULL OR rol = 'COORDINADOR'),
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
-- Una capa por encima de las listas: agrupa motivos o agrupa trabajos para
-- ordenarlos y plegarlos. Null en seccion_id = «sin sección».
CREATE TABLE dmc.catalogo_seccion (
    id      bigint        IDENTITY(1,1) NOT NULL,
    tipo    varchar(10)   NOT NULL,     -- MOTIVO | TRABAJO
    nombre  nvarchar(80)  NOT NULL,     -- "Visitas", "Instalaciones"…
    orden   smallint      NOT NULL CONSTRAINT df_cat_seccion_orden DEFAULT (0),
    activo  bit           NOT NULL CONSTRAINT df_cat_seccion_activo DEFAULT (1),
    CONSTRAINT pk_catalogo_seccion PRIMARY KEY (id),
    CONSTRAINT ck_catalogo_seccion_tipo CHECK (tipo IN ('MOTIVO', 'TRABAJO')),
    CONSTRAINT uq_catalogo_seccion_nombre UNIQUE (tipo, nombre)
);
GO

CREATE TABLE dmc.catalogo_motivo (
    id              bigint        IDENTITY(1,1) NOT NULL,
    codigo          varchar(40)   NOT NULL,     -- CALIBRACION, INSTALACION…
    nombre          nvarchar(80)  NOT NULL,     -- "Calibración de las antenas"
    seccion_id      bigint        NULL,         -- la sección donde se agrupa
    orden           smallint      NOT NULL CONSTRAINT df_cat_motivo_orden DEFAULT (0),
    activo          bit           NOT NULL CONSTRAINT df_cat_motivo_activo DEFAULT (1),
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_cat_motivo_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_cat_motivo_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_catalogo_motivo        PRIMARY KEY (id),
    CONSTRAINT uq_catalogo_motivo_codigo UNIQUE (codigo),
    CONSTRAINT uq_catalogo_motivo_nombre UNIQUE (nombre),
    CONSTRAINT fk_cat_motivo_seccion FOREIGN KEY (seccion_id) REFERENCES dmc.catalogo_seccion (id)
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
    seccion_id      bigint        NULL,         -- la sección donde se agrupa
    orden           smallint      NOT NULL CONSTRAINT df_cat_trab_orden DEFAULT (0),
    activo          bit           NOT NULL CONSTRAINT df_cat_trab_activo DEFAULT (1),
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_cat_trab_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_cat_trab_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_catalogo_trabajo        PRIMARY KEY (id),
    CONSTRAINT uq_catalogo_trabajo_codigo UNIQUE (codigo),
    CONSTRAINT uq_catalogo_trabajo_nombre UNIQUE (nombre),
    CONSTRAINT fk_cat_trabajo_seccion FOREIGN KEY (seccion_id) REFERENCES dmc.catalogo_seccion (id)
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

-- Qué trabajos van con cada motivo, y en qué orden: en el acta, bajo cada
-- motivo marcado solo se ofrecen los suyos. Un trabajo sin filas acá no se
-- ofrece en ninguno. Un mismo trabajo puede ir en varios motivos.
CREATE TABLE dmc.catalogo_motivo_trabajo (
    motivo_id   bigint    NOT NULL,
    trabajo_id  bigint    NOT NULL,
    orden       smallint  NOT NULL CONSTRAINT df_cat_mot_trab_orden DEFAULT (0),
    CONSTRAINT pk_catalogo_motivo_trabajo PRIMARY KEY (motivo_id, trabajo_id),
    CONSTRAINT fk_cat_mot_trab_motivo  FOREIGN KEY (motivo_id)  REFERENCES dmc.catalogo_motivo (id)  ON DELETE CASCADE,
    CONSTRAINT fk_cat_mot_trab_trabajo FOREIGN KEY (trabajo_id) REFERENCES dmc.catalogo_trabajo (id) ON DELETE CASCADE
);
GO
CREATE INDEX ix_cat_mot_trab_trabajo ON dmc.catalogo_motivo_trabajo (trabajo_id);
GO
CREATE INDEX ix_cat_mot_trab_motivo ON dmc.catalogo_motivo_trabajo (motivo_id, orden);
GO

-- Checklist del comentario interno: lo marca el técnico, no lo ve el cliente.
CREATE TABLE dmc.catalogo_interno (
    id              bigint        IDENTITY(1,1) NOT NULL,
    codigo          varchar(40)   NOT NULL,
    nombre          nvarchar(80)  NOT NULL,     -- "Cliente pidió cotización"
    orden           smallint      NOT NULL CONSTRAINT df_cat_interno_orden DEFAULT (0),
    activo          bit           NOT NULL CONSTRAINT df_cat_interno_activo DEFAULT (1),
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_cat_interno_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_cat_interno_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_catalogo_interno        PRIMARY KEY (id),
    CONSTRAINT uq_catalogo_interno_codigo UNIQUE (codigo),
    CONSTRAINT uq_catalogo_interno_nombre UNIQUE (nombre)
);
GO

-- Checklist de gestión de reagendas y pendientes: los pasos que coordinación
-- marca en el panel mientras destraba una visita que no se pudo hacer.
CREATE TABLE dmc.catalogo_pendiente (
    id              bigint        IDENTITY(1,1) NOT NULL,
    codigo          varchar(40)   NOT NULL,
    nombre          nvarchar(80)  NOT NULL,     -- "Repuesto pedido"
    orden           smallint      NOT NULL CONSTRAINT df_cat_pendiente_orden DEFAULT (0),
    activo          bit           NOT NULL CONSTRAINT df_cat_pendiente_activo DEFAULT (1),
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_cat_pendiente_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_cat_pendiente_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_catalogo_pendiente        PRIMARY KEY (id),
    CONSTRAINT uq_catalogo_pendiente_codigo UNIQUE (codigo),
    CONSTRAINT uq_catalogo_pendiente_nombre UNIQUE (nombre)
);
GO

-- Cargos del responsable de tienda ("Jefe de tienda"): la lista fija que se
-- ofrece al agendar y al llenar el acta (migración 022).
CREATE TABLE dmc.catalogo_cargo (
    id              bigint        IDENTITY(1,1) NOT NULL,
    codigo          varchar(40)   NOT NULL,
    nombre          nvarchar(80)  NOT NULL,     -- "Jefe de tienda"
    orden           smallint      NOT NULL CONSTRAINT df_cat_cargo_orden DEFAULT (0),
    activo          bit           NOT NULL CONSTRAINT df_cat_cargo_activo DEFAULT (1),
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_cat_cargo_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_cat_cargo_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_catalogo_cargo        PRIMARY KEY (id),
    CONSTRAINT uq_catalogo_cargo_codigo UNIQUE (codigo),
    CONSTRAINT uq_catalogo_cargo_nombre UNIQUE (nombre)
);
GO

-- Checklist de gestión de problemas: los pasos que coordinación marca en el
-- panel mientras lleva una falla hasta cerrarla.
CREATE TABLE dmc.catalogo_problema_gestion (
    id              bigint        IDENTITY(1,1) NOT NULL,
    codigo          varchar(40)   NOT NULL,
    nombre          nvarchar(80)  NOT NULL,     -- "Repuesto cotizado"
    orden           smallint      NOT NULL CONSTRAINT df_cat_prob_gestion_orden DEFAULT (0),
    activo          bit           NOT NULL CONSTRAINT df_cat_prob_gestion_activo DEFAULT (1),
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_cat_prob_gestion_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_cat_prob_gestion_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_catalogo_problema_gestion        PRIMARY KEY (id),
    CONSTRAINT uq_catalogo_problema_gestion_codigo UNIQUE (codigo),
    CONSTRAINT uq_catalogo_problema_gestion_nombre UNIQUE (nombre)
);
GO

-- Estados de un problema (Lista 7 del Checklist). ABIERTO es con el que nace
-- y RESUELTO el único que lo cierra; AGENDADO lo pone la app cuando se agenda
-- una visita para resolverlo (migración 030). Los tres se renombran, pero no se
-- quitan. Lo demás son estados intermedios. El código mide 10, como dmc.problema.estado.
CREATE TABLE dmc.catalogo_problema_estado (
    id         bigint        IDENTITY(1,1) NOT NULL,
    codigo     varchar(10)   NOT NULL,
    nombre     nvarchar(80)  NOT NULL,
    orden      smallint      NOT NULL CONSTRAINT df_cat_prob_estado_orden DEFAULT (0),
    activo     bit           NOT NULL CONSTRAINT df_cat_prob_estado_activo DEFAULT (1),
    creado_en  datetime2(0)  NOT NULL CONSTRAINT df_cat_prob_estado_creado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_catalogo_problema_estado        PRIMARY KEY (id),
    CONSTRAINT uq_catalogo_problema_estado_codigo UNIQUE (codigo),
    CONSTRAINT uq_catalogo_problema_estado_nombre UNIQUE (nombre)
);
GO
INSERT INTO dmc.catalogo_problema_estado (codigo, nombre, orden) VALUES
 ('ABIERTO',   N'Abierto',         1),
 ('AGENDADO',  N'Agendado',        2),
 ('PENDIENTE', N'Espera repuesto', 3),
 ('RESUELTO',  N'Resuelto',        4);
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
    tecnico_ayudante_id   bigint        NULL,       -- segundo técnico cuando van dos al local
    motivo_codigo         varchar(40)   NOT NULL,   -- FK al catálogo editable (Lista 1)
    estado                varchar(16)   NOT NULL CONSTRAINT df_visita_estado DEFAULT ('PROGRAMADA'),
    fecha_programada      date          NOT NULL,
    fecha_hasta           date          NULL,       -- margen de días: último día para hacerla (migración 010)
    hora_programada      time(0)       NULL,       -- la app la exige en motivos «Instalación…»
    trabajo_solicitado    nvarchar(max) NOT NULL,
    indicaciones_acceso   nvarchar(max) NULL,
    responsable_nombre    nvarchar(120) NULL,
    responsable_rut       varchar(12)   NULL,       -- se pide al agendar; llega precargado al acta
    responsable_telefono  varchar(30)   NULL,
    responsable_cargo     nvarchar(80)  NULL,       -- el cargo que se anotó al agendar (migración 022)
    problema_origen_id    bigint        NULL,       -- visita nacida de un problema abierto
    creada_en_terreno     bit           NOT NULL CONSTRAINT df_visita_terreno DEFAULT (0),
    creada_por            bigint        NULL,
    -- Borrado lógico: "Eliminar visita" del panel pasa esto a 0 en vez de
    -- borrar la fila. El acta, las fotos, el video y la firma quedan intactos;
    -- solo se saca de lo que ve el panel, el celular y los gráficos.
    activo                bit           NOT NULL CONSTRAINT df_visita_activo DEFAULT (1),
    creado_en             datetime2(0)  NOT NULL CONSTRAINT df_visita_creado DEFAULT (SYSDATETIME()),
    actualizado_en        datetime2(0)  NOT NULL CONSTRAINT df_visita_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita          PRIMARY KEY (id),
    CONSTRAINT uq_visita_folio    UNIQUE (folio),
    CONSTRAINT fk_visita_cliente    FOREIGN KEY (cliente_id)    REFERENCES dmc.cliente  (id),
    CONSTRAINT fk_visita_sucursal   FOREIGN KEY (sucursal_id)   REFERENCES dmc.sucursal (id),
    CONSTRAINT fk_visita_tecnico    FOREIGN KEY (tecnico_id)    REFERENCES dmc.tecnico  (id),
    CONSTRAINT fk_visita_ayudante   FOREIGN KEY (tecnico_ayudante_id) REFERENCES dmc.tecnico (id),
    CONSTRAINT fk_visita_motivo     FOREIGN KEY (motivo_codigo) REFERENCES dmc.catalogo_motivo (codigo),
    CONSTRAINT fk_visita_creada_por FOREIGN KEY (creada_por)    REFERENCES dmc.usuario  (id),
    -- CANCELADA_ADMIN la pone administracion desde el panel sobre una visita
    -- vieja o que ya no sirve; CANCELADA la deja el tecnico parado en la tienda.
    CONSTRAINT ck_visita_estado CHECK (estado IN
        ('PROGRAMADA','EN_CURSO','COMPLETADA','PENDIENTE','REAGENDADA','CANCELADA','CANCELADA_ADMIN')),
    -- La hora en instalación no va como CHECK: el código del motivo es fijo
    -- pero su nombre se edita, y la app la decide por el nombre (migración 007).
    CONSTRAINT ck_visita_ayudante CHECK (tecnico_ayudante_id IS NULL OR tecnico_ayudante_id <> tecnico_id),
    CONSTRAINT ck_visita_fecha_hasta CHECK (fecha_hasta IS NULL OR fecha_hasta > fecha_programada)
);
GO
CREATE INDEX ix_visita_fecha    ON dmc.visita (fecha_programada DESC);
CREATE INDEX ix_visita_tecnico  ON dmc.visita (tecnico_id, fecha_programada DESC) INCLUDE (estado, sucursal_id);
CREATE INDEX ix_visita_ayudante ON dmc.visita (tecnico_ayudante_id, fecha_programada DESC)
    WHERE tecnico_ayudante_id IS NOT NULL;
CREATE INDEX ix_visita_sucursal ON dmc.visita (sucursal_id, fecha_programada DESC);
CREATE INDEX ix_visita_cliente  ON dmc.visita (cliente_id, fecha_programada DESC);
CREATE INDEX ix_visita_estado   ON dmc.visita (estado, fecha_programada DESC);
CREATE INDEX ix_visita_activo   ON dmc.visita (activo) INCLUDE (fecha_programada, estado);
GO

-- Una visita puede tener varios motivos: motivo_codigo de arriba es el
-- principal (el primero marcado, del que cuelga la FK) y acá va la
-- selección completa.
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
    responsable_cargo     nvarchar(80)  NULL,      -- el cargo de quien firmó; sale en el acta y el PDF (migración 022)
    motivo_real_codigo    varchar(40)   NULL,      -- el motivo que el técnico confirma en terreno
    observaciones         nvarchar(max) NULL,      -- las ve el cliente en el acta
    comentario_interno    nvarchar(max) NULL,      -- solo coordinación
    dispositivo           nvarchar(60)  NULL,
    app_version           varchar(20)   NULL,
    registrado_offline    bit           NOT NULL CONSTRAINT df_ejec_offline DEFAULT (0),
    sincronizado_en       datetime2(0)  NULL,
    edicion_tecnico_hasta datetime2(0)  NULL,      -- coordinación le abre la edición al técnico hasta esta hora (migración 027)
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

-- Auditoría de "Eliminar visita": quién, cuándo y en qué estado estaba. No es
-- lo mismo que visita_estado_historial: eliminar no es un cambio de estado,
-- es sacar la visita de circulación (dmc.visita.activo = 0). El folio va
-- duplicado a propósito: la fila de dmc.visita sigue existiendo, pero esta
-- bitácora se puede leer sin depender del join.
CREATE TABLE dmc.visita_eliminacion (
    id            bigint       IDENTITY(1,1) NOT NULL,
    visita_id     bigint       NOT NULL,
    folio         varchar(16)  NOT NULL,
    estado_previo varchar(16)  NOT NULL,
    usuario_id    bigint       NOT NULL,
    eliminado_en  datetime2(0) NOT NULL CONSTRAINT df_visita_elim_en DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita_eliminacion PRIMARY KEY (id),
    CONSTRAINT fk_visita_elim_visita  FOREIGN KEY (visita_id)  REFERENCES dmc.visita  (id),
    CONSTRAINT fk_visita_elim_usuario FOREIGN KEY (usuario_id) REFERENCES dmc.usuario (id)
);
GO
CREATE INDEX ix_visita_elim_visita ON dmc.visita_eliminacion (visita_id);
GO

-- Contactos (migración 029). Un contacto tiene varios cargos y cada cargo su
-- alcance: CLIENTE, MARCA, SUCURSAL (alcance_id) o REGION (alcance_texto). Sin
-- triggers de INSERT a propósito: el servidor valida que el alcance exista.
CREATE TABLE dmc.contacto (
    id              bigint        IDENTITY(1,1) NOT NULL,
    nombre          nvarchar(120) NOT NULL,
    email           nvarchar(160) NULL,
    telefono        varchar(30)   NULL,
    activo          bit           NOT NULL CONSTRAINT df_contacto_activo DEFAULT (1),
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_contacto_creado DEFAULT (SYSDATETIME()),
    actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_contacto_actualizado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_contacto PRIMARY KEY (id)
);
GO
CREATE TABLE dmc.contacto_cargo (
    id            bigint        IDENTITY(1,1) NOT NULL,
    contacto_id   bigint        NOT NULL,
    cargo         nvarchar(80)  NOT NULL,
    alcance_tipo  varchar(10)   NOT NULL,
    alcance_id    bigint        NULL,           -- cliente, marca o sucursal
    alcance_texto nvarchar(80)  NULL,           -- la región, como texto
    CONSTRAINT pk_contacto_cargo PRIMARY KEY (id),
    CONSTRAINT fk_contacto_cargo_contacto FOREIGN KEY (contacto_id) REFERENCES dmc.contacto (id) ON DELETE CASCADE,
    CONSTRAINT ck_contacto_cargo_alcance CHECK (
           (alcance_tipo IN ('CLIENTE', 'MARCA', 'SUCURSAL') AND alcance_id IS NOT NULL AND alcance_texto IS NULL)
        OR (alcance_tipo = 'REGION' AND alcance_id IS NULL AND alcance_texto IS NOT NULL)
    )
);
GO
CREATE UNIQUE INDEX uq_contacto_cargo ON dmc.contacto_cargo (contacto_id, cargo, alcance_tipo, alcance_id, alcance_texto);
GO
CREATE INDEX ix_contacto_cargo_alcance ON dmc.contacto_cargo (alcance_tipo, alcance_id, alcance_texto);
GO

-- Quienes han recibido o firmado en cada tienda (migración 021). Se ofrecen al
-- agendar y al llenar el acta; la app la alimenta con cada visita. Una persona
-- por tienda: por RUT cuando lo tiene, por nombre cuando no.
CREATE TABLE dmc.persona_local (
    id          bigint        IDENTITY(1,1) NOT NULL,
    sucursal_id bigint        NOT NULL,
    nombre      nvarchar(120) NOT NULL,
    rut         varchar(12)   NULL,
    telefono    varchar(30)   NULL,
    cargo       nvarchar(80)  NULL,
    ultima_vez  datetime2(0)  NOT NULL CONSTRAINT df_persona_local_ultima DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_persona_local          PRIMARY KEY (id),
    CONSTRAINT fk_persona_local_sucursal FOREIGN KEY (sucursal_id) REFERENCES dmc.sucursal (id)
);
GO
CREATE UNIQUE INDEX uq_persona_local_rut    ON dmc.persona_local (sucursal_id, rut)    WHERE rut IS NOT NULL;
CREATE UNIQUE INDEX uq_persona_local_nombre ON dmc.persona_local (sucursal_id, nombre) WHERE rut IS NULL;
GO

-- Bitácora de cada corrección hecha a un acta después de cerrarla: quién,
-- cuándo, desde dónde, qué partes tocó, qué cambió y por qué. El técnico puede
-- editar hasta un día después del cierre; el administrador, sin plazo. La firma
-- de la tienda no se toca y el PDF no menciona las ediciones.
CREATE TABLE dmc.visita_edicion (
    id          bigint        IDENTITY(1,1) NOT NULL,
    visita_id   bigint        NOT NULL,
    origen      varchar(6)    NOT NULL,      -- MOVIL = el técnico, WEB = el panel
    usuario_id  bigint        NOT NULL,
    tecnico_id  bigint        NULL,
    motivo      nvarchar(max) NOT NULL,      -- por qué se cambió
    secciones   nvarchar(400) NOT NULL,      -- qué partes: "Responsable de tienda · Fotos y video"
    detalle     nvarchar(max) NOT NULL,      -- qué cambió, una línea por cambio
    editado_en  datetime2(0)  NOT NULL CONSTRAINT df_visita_edicion_en DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita_edicion PRIMARY KEY (id),
    CONSTRAINT fk_visita_edicion_visita  FOREIGN KEY (visita_id)  REFERENCES dmc.visita  (id) ON DELETE CASCADE,
    CONSTRAINT fk_visita_edicion_usuario FOREIGN KEY (usuario_id) REFERENCES dmc.usuario (id),
    CONSTRAINT fk_visita_edicion_tecnico FOREIGN KEY (tecnico_id) REFERENCES dmc.tecnico (id),
    CONSTRAINT ck_visita_edicion_origen  CHECK (origen IN ('MOVIL','WEB'))
);
GO
CREATE INDEX ix_visita_edicion_visita ON dmc.visita_edicion (visita_id, editado_en DESC);
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
    motivo_codigo   varchar(40)   NULL,          -- bajo qué motivo se registró
    detalle         nvarchar(max) NULL,          -- texto libre opcional del técnico
    orden           smallint      NOT NULL CONSTRAINT df_vis_trab_orden DEFAULT (1),
    -- Nada se borra: quitar un trabajo del acta lo deja inactivo.
    activo          bit           NOT NULL CONSTRAINT df_vis_trab_activo DEFAULT (1),
    creado_en       datetime2(0)  NOT NULL CONSTRAINT df_vis_trab_creado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita_trabajo PRIMARY KEY (id),
    CONSTRAINT fk_vis_trab_visita  FOREIGN KEY (visita_id)      REFERENCES dmc.visita (id) ON DELETE CASCADE,
    CONSTRAINT fk_vis_trab_catalogo FOREIGN KEY (trabajo_codigo) REFERENCES dmc.catalogo_trabajo (codigo),
    CONSTRAINT fk_vis_trab_motivo   FOREIGN KEY (motivo_codigo)  REFERENCES dmc.catalogo_motivo (codigo)
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

-- Lo que el técnico marcó del checklist del comentario interno.
CREATE TABLE dmc.visita_interno (
    id              bigint       IDENTITY(1,1) NOT NULL,
    visita_id       bigint       NOT NULL,
    interno_codigo  varchar(40)  NOT NULL,
    orden           smallint     NOT NULL CONSTRAINT df_vis_interno_orden DEFAULT (1),
    creado_en       datetime2(0) NOT NULL CONSTRAINT df_vis_interno_creado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita_interno        PRIMARY KEY (id),
    CONSTRAINT uq_visita_interno        UNIQUE (visita_id, interno_codigo),
    CONSTRAINT fk_vis_interno_visita    FOREIGN KEY (visita_id)      REFERENCES dmc.visita (id) ON DELETE CASCADE,
    CONSTRAINT fk_vis_interno_catalogo  FOREIGN KEY (interno_codigo) REFERENCES dmc.catalogo_interno (codigo)
);
GO

-- Lo que coordinación lleva marcado del checklist de gestión en cada visita
-- reagendada o pendiente. Desmarcar borra la fila; la app solo cuenta lo
-- marcado desde el último cambio de estado de la visita.
CREATE TABLE dmc.visita_pendiente_gestion (
    id                bigint       IDENTITY(1,1) NOT NULL,
    visita_id         bigint       NOT NULL,
    pendiente_codigo  varchar(40)  NOT NULL,
    usuario_id        bigint       NULL,
    marcado_en        datetime2(0) NOT NULL CONSTRAINT df_vis_pend_gestion_en DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita_pendiente_gestion PRIMARY KEY (id),
    CONSTRAINT uq_visita_pendiente_gestion UNIQUE (visita_id, pendiente_codigo),
    CONSTRAINT fk_vis_pend_gestion_visita   FOREIGN KEY (visita_id)        REFERENCES dmc.visita (id) ON DELETE CASCADE,
    CONSTRAINT fk_vis_pend_gestion_catalogo FOREIGN KEY (pendiente_codigo) REFERENCES dmc.catalogo_pendiente (codigo),
    CONSTRAINT fk_vis_pend_gestion_usuario  FOREIGN KEY (usuario_id)       REFERENCES dmc.usuario (id)
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
    CONSTRAINT fk_problema_estado  FOREIGN KEY (estado) REFERENCES dmc.catalogo_problema_estado (codigo),
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

-- Lo que coordinación lleva marcado del checklist de gestión en cada problema.
-- Desmarcar borra la fila; al resolver el problema lo marcado se conserva.
CREATE TABLE dmc.problema_gestion (
    id              bigint       IDENTITY(1,1) NOT NULL,
    problema_id     bigint       NOT NULL,
    gestion_codigo  varchar(40)  NOT NULL,
    usuario_id      bigint       NULL,
    marcado_en      datetime2(0) NOT NULL CONSTRAINT df_problema_gestion_en DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_problema_gestion PRIMARY KEY (id),
    CONSTRAINT uq_problema_gestion UNIQUE (problema_id, gestion_codigo),
    CONSTRAINT fk_problema_gestion_problema FOREIGN KEY (problema_id)    REFERENCES dmc.problema (id) ON DELETE CASCADE,
    CONSTRAINT fk_problema_gestion_catalogo FOREIGN KEY (gestion_codigo) REFERENCES dmc.catalogo_problema_gestion (codigo),
    CONSTRAINT fk_problema_gestion_usuario  FOREIGN KEY (usuario_id)     REFERENCES dmc.usuario (id)
);
GO

CREATE TABLE dmc.problema_visita_resolucion (
    id            bigint       IDENTITY(1,1) NOT NULL,
    problema_id   bigint       NOT NULL,
    visita_id     bigint       NOT NULL,        -- visita agendada para resolverlo
    agendado_por  bigint       NULL,
    creado_en     datetime2(0) NOT NULL CONSTRAINT df_pvr_creado DEFAULT (SYSDATETIME()),
    -- Lo que dijo el acta de esa visita: RESUELTO o NO_RESUELTO. NULL = sin acta aún.
    resultado     varchar(12)  NULL,
    respondido_en datetime2(0) NULL,
    CONSTRAINT pk_problema_visita_resolucion PRIMARY KEY (id),
    CONSTRAINT uq_pvr UNIQUE (problema_id, visita_id),
    CONSTRAINT fk_pvr_problema FOREIGN KEY (problema_id)  REFERENCES dmc.problema (id) ON DELETE CASCADE,
    CONSTRAINT fk_pvr_visita   FOREIGN KEY (visita_id)    REFERENCES dmc.visita   (id),
    CONSTRAINT fk_pvr_usuario  FOREIGN KEY (agendado_por) REFERENCES dmc.usuario  (id),
    CONSTRAINT ck_pvr_resultado CHECK (resultado IS NULL OR resultado IN ('RESUELTO','NO_RESUELTO'))
);
GO
CREATE INDEX ix_pvr_visita ON dmc.problema_visita_resolucion (visita_id);
GO

-- El aviso de problemas sin resolver al agendar o reprogramar en una sucursal
-- que los tiene: qué se respondió, quién y qué se mostró (migración 030). Queda
-- aunque la respuesta sea "otra cosa" y no se vincule nada. Sin trigger: la app
-- recoge el id con SCOPE_IDENTITY().
CREATE TABLE dmc.visita_aviso_problema (
    id          bigint        IDENTITY(1,1) NOT NULL,
    visita_id   bigint        NOT NULL,
    ocasion     varchar(10)   NOT NULL,      -- AGENDAR | REAGENDAR
    respuesta   varchar(10)   NOT NULL,      -- RESUELVE | OTRA_COSA
    usuario_id  bigint        NULL,
    creado_en   datetime2(0)  NOT NULL CONSTRAINT df_aviso_problema_creado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita_aviso_problema PRIMARY KEY (id),
    CONSTRAINT fk_aviso_problema_visita  FOREIGN KEY (visita_id)  REFERENCES dmc.visita  (id) ON DELETE CASCADE,
    CONSTRAINT fk_aviso_problema_usuario FOREIGN KEY (usuario_id) REFERENCES dmc.usuario (id),
    CONSTRAINT ck_aviso_problema_ocasion   CHECK (ocasion   IN ('AGENDAR','REAGENDAR')),
    CONSTRAINT ck_aviso_problema_respuesta CHECK (respuesta IN ('RESUELVE','OTRA_COSA'))
);
GO
CREATE INDEX ix_aviso_problema_visita ON dmc.visita_aviso_problema (visita_id, creado_en DESC);
GO

CREATE TABLE dmc.visita_aviso_problema_detalle (
    aviso_id     bigint  NOT NULL,
    problema_id  bigint  NOT NULL,
    CONSTRAINT pk_visita_aviso_problema_detalle PRIMARY KEY (aviso_id, problema_id),
    CONSTRAINT fk_aviso_detalle_aviso    FOREIGN KEY (aviso_id)    REFERENCES dmc.visita_aviso_problema (id) ON DELETE CASCADE,
    CONSTRAINT fk_aviso_detalle_problema FOREIGN KEY (problema_id) REFERENCES dmc.problema (id)
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
    -- 1 = foto del comentario interno: no sale en el PDF ni en el correo.
    interno      bit           NOT NULL CONSTRAINT df_foto_interno DEFAULT (0),
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
    -- 1 = clip del comentario interno: no sale en el PDF ni en el correo.
    interno         bit            NOT NULL CONSTRAINT df_video_interno DEFAULT (0),
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

-- Fotos y videos que explican el trabajo a realizar (migración 028). Aparte de
-- la evidencia del acta: esto es el encargo y no sale en el PDF ni en el correo.
-- Se suben por trozos, como el video del acta; 25 MB por archivo.
CREATE TABLE dmc.visita_adjunto (
    id              bigint         IDENTITY(1,1) NOT NULL,
    visita_id       bigint         NOT NULL,
    tipo            varchar(5)     NOT NULL,           -- FOTO | VIDEO
    nombre          nvarchar(120)  NULL,               -- el nombre del archivo, para descargarlo
    mime            varchar(40)    NOT NULL,
    contenido       varbinary(max) NULL,
    bytes           int            NOT NULL,           -- lo que declaró el navegador
    bytes_recibidos int            NOT NULL CONSTRAINT df_adjunto_recibidos DEFAULT (0),
    duracion_seg    smallint       NULL,
    subida_completa bit            NOT NULL CONSTRAINT df_adjunto_completa DEFAULT (0),
    activo          bit            NOT NULL CONSTRAINT df_adjunto_activo DEFAULT (1),
    subido_por      bigint         NULL,
    subido_en       datetime2(0)   NOT NULL CONSTRAINT df_adjunto_subido DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita_adjunto  PRIMARY KEY (id),
    CONSTRAINT fk_adjunto_visita  FOREIGN KEY (visita_id)  REFERENCES dmc.visita  (id) ON DELETE CASCADE,
    CONSTRAINT fk_adjunto_usuario FOREIGN KEY (subido_por) REFERENCES dmc.usuario (id),
    CONSTRAINT ck_adjunto_tipo    CHECK (tipo IN ('FOTO','VIDEO')),
    CONSTRAINT ck_adjunto_mime    CHECK (mime IN ('image/jpeg','image/png','image/webp',
                                                  'video/mp4','video/webm','video/quicktime')),
    CONSTRAINT ck_adjunto_bytes   CHECK (bytes > 0 AND bytes <= 26214400),
    CONSTRAINT ck_adjunto_recibidos CHECK (bytes_recibidos >= 0 AND bytes_recibidos <= bytes),
    CONSTRAINT ck_adjunto_completa  CHECK (subida_completa = 0 OR bytes_recibidos = bytes)
);
GO
CREATE INDEX ix_adjunto_visita ON dmc.visita_adjunto (visita_id, id)
    WHERE activo = 1 AND subida_completa = 1;
-- Las subidas que nunca terminaron: se limpian aparte.
CREATE INDEX ix_adjunto_incompleto ON dmc.visita_adjunto (subido_en) WHERE subida_completa = 0;
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

-- Quién tiene el acta de una visita ahora (migración 026). Una fila por visita;
-- vence a los 15 minutos sin actividad y la vigencia la mide el servidor.
CREATE TABLE dmc.visita_reserva (
    visita_id    bigint        NOT NULL,
    usuario_id   bigint        NOT NULL,
    tecnico_id   bigint        NOT NULL,
    tomada_en    datetime2(0)  NOT NULL CONSTRAINT df_reserva_tomada   DEFAULT (SYSDATETIME()),
    renovada_en  datetime2(0)  NOT NULL CONSTRAINT df_reserva_renovada DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_visita_reserva  PRIMARY KEY (visita_id),
    CONSTRAINT fk_reserva_visita  FOREIGN KEY (visita_id)  REFERENCES dmc.visita  (id) ON DELETE CASCADE,
    CONSTRAINT fk_reserva_usuario FOREIGN KEY (usuario_id) REFERENCES dmc.usuario (id),
    CONSTRAINT fk_reserva_tecnico FOREIGN KEY (tecnico_id) REFERENCES dmc.tecnico (id)
);
CREATE INDEX ix_reserva_usuario ON dmc.visita_reserva (usuario_id);
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
    ip            varchar(45)   NULL,
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
CREATE INDEX ix_solpass_ip ON dmc.solicitud_password (ip, creado_en) WHERE ip IS NOT NULL;
GO

-- Cada intento de entrar, bueno o malo. Frena los intentos repetidos por
-- cuenta y por origen. Se guarda también el correo que no existe, para que el
-- freno no delate qué correos están dados de alta.
CREATE TABLE dmc.intento_login (
    id         bigint         IDENTITY(1,1) NOT NULL,
    email      nvarchar(160)  NOT NULL,
    ip         varchar(45)    NULL,
    exito      bit            NOT NULL,
    creado_en  datetime2(3)   NOT NULL CONSTRAINT df_intento_login_creado DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_intento_login PRIMARY KEY (id)
);
GO
CREATE INDEX ix_intento_login_email ON dmc.intento_login (email, creado_en) INCLUDE (exito);
GO
CREATE INDEX ix_intento_login_ip ON dmc.intento_login (ip, creado_en) INCLUDE (exito) WHERE ip IS NOT NULL;
GO
CREATE INDEX ix_intento_login_creado ON dmc.intento_login (creado_en);
GO

-- Registro de acciones sensibles (migración 024). Solo se agrega: la app nunca
-- actualiza ni borra filas, y no lleva FK a dmc.usuario para sobrevivir a
-- cualquier cambio de las cuentas.
CREATE TABLE dmc.auditoria (
    id             bigint         IDENTITY(1,1) NOT NULL,
    creado_en      datetime2(3)   NOT NULL CONSTRAINT df_auditoria_creado DEFAULT (SYSDATETIME()),
    usuario_id     bigint         NULL,
    usuario_email  nvarchar(160)  NULL,
    accion         varchar(40)    NOT NULL,
    entidad        varchar(30)    NOT NULL,
    entidad_id     nvarchar(40)   NULL,
    detalle        nvarchar(2000) NULL,
    ip             varchar(45)    NULL,
    CONSTRAINT pk_auditoria PRIMARY KEY (id)
);
GO
CREATE INDEX ix_auditoria_creado ON dmc.auditoria (creado_en DESC);
GO
CREATE INDEX ix_auditoria_entidad ON dmc.auditoria (entidad, entidad_id, creado_en DESC);
GO
CREATE INDEX ix_auditoria_usuario ON dmc.auditoria (usuario_id, creado_en DESC) WHERE usuario_id IS NOT NULL;
GO

-- Versión del esquema (migración 025): una fila por migración aplicada; la
-- versión es la mayor. La app la compara con la que necesita en /api/salud.
CREATE TABLE dmc.schema_version (
    version      smallint       NOT NULL,
    descripcion  nvarchar(200)  NOT NULL,
    aplicada_en  datetime2(0)   NOT NULL CONSTRAINT df_schema_version_aplicada DEFAULT (SYSDATETIME()),
    CONSTRAINT pk_schema_version PRIMARY KEY (version)
);
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
CREATE OR ALTER TRIGGER dmc.tg_marca_actualizado ON dmc.marca AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE m SET actualizado_en = SYSDATETIME() FROM dmc.marca m JOIN inserted i ON i.id = m.id;
END;
GO
CREATE OR ALTER TRIGGER dmc.tg_contacto_actualizado ON dmc.contacto AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE c SET actualizado_en = SYSDATETIME() FROM dmc.contacto c JOIN inserted i ON i.id = c.id;
END;
GO
CREATE OR ALTER TRIGGER dmc.tg_mall_actualizado ON dmc.mall AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE m SET actualizado_en = SYSDATETIME() FROM dmc.mall m JOIN inserted i ON i.id = m.id;
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
CREATE OR ALTER TRIGGER dmc.tg_cat_interno_actualizado ON dmc.catalogo_interno AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE c SET actualizado_en = SYSDATETIME() FROM dmc.catalogo_interno c JOIN inserted i ON i.id = c.id;
END;
GO
CREATE OR ALTER TRIGGER dmc.tg_cat_pendiente_actualizado ON dmc.catalogo_pendiente AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE c SET actualizado_en = SYSDATETIME() FROM dmc.catalogo_pendiente c JOIN inserted i ON i.id = c.id;
END;
GO
CREATE OR ALTER TRIGGER dmc.tg_cat_cargo_actualizado ON dmc.catalogo_cargo AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE c SET actualizado_en = SYSDATETIME() FROM dmc.catalogo_cargo c JOIN inserted i ON i.id = c.id;
END;
GO
CREATE OR ALTER TRIGGER dmc.tg_cat_prob_gestion_actualizado ON dmc.catalogo_problema_gestion AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE c SET actualizado_en = SYSDATETIME()
      FROM dmc.catalogo_problema_gestion c JOIN inserted i ON i.id = c.id;
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
WHERE p.estado <> 'RESUELTO' AND v.activo = 1;
GO

CREATE OR ALTER VIEW dmc.v_carga_tecnico AS
SELECT t.id AS tecnico_id, t.nombre_completo AS tecnico, v.fecha_programada,
       COUNT(*) AS programadas,
       SUM(CASE WHEN v.estado = 'COMPLETADA' THEN 1 ELSE 0 END) AS realizadas,
       SUM(CASE WHEN v.estado IN ('REAGENDADA','PENDIENTE','CANCELADA','CANCELADA_ADMIN')
                THEN 1 ELSE 0 END) AS no_realizadas
FROM dmc.visita v
JOIN dmc.tecnico t ON t.id = v.tecnico_id
WHERE v.activo = 1
GROUP BY t.id, t.nombre_completo, v.fecha_programada;
GO

CREATE OR ALTER VIEW dmc.v_cumplimiento_dia AS
SELECT fecha_programada,
       COUNT(*) AS programadas,
       SUM(CASE WHEN estado = 'COMPLETADA' THEN 1 ELSE 0 END) AS cerradas,
       CAST(ROUND(100.0 * SUM(CASE WHEN estado = 'COMPLETADA' THEN 1 ELSE 0 END)
                  / NULLIF(COUNT(*), 0), 0) AS int) AS pct
FROM dmc.visita
WHERE activo = 1
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
WHERE v.activo = 1
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
WHERE v.estado IN ('COMPLETADA','PENDIENTE') AND v.activo = 1;
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
WHERE v.estado = 'CANCELADA_ADMIN' AND v.activo = 1;
GO

/* =====================================================================
   11. ROLES DEL SISTEMA
   ===================================================================== */
/* El rol «Coordinador»: todo menos cancelar por admin, eliminar visitas y
   administrar roles. Es de sistema: se le editan los permisos, no se borra. */
INSERT INTO dmc.rol (nombre, descripcion, es_sistema)
VALUES (N'Coordinador', N'Agenda, corrige y reprograma visitas, y mantiene los maestros.', 1);

INSERT INTO dmc.rol_permiso (rol_id, permiso)
SELECT (SELECT id FROM dmc.rol WHERE nombre = N'Coordinador'), x.permiso
FROM (VALUES
        ('panel.ver'),
        ('visitas.ver'), ('visitas.crear'), ('visitas.editar'), ('visitas.reprogramar'), ('visitas.enviar'),
        ('reagendas.ver'), ('reagendas.gestionar'),
        ('problemas.ver'), ('problemas.editar'),
        ('tecnicos.ver'), ('tecnicos.crear'), ('tecnicos.editar'),
        ('usuarios.ver'), ('usuarios.crear'), ('usuarios.editar'), ('usuarios.contrasenas'),
        ('clientes.ver'), ('clientes.crear'), ('clientes.editar'),
        ('sucursales.ver'), ('sucursales.crear'), ('sucursales.editar'),
        ('malls.ver'), ('malls.crear'), ('malls.editar'),
        ('marcas.ver'), ('marcas.crear'), ('marcas.editar'),
        ('contactos.ver'), ('contactos.crear'), ('contactos.editar'),
        ('checklist.ver'), ('checklist.editar')
) AS x(permiso);
GO

/* =====================================================================
   12. VERSIÓN DEL ESQUEMA
   ===================================================================== */
/* Este archivo ya trae todo hasta la migración 030. */
INSERT INTO dmc.schema_version (version, descripcion)
VALUES (30, N'Esquema base (incluye las migraciones 002 a 030)');
GO


/* =====================================================================
   Comprobación rápida
     SELECT * FROM dmc.v_cumplimiento_dia ORDER BY fecha_programada;
     SELECT * FROM dmc.v_problema_abierto ORDER BY sucursal;
     SELECT * FROM dmc.v_sucursal_fallas  ORDER BY sin_cerrar DESC;
     SELECT * FROM dmc.v_visita_realizada WHERE tecnico_id = 1 ORDER BY fecha_programada DESC;
   ===================================================================== */

