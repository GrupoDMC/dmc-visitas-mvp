/* =====================================================================
   DMC Contingencia · migración 026 — reserva del acta
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     dmc.visita_reserva .. una fila por visita con acta en curso: quién la
                           tiene, desde cuándo y cuándo fue su última
                           actividad. Cuando el asignado y el ayudante abren
                           el acta a la vez, el primero la reserva y el otro
                           solo la ve; la reserva vence a los 15 minutos sin
                           actividad y se libera sola al guardar el acta, salir
                           del formulario o cerrar sesión.

                           La vigencia la decide el servidor con su propio
                           reloj (renovada_en contra SYSDATETIME()), nunca la
                           hora del celular. La toma y la renovación corren con
                           la fila de la visita bloqueada (UPDLOCK), así que dos
                           técnicos a la vez no pueden quedar los dos con ella.

   Requisito: tener aplicada la migración 025 (dmc.schema_version).
   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-026-reserva-del-acta.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

IF OBJECT_ID('dmc.visita_reserva', 'U') IS NULL
    CREATE TABLE dmc.visita_reserva (
        visita_id    bigint        NOT NULL,
        usuario_id   bigint        NOT NULL,
        tecnico_id   bigint        NOT NULL,
        tomada_en    datetime2(0)  NOT NULL CONSTRAINT df_reserva_tomada   DEFAULT (SYSDATETIME()),
        renovada_en  datetime2(0)  NOT NULL CONSTRAINT df_reserva_renovada DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_visita_reserva         PRIMARY KEY (visita_id),
        CONSTRAINT fk_reserva_visita  FOREIGN KEY (visita_id)  REFERENCES dmc.visita  (id) ON DELETE CASCADE,
        CONSTRAINT fk_reserva_usuario FOREIGN KEY (usuario_id) REFERENCES dmc.usuario (id),
        CONSTRAINT fk_reserva_tecnico FOREIGN KEY (tecnico_id) REFERENCES dmc.tecnico (id)
    );
GO

-- Soltar las reservas de un usuario al cerrar sesión busca por usuario.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_reserva_usuario' AND object_id = OBJECT_ID('dmc.visita_reserva'))
    CREATE INDEX ix_reserva_usuario ON dmc.visita_reserva (usuario_id);
GO

IF NOT EXISTS (SELECT 1 FROM dmc.schema_version WHERE version = 26)
    INSERT INTO dmc.schema_version (version, descripcion)
    VALUES (26, N'Reserva del acta (dmc.visita_reserva)');
GO

PRINT 'Migracion 026 aplicada.';
GO
