/* =====================================================================
   DMC Contingencia · migración 018 — plan de calibración por sucursal
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.sucursal.plan_calibracion ... si la tienda está en plan de
                                          calibración por su cuenta. Opcional:
                                          NULL quiere decir «no se sabe».

   La regla la aplica la app: si el cliente está en plan de calibración
   (dmc.cliente.plan_calibracion = 1, migración 017), todas sus tiendas lo
   están y esta columna no se mira. Si el cliente no lo está, una tienda en
   particular sí puede estarlo, y eso es lo que guarda esta columna.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-018-calibracion-por-sucursal.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

IF COL_LENGTH('dmc.sucursal', 'plan_calibracion') IS NULL
    ALTER TABLE dmc.sucursal ADD plan_calibracion bit NULL;
GO

PRINT 'Migración 018 aplicada.';
GO
