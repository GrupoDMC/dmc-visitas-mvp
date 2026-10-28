/* =====================================================================
   DMC Contingencia · migración 027 — edición habilitada al técnico
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     dmc.visita_ejecucion.edicion_tecnico_hasta ..
                           hasta cuándo el técnico puede corregir su acta
                           aunque ya pasara el plazo de un día. Coordinación
                           lo abre con «Permitir editar al técnico» (5
                           minutos) y se borra solo al guardar la edición.
                           NULL = sin habilitación; rige el plazo normal.

                           La vigencia la decide el servidor con su propio
                           reloj (SYSDATETIME()), nunca la hora del celular.

   Requisito: tener aplicada la migración 026.
   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-027-edicion-habilitada-al-tecnico.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

IF COL_LENGTH('dmc.visita_ejecucion', 'edicion_tecnico_hasta') IS NULL
    ALTER TABLE dmc.visita_ejecucion ADD edicion_tecnico_hasta datetime2(0) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM dmc.schema_version WHERE version = 27)
    INSERT INTO dmc.schema_version (version, descripcion)
    VALUES (27, N'Edición habilitada al técnico (visita_ejecucion.edicion_tecnico_hasta)');
GO

PRINT 'Migracion 027 aplicada.';
GO
