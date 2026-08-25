/* =====================================================================
   DMC Contingencia · migración 003 — video en el acta y cancelación por admin
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.visita_video ................. el técnico puede grabar hasta
                                           1 minuto en 720p por clip y dejarlo
                                           en el acta, igual que una foto.
                                           Los bytes viven en la tabla: no hay
                                           almacenamiento de archivos
                                           contratado.
     2. subida por partes ................ el video no cabe en un solo
                                           request (Vercel corta el cuerpo en
                                           4,5 MB). La fila nace vacía, se le
                                           van pegando trozos con .WRITE y
                                           recién al final queda utilizable.
     3. adjunto de tipo VIDEO ............ el correo del acta puede llevar el
                                           clip entre sus adjuntos.
     4. CANCELADA_ADMIN .................. el administrador cierra por su
                                           cuenta una visita que quedó vieja o
                                           que ya no sirve. Es una cancelación,
                                           pero se distingue de la que hace el
                                           técnico en terreno.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-003-video-y-cancelacion-admin.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

/* =====================================================================
   1. VIDEO DEL TRABAJO
   ---------------------------------------------------------------------
   Mismo trato que dmc.visita_foto: los bytes van en la fila y archivo_url
   es la ruta interna con la que la app lo sirve (/api/visita/video/<id>).

   Los tres límites del formulario quedan escritos también acá, para que
   no dependan solo de lo que valide el celular:

     · duración   ..... 60 segundos como máximo
     · resolución ..... 720p, en horizontal (1280x720) o vertical (720x1280)
     · peso       ..... 25 MB por clip

   subida_completa separa el clip utilizable del que se quedó a medias
   cuando se cortó la señal en mitad del envío: hasta que no llega el
   último trozo, la fila existe pero el acta no la muestra.
   ===================================================================== */
IF OBJECT_ID('dmc.visita_video', 'U') IS NULL
BEGIN
    CREATE TABLE dmc.visita_video (
        id              bigint         IDENTITY(1,1) NOT NULL,
        visita_id       bigint         NOT NULL,
        problema_id     bigint         NULL,
        etiqueta        nvarchar(40)   NULL,
        archivo_url     nvarchar(400)  NOT NULL CONSTRAINT df_video_url DEFAULT (''),
        contenido       varbinary(max) NULL,       -- los bytes del clip
        mime            varchar(40)    NOT NULL CONSTRAINT df_video_mime DEFAULT ('video/mp4'),
        bytes           int            NULL,       -- lo que declaró el celular
        bytes_recibidos int            NOT NULL CONSTRAINT df_video_recibidos DEFAULT (0),
        duracion_seg    smallint       NULL,
        ancho           smallint       NULL,
        alto            smallint       NULL,
        orden           smallint       NOT NULL CONSTRAINT df_video_orden DEFAULT (0),
        subida_completa bit            NOT NULL CONSTRAINT df_video_completa DEFAULT (0),
        activo          bit            NOT NULL CONSTRAINT df_video_activo DEFAULT (1),
        grabado_en      datetime2(0)   NULL,
        subido_en       datetime2(0)   NOT NULL CONSTRAINT df_video_subido DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_visita_video   PRIMARY KEY (id),
        CONSTRAINT fk_video_visita   FOREIGN KEY (visita_id)   REFERENCES dmc.visita   (id) ON DELETE CASCADE,
        CONSTRAINT fk_video_problema FOREIGN KEY (problema_id) REFERENCES dmc.problema (id),
        CONSTRAINT ck_video_mime     CHECK (mime IN ('video/mp4','video/webm','video/quicktime')),
        CONSTRAINT ck_video_duracion CHECK (duracion_seg IS NULL OR (duracion_seg > 0 AND duracion_seg <= 60)),
        -- 720p: el lado mayor no pasa de 1280 y el menor no pasa de 720.
        CONSTRAINT ck_video_resolucion CHECK (
            (ancho IS NULL AND alto IS NULL) OR
            (ancho BETWEEN 1 AND 1280 AND alto BETWEEN 1 AND 1280 AND (ancho <= 720 OR alto <= 720))),
        CONSTRAINT ck_video_bytes    CHECK (bytes IS NULL OR (bytes > 0 AND bytes <= 26214400)),
        CONSTRAINT ck_video_recibidos CHECK (bytes_recibidos >= 0 AND bytes_recibidos <= 26214400),
        -- Un clip marcado como completo tiene que tener todo lo que declaró.
        CONSTRAINT ck_video_completa CHECK (
            subida_completa = 0 OR (bytes IS NOT NULL AND bytes_recibidos = bytes))
    );

    CREATE INDEX ix_video_visita ON dmc.visita_video (visita_id, orden)
        WHERE activo = 1 AND subida_completa = 1;

    -- Los clips que nunca terminaron de subir: se limpian aparte.
    CREATE INDEX ix_video_incompleto ON dmc.visita_video (subido_en) WHERE subida_completa = 0;
END
GO

/* =====================================================================
   2. EL CLIP TAMBIÉN SE PUEDE ADJUNTAR AL CORREO DEL ACTA
   ===================================================================== */
IF COL_LENGTH('dmc.acta_envio_adjunto', 'visita_video_id') IS NULL
    ALTER TABLE dmc.acta_envio_adjunto ADD visita_video_id bigint NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_adj_video')
    ALTER TABLE dmc.acta_envio_adjunto
        ADD CONSTRAINT fk_adj_video FOREIGN KEY (visita_video_id) REFERENCES dmc.visita_video (id);
GO

/* tipo y origen tenían FOTO / FIRMA / PDF_ACTA; ahora entra VIDEO. */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_adj_tipo')
    ALTER TABLE dmc.acta_envio_adjunto DROP CONSTRAINT ck_adj_tipo;
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_adj_origen')
    ALTER TABLE dmc.acta_envio_adjunto DROP CONSTRAINT ck_adj_origen;
GO

ALTER TABLE dmc.acta_envio_adjunto
    ADD CONSTRAINT ck_adj_tipo CHECK (tipo IN ('FOTO','FIRMA','VIDEO','PDF_ACTA'));
GO

ALTER TABLE dmc.acta_envio_adjunto
    ADD CONSTRAINT ck_adj_origen CHECK (
        (tipo = 'FOTO'  AND visita_foto_id  IS NOT NULL) OR
        (tipo = 'FIRMA' AND visita_firma_id IS NOT NULL) OR
        (tipo = 'VIDEO' AND visita_video_id IS NOT NULL) OR
        (tipo = 'PDF_ACTA'));
GO

/* =====================================================================
   3. CANCELADA POR ADMINISTRACIÓN
   ---------------------------------------------------------------------
   Una visita que quedó dando vueltas —la tienda cerró, el equipo se
   cambió, pasaron tres meses— no la puede arrastrar el técnico para
   siempre. El administrador la cierra desde el panel.

   Es un estado propio y no CANCELADA a secas porque la diferencia
   importa al leer la ficha: una la canceló el técnico parado en la
   puerta de la tienda, la otra la cerró administración desde la oficina.

   Se aplica solo a visitas PROGRAMADA o EN_CURSO. Una COMPLETADA ya
   tiene acta firmada y no se toca; eso lo hace cumplir la aplicación.

   El estado pasa de varchar(12) a varchar(16): 'CANCELADA_ADMIN' son 15
   caracteres. La columna está indexada y tiene CHECK, así que hay que
   soltar los dos antes de cambiarle el tipo.
   ===================================================================== */

/* --- dmc.visita ------------------------------------------------------ */
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_visita_estado' AND object_id = OBJECT_ID('dmc.visita'))
    DROP INDEX ix_visita_estado ON dmc.visita;
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_visita_estado')
    ALTER TABLE dmc.visita DROP CONSTRAINT ck_visita_estado;
GO

IF COL_LENGTH('dmc.visita', 'estado') < 16
    ALTER TABLE dmc.visita ALTER COLUMN estado varchar(16) NOT NULL;
GO

ALTER TABLE dmc.visita
    ADD CONSTRAINT ck_visita_estado CHECK (estado IN
        ('PROGRAMADA','EN_CURSO','COMPLETADA','PENDIENTE','REAGENDADA','CANCELADA','CANCELADA_ADMIN'));
GO

CREATE INDEX ix_visita_estado ON dmc.visita (estado, fecha_programada DESC);
GO

/* --- dmc.visita_estado_historial ------------------------------------- */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_hist_estado')
    ALTER TABLE dmc.visita_estado_historial DROP CONSTRAINT ck_hist_estado;
GO

IF COL_LENGTH('dmc.visita_estado_historial', 'estado') < 16
    ALTER TABLE dmc.visita_estado_historial ALTER COLUMN estado varchar(16) NOT NULL;
GO

ALTER TABLE dmc.visita_estado_historial
    ADD CONSTRAINT ck_hist_estado CHECK (estado IN
        ('PROGRAMADA','EN_CURSO','COMPLETADA','PENDIENTE','REAGENDADA','CANCELADA','CANCELADA_ADMIN'));
GO

/* =====================================================================
   4. VISTAS QUE CONTABAN LOS ESTADOS
   ---------------------------------------------------------------------
   v_carga_tecnico sumaba las no realizadas por lista de estados: si no se
   agrega el nuevo, una visita cerrada por administración desaparece de la
   cuenta y los totales del panel dejan de cuadrar.
   ===================================================================== */
CREATE OR ALTER VIEW dmc.v_carga_tecnico AS
SELECT t.id AS tecnico_id, t.nombre_completo AS tecnico, v.fecha_programada,
       COUNT(*) AS programadas,
       SUM(CASE WHEN v.estado = 'COMPLETADA' THEN 1 ELSE 0 END) AS realizadas,
       SUM(CASE WHEN v.estado IN ('REAGENDADA','PENDIENTE','CANCELADA','CANCELADA_ADMIN')
                THEN 1 ELSE 0 END) AS no_realizadas
FROM dmc.visita v
JOIN dmc.tecnico t ON t.id = v.tecnico_id
GROUP BY t.id, t.nombre_completo, v.fecha_programada;
GO

/* Quién cerró la visita desde el panel, cuándo y con qué explicación.
   El motivo no vive en dmc.visita: lo deja la bitácora, igual que el de
   una visita PENDIENTE o CANCELADA. */
CREATE OR ALTER VIEW dmc.v_visita_cancelada_admin AS
SELECT v.id AS visita_id, v.folio, v.fecha_programada, v.tecnico_id,
       t.nombre_completo AS tecnico,
       s.nombre AS sucursal, c.nombre_fantasia AS cliente,
       h.motivo, h.ocurrido_en AS cancelada_en,
       h.usuario_id AS cancelada_por, u.email AS cancelada_por_email
FROM dmc.visita v
JOIN dmc.tecnico  t ON t.id = v.tecnico_id
JOIN dmc.sucursal s ON s.id = v.sucursal_id
JOIN dmc.cliente  c ON c.id = v.cliente_id
CROSS APPLY (SELECT TOP 1 x.motivo, x.ocurrido_en, x.usuario_id
               FROM dmc.visita_estado_historial x
              WHERE x.visita_id = v.id AND x.estado = 'CANCELADA_ADMIN'
              ORDER BY x.ocurrido_en DESC, x.id DESC) h
LEFT JOIN dmc.usuario u ON u.id = h.usuario_id
WHERE v.estado = 'CANCELADA_ADMIN';
GO

PRINT 'Migracion 003 aplicada.';
GO
