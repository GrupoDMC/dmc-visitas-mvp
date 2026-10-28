/* =====================================================================
   DMC Contingencia · reversa de la migración 029
   Microsoft SQL Server 2022 · esquema dmc

   Deshace marcas, garantías por duración y contactos.

   OJO: es destructiva para lo cargado desde la 029.
     - Se pierden las marcas, los contactos y sus cargos, y las duraciones de
       garantía.
     - Las sucursales vuelven a ser únicas por (cliente, nombre). Si dos marcas
       del mismo cliente tienen una sucursal con el mismo nombre, el script se
       detiene y no cambia nada: renombrar una antes.
     - Los permisos marcas.* y contactos.* se borran.
   Las sucursales y los clientes anteriores quedan intactos.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-029-revertir.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

IF EXISTS (SELECT 1 FROM dmc.sucursal GROUP BY cliente_id, nombre HAVING COUNT(*) > 1)
    THROW 50029, 'Hay sucursales con el mismo nombre en distintas marcas del mismo cliente: renombrar antes de revertir.', 1;
GO

BEGIN TRANSACTION;

DELETE FROM dmc.rol_permiso WHERE permiso LIKE 'marcas.%' OR permiso LIKE 'contactos.%';

DROP TABLE IF EXISTS dmc.contacto_cargo;
DROP TABLE IF EXISTS dmc.contacto;

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'uq_sucursal_marca_nombre')
    ALTER TABLE dmc.sucursal DROP CONSTRAINT uq_sucursal_marca_nombre;
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'uq_sucursal_cliente_nombre')
    ALTER TABLE dmc.sucursal ADD CONSTRAINT uq_sucursal_cliente_nombre UNIQUE (cliente_id, nombre);

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_sucursal_marca' AND object_id = OBJECT_ID('dmc.sucursal'))
    DROP INDEX ix_sucursal_marca ON dmc.sucursal;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_sucursal_marca')
    ALTER TABLE dmc.sucursal DROP CONSTRAINT fk_sucursal_marca;
IF COL_LENGTH('dmc.sucursal', 'marca_id') IS NOT NULL
    ALTER TABLE dmc.sucursal DROP COLUMN marca_id;

DROP TABLE IF EXISTS dmc.marca;

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_sucursal_garantia_meses')
    ALTER TABLE dmc.sucursal DROP CONSTRAINT ck_sucursal_garantia_meses;
IF COL_LENGTH('dmc.sucursal', 'garantia_meses') IS NOT NULL
    ALTER TABLE dmc.sucursal DROP COLUMN garantia_meses;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_cliente_garantia_meses')
    ALTER TABLE dmc.cliente DROP CONSTRAINT ck_cliente_garantia_meses;
IF COL_LENGTH('dmc.cliente', 'garantia_meses') IS NOT NULL
    ALTER TABLE dmc.cliente DROP COLUMN garantia_meses;

DELETE FROM dmc.schema_version WHERE version = 29;

COMMIT TRANSACTION;
GO

PRINT 'Migracion 029 revertida. Antes de volver a desplegar la app anterior, comprobar que no necesite la 029.';
GO
