/* =====================================================================
   DMC Contingencia · migración 020 — secciones de motivos y de trabajos
   Microsoft SQL Server 2022 · esquema dmc

   Qué cambia, y para qué:

     1. dmc.catalogo_seccion ............ una capa por encima de las listas del
                                          checklist. Una sección agrupa motivos
                                          (ej. «Visitas») o agrupa trabajos
                                          realizados (con sus subtrabajos). Es
                                          solo para ordenar y plegar la lista:
                                          no cambia qué trabajos van con cada
                                          motivo.
     2. dmc.catalogo_motivo.seccion_id .. en qué sección está el motivo.
        dmc.catalogo_trabajo.seccion_id   Null = «sin sección»: sigue saliendo,
                                          suelto, como hasta hoy.

   Nada se borra: una sección quitada queda con activo = 0 y sus entradas
   vuelven a «sin sección». Correrla de nuevo no cambia nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-020-secciones.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

IF OBJECT_ID('dmc.catalogo_seccion', 'U') IS NULL
BEGIN
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
END
GO

IF COL_LENGTH('dmc.catalogo_motivo', 'seccion_id') IS NULL
BEGIN
    ALTER TABLE dmc.catalogo_motivo ADD seccion_id bigint NULL
        CONSTRAINT fk_cat_motivo_seccion FOREIGN KEY REFERENCES dmc.catalogo_seccion (id);
END
GO

IF COL_LENGTH('dmc.catalogo_trabajo', 'seccion_id') IS NULL
BEGIN
    ALTER TABLE dmc.catalogo_trabajo ADD seccion_id bigint NULL
        CONSTRAINT fk_cat_trabajo_seccion FOREIGN KEY REFERENCES dmc.catalogo_seccion (id);
END
GO

PRINT 'Migración 020 aplicada.';
GO
