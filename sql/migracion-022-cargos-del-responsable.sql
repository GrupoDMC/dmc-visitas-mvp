/* =====================================================================
   DMC Contingencia · migración 022 — cargos del responsable de tienda
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.catalogo_cargo ............ la lista fija de cargos ("Jefe de
                                        tienda", "Encargado de seguridad"…)
                                        que se ofrece al agendar y al llenar
                                        el acta. Se arma en Maestros ›
                                        Checklist, como el resto de las listas.
     2. dmc.visita.responsable_cargo .. el cargo que se anotó al agendar.
     3. dmc.visita_ejecucion.responsable_cargo
                                        el cargo de quien firmó esa acta. Es el
                                        que se ve en el acta y en el PDF.

   El cargo se guarda como texto (el nombre que tenía al momento): renombrar o
   quitar un cargo del checklist no cambia las actas ya cerradas.

   Siempre es opcional: queda NULL si no se elige.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-022-cargos-del-responsable.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

IF OBJECT_ID('dmc.catalogo_cargo', 'U') IS NULL
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

CREATE OR ALTER TRIGGER dmc.tg_cat_cargo_actualizado ON dmc.catalogo_cargo AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE c SET actualizado_en = SYSDATETIME() FROM dmc.catalogo_cargo c JOIN inserted i ON i.id = c.id;
END;
GO

IF COL_LENGTH('dmc.visita', 'responsable_cargo') IS NULL
    ALTER TABLE dmc.visita ADD responsable_cargo nvarchar(80) NULL;
GO

IF COL_LENGTH('dmc.visita_ejecucion', 'responsable_cargo') IS NULL
    ALTER TABLE dmc.visita_ejecucion ADD responsable_cargo nvarchar(80) NULL;
GO

PRINT 'Migracion 022 aplicada.';
GO
