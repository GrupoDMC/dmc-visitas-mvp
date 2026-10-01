/* =====================================================================
   DMC Contingencia · migración 009 — notas en clientes y sucursales, y
   el porqué de un cliente inactivo
   Microsoft SQL Server 2022 · esquema dmc

   Qué cambia, y para qué:

     1. dmc.cliente.notas y dmc.sucursal.notas ... texto libre del panel:
        lo que conviene saber de la empresa o de la tienda y no cabe en
        ningún otro campo. Opcional.
     2. dmc.cliente.motivo_inactivo y dmc.sucursal.motivo_inactivo ... por
        qué se desactivó el cliente o la sucursal. El panel lo exige al
        pasar el estado a Inactivo y lo borra al reactivar. Los que ya
        estaban inactivos quedan sin motivo hasta que alguien los edite.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-009-notas-y-motivo-inactivo.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

/* =====================================================================
   1. Notas
   ===================================================================== */
IF COL_LENGTH('dmc.cliente', 'notas') IS NULL
    ALTER TABLE dmc.cliente ADD notas nvarchar(max) NULL;
GO

IF COL_LENGTH('dmc.sucursal', 'notas') IS NULL
    ALTER TABLE dmc.sucursal ADD notas nvarchar(max) NULL;
GO

/* =====================================================================
   2. Motivo de la desactivación del cliente y de la sucursal
   ===================================================================== */
IF COL_LENGTH('dmc.cliente', 'motivo_inactivo') IS NULL
    ALTER TABLE dmc.cliente ADD motivo_inactivo nvarchar(400) NULL;
GO

IF COL_LENGTH('dmc.sucursal', 'motivo_inactivo') IS NULL
    ALTER TABLE dmc.sucursal ADD motivo_inactivo nvarchar(400) NULL;
GO

PRINT 'Migración 009 aplicada.';
GO
