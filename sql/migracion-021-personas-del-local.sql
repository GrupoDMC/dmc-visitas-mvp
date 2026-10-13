/* =====================================================================
   DMC Contingencia · migración 021 — personas del local
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     dmc.persona_local ...... quienes han recibido o firmado en cada tienda:
                              nombre, RUT, teléfono y cargo. Al agendar una
                              visita (panel o celular) y al llenar el acta se
                              ofrece elegirlos de una lista en vez de volver
                              a escribirlos. La app la alimenta sola cada vez
                              que se agenda o se cierra una visita con un
                              responsable.

   El cargo ("Jefe de tienda", "Encargado de seguridad"…) es nuevo y siempre
   opcional.

   Al crearla se carga con lo que ya hay: los responsables de las visitas
   agendadas y de las actas cerradas, uno por persona y tienda (el más
   reciente). La persona se reconoce por su RUT; si no lo tiene, por el nombre.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-021-personas-del-local.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

IF OBJECT_ID('dmc.persona_local', 'U') IS NULL
BEGIN
    CREATE TABLE dmc.persona_local (
        id          bigint        IDENTITY(1,1) NOT NULL,
        sucursal_id bigint        NOT NULL,
        nombre      nvarchar(120) NOT NULL,
        rut         varchar(12)   NULL,
        telefono    varchar(30)   NULL,
        cargo       nvarchar(80)  NULL,
        ultima_vez  datetime2(0)  NOT NULL CONSTRAINT df_persona_local_ultima DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_persona_local          PRIMARY KEY (id),
        CONSTRAINT fk_persona_local_sucursal FOREIGN KEY (sucursal_id) REFERENCES dmc.sucursal (id)
    );
END
GO

-- Una persona por tienda: por RUT cuando lo tiene, por nombre cuando no.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_persona_local_rut')
    CREATE UNIQUE INDEX uq_persona_local_rut ON dmc.persona_local (sucursal_id, rut) WHERE rut IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_persona_local_nombre')
    CREATE UNIQUE INDEX uq_persona_local_nombre ON dmc.persona_local (sucursal_id, nombre) WHERE rut IS NULL;
GO

/* Carga inicial con lo ya registrado. Solo si la tabla está vacía. */
IF NOT EXISTS (SELECT 1 FROM dmc.persona_local)
BEGIN
    ;WITH origen AS (
        SELECT v.sucursal_id,
               LTRIM(RTRIM(e.responsable_nombre)) AS nombre,
               NULLIF(LTRIM(RTRIM(e.responsable_rut)), '') AS rut,
               NULLIF(LTRIM(RTRIM(e.responsable_telefono)), '') AS telefono,
               CAST(COALESCE(e.hora_termino, e.hora_inicio) AS datetime2(0)) AS visto
          FROM dmc.visita_ejecucion e
          JOIN dmc.visita v ON v.id = e.visita_id
        UNION ALL
        SELECT v.sucursal_id,
               LTRIM(RTRIM(v.responsable_nombre)),
               NULLIF(LTRIM(RTRIM(v.responsable_rut)), ''),
               NULLIF(LTRIM(RTRIM(v.responsable_telefono)), ''),
               CAST(v.creado_en AS datetime2(0))
          FROM dmc.visita v
         WHERE v.responsable_nombre IS NOT NULL
    ),
    util AS (
        SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY sucursal_id, COALESCE(rut, 'N:' + nombre)
                    ORDER BY visto DESC) AS n
          FROM origen
         WHERE nombre <> '' AND nombre <> N'Por registrar'
    )
    INSERT INTO dmc.persona_local (sucursal_id, nombre, rut, telefono, ultima_vez)
    SELECT sucursal_id, nombre, rut, telefono, visto FROM util WHERE n = 1;
END
GO

PRINT 'Migracion 021 aplicada.';
GO
