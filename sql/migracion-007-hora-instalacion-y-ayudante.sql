/* =====================================================================
   DMC Contingencia · migración 007 — hora solo en instalaciones y
   técnico ayudante
   Microsoft SQL Server 2022 · esquema dmc

   Qué cambia, y para qué:

     1. Se elimina ck_visita_hora_instalacion. Exigía hora cuando el motivo
        principal tenía el código INSTALACION, pero ese código hoy se llama
        «Visita preventiva Antenas» (el nombre se edita en el checklist, el
        código no). Resultado: las preventivas pedían hora y las
        instalaciones reales no. La regla pasa a la app, que la decide por el
        nombre del motivo: todo lo que empiece con «Instalación».
     2. dmc.visita.tecnico_ayudante_id ... el segundo técnico cuando van dos
        al mismo local. Opcional; nunca el mismo que tecnico_id. Ve la visita
        en su celular, pero el acta la llena el asignado.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-007-hora-instalacion-y-ayudante.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

/* =====================================================================
   1. Sin CHECK de hora por código de motivo
   ===================================================================== */
IF EXISTS (SELECT 1 FROM sys.check_constraints
            WHERE name = 'ck_visita_hora_instalacion' AND parent_object_id = OBJECT_ID('dmc.visita'))
    ALTER TABLE dmc.visita DROP CONSTRAINT ck_visita_hora_instalacion;
GO

/* =====================================================================
   2. Técnico ayudante
   ===================================================================== */
IF COL_LENGTH('dmc.visita', 'tecnico_ayudante_id') IS NULL
    ALTER TABLE dmc.visita ADD tecnico_ayudante_id bigint NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_visita_ayudante')
    ALTER TABLE dmc.visita ADD CONSTRAINT fk_visita_ayudante
        FOREIGN KEY (tecnico_ayudante_id) REFERENCES dmc.tecnico (id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_visita_ayudante')
    ALTER TABLE dmc.visita ADD CONSTRAINT ck_visita_ayudante
        CHECK (tecnico_ayudante_id IS NULL OR tecnico_ayudante_id <> tecnico_id);
GO

-- El celular del ayudante busca sus visitas por esta columna.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_visita_ayudante' AND object_id = OBJECT_ID('dmc.visita'))
    CREATE INDEX ix_visita_ayudante ON dmc.visita (tecnico_ayudante_id, fecha_programada DESC)
        WHERE tecnico_ayudante_id IS NOT NULL;
GO

PRINT 'Migración 007 aplicada.';
GO
