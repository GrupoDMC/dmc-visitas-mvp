/* =====================================================================
   DMC Contingencia · migración 030 — aviso de problemas al agendar
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. Estado AGENDADO ........... en dmc.catalogo_problema_estado (Lista 7).
                                    Lo pone la app cuando se agenda una visita
                                    para resolver el problema, y lo saca el
                                    acta de esa visita: RESUELTO si quedó
                                    solucionado, ABIERTO si no. Es del sistema,
                                    como ABIERTO y RESUELTO: se renombra pero no
                                    se quita.

     2. dmc.visita_aviso_problema  cada vez que, al agendar o reprogramar, la
        y su _detalle              sucursal tenía problemas sin resolver: qué
                                   se respondió (RESUELVE / OTRA_COSA), quién,
                                   cuándo, y qué problemas se mostraron. Así
                                   queda registro aunque la respuesta sea
                                   "otra cosa" y no se vincule nada.

     3. dmc.problema_visita_resolucion.resultado
                                   lo que dijo el técnico en el acta sobre cada
                                   problema que la visita venía a resolver:
                                   RESUELTO o NO_RESUELTO. NULL = sin acta aún.
                                   El vínculo visita ↔ problema ya existía en
                                   esta tabla; no se crea otra.

   Sin triggers en las tablas nuevas: la app recoge el id con SCOPE_IDENTITY().

   Requisito: tener aplicada la migración 029.
   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-030-aviso-de-problemas-al-agendar.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

IF NOT EXISTS (SELECT 1 FROM dmc.schema_version WHERE version = 29)
    THROW 50030, 'Falta aplicar la migración 029 antes que esta.', 1;
GO

/* =====================================================================
   1. Estado AGENDADO, justo después de ABIERTO
   ===================================================================== */
IF NOT EXISTS (SELECT 1 FROM dmc.catalogo_problema_estado WHERE codigo = 'AGENDADO')
BEGIN
    DECLARE @tras smallint = (SELECT orden FROM dmc.catalogo_problema_estado WHERE codigo = 'ABIERTO');
    UPDATE dmc.catalogo_problema_estado SET orden = orden + 1 WHERE orden > @tras;
    -- Si ya hay un estado llamado "Agendado" creado a mano, el nombre choca con
    -- la unicidad: el del sistema se llama distinto y se puede renombrar luego.
    INSERT INTO dmc.catalogo_problema_estado (codigo, nombre, orden)
    VALUES ('AGENDADO',
            CASE WHEN EXISTS (SELECT 1 FROM dmc.catalogo_problema_estado WHERE nombre = N'Agendado')
                 THEN N'Visita agendada' ELSE N'Agendado' END,
            @tras + 1);
END
GO

/* =====================================================================
   2. dmc.visita_aviso_problema y su detalle
   ===================================================================== */
IF OBJECT_ID('dmc.visita_aviso_problema', 'U') IS NULL
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

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_aviso_problema_visita' AND object_id = OBJECT_ID('dmc.visita_aviso_problema'))
    CREATE INDEX ix_aviso_problema_visita ON dmc.visita_aviso_problema (visita_id, creado_en DESC);
GO

-- Los problemas que estaban sin resolver cuando se mostró el aviso.
IF OBJECT_ID('dmc.visita_aviso_problema_detalle', 'U') IS NULL
    CREATE TABLE dmc.visita_aviso_problema_detalle (
        aviso_id     bigint  NOT NULL,
        problema_id  bigint  NOT NULL,
        CONSTRAINT pk_visita_aviso_problema_detalle PRIMARY KEY (aviso_id, problema_id),
        CONSTRAINT fk_aviso_detalle_aviso    FOREIGN KEY (aviso_id)    REFERENCES dmc.visita_aviso_problema (id) ON DELETE CASCADE,
        CONSTRAINT fk_aviso_detalle_problema FOREIGN KEY (problema_id) REFERENCES dmc.problema (id)
    );
GO

/* =====================================================================
   3. Lo que respondió el acta sobre cada problema que venía a resolver
   ===================================================================== */
IF COL_LENGTH('dmc.problema_visita_resolucion', 'resultado') IS NULL
    ALTER TABLE dmc.problema_visita_resolucion ADD
        resultado      varchar(12)   NULL,
        respondido_en  datetime2(0)  NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_pvr_resultado')
    ALTER TABLE dmc.problema_visita_resolucion ADD CONSTRAINT ck_pvr_resultado
        CHECK (resultado IS NULL OR resultado IN ('RESUELTO','NO_RESUELTO'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_pvr_visita' AND object_id = OBJECT_ID('dmc.problema_visita_resolucion'))
    CREATE INDEX ix_pvr_visita ON dmc.problema_visita_resolucion (visita_id);
GO

IF NOT EXISTS (SELECT 1 FROM dmc.schema_version WHERE version = 30)
    INSERT INTO dmc.schema_version (version, descripcion)
    VALUES (30, N'Aviso de problemas al agendar y su resolución en el acta');
GO

PRINT 'Migración 030 aplicada.';
GO
