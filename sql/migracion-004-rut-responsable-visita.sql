/* =====================================================================
   DMC Contingencia · migración 004 — RUT del responsable al crear la visita
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     dmc.visita.responsable_rut ...... al agendar (panel) o agregar visita
                                       (celular) ya se pide el nombre y el
                                       teléfono de quien recibe; faltaba el
                                       RUT. Sin él, el técnico llega a la
                                       tienda y tiene que preguntarlo otra
                                       vez para poder cerrar el acta, que sí
                                       lo exige (dmc.visita_ejecucion.
                                       responsable_rut).

   Con esto el dato se captura una sola vez, viaja con la visita y llega
   precargado al formulario del técnico. Sigue siendo NULL: una visita se
   puede agendar sin saber todavía quién va a recibir.

   El largo (12) es el mismo que ya usan dmc.visita_ejecucion.responsable_rut
   y dmc.firma.firmante_rut: '12.345.678-K' entra justo.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-004-rut-responsable-visita.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

IF COL_LENGTH('dmc.visita', 'responsable_rut') IS NULL
    ALTER TABLE dmc.visita ADD responsable_rut varchar(12) NULL;
GO

PRINT 'Migracion 004 aplicada.';
GO
