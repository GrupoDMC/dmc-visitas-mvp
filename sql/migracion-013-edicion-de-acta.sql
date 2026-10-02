/* =====================================================================
   DMC Contingencia · migración 013 — edición del acta ya cerrada
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.visita_edicion ....... la bitácora de cada corrección hecha a un
                                   acta después de cerrarla: quién, cuándo,
                                   desde dónde (celular o panel), qué partes
                                   tocó, qué cambió exactamente y por qué.
                                   El técnico puede editar su acta hasta un
                                   día después de cerrarla; el administrador,
                                   sin plazo. La firma de la tienda no se toca.
                                   El PDF del acta no menciona las ediciones:
                                   este registro es interno.

   El permiso nuevo (visitas.editarActa) no necesita filas acá: lo tiene el
   administrador, y a los demás roles se les da desde Maestros › Usuarios ›
   Roles.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-013-edicion-de-acta.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

/* =====================================================================
   1. Bitácora de ediciones del acta
   ===================================================================== */
IF OBJECT_ID('dmc.visita_edicion', 'U') IS NULL
    CREATE TABLE dmc.visita_edicion (
        id          bigint        IDENTITY(1,1) NOT NULL,
        visita_id   bigint        NOT NULL,
        origen      varchar(6)    NOT NULL,      -- MOVIL = el técnico, WEB = el panel
        usuario_id  bigint        NOT NULL,
        tecnico_id  bigint        NULL,
        motivo      nvarchar(max) NOT NULL,      -- por qué se cambió
        secciones   nvarchar(400) NOT NULL,      -- qué partes: "Responsable de tienda · Fotos y video"
        detalle     nvarchar(max) NOT NULL,      -- qué cambió, una línea por cambio
        editado_en  datetime2(0)  NOT NULL CONSTRAINT df_visita_edicion_en DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_visita_edicion PRIMARY KEY (id),
        CONSTRAINT fk_visita_edicion_visita  FOREIGN KEY (visita_id)  REFERENCES dmc.visita  (id) ON DELETE CASCADE,
        CONSTRAINT fk_visita_edicion_usuario FOREIGN KEY (usuario_id) REFERENCES dmc.usuario (id),
        CONSTRAINT fk_visita_edicion_tecnico FOREIGN KEY (tecnico_id) REFERENCES dmc.tecnico (id),
        CONSTRAINT ck_visita_edicion_origen  CHECK (origen IN ('MOVIL','WEB'))
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_visita_edicion_visita')
    CREATE INDEX ix_visita_edicion_visita ON dmc.visita_edicion (visita_id, editado_en DESC);
GO

PRINT 'Migración 013 aplicada.';
GO
