/* =====================================================================
   DMC Contingencia · migración 008 — roles y permisos del panel
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.rol .................. los roles del panel que se crean desde
                                   Usuarios › Roles y permisos. «Coordinador»
                                   nace acá como rol de sistema: se le pueden
                                   cambiar los permisos, pero no borrarlo.
     2. dmc.rol_permiso .......... qué puede hacer cada rol. Un permiso es
                                   "<módulo>.<acción>" (visitas.crear,
                                   clientes.editar…). La lista de permisos que
                                   existen vive en la app (lib/permisos.ts).
     3. dmc.usuario.rol_id ....... el rol del panel de cada usuario. Solo lo
                                   llevan las cuentas COORDINADOR: el ADMIN
                                   tiene acceso total y el TECNICO entra por el
                                   celular, ninguno de los dos usa permisos.

   dmc.usuario.rol no cambia: sigue diciendo si la cuenta es de administrador,
   del panel o del celular. Los usuarios COORDINADOR que ya existen quedan con
   el rol «Coordinador», que arranca con lo mismo que podían hacer hasta hoy.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-008-roles-y-permisos.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

/* =====================================================================
   1. Roles
   ===================================================================== */
IF OBJECT_ID('dmc.rol', 'U') IS NULL
    CREATE TABLE dmc.rol (
        id              bigint         IDENTITY(1,1) NOT NULL,
        nombre          nvarchar(60)   NOT NULL,
        descripcion     nvarchar(240)  NULL,
        es_sistema      bit            NOT NULL CONSTRAINT df_rol_sistema DEFAULT (0),
        creado_en       datetime2(0)   NOT NULL CONSTRAINT df_rol_creado DEFAULT (SYSDATETIME()),
        actualizado_en  datetime2(0)   NOT NULL CONSTRAINT df_rol_actualizado DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_rol        PRIMARY KEY (id),
        CONSTRAINT uq_rol_nombre UNIQUE (nombre)
    );
GO

/* =====================================================================
   2. Permisos de cada rol
   ===================================================================== */
IF OBJECT_ID('dmc.rol_permiso', 'U') IS NULL
    CREATE TABLE dmc.rol_permiso (
        rol_id   bigint       NOT NULL,
        permiso  varchar(60)  NOT NULL,
        CONSTRAINT pk_rol_permiso     PRIMARY KEY (rol_id, permiso),
        CONSTRAINT fk_rol_permiso_rol FOREIGN KEY (rol_id) REFERENCES dmc.rol (id) ON DELETE CASCADE
    );
GO

/* =====================================================================
   3. El rol de cada usuario del panel
   ===================================================================== */
IF COL_LENGTH('dmc.usuario', 'rol_id') IS NULL
    ALTER TABLE dmc.usuario ADD rol_id bigint NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_usuario_rol')
    ALTER TABLE dmc.usuario ADD CONSTRAINT fk_usuario_rol
        FOREIGN KEY (rol_id) REFERENCES dmc.rol (id);
GO

-- Solo las cuentas del panel llevan rol: ADMIN y TECNICO no usan permisos.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_usuario_rol_id')
    ALTER TABLE dmc.usuario ADD CONSTRAINT ck_usuario_rol_id
        CHECK (rol_id IS NULL OR rol = 'COORDINADOR');
GO

/* =====================================================================
   4. El rol «Coordinador», con lo que un coordinador podía hacer hasta hoy:
      todo menos cancelar por admin, eliminar visitas y administrar roles.
   ===================================================================== */
IF NOT EXISTS (SELECT 1 FROM dmc.rol WHERE nombre = N'Coordinador')
BEGIN
    INSERT INTO dmc.rol (nombre, descripcion, es_sistema)
    VALUES (N'Coordinador', N'Agenda, corrige y reprograma visitas, y mantiene los maestros.', 1);

    INSERT INTO dmc.rol_permiso (rol_id, permiso)
    SELECT SCOPE_IDENTITY(), x.permiso
    FROM (VALUES
        ('panel.ver'),
        ('visitas.ver'), ('visitas.crear'), ('visitas.editar'), ('visitas.reprogramar'), ('visitas.enviar'),
        ('reagendas.ver'),
        ('problemas.ver'), ('problemas.editar'),
        ('tecnicos.ver'), ('tecnicos.crear'), ('tecnicos.editar'),
        ('usuarios.ver'), ('usuarios.crear'), ('usuarios.editar'), ('usuarios.contrasenas'),
        ('clientes.ver'), ('clientes.crear'), ('clientes.editar'),
        ('sucursales.ver'), ('sucursales.crear'), ('sucursales.editar'),
        ('checklist.ver'), ('checklist.editar')
    ) AS x(permiso);
END
GO

UPDATE u
   SET rol_id = (SELECT id FROM dmc.rol WHERE nombre = N'Coordinador')
  FROM dmc.usuario u
 WHERE u.rol = 'COORDINADOR' AND u.rol_id IS NULL;
GO

PRINT 'Migración 008 aplicada.';
GO
