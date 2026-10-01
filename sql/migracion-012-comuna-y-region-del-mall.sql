/* =====================================================================
   DMC Contingencia · migración 012 — comuna y región del mall
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.mall.comuna ......... la comuna del mall.
     2. dmc.mall.region ......... la región del mall.

   El mall guarda su ubicación igual que la sucursal: dirección, comuna y
   región, cada una en su columna. Los malls que ya existen quedan con las
   dos vacías hasta que se completen desde Maestros › Malls.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-012-comuna-y-region-del-mall.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

IF COL_LENGTH('dmc.mall', 'comuna') IS NULL
    ALTER TABLE dmc.mall ADD comuna nvarchar(80) NOT NULL CONSTRAINT df_mall_comuna DEFAULT (N'');
GO

IF COL_LENGTH('dmc.mall', 'region') IS NULL
    ALTER TABLE dmc.mall ADD region nvarchar(80) NOT NULL CONSTRAINT df_mall_region DEFAULT (N'');
GO

PRINT 'Migración 012 aplicada.';
GO
