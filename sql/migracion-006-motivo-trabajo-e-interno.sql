/* =====================================================================
   DMC Contingencia · migración 006 — trabajos por motivo, comentario
   interno con checklist propio y código de sucursal opcional
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.sucursal.codigo NULL ......... el código interno deja de ser
                                           obligatorio. La unicidad pasa a un
                                           índice filtrado: dos sucursales sin
                                           código ya no chocan entre sí.
     2. dmc.catalogo_motivo_trabajo ...... qué trabajos corresponden a cada
                                           motivo. En el acta, bajo cada motivo
                                           marcado solo se ofrecen sus trabajos,
                                           así el técnico no recorre la lista
                                           entera. Un trabajo sin ninguna fila
                                           acá se ofrece en todos los motivos.
     3. dmc.visita_trabajo.motivo_codigo . bajo qué motivo se registró cada
                                           trabajo del acta.
     4. dmc.catalogo_interno ............. el checklist del comentario interno
                                           (lo edita el panel, lo marca el
                                           técnico, no lo ve el cliente).
     5. dmc.visita_interno ............... lo que el técnico marcó de ese
                                           checklist en cada acta.
     6. interno en visita_foto y
        visita_video ..................... fotos y clips del comentario interno:
                                           quedan en el acta para coordinación
                                           pero no salen en el PDF ni en el
                                           correo al cliente.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-006-motivo-trabajo-e-interno.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

/* =====================================================================
   1. dmc.sucursal.codigo opcional
   ---------------------------------------------------------------------
   Un UNIQUE normal de SQL Server admite un solo NULL; por eso se cambia por
   un índice único filtrado con el mismo nombre (así el mensaje de error de la
   app, que busca uq_sucursal_codigo, sigue funcionando).
   ===================================================================== */
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'uq_sucursal_codigo' AND parent_object_id = OBJECT_ID('dmc.sucursal'))
    ALTER TABLE dmc.sucursal DROP CONSTRAINT uq_sucursal_codigo;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dmc.sucursal') AND name = 'codigo' AND is_nullable = 0)
    ALTER TABLE dmc.sucursal ALTER COLUMN codigo varchar(20) NULL;
GO

-- Un código en blanco es "sin código".
UPDATE dmc.sucursal SET codigo = NULL WHERE codigo IS NOT NULL AND LTRIM(RTRIM(codigo)) = '';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_sucursal_codigo' AND object_id = OBJECT_ID('dmc.sucursal'))
    CREATE UNIQUE INDEX uq_sucursal_codigo ON dmc.sucursal (codigo) WHERE codigo IS NOT NULL;
GO

/* =====================================================================
   2. dmc.catalogo_motivo_trabajo — trabajos que van con cada motivo
   ===================================================================== */
IF OBJECT_ID('dmc.catalogo_motivo_trabajo', 'U') IS NULL
BEGIN
    CREATE TABLE dmc.catalogo_motivo_trabajo (
        motivo_id   bigint  NOT NULL,
        trabajo_id  bigint  NOT NULL,
        CONSTRAINT pk_catalogo_motivo_trabajo PRIMARY KEY (motivo_id, trabajo_id),
        CONSTRAINT fk_cat_mot_trab_motivo  FOREIGN KEY (motivo_id)  REFERENCES dmc.catalogo_motivo (id)  ON DELETE CASCADE,
        CONSTRAINT fk_cat_mot_trab_trabajo FOREIGN KEY (trabajo_id) REFERENCES dmc.catalogo_trabajo (id) ON DELETE CASCADE
    );
    CREATE INDEX ix_cat_mot_trab_trabajo ON dmc.catalogo_motivo_trabajo (trabajo_id);
END
GO

/* =====================================================================
   3. dmc.visita_trabajo.motivo_codigo
   ===================================================================== */
IF COL_LENGTH('dmc.visita_trabajo', 'motivo_codigo') IS NULL
    ALTER TABLE dmc.visita_trabajo ADD motivo_codigo varchar(40) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_vis_trab_motivo')
    ALTER TABLE dmc.visita_trabajo
      ADD CONSTRAINT fk_vis_trab_motivo FOREIGN KEY (motivo_codigo) REFERENCES dmc.catalogo_motivo (codigo);
GO

/* =====================================================================
   4. dmc.catalogo_interno — checklist del comentario interno
   ===================================================================== */
IF OBJECT_ID('dmc.catalogo_interno', 'U') IS NULL
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

CREATE OR ALTER TRIGGER dmc.tg_cat_interno_actualizado ON dmc.catalogo_interno AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE c SET actualizado_en = SYSDATETIME() FROM dmc.catalogo_interno c JOIN inserted i ON i.id = c.id;
END;
GO

/* =====================================================================
   5. dmc.visita_interno — lo marcado en cada acta
   ===================================================================== */
IF OBJECT_ID('dmc.visita_interno', 'U') IS NULL
BEGIN
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
END
GO

/* =====================================================================
   6. Fotos y videos internos
   ===================================================================== */
IF COL_LENGTH('dmc.visita_foto', 'interno') IS NULL
    ALTER TABLE dmc.visita_foto ADD interno bit NOT NULL CONSTRAINT df_foto_interno DEFAULT (0);
GO

IF COL_LENGTH('dmc.visita_video', 'interno') IS NULL
    ALTER TABLE dmc.visita_video ADD interno bit NOT NULL CONSTRAINT df_video_interno DEFAULT (0);
GO

PRINT 'Migración 006 aplicada.';
GO
