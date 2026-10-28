/* =====================================================================
   DMC Contingencia · migración 028 — adjuntos del trabajo a realizar
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     dmc.visita_adjunto .. fotos y videos que quien agenda la visita (el panel
                           o el propio técnico en terreno) adjunta a "qué se
                           necesita hacer" para explicar el trabajo. Es una
                           tabla aparte de dmc.visita_foto y dmc.visita_video
                           a propósito: aquellas son la evidencia que el
                           técnico deja en el acta (van al PDF, al correo y a
                           las descargas) y esto es el encargo, que no debe
                           mezclarse con ella.

                           Los bytes viven en la fila, como en la evidencia.
                           Se suben por trozos con .WRITE, igual que el video
                           del acta: la fila nace vacía, y subida_completa = 1
                           la deja utilizable. Una subida cortada deja la fila
                           incompleta y nadie la ve.

                           Límite: 25 MB por archivo. Los clips llegan ya a
                           720p y de hasta un minuto (la app los reajusta en el
                           navegador).

   Requisito: tener aplicada la migración 025 (dmc.schema_version).
   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-028-adjuntos-del-trabajo.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

IF OBJECT_ID('dmc.visita_adjunto', 'U') IS NULL
    CREATE TABLE dmc.visita_adjunto (
        id              bigint         IDENTITY(1,1) NOT NULL,
        visita_id       bigint         NOT NULL,
        tipo            varchar(5)     NOT NULL,           -- FOTO | VIDEO
        nombre          nvarchar(120)  NULL,               -- el nombre del archivo, para descargarlo
        mime            varchar(40)    NOT NULL,
        contenido       varbinary(max) NULL,
        bytes           int            NOT NULL,           -- lo que declaró el navegador
        bytes_recibidos int            NOT NULL CONSTRAINT df_adjunto_recibidos DEFAULT (0),
        duracion_seg    smallint       NULL,
        subida_completa bit            NOT NULL CONSTRAINT df_adjunto_completa DEFAULT (0),
        activo          bit            NOT NULL CONSTRAINT df_adjunto_activo DEFAULT (1),
        subido_por      bigint         NULL,
        subido_en       datetime2(0)   NOT NULL CONSTRAINT df_adjunto_subido DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_visita_adjunto  PRIMARY KEY (id),
        CONSTRAINT fk_adjunto_visita  FOREIGN KEY (visita_id)  REFERENCES dmc.visita  (id) ON DELETE CASCADE,
        CONSTRAINT fk_adjunto_usuario FOREIGN KEY (subido_por) REFERENCES dmc.usuario (id),
        CONSTRAINT ck_adjunto_tipo    CHECK (tipo IN ('FOTO','VIDEO')),
        CONSTRAINT ck_adjunto_mime    CHECK (mime IN ('image/jpeg','image/png','image/webp',
                                                      'video/mp4','video/webm','video/quicktime')),
        CONSTRAINT ck_adjunto_bytes   CHECK (bytes > 0 AND bytes <= 26214400),
        CONSTRAINT ck_adjunto_recibidos CHECK (bytes_recibidos >= 0 AND bytes_recibidos <= bytes),
        CONSTRAINT ck_adjunto_completa  CHECK (subida_completa = 0 OR bytes_recibidos = bytes)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_adjunto_visita' AND object_id = OBJECT_ID('dmc.visita_adjunto'))
    CREATE INDEX ix_adjunto_visita ON dmc.visita_adjunto (visita_id, id)
        WHERE activo = 1 AND subida_completa = 1;
GO

-- Las subidas que nunca terminaron: se limpian aparte.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_adjunto_incompleto' AND object_id = OBJECT_ID('dmc.visita_adjunto'))
    CREATE INDEX ix_adjunto_incompleto ON dmc.visita_adjunto (subido_en) WHERE subida_completa = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dmc.schema_version WHERE version = 28)
    INSERT INTO dmc.schema_version (version, descripcion)
    VALUES (28, N'Adjuntos del trabajo a realizar (dmc.visita_adjunto)');
GO

PRINT 'Migracion 028 aplicada.';
GO
