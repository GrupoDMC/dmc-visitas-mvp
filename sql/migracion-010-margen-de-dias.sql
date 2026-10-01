/* =====================================================================
   DMC Contingencia · migración 010 — margen de días en la visita
   Microsoft SQL Server 2022 · esquema dmc

   Qué cambia, y para qué:

     1. dmc.visita.fecha_hasta ... el último día en que se puede hacer la
        visita. Vacío = la visita es de un solo día, como hasta ahora. Con
        valor, la visita se puede hacer cualquier día entre
        fecha_programada y fecha_hasta: al técnico le aparece en «Hoy»
        todos esos días mientras no la cierre, y la cancelación automática
        cuenta el plazo desde fecha_hasta.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-010-margen-de-dias.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

IF COL_LENGTH('dmc.visita', 'fecha_hasta') IS NULL
    ALTER TABLE dmc.visita ADD fecha_hasta date NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_visita_fecha_hasta')
    ALTER TABLE dmc.visita ADD CONSTRAINT ck_visita_fecha_hasta
        CHECK (fecha_hasta IS NULL OR fecha_hasta > fecha_programada);
GO

PRINT 'Migración 010 aplicada.';
GO
