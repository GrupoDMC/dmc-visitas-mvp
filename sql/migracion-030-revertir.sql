/* =====================================================================
   DMC Contingencia · reversa de la migración 030
   Microsoft SQL Server 2022 · esquema dmc

   Deshace el aviso de problemas al agendar.

   OJO: es destructiva para lo registrado desde la 030.
     - Se pierde el registro de los avisos y de lo que se respondió.
     - Se pierde lo que respondió cada acta sobre los problemas que venía a
       resolver (el vínculo visita ↔ problema se conserva).
     - Los problemas que estén en AGENDADO vuelven a ABIERTO, con su fila en la
       bitácora, antes de quitar el estado del catálogo.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-030-revertir.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

BEGIN TRANSACTION;

INSERT INTO dmc.problema_historial (problema_id, campo, valor_anterior, valor_nuevo, motivo)
SELECT id, 'ESTADO', 'AGENDADO', 'ABIERTO', N'Reversa de la migración 030.'
  FROM dmc.problema WHERE estado = 'AGENDADO';

UPDATE dmc.problema SET estado = 'ABIERTO' WHERE estado = 'AGENDADO';

DELETE FROM dmc.catalogo_problema_estado WHERE codigo = 'AGENDADO';

IF OBJECT_ID('dmc.visita_aviso_problema_detalle', 'U') IS NOT NULL
    DROP TABLE dmc.visita_aviso_problema_detalle;

IF OBJECT_ID('dmc.visita_aviso_problema', 'U') IS NOT NULL
    DROP TABLE dmc.visita_aviso_problema;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_pvr_visita' AND object_id = OBJECT_ID('dmc.problema_visita_resolucion'))
    DROP INDEX ix_pvr_visita ON dmc.problema_visita_resolucion;

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_pvr_resultado')
    ALTER TABLE dmc.problema_visita_resolucion DROP CONSTRAINT ck_pvr_resultado;

IF COL_LENGTH('dmc.problema_visita_resolucion', 'resultado') IS NOT NULL
    ALTER TABLE dmc.problema_visita_resolucion DROP COLUMN resultado, respondido_en;

DELETE FROM dmc.schema_version WHERE version = 30;

COMMIT;
GO

PRINT 'Migración 030 revertida.';
GO
