/* =====================================================================
   DMC Contingencia · datos — malls de la Región Metropolitana
   Microsoft SQL Server 2022 · esquema dmc

   Carga 32 malls y outlets de la Región Metropolitana en dmc.mall, con
   su dirección, comuna y región.

   Requiere la migración 012 (columnas comuna y region del mall).

   Es idempotente: el mall que ya existe con el mismo nombre no se toca,
   así que se puede correr varias veces sin duplicar ni romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/datos-malls-region-metropolitana.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

DECLARE @malls TABLE (
    nombre    nvarchar(120) NOT NULL PRIMARY KEY,
    direccion nvarchar(180) NOT NULL,
    comuna    nvarchar(80)  NOT NULL
);

INSERT INTO @malls (nombre, direccion, comuna) VALUES
 -- Maipú
 (N'Arauco Maipú',                        N'Av. Américo Vespucio 399',                         N'Maipú'),
 (N'Patio Outlet Maipú',                  N'Av. Lo Espejo 943',                                N'Maipú'),            -- ex Vivo Outlet Maipú
 (N'Mid Mall Maipú',                      N'Camino a Melipilla 15900',                         N'Maipú'),
 (N'Espacio Urbano Plaza Maipú',          N'Av. Ramón Freire 1790',                            N'Maipú'),            -- ex Av. Pajaritos
 -- Pudahuel
 (N'Style Outlet Pudahuel',               N'Av. Claudio Arrau 6910',                           N'Pudahuel'),
 -- Cerrillos / Estación Central
 (N'Mall Plaza Oeste',                    N'Av. Américo Vespucio 1501',                        N'Cerrillos'),
 (N'Mall Plaza Alameda',                  N'Av. Libertador Bernardo O''Higgins 3470',          N'Estación Central'),
 -- Las Condes
 (N'Cenco Alto Las Condes',               N'Av. Presidente Kennedy 9001',                      N'Las Condes'),
 (N'Mall Plaza Los Dominicos',            N'Av. Padre Hurtado Sur 875',                        N'Las Condes'),
 (N'Parque Arauco',                       N'Av. Presidente Kennedy 5413',                      N'Las Condes'),
 (N'Mall Sport',                          N'Av. Las Condes 13451',                             N'Las Condes'),
 (N'Apumanque',                           N'Av. Manquehue Sur 31',                             N'Las Condes'),
 (N'Subcentro Las Condes',                N'Av. Apoquindo 4411',                               N'Las Condes'),       -- galería del metro Escuela Militar
 (N'MUT (Mercado Urbano Tobalaba)',       N'Av. Apoquindo 2730',                               N'Las Condes'),
 -- La Reina / Ñuñoa
 (N'Mall Plaza Egaña',                    N'Av. Larraín 5862',                                 N'La Reina'),
 (N'Portal Ñuñoa',                        N'Av. José Pedro Alessandri 1166',                   N'Ñuñoa'),
 -- San Miguel / San Joaquín
 (N'Cenco El Llano',                      N'Av. El Llano Subercaseaux 3519',                   N'San Miguel'),
 (N'La Fábrica Patio Outlet',             N'Av. Carlos Valdovinos 200',                        N'San Joaquín'),
 -- Providencia / Vitacura
 (N'Costanera Center',                    N'Av. Andrés Bello 2425',                            N'Providencia'),
 (N'Mall Panorámico',                     N'Av. Nueva Providencia 2155',                       N'Providencia'),
 (N'Casacostanera',                       N'Av. Nueva Costanera 3900',                         N'Vitacura'),
 -- San Bernardo
 (N'Mall Plaza Sur',                      N'Av. Presidente Jorge Alessandri Rodríguez 20040',  N'San Bernardo'),
 -- Lo Barnechea
 (N'Portal La Dehesa',                    N'Av. La Dehesa 1445',                               N'Lo Barnechea'),
 -- Puente Alto
 (N'Vivo Outlet Parque Los Toros',        N'Los Toros 297',                                    N'Puente Alto'),
 (N'Mall Plaza Tobalaba',                 N'Av. Camilo Henríquez 3692',                        N'Puente Alto'),
 -- La Florida
 (N'Mall Plaza Vespucio',                 N'Av. Vicuña Mackenna Oriente 7110',                 N'La Florida'),
 (N'Cenco Florida',                       N'Av. Vicuña Mackenna Oriente 6100',                 N'La Florida'),       -- ex Florida Center
 (N'Patio Outlet La Florida',             N'Av. La Florida 8988',                              N'La Florida'),       -- ex Vivo Outlet La Florida
 -- Peñalolén
 (N'Alto Peñalolén',                      N'Av. Consistorial 2100',                            N'Peñalolén'),
 -- Huechuraba
 (N'Mall Plaza Norte',                    N'Av. Américo Vespucio 1737',                        N'Huechuraba'),
 -- Quilicura
 (N'Arauco Premium Outlet Buenaventura',  N'San Ignacio 500',                                  N'Quilicura'),
 (N'Easton Outlet Mall',                  N'Av. Presidente Eduardo Frei Montalva 9709',        N'Quilicura');

BEGIN TRANSACTION;

INSERT INTO dmc.mall (nombre, direccion, comuna, region, activo)
SELECT m.nombre, m.direccion, m.comuna, N'Metropolitana', 1
FROM @malls m
WHERE NOT EXISTS (SELECT 1 FROM dmc.mall x WHERE x.nombre = m.nombre)
ORDER BY m.comuna, m.nombre;

DECLARE @insertados int = @@ROWCOUNT;

COMMIT TRANSACTION;

PRINT CONCAT('Malls insertados: ', @insertados, ' de 32 (el resto ya existía).');
GO
