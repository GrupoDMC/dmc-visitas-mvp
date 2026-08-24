/* =====================================================================
   DMC Contingencia · migración 002 — mejoras del panel y del acta móvil
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.visita_motivo ................ el motivo deja de ser uno solo:
                                           ahora se marcan varios (checkbox).
     2. permite_cantidad ................. cada subtrabajo / subdetalle del
                                           checklist decide si se le pone
                                           cantidad o si solo se marca.
     3. contenido varbinary .............. la foto y la firma que toma el
                                           técnico se guardan de verdad, no
                                           como una URL que no existe.
     4. dmc.checklist_plantilla .......... la lista propia a la que vuelve el
                                           botón Reiniciar.
     5. dmc.solicitud_password ........... el Olvidé mi contraseña del login.
     6. activo en visita_trabajo ......... nada se borra; se deja inactivo.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-002-mejoras.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

/* =====================================================================
   1. MOTIVOS MÚLTIPLES POR VISITA
   ---------------------------------------------------------------------
   dmc.visita.motivo_codigo y dmc.visita_ejecucion.motivo_real_codigo se
   MANTIENEN: siguen siendo el motivo principal (el primero marcado) y de
   ellos cuelgan las FK y el CHECK de la hora en instalación. La tabla
   nueva guarda la selección completa.

     ambito = PLAN  -> lo que marcó coordinación al agendar
     ambito = REAL  -> lo que confirmó el técnico en terreno
   ===================================================================== */
IF OBJECT_ID('dmc.visita_motivo', 'U') IS NULL
BEGIN
    CREATE TABLE dmc.visita_motivo (
        id             bigint       IDENTITY(1,1) NOT NULL,
        visita_id      bigint       NOT NULL,
        motivo_codigo  varchar(40)  NOT NULL,
        ambito         varchar(4)   NOT NULL CONSTRAINT df_visita_motivo_ambito DEFAULT ('PLAN'),
        orden          smallint     NOT NULL CONSTRAINT df_visita_motivo_orden  DEFAULT (0),
        creado_en      datetime2(0) NOT NULL CONSTRAINT df_visita_motivo_creado DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_visita_motivo PRIMARY KEY (id),
        CONSTRAINT uq_visita_motivo UNIQUE (visita_id, ambito, motivo_codigo),
        CONSTRAINT fk_visita_motivo_visita FOREIGN KEY (visita_id)
            REFERENCES dmc.visita (id) ON DELETE CASCADE,
        CONSTRAINT fk_visita_motivo_catalogo FOREIGN KEY (motivo_codigo)
            REFERENCES dmc.catalogo_motivo (codigo),
        CONSTRAINT ck_visita_motivo_ambito CHECK (ambito IN ('PLAN','REAL'))
    );

    CREATE INDEX ix_visita_motivo ON dmc.visita_motivo (visita_id, ambito, orden);
END
GO

/* Relleno inicial: lo que ya estaba en las columnas de una sola opción. */
INSERT INTO dmc.visita_motivo (visita_id, motivo_codigo, ambito, orden)
SELECT v.id, v.motivo_codigo, 'PLAN', 1
  FROM dmc.visita v
 WHERE NOT EXISTS (SELECT 1 FROM dmc.visita_motivo m
                    WHERE m.visita_id = v.id AND m.ambito = 'PLAN' AND m.motivo_codigo = v.motivo_codigo);
GO

INSERT INTO dmc.visita_motivo (visita_id, motivo_codigo, ambito, orden)
SELECT e.visita_id, e.motivo_real_codigo, 'REAL', 1
  FROM dmc.visita_ejecucion e
 WHERE e.motivo_real_codigo IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dmc.visita_motivo m
                    WHERE m.visita_id = e.visita_id AND m.ambito = 'REAL' AND m.motivo_codigo = e.motivo_real_codigo);
GO

/* =====================================================================
   2. CANTIDAD O SOLO MARCAR
   ---------------------------------------------------------------------
   Lo decide el panel por cada subtrabajo y por cada subdetalle. Cuando
   está en 0, el celular muestra una casilla; cuando está en 1, muestra
   la casilla con su contador de cantidad.
   ===================================================================== */
IF COL_LENGTH('dmc.catalogo_trabajo_subtrabajo', 'permite_cantidad') IS NULL
    ALTER TABLE dmc.catalogo_trabajo_subtrabajo
        ADD permite_cantidad bit NOT NULL CONSTRAINT df_cat_sub_cantidad DEFAULT (0);
GO

IF COL_LENGTH('dmc.catalogo_problema_opcion', 'permite_cantidad') IS NULL
    ALTER TABLE dmc.catalogo_problema_opcion
        ADD permite_cantidad bit NOT NULL CONSTRAINT df_cat_prob_op_cantidad DEFAULT (0);
GO

/* =====================================================================
   3. LA FOTO Y LA FIRMA SE GUARDAN DE VERDAD
   ---------------------------------------------------------------------
   archivo_url / imagen_url quedan como la ruta interna con la que la app
   sirve la imagen (/api/visita/foto/<id>); los bytes viven acá. No hay
   almacenamiento de archivos contratado, y una nvarchar(400) no alcanza
   ni para la miniatura de un JPEG.
   ===================================================================== */
IF COL_LENGTH('dmc.visita_foto', 'contenido') IS NULL
    ALTER TABLE dmc.visita_foto ADD contenido varbinary(max) NULL;
GO

IF COL_LENGTH('dmc.visita_firma', 'contenido') IS NULL
    ALTER TABLE dmc.visita_firma ADD contenido varbinary(max) NULL;
GO

/* La firma se puede rehacer antes de cerrar el acta: el UPDATE necesita
   saber cuándo se guardó por última vez. */
IF COL_LENGTH('dmc.visita_firma', 'actualizado_en') IS NULL
    ALTER TABLE dmc.visita_firma
        ADD actualizado_en datetime2(0) NOT NULL CONSTRAINT df_firma_actualizado DEFAULT (SYSDATETIME());
GO

/* =====================================================================
   4. LA PLANTILLA DEL CHECKLIST
   ---------------------------------------------------------------------
   Las tres listas arrancan vacías. El panel guarda una foto de cómo las
   dejó armadas, y el botón Reiniciar vuelve a esa foto — no a un
   catálogo de fábrica que nadie pidió.
   ===================================================================== */
IF OBJECT_ID('dmc.checklist_plantilla', 'U') IS NULL
BEGIN
    CREATE TABLE dmc.checklist_plantilla (
        id              bigint        IDENTITY(1,1) NOT NULL,
        nombre          nvarchar(80)  NOT NULL,
        payload         nvarchar(max) NOT NULL,     -- JSON con las tres listas
        creado_por      bigint        NULL,
        creado_en       datetime2(0)  NOT NULL CONSTRAINT df_plantilla_creado DEFAULT (SYSDATETIME()),
        actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_plantilla_actualizado DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_checklist_plantilla PRIMARY KEY (id),
        CONSTRAINT uq_checklist_plantilla UNIQUE (nombre),
        CONSTRAINT fk_plantilla_usuario   FOREIGN KEY (creado_por) REFERENCES dmc.usuario (id),
        CONSTRAINT ck_plantilla_json      CHECK (ISJSON(payload) = 1)
    );
END
GO

/* =====================================================================
   5. OLVIDÉ MI CONTRASEÑA
   ---------------------------------------------------------------------
   No hay servidor de correo: la solicitud queda registrada y el
   administrador la ve en el panel, donde asigna una clave temporal.
   Se guarda el correo tal cual se escribió aunque no exista ningún
   usuario con él — así el login nunca delata qué correos están dados de
   alta.
   ===================================================================== */
IF OBJECT_ID('dmc.solicitud_password', 'U') IS NULL
BEGIN
    CREATE TABLE dmc.solicitud_password (
        id            bigint        IDENTITY(1,1) NOT NULL,
        email         nvarchar(160) NOT NULL,
        usuario_id    bigint        NULL,
        mensaje       nvarchar(400) NULL,
        estado        varchar(10)   NOT NULL CONSTRAINT df_solpass_estado DEFAULT ('PENDIENTE'),
        atendido_por  bigint        NULL,
        atendido_en   datetime2(0)  NULL,
        creado_en     datetime2(0)  NOT NULL CONSTRAINT df_solpass_creado DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_solicitud_password PRIMARY KEY (id),
        CONSTRAINT fk_solpass_usuario    FOREIGN KEY (usuario_id)   REFERENCES dmc.usuario (id),
        CONSTRAINT fk_solpass_atendido   FOREIGN KEY (atendido_por) REFERENCES dmc.usuario (id),
        CONSTRAINT ck_solpass_estado     CHECK (estado IN ('PENDIENTE','ATENDIDA','DESCARTADA'))
    );

    CREATE INDEX ix_solpass_pendiente ON dmc.solicitud_password (creado_en DESC) WHERE estado = 'PENDIENTE';
END
GO

/* =====================================================================
   6. NADA SE BORRA, SOLO SE DEJA INACTIVO
   ---------------------------------------------------------------------
   Los catálogos ya tenían activo; lo que faltaba era poder desactivar un
   trabajo o una foto YA REGISTRADOS en una visita sin perder la fila. El
   acta vieja los sigue mostrando; el listado normal los omite.
   ===================================================================== */
IF COL_LENGTH('dmc.visita_trabajo', 'activo') IS NULL
    ALTER TABLE dmc.visita_trabajo
        ADD activo bit NOT NULL CONSTRAINT df_vis_trab_activo DEFAULT (1);
GO

IF COL_LENGTH('dmc.visita_foto', 'activo') IS NULL
    ALTER TABLE dmc.visita_foto
        ADD activo bit NOT NULL CONSTRAINT df_foto_activo DEFAULT (1);
GO

/* =====================================================================
   7. CIERRE DEL ACTA
   ---------------------------------------------------------------------
   Cuando el técnico aprieta Guardar visita, la visita queda COMPLETADA y
   se sella la hora de término. Este índice es el que usa el panel para
   mostrar al instante lo recién cerrado.
   ===================================================================== */
IF NOT EXISTS (SELECT 1 FROM sys.indexes
                WHERE name = 'ix_ejecucion_termino'
                  AND object_id = OBJECT_ID('dmc.visita_ejecucion'))
    CREATE INDEX ix_ejecucion_termino ON dmc.visita_ejecucion (hora_termino DESC);
GO

PRINT 'Migracion 002 aplicada.';
GO
