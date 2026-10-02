/* =====================================================================
   DMC Contingencia · migración 016 — estados del problema editables
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.catalogo_problema_estado .. los estados por los que pasa un
                                        problema. Es la Lista 7 de Maestros ›
                                        Checklist: se renombran, se ordenan y
                                        se agregan ahí. Nace cargada con los
                                        tres de siempre:
                                          ABIERTO    Abierto
                                          PENDIENTE  Espera repuesto
                                          RESUELTO   Resuelto
     2. dmc.problema.estado ........... deja de estar amarrado a esos tres por
                                        un CHECK y pasa a apuntar al catálogo
                                        (fk_problema_estado).

   Dos estados son del sistema y no se pueden quitar, solo renombrar:
   ABIERTO, con el que nace todo problema que levanta el técnico, y RESUELTO,
   el único que lo da por cerrado (ck_problema_resuelto sigue exigiendo que
   RESUELTO traiga fecha de resolución). Todo lo que se agregue son estados
   intermedios: el problema sigue contando como «sin cerrar».

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-016-estados-de-problema.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

/* =====================================================================
   1. dmc.catalogo_problema_estado
   ---------------------------------------------------------------------
   El código es de 10 caracteres porque es lo que mide dmc.problema.estado.
   Sin trigger a propósito: la app recoge el id con OUTPUT al insertar.
   ===================================================================== */
IF OBJECT_ID('dmc.catalogo_problema_estado', 'U') IS NULL
    CREATE TABLE dmc.catalogo_problema_estado (
        id         bigint        IDENTITY(1,1) NOT NULL,
        codigo     varchar(10)   NOT NULL,
        nombre     nvarchar(80)  NOT NULL,
        orden      smallint      NOT NULL CONSTRAINT df_cat_prob_estado_orden DEFAULT (0),
        activo     bit           NOT NULL CONSTRAINT df_cat_prob_estado_activo DEFAULT (1),
        creado_en  datetime2(0)  NOT NULL CONSTRAINT df_cat_prob_estado_creado DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_catalogo_problema_estado        PRIMARY KEY (id),
        CONSTRAINT uq_catalogo_problema_estado_codigo UNIQUE (codigo),
        CONSTRAINT uq_catalogo_problema_estado_nombre UNIQUE (nombre)
    );
GO

INSERT INTO dmc.catalogo_problema_estado (codigo, nombre, orden)
SELECT x.codigo, x.nombre, x.orden
  FROM (VALUES ('ABIERTO',   N'Abierto',         1),
               ('PENDIENTE', N'Espera repuesto', 2),
               ('RESUELTO',  N'Resuelto',        3)) AS x(codigo, nombre, orden)
 WHERE NOT EXISTS (SELECT 1 FROM dmc.catalogo_problema_estado c WHERE c.codigo = x.codigo);
GO

/* =====================================================================
   2. dmc.problema.estado apunta al catálogo
   ===================================================================== */
IF EXISTS (SELECT 1 FROM sys.check_constraints
            WHERE name = 'ck_problema_estado' AND parent_object_id = OBJECT_ID('dmc.problema'))
    ALTER TABLE dmc.problema DROP CONSTRAINT ck_problema_estado;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_problema_estado')
    ALTER TABLE dmc.problema ADD CONSTRAINT fk_problema_estado
        FOREIGN KEY (estado) REFERENCES dmc.catalogo_problema_estado (codigo);
GO

PRINT 'Migración 016 aplicada.';
GO
