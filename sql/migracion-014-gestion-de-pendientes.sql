/* =====================================================================
   DMC Contingencia · migración 014 — gestión de reagendas y pendientes
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.catalogo_pendiente ........ los pasos con que coordinación gestiona
                                        una visita que no se pudo hacer
                                        ("Repuesto pedido", "Tienda confirmó
                                        acceso"…). Es la Lista 5 de Maestros ›
                                        Checklist: se arma y se ordena ahí.
     2. dmc.visita_pendiente_gestion .. qué pasos lleva marcados cada visita,
                                        quién marcó cada uno y cuándo. Se ve y
                                        se marca en Operación › Reagendas y
                                        pendientes.
     3. Permiso reagendas.gestionar ... marcar esos pasos. Lo recibe cada rol
                                        que ya podía ver reagendas y pendientes.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-014-gestion-de-pendientes.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

/* =====================================================================
   1. dmc.catalogo_pendiente — checklist de gestión de pendientes
   ===================================================================== */
IF OBJECT_ID('dmc.catalogo_pendiente', 'U') IS NULL
    CREATE TABLE dmc.catalogo_pendiente (
        id              bigint        IDENTITY(1,1) NOT NULL,
        codigo          varchar(40)   NOT NULL,
        nombre          nvarchar(80)  NOT NULL,     -- "Repuesto pedido"
        orden           smallint      NOT NULL CONSTRAINT df_cat_pendiente_orden DEFAULT (0),
        activo          bit           NOT NULL CONSTRAINT df_cat_pendiente_activo DEFAULT (1),
        creado_en       datetime2(0)  NOT NULL CONSTRAINT df_cat_pendiente_creado DEFAULT (SYSDATETIME()),
        actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_cat_pendiente_actualizado DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_catalogo_pendiente        PRIMARY KEY (id),
        CONSTRAINT uq_catalogo_pendiente_codigo UNIQUE (codigo),
        CONSTRAINT uq_catalogo_pendiente_nombre UNIQUE (nombre)
    );
GO

CREATE OR ALTER TRIGGER dmc.tg_cat_pendiente_actualizado ON dmc.catalogo_pendiente AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE c SET actualizado_en = SYSDATETIME() FROM dmc.catalogo_pendiente c JOIN inserted i ON i.id = c.id;
END;
GO

/* =====================================================================
   2. dmc.visita_pendiente_gestion — lo marcado en cada visita
   ---------------------------------------------------------------------
   Desmarcar borra la fila. Si la visita se reprograma y más adelante vuelve
   a quedar pendiente, la app solo cuenta lo marcado desde ese último cambio
   de estado: la gestión parte de cero sin perder lo anterior.
   ===================================================================== */
IF OBJECT_ID('dmc.visita_pendiente_gestion', 'U') IS NULL
BEGIN
    CREATE TABLE dmc.visita_pendiente_gestion (
        id                bigint       IDENTITY(1,1) NOT NULL,
        visita_id         bigint       NOT NULL,
        pendiente_codigo  varchar(40)  NOT NULL,
        usuario_id        bigint       NULL,
        marcado_en        datetime2(0) NOT NULL CONSTRAINT df_vis_pend_gestion_en DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_visita_pendiente_gestion PRIMARY KEY (id),
        CONSTRAINT uq_visita_pendiente_gestion UNIQUE (visita_id, pendiente_codigo),
        CONSTRAINT fk_vis_pend_gestion_visita   FOREIGN KEY (visita_id)        REFERENCES dmc.visita (id) ON DELETE CASCADE,
        CONSTRAINT fk_vis_pend_gestion_catalogo FOREIGN KEY (pendiente_codigo) REFERENCES dmc.catalogo_pendiente (codigo),
        CONSTRAINT fk_vis_pend_gestion_usuario  FOREIGN KEY (usuario_id)       REFERENCES dmc.usuario (id)
    );
END
GO

/* =====================================================================
   3. Permiso: quien ve reagendas y pendientes puede marcar su gestión
   ===================================================================== */
INSERT INTO dmc.rol_permiso (rol_id, permiso)
SELECT rp.rol_id, 'reagendas.gestionar'
  FROM dmc.rol_permiso rp
 WHERE rp.permiso = 'reagendas.ver'
   AND NOT EXISTS (SELECT 1 FROM dmc.rol_permiso x
                    WHERE x.rol_id = rp.rol_id AND x.permiso = 'reagendas.gestionar');
GO

PRINT 'Migración 014 aplicada.';
GO
