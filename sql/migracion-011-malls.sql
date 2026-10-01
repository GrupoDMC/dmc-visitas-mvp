/* =====================================================================
   DMC Contingencia · migración 011 — malls y sus tiendas
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.mall ................. el centro comercial: nombre, dirección y
                                   si está activo. Se mantiene desde
                                   Maestros › Malls.
     2. dmc.sucursal.mall_id ..... el mall en el que está la tienda. Vacío =
                                   la sucursal no está en ningún mall. Una
                                   sucursal sigue siendo de su cliente; el
                                   mall solo dice dónde queda. Sirve para
                                   agendar de una vez las tiendas de un mall.
     3. Permisos del módulo ...... malls.ver / malls.crear / malls.editar.
                                   Cada rol los recibe según lo que ya podía
                                   hacer con las sucursales.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-011-malls.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

/* =====================================================================
   1. Malls
   ===================================================================== */
IF OBJECT_ID('dmc.mall', 'U') IS NULL
    CREATE TABLE dmc.mall (
        id              bigint        IDENTITY(1,1) NOT NULL,
        nombre          nvarchar(120) NOT NULL,
        direccion       nvarchar(180) NOT NULL,
        activo          bit           NOT NULL CONSTRAINT df_mall_activo DEFAULT (1),
        creado_en       datetime2(0)  NOT NULL CONSTRAINT df_mall_creado DEFAULT (SYSDATETIME()),
        actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_mall_actualizado DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_mall        PRIMARY KEY (id),
        CONSTRAINT uq_mall_nombre UNIQUE (nombre)
    );
GO

CREATE OR ALTER TRIGGER dmc.tg_mall_actualizado ON dmc.mall AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE m SET actualizado_en = SYSDATETIME() FROM dmc.mall m JOIN inserted i ON i.id = m.id;
END;
GO

/* =====================================================================
   2. El mall de cada tienda
   ===================================================================== */
IF COL_LENGTH('dmc.sucursal', 'mall_id') IS NULL
    ALTER TABLE dmc.sucursal ADD mall_id bigint NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_sucursal_mall')
    ALTER TABLE dmc.sucursal ADD CONSTRAINT fk_sucursal_mall
        FOREIGN KEY (mall_id) REFERENCES dmc.mall (id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_sucursal_mall')
    CREATE INDEX ix_sucursal_mall ON dmc.sucursal (mall_id) WHERE mall_id IS NOT NULL;
GO

/* =====================================================================
   3. Permisos: cada rol queda con los malls igual que con las sucursales
   ===================================================================== */
INSERT INTO dmc.rol_permiso (rol_id, permiso)
SELECT rp.rol_id, REPLACE(rp.permiso, 'sucursales.', 'malls.')
  FROM dmc.rol_permiso rp
 WHERE rp.permiso IN ('sucursales.ver', 'sucursales.crear', 'sucursales.editar')
   AND NOT EXISTS (SELECT 1 FROM dmc.rol_permiso x
                    WHERE x.rol_id = rp.rol_id
                      AND x.permiso = REPLACE(rp.permiso, 'sucursales.', 'malls.'));
GO

PRINT 'Migración 011 aplicada.';
GO
