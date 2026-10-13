/* =====================================================================
   DMC Contingencia · migración 025 — versión del esquema e índice por cliente
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.schema_version .. una fila por migración aplicada. La versión del
                              esquema es la mayor. La app ya no pregunta en
                              cada petición si existe tal tabla o tal columna:
                              da por hecho que la base está al día y
                              /api/salud avisa si no lo está.

     2. ix_visita_cliente ..... la lista de Visitas filtra y pagina en el
                              servidor, y la ficha del cliente lee sus visitas:
                              las dos buscan por cliente y ordenan por fecha.

   Desde esta migración, cada migración nueva termina registrando su número
   en dmc.schema_version.

   Requisito: tener aplicadas todas las migraciones hasta la 024. La app ya no
   tiene caminos alternativos para una base sin ellas.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-025-version-del-esquema.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

IF OBJECT_ID('dmc.schema_version', 'U') IS NULL
    CREATE TABLE dmc.schema_version (
        version      smallint       NOT NULL,
        descripcion  nvarchar(200)  NOT NULL,
        aplicada_en  datetime2(0)   NOT NULL CONSTRAINT df_schema_version_aplicada DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_schema_version PRIMARY KEY (version)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_visita_cliente' AND object_id = OBJECT_ID('dmc.visita'))
    CREATE INDEX ix_visita_cliente ON dmc.visita (cliente_id, fecha_programada DESC);
GO

IF NOT EXISTS (SELECT 1 FROM dmc.schema_version WHERE version = 25)
    INSERT INTO dmc.schema_version (version, descripcion)
    VALUES (25, N'Versión del esquema (incluye las migraciones 002 a 024)');
GO

PRINT 'Migracion 025 aplicada.';
GO
