/* =====================================================================
   DMC Contingencia · migración 029 — marcas, garantías y contactos
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.marca ............ cada marca que opera un cliente. La jerarquía
                               queda Cliente → Marca → Sucursal. Un cliente
                               tiene una o varias marcas.

     2. dmc.sucursal.marca_id  la marca de la tienda. Nace nullable, se llena
                               y recién entonces queda NOT NULL: a cada cliente
                               se le crea una marca por defecto (con su nombre
                               de fantasía) y se le asignan sus sucursales.
                               El par (marca_id, cliente_id) tiene una FK
                               compuesta contra dmc.marca, así una sucursal
                               nunca queda con una marca de otro cliente.

                               El nombre de la sucursal pasa a ser único por
                               marca (antes, por cliente): dos marcas del mismo
                               cliente pueden tener una tienda en el mismo mall.

     3. Garantía .............. dmc.sucursal.garantia_meses (la de la tienda) y
                               dmc.cliente.garantia_meses (plan que cubre todos
                               sus locales). Precedencia: si la sucursal tiene
                               duración propia, manda esa; si no, la del
                               cliente. El vencimiento es fecha_instalacion +
                               meses; lo calcula la app (lib/ui/garantia.ts).
                               dmc.sucursal.en_garantia queda como dato
                               histórico y ya no se muestra.

     4. dmc.contacto y dmc.contacto_cargo
                               un contacto tiene varios cargos y cada cargo su
                               alcance: CLIENTE, MARCA, REGION o SUCURSAL
                               (alcance_id apunta a la tabla que corresponda;
                               la región va como texto, igual que en sucursal y
                               mall). Sin triggers de INSERT a propósito:
                               el servidor valida que el alcance exista.
                               La ZONA queda para más adelante: sumarla es
                               ampliar el CHECK ck_contacto_cargo_alcance.

     5. Permisos .............. marcas.* y contactos.* se copian de clientes.*
                               a cada rol que ya los tenía.

   Requisito: tener aplicada la migración 028.
   Es idempotente: se puede correr varias veces sin romper nada.
   Para deshacerla: sql/migracion-029-revertir.sql

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-029-marcas-garantias-contactos.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

/* ---- 1. Marca ------------------------------------------------------- */
IF OBJECT_ID('dmc.marca', 'U') IS NULL
    CREATE TABLE dmc.marca (
        id              bigint        IDENTITY(1,1) NOT NULL,
        cliente_id      bigint        NOT NULL,
        nombre          nvarchar(80)  NOT NULL,
        activo          bit           NOT NULL CONSTRAINT df_marca_activo DEFAULT (1),
        creado_en       datetime2(0)  NOT NULL CONSTRAINT df_marca_creado DEFAULT (SYSDATETIME()),
        actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_marca_actualizado DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_marca                PRIMARY KEY (id),
        CONSTRAINT uq_marca_cliente_nombre UNIQUE (cliente_id, nombre),
        CONSTRAINT uq_marca_id_cliente     UNIQUE (id, cliente_id),   -- destino de la FK compuesta de sucursal
        CONSTRAINT fk_marca_cliente        FOREIGN KEY (cliente_id) REFERENCES dmc.cliente (id)
    );
GO

CREATE OR ALTER TRIGGER dmc.tg_marca_actualizado ON dmc.marca AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE m SET actualizado_en = SYSDATETIME() FROM dmc.marca m JOIN inserted i ON i.id = m.id;
END;
GO

/* ---- 2. Garantía: columnas ------------------------------------------ */
IF COL_LENGTH('dmc.cliente', 'garantia_meses') IS NULL
    ALTER TABLE dmc.cliente ADD garantia_meses smallint NULL;
GO
IF COL_LENGTH('dmc.sucursal', 'garantia_meses') IS NULL
    ALTER TABLE dmc.sucursal ADD garantia_meses smallint NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_cliente_garantia_meses')
    ALTER TABLE dmc.cliente ADD CONSTRAINT ck_cliente_garantia_meses
        CHECK (garantia_meses IS NULL OR garantia_meses BETWEEN 1 AND 240);
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_sucursal_garantia_meses')
    ALTER TABLE dmc.sucursal ADD CONSTRAINT ck_sucursal_garantia_meses
        CHECK (garantia_meses IS NULL OR garantia_meses BETWEEN 1 AND 240);
GO

/* ---- 3. Sucursal.marca_id ------------------------------------------- */
IF COL_LENGTH('dmc.sucursal', 'marca_id') IS NULL
    ALTER TABLE dmc.sucursal ADD marca_id bigint NULL;
GO

/* Una marca por defecto por cada cliente con sucursales sin marca: lleva el
   nombre de fantasía del cliente (se renombra o se separa después, a mano). */
INSERT INTO dmc.marca (cliente_id, nombre)
SELECT c.id, c.nombre_fantasia
  FROM dmc.cliente c
 WHERE EXISTS (SELECT 1 FROM dmc.sucursal s WHERE s.cliente_id = c.id AND s.marca_id IS NULL)
   AND NOT EXISTS (SELECT 1 FROM dmc.marca m WHERE m.cliente_id = c.id AND m.nombre = c.nombre_fantasia);
GO

UPDATE s
   SET marca_id = m.id
  FROM dmc.sucursal s
  JOIN dmc.cliente c ON c.id = s.cliente_id
  JOIN dmc.marca m   ON m.cliente_id = c.id AND m.nombre = c.nombre_fantasia
 WHERE s.marca_id IS NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dmc.sucursal') AND name = 'marca_id' AND is_nullable = 1)
BEGIN
    IF EXISTS (SELECT 1 FROM dmc.sucursal WHERE marca_id IS NULL)
        THROW 50029, 'Quedaron sucursales sin marca: revisar antes de seguir.', 1;
    ALTER TABLE dmc.sucursal ALTER COLUMN marca_id bigint NOT NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_sucursal_marca')
    ALTER TABLE dmc.sucursal ADD CONSTRAINT fk_sucursal_marca
        FOREIGN KEY (marca_id, cliente_id) REFERENCES dmc.marca (id, cliente_id);
GO

/* El nombre ya no es único por cliente sino por marca. */
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'uq_sucursal_cliente_nombre')
    ALTER TABLE dmc.sucursal DROP CONSTRAINT uq_sucursal_cliente_nombre;
GO
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'uq_sucursal_marca_nombre')
    ALTER TABLE dmc.sucursal ADD CONSTRAINT uq_sucursal_marca_nombre UNIQUE (marca_id, nombre);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_sucursal_marca' AND object_id = OBJECT_ID('dmc.sucursal'))
    CREATE INDEX ix_sucursal_marca ON dmc.sucursal (marca_id) WHERE activo = 1;
GO

/* ---- 4. Contactos ---------------------------------------------------- */
IF OBJECT_ID('dmc.contacto', 'U') IS NULL
    CREATE TABLE dmc.contacto (
        id              bigint        IDENTITY(1,1) NOT NULL,
        nombre          nvarchar(120) NOT NULL,
        email           nvarchar(160) NULL,
        telefono        varchar(30)   NULL,
        activo          bit           NOT NULL CONSTRAINT df_contacto_activo DEFAULT (1),
        creado_en       datetime2(0)  NOT NULL CONSTRAINT df_contacto_creado DEFAULT (SYSDATETIME()),
        actualizado_en  datetime2(0)  NOT NULL CONSTRAINT df_contacto_actualizado DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_contacto PRIMARY KEY (id)
    );
GO

CREATE OR ALTER TRIGGER dmc.tg_contacto_actualizado ON dmc.contacto AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE c SET actualizado_en = SYSDATETIME() FROM dmc.contacto c JOIN inserted i ON i.id = c.id;
END;
GO

IF OBJECT_ID('dmc.contacto_cargo', 'U') IS NULL
    CREATE TABLE dmc.contacto_cargo (
        id            bigint        IDENTITY(1,1) NOT NULL,
        contacto_id   bigint        NOT NULL,
        cargo         nvarchar(80)  NOT NULL,
        alcance_tipo  varchar(10)   NOT NULL,
        alcance_id    bigint        NULL,           -- cliente, marca o sucursal
        alcance_texto nvarchar(80)  NULL,           -- la región, como texto
        CONSTRAINT pk_contacto_cargo PRIMARY KEY (id),
        CONSTRAINT fk_contacto_cargo_contacto FOREIGN KEY (contacto_id) REFERENCES dmc.contacto (id) ON DELETE CASCADE,
        CONSTRAINT ck_contacto_cargo_alcance CHECK (
               (alcance_tipo IN ('CLIENTE', 'MARCA', 'SUCURSAL') AND alcance_id IS NOT NULL AND alcance_texto IS NULL)
            OR (alcance_tipo = 'REGION' AND alcance_id IS NULL AND alcance_texto IS NOT NULL)
        )
    );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_contacto_cargo' AND object_id = OBJECT_ID('dmc.contacto_cargo'))
    CREATE UNIQUE INDEX uq_contacto_cargo ON dmc.contacto_cargo (contacto_id, cargo, alcance_tipo, alcance_id, alcance_texto);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_contacto_cargo_alcance' AND object_id = OBJECT_ID('dmc.contacto_cargo'))
    CREATE INDEX ix_contacto_cargo_alcance ON dmc.contacto_cargo (alcance_tipo, alcance_id, alcance_texto);
GO

/* ---- 5. Permisos ------------------------------------------------------ */
INSERT INTO dmc.rol_permiso (rol_id, permiso)
SELECT rp.rol_id, REPLACE(rp.permiso, 'clientes.', n.modulo + '.')
  FROM dmc.rol_permiso rp
 CROSS JOIN (VALUES ('marcas'), ('contactos')) n(modulo)
 WHERE rp.permiso IN ('clientes.ver', 'clientes.crear', 'clientes.editar')
   AND NOT EXISTS (SELECT 1 FROM dmc.rol_permiso x
                    WHERE x.rol_id = rp.rol_id
                      AND x.permiso = REPLACE(rp.permiso, 'clientes.', n.modulo + '.'));
GO

/* ---- Versión ----------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM dmc.schema_version WHERE version = 29)
    INSERT INTO dmc.schema_version (version, descripcion)
    VALUES (29, N'Marcas, garantías por sucursal y cliente, contactos con cargos y alcances');
GO

PRINT 'Migracion 029 aplicada.';
GO
