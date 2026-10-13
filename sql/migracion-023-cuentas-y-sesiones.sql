/* =====================================================================
   DMC Contingencia · migración 023 — cuentas y sesiones
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.usuario.sesion_version ......... número que va dentro del token de
                                             sesión. Subirlo cierra todas las
                                             sesiones abiertas de esa cuenta.
     2. dmc.usuario.debe_cambiar_password .. la clave la puso otra persona
                                             (alta, reseteo o solicitud
                                             atendida): al entrar se pide una
                                             nueva antes de seguir.
     3. dmc.solicitud_password.ip .......... desde dónde se pidió, para acotar
                                             cuántas solicitudes llegan de un
                                             mismo origen.
     4. dmc.intento_login .................. cada intento de entrar, bueno o
                                             malo. Con esto se frenan los
                                             intentos repetidos por cuenta y
                                             por origen.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-023-cuentas-y-sesiones.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

IF COL_LENGTH('dmc.usuario', 'sesion_version') IS NULL
    ALTER TABLE dmc.usuario ADD sesion_version int NOT NULL
        CONSTRAINT df_usuario_sesion_version DEFAULT (0);
GO

IF COL_LENGTH('dmc.usuario', 'debe_cambiar_password') IS NULL
    ALTER TABLE dmc.usuario ADD debe_cambiar_password bit NOT NULL
        CONSTRAINT df_usuario_debe_cambiar DEFAULT (0);
GO

IF COL_LENGTH('dmc.solicitud_password', 'ip') IS NULL
    ALTER TABLE dmc.solicitud_password ADD ip varchar(45) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_solpass_ip' AND object_id = OBJECT_ID('dmc.solicitud_password'))
    CREATE INDEX ix_solpass_ip ON dmc.solicitud_password (ip, creado_en) WHERE ip IS NOT NULL;
GO

IF OBJECT_ID('dmc.intento_login', 'U') IS NULL
    CREATE TABLE dmc.intento_login (
        id         bigint         IDENTITY(1,1) NOT NULL,
        email      nvarchar(160)  NOT NULL,     -- tal cual se escribió, en minúsculas
        ip         varchar(45)    NULL,
        exito      bit            NOT NULL,
        creado_en  datetime2(3)   NOT NULL CONSTRAINT df_intento_login_creado DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_intento_login PRIMARY KEY (id)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_intento_login_email' AND object_id = OBJECT_ID('dmc.intento_login'))
    CREATE INDEX ix_intento_login_email ON dmc.intento_login (email, creado_en) INCLUDE (exito);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_intento_login_ip' AND object_id = OBJECT_ID('dmc.intento_login'))
    CREATE INDEX ix_intento_login_ip ON dmc.intento_login (ip, creado_en) INCLUDE (exito) WHERE ip IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_intento_login_creado' AND object_id = OBJECT_ID('dmc.intento_login'))
    CREATE INDEX ix_intento_login_creado ON dmc.intento_login (creado_en);
GO

PRINT 'Migracion 023 aplicada.';
GO
