/* =====================================================================
   DMC Contingencia · migración 017 — detalle de la sucursal y plan de
   calibración del cliente
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué. Todo es opcional: NULL quiere decir «no se sabe»,
   que no es lo mismo que «no».

     1. dmc.sucursal.fecha_instalacion .. cuándo se instaló el equipo en la
                                          tienda.
     2. dmc.sucursal.remota ............. si la tienda se atiende en remoto.
     3. dmc.sucursal.en_garantia ........ si la tienda está en garantía.
     4. dmc.cliente.plan_calibracion .... si el cliente está en plan de
                                          calibración.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-017-detalle-sucursal-y-plan-calibracion.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

/* =====================================================================
   1–3. Detalle de la sucursal
   ===================================================================== */
IF COL_LENGTH('dmc.sucursal', 'fecha_instalacion') IS NULL
    ALTER TABLE dmc.sucursal ADD fecha_instalacion date NULL;
GO

IF COL_LENGTH('dmc.sucursal', 'remota') IS NULL
    ALTER TABLE dmc.sucursal ADD remota bit NULL;
GO

IF COL_LENGTH('dmc.sucursal', 'en_garantia') IS NULL
    ALTER TABLE dmc.sucursal ADD en_garantia bit NULL;
GO

/* =====================================================================
   4. Plan de calibración del cliente
   ===================================================================== */
IF COL_LENGTH('dmc.cliente', 'plan_calibracion') IS NULL
    ALTER TABLE dmc.cliente ADD plan_calibracion bit NULL;
GO

PRINT 'Migración 017 aplicada.';
GO
