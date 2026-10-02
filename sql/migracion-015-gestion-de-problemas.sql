/* =====================================================================
   DMC Contingencia · migración 015 — gestión de problemas
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.catalogo_problema_gestion .. los pasos con que coordinación lleva
                                         un problema hasta cerrarlo ("Repuesto
                                         cotizado", "Cliente aprobó", "Repuesto
                                         en bodega"…). Es la Lista 6 de
                                         Maestros › Checklist: se arma y se
                                         ordena ahí.
     2. dmc.problema_gestion ........... qué pasos lleva marcados cada
                                         problema, quién marcó cada uno y
                                         cuándo. Se ve y se marca en
                                         Operación › Problemas.

   No agrega permisos: marcar la gestión usa el que ya existe para cambiar un
   problema (problemas.editar).

   La nota que ahora se puede dejar al cambiar el estado o el tipo de un
   problema tampoco necesita nada: va en dmc.problema_historial.motivo, que
   existe desde el esquema base.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-015-gestion-de-problemas.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

/* =====================================================================
   1. dmc.catalogo_problema_gestion — checklist de gestión de problemas
   ===================================================================== */
IF OBJECT_ID('dmc.catalogo_problema_gestion', 'U') IS NULL
    CREATE TABLE dmc.catalogo_problema_gestion (
        id              bigint        IDENTITY(1,1) NOT NULL,
        codigo          varchar(40)   NOT NULL,
        nombre          nvarchar(80)  NOT NULL,     -- "Repuesto cotizado"
        orden           smallint      NOT NULL CONSTRAINT df_cat_prob_gestion_orden DEFAULT (0),
        activo          bit           NOT NULL CONSTRAINT df_cat_prob_gestion_activo DEFAULT (1),
        creado_en       datetime2(0)  NOT NULL CONSTRAINT df_cat_prob_gestion_creado DEFAULT (SYSDATETIME()),
        actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_cat_prob_gestion_actualizado DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_catalogo_problema_gestion        PRIMARY KEY (id),
        CONSTRAINT uq_catalogo_problema_gestion_codigo UNIQUE (codigo),
        CONSTRAINT uq_catalogo_problema_gestion_nombre UNIQUE (nombre)
    );
GO

CREATE OR ALTER TRIGGER dmc.tg_cat_prob_gestion_actualizado ON dmc.catalogo_problema_gestion AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE c SET actualizado_en = SYSDATETIME()
      FROM dmc.catalogo_problema_gestion c JOIN inserted i ON i.id = c.id;
END;
GO

/* =====================================================================
   2. dmc.problema_gestion — lo marcado en cada problema
   ---------------------------------------------------------------------
   Desmarcar borra la fila. Lo marcado se conserva al resolver el problema:
   queda como registro de cómo se llegó a cerrarlo.
   ===================================================================== */
IF OBJECT_ID('dmc.problema_gestion', 'U') IS NULL
BEGIN
    CREATE TABLE dmc.problema_gestion (
        id              bigint       IDENTITY(1,1) NOT NULL,
        problema_id     bigint       NOT NULL,
        gestion_codigo  varchar(40)  NOT NULL,
        usuario_id      bigint       NULL,
        marcado_en      datetime2(0) NOT NULL CONSTRAINT df_problema_gestion_en DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_problema_gestion PRIMARY KEY (id),
        CONSTRAINT uq_problema_gestion UNIQUE (problema_id, gestion_codigo),
        CONSTRAINT fk_problema_gestion_problema FOREIGN KEY (problema_id)    REFERENCES dmc.problema (id) ON DELETE CASCADE,
        CONSTRAINT fk_problema_gestion_catalogo FOREIGN KEY (gestion_codigo) REFERENCES dmc.catalogo_problema_gestion (codigo),
        CONSTRAINT fk_problema_gestion_usuario  FOREIGN KEY (usuario_id)     REFERENCES dmc.usuario (id)
    );
END
GO

PRINT 'Migración 015 aplicada.';
GO
