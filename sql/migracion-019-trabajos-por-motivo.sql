/* =====================================================================
   DMC Contingencia · migración 019 — los trabajos cuelgan del motivo
   Microsoft SQL Server 2022 · esquema dmc

   Qué cambia, y para qué:

     1. dmc.catalogo_motivo_trabajo.orden . el orden de los trabajos DENTRO
                                            de cada motivo. Antes había un solo
                                            orden global; ahora cada motivo
                                            ordena los suyos.
     2. Fin de «sin motivos = en todos» ... hasta ahora un trabajo sin filas en
                                            dmc.catalogo_motivo_trabajo se
                                            ofrecía bajo cualquier motivo. Desde
                                            esta migración el técnico solo ve
                                            los trabajos enlazados al motivo.
                                            Para que nada cambie el día que se
                                            corre, cada trabajo activo que hoy
                                            no tiene motivos queda enlazado a
                                            todos los motivos activos; después
                                            se depuran desde el panel
                                            (Checklist → Motivos y trabajos).

   El enlace del punto 2 se hace solo la primera vez, cuando se agrega la
   columna: correrla de nuevo no vuelve a enlazar un trabajo que el panel
   dejó sin motivos a propósito.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-019-trabajos-por-motivo.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

IF COL_LENGTH('dmc.catalogo_motivo_trabajo', 'orden') IS NULL
BEGIN
    BEGIN TRANSACTION;

    ALTER TABLE dmc.catalogo_motivo_trabajo
        ADD orden smallint NOT NULL CONSTRAINT df_cat_mot_trab_orden DEFAULT (0);

    -- La columna recién nacida no se puede nombrar en el mismo lote: va dinámico.
    EXEC (N'
        -- Lo que ya estaba enlazado toma el orden global del trabajo.
        UPDATE mt SET orden = t.orden
          FROM dmc.catalogo_motivo_trabajo mt
          JOIN dmc.catalogo_trabajo t ON t.id = mt.trabajo_id;

        -- Los trabajos que se ofrecían «en todos» quedan enlazados a todos.
        INSERT INTO dmc.catalogo_motivo_trabajo (motivo_id, trabajo_id, orden)
        SELECT m.id, t.id, t.orden
          FROM dmc.catalogo_trabajo t
         CROSS JOIN dmc.catalogo_motivo m
         WHERE t.activo = 1 AND m.activo = 1
           AND NOT EXISTS (SELECT 1 FROM dmc.catalogo_motivo_trabajo x WHERE x.trabajo_id = t.id);
    ');

    COMMIT TRANSACTION;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_cat_mot_trab_motivo' AND object_id = OBJECT_ID('dmc.catalogo_motivo_trabajo'))
    CREATE INDEX ix_cat_mot_trab_motivo ON dmc.catalogo_motivo_trabajo (motivo_id, orden);
GO

PRINT 'Migración 019 aplicada.';
GO
