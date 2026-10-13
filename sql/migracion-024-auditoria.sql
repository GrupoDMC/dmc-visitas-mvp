/* =====================================================================
   DMC Contingencia · migración 024 — auditoría de acciones sensibles
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.auditoria .... una fila por cada acción sensible: cambio y
                           reseteo de contraseña, alta, baja y cambio de rol
                           de una cuenta, edición de roles y permisos,
                           eliminación de visitas y edición del checklist.
                           Guarda quién (id y correo en ese momento), qué,
                           sobre qué id, cuándo y desde qué IP.

   Es solo de agregar: la aplicación nunca actualiza ni borra filas. No lleva
   llave foránea a dmc.usuario a propósito: el registro tiene que sobrevivir
   a cualquier cambio de las cuentas.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-024-auditoria.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

IF OBJECT_ID('dmc.auditoria', 'U') IS NULL
    CREATE TABLE dmc.auditoria (
        id             bigint         IDENTITY(1,1) NOT NULL,
        creado_en      datetime2(3)   NOT NULL CONSTRAINT df_auditoria_creado DEFAULT (SYSDATETIME()),
        usuario_id     bigint         NULL,           -- quién; NULL si no hay sesión
        usuario_email  nvarchar(160)  NULL,           -- su correo en ese momento
        accion         varchar(40)    NOT NULL,       -- 'password.reseteo', 'visita.eliminar'…
        entidad        varchar(30)    NOT NULL,       -- 'usuario', 'rol', 'visita', 'checklist'…
        entidad_id     nvarchar(40)   NULL,           -- id (o folio) de lo afectado
        detalle        nvarchar(2000) NULL,           -- JSON breve; nunca claves ni hashes
        ip             varchar(45)    NULL,
        CONSTRAINT pk_auditoria PRIMARY KEY (id)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_auditoria_creado' AND object_id = OBJECT_ID('dmc.auditoria'))
    CREATE INDEX ix_auditoria_creado ON dmc.auditoria (creado_en DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_auditoria_entidad' AND object_id = OBJECT_ID('dmc.auditoria'))
    CREATE INDEX ix_auditoria_entidad ON dmc.auditoria (entidad, entidad_id, creado_en DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_auditoria_usuario' AND object_id = OBJECT_ID('dmc.auditoria'))
    CREATE INDEX ix_auditoria_usuario ON dmc.auditoria (usuario_id, creado_en DESC) WHERE usuario_id IS NOT NULL;
GO

PRINT 'Migracion 024 aplicada.';
GO
