/* =====================================================================
   DMC Contingencia · datos de demostración (ficticios) — SQL Server 2022

   Solo para una base de DESARROLLO propia. Nunca lo corras en producción.

   Todo lo de aquí es inventado: clientes, tiendas, técnicos, personas de
   contacto, RUT y teléfonos. Los correos son @example.com. No crea ningún
   usuario ni lleva contraseñas: la cuenta de acceso se crea aparte (ver
   «Base de datos de desarrollo» en el README), con
   `npm run hash-password`.

   Contiene, en este orden:
     1. el checklist de ejemplo (motivos, problemas y trabajos),
     2. clientes, tiendas y técnicos,
     3. quince visitas con su ejecución, fotos, firmas y problemas.

   Requisitos: el esquema (sql/dmc_contingencia_sqlserver.sql) y todas las
   migraciones posteriores a ese archivo ya aplicadas.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/semillas-demo.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

/* =====================================================================
   1. CHECKLIST DE EJEMPLO (los tres checklists del panel)
   ===================================================================== */
INSERT INTO dmc.catalogo_motivo (codigo, nombre, orden) VALUES
 ('CALIBRACION',     N'Calibración de las antenas',    1),
 ('INSTALACION',     N'Instalación de las antenas',    2),
 ('RE_INSTALACION',  N'Reinstalación de las antenas',  3),
 ('DES_INSTALACION', N'Desinstalación de las antenas', 4),
 ('VISITA',          N'Visita preventiva',             5),
 ('REVISION',        N'Revisión de condiciones',       6);
GO

INSERT INTO dmc.catalogo_problema (codigo, nombre, grupo_label, singular, ayuda, orden) VALUES
 ('ANTENA_NO_DETECTA',   N'Antena no detecta etiquetas',      N'Antena afectada',              N'antena', N'Marca las antenas que no están detectando.',        1),
 ('FALSA_ALARMA',        N'Falsa alarma / falso positivo',    N'Dónde suena la falsa alarma',  N'punto',  N'Marca los puntos donde ocurre.',                    2),
 ('SIN_ENERGIA',         N'Sin alimentación eléctrica',       N'Qué quedó sin energía',        N'equipo', N'Marca los equipos sin alimentación.',               3),
 ('CABLE_DANADO',        N'Cable dañado o cortado',           N'Cable dañado',                 N'cable',  N'Marca el o los cables afectados.',                  4),
 ('PLACAS_DANADAS',      N'Placas dañadas',                   N'Modelo de placa',              N'modelo', N'Marca los modelos dañados y ajusta las cantidades.',5),
 ('DESCALIBRACION',      N'Antena descalibrada',              N'Antena a calibrar',            N'antena', N'Marca las antenas descalibradas.',                  6),
 ('CONTADOR_FALLA',      N'Contador de personas con falla',   N'Parte con falla',              N'parte',  N'Marca la parte del contador con falla.',            7),
 ('ETIQUETA_DEFECTUOSA', N'Etiqueta AM defectuosa',           N'Tipo de etiqueta',             N'tipo',   N'Marca el tipo de etiqueta y la cantidad revisada.', 8),
 ('OTRO',                N'Otro',                             NULL,                            NULL,      N'Describe el problema en el detalle escrito.',       9);
GO

INSERT INTO dmc.catalogo_problema_opcion (problema_id, etiqueta, orden)
SELECT cp.id, x.etiqueta, x.orden
FROM (VALUES
 ('ANTENA_NO_DETECTA',   N'Pórtico 1',1),('ANTENA_NO_DETECTA',N'Pórtico 2',2),('ANTENA_NO_DETECTA',N'Pórtico 3',3),
 ('ANTENA_NO_DETECTA',   N'Antena AM',4),('ANTENA_NO_DETECTA',N'Antena RF',5),
 ('FALSA_ALARMA',        N'Pórtico 1',1),('FALSA_ALARMA',N'Pórtico 2',2),('FALSA_ALARMA',N'Pórtico 3',3),
 ('FALSA_ALARMA',        N'Zona de cajas',4),('FALSA_ALARMA',N'Bodega',5),
 ('SIN_ENERGIA',         N'Pórtico completo',1),('SIN_ENERGIA',N'Fuente de poder',2),
 ('SIN_ENERGIA',         N'Transformador',3),('SIN_ENERGIA',N'Enchufe o toma',4),
 ('CABLE_DANADO',        N'Cable de poder',1),('CABLE_DANADO',N'Cable de antena',2),
 ('CABLE_DANADO',        N'Cable de red',3),('CABLE_DANADO',N'Cable de sincronía',4),
 ('PLACAS_DANADAS',      N'Master 9000',1),('PLACAS_DANADAS',N'Slave 9000',2),
 ('PLACAS_DANADAS',      N'TX MDG',3),('PLACAS_DANADAS',N'RX MDG',4),
 ('DESCALIBRACION',      N'Pórtico 1',1),('DESCALIBRACION',N'Pórtico 2',2),('DESCALIBRACION',N'Pórtico 3',3),
 ('CONTADOR_FALLA',      N'Sensor',1),('CONTADOR_FALLA',N'Display',2),
 ('CONTADOR_FALLA',      N'Cableado',3),('CONTADOR_FALLA',N'Fuente',4),
 ('ETIQUETA_DEFECTUOSA', N'Etiqueta AM dura',1),('ETIQUETA_DEFECTUOSA',N'Etiqueta AM blanda',2),
 ('ETIQUETA_DEFECTUOSA', N'Etiqueta RF',3)
) AS x(codigo, etiqueta, orden)
JOIN dmc.catalogo_problema cp ON cp.codigo = x.codigo;
GO

INSERT INTO dmc.catalogo_trabajo (codigo, nombre, grupo_label, singular, orden) VALUES
 ('CALIBRACION_ANTENAS', N'Calibración de antenas',    N'Antena calibrada',     N'antena',   1),
 ('CAMBIO_REPUESTO',     N'Cambio de repuesto',        N'Repuesto cambiado',    N'repuesto', 2),
 ('INSTALACION_EQUIPO',  N'Instalación de equipo',     N'Equipo instalado',     N'equipo',   3),
 ('MANTENCION',          N'Mantención preventiva',     N'Tarea de mantención',  N'tarea',    4),
 ('RETIRO_EQUIPO',       N'Retiro de equipo',          N'Equipo retirado',      N'equipo',   5),
 ('CAPACITACION',        N'Capacitación al personal',  NULL,                    NULL,        6);
GO

INSERT INTO dmc.catalogo_trabajo_subtrabajo (trabajo_id, etiqueta, orden)
SELECT ct.id, x.etiqueta, x.orden
FROM (VALUES
 ('CALIBRACION_ANTENAS', N'Pórtico 1',1),('CALIBRACION_ANTENAS',N'Pórtico 2',2),('CALIBRACION_ANTENAS',N'Pórtico 3',3),
 ('CALIBRACION_ANTENAS', N'Antena AM',4),('CALIBRACION_ANTENAS',N'Antena RF',5),
 ('CAMBIO_REPUESTO',     N'Tarjeta electrónica',1),('CAMBIO_REPUESTO',N'Fuente de poder',2),
 ('CAMBIO_REPUESTO',     N'Cable de slave a master',3),('CAMBIO_REPUESTO',N'Antena completa',4),
 ('CAMBIO_REPUESTO',     N'Sensor de conteo',5),
 ('INSTALACION_EQUIPO',  N'Pórtico nuevo',1),('INSTALACION_EQUIPO',N'Desactivador',2),
 ('INSTALACION_EQUIPO',  N'Contador de personas',3),('INSTALACION_EQUIPO',N'Alarma sonora',4),
 ('MANTENCION',          N'Limpieza interna',1),('MANTENCION',N'Revisión de conexiones',2),
 ('MANTENCION',          N'Ajuste de sensibilidad',3),('MANTENCION',N'Prueba con etiqueta patrón',4),
 ('RETIRO_EQUIPO',       N'Pórtico completo',1),('RETIRO_EQUIPO',N'Desactivador',2),
 ('RETIRO_EQUIPO',       N'Contador de personas',3)
) AS x(codigo, etiqueta, orden)
JOIN dmc.catalogo_trabajo ct ON ct.codigo = x.codigo;
GO

/* =====================================================================
   2. CLIENTES, TIENDAS Y TÉCNICOS (ficticios)
   ===================================================================== */
INSERT INTO dmc.cliente (rut, razon_social, nombre_fantasia, activo) VALUES
 ('99.000.001-8', N'Comercial Sol y Mar SpA',  N'Sol y Mar', 1),
 ('99.000.002-6', N'Deportes Andes Ltda.',           N'Deportes Andes',  1),
 ('99.000.003-4', N'Comercializadora Moda Central S.A.', N'Moda Central',        1),
 ('99.000.004-2', N'Belleza Plus S.A.',                 N'Belleza Plus',       1),
 ('99.000.005-0', N'Deportes del Sur SpA',          N'Deportes del Sur',        0);
GO

INSERT INTO dmc.sucursal (cliente_id, nombre, codigo, direccion, comuna, region, telefono, activo)
SELECT c.id, x.nombre, x.codigo, x.direccion, x.comuna, x.region, x.telefono, x.activo
FROM (VALUES
 (N'Deportes del Sur',       N'Parque Arauco',        'SP-241', N'Av. Kennedy 5413',                       N'Las Condes',       N'Metropolitana', '+56 2 2000 0001', 1),
 (N'Sol y Mar',N'Mall Plaza Tobalaba',  'MS-118', N'Av. Camilo Henríquez 3296',              N'Puente Alto',      N'Metropolitana', '+56 2 2000 0002', 1),
 (N'Deportes Andes', N'Costanera Center',     'AD-002', N'Andrés Bello 2425',                      N'Providencia',      N'Metropolitana', '+56 2 2000 0003', 1),
 (N'Moda Central',       N'Paseo Ahumada',        'TR-055', N'Ahumada 131',                            N'Santiago',         N'Metropolitana', '+56 2 2000 0004', 1),
 (N'Sol y Mar',N'Mall Marina Arauco',   'MS-330', N'14 Norte 961',                           N'Viña del Mar',     N'Valparaíso',    '+56 2 2000 0005', 1),
 (N'Belleza Plus',      N'Mall Plaza Oeste',     'PR-076', N'Av. Américo Vespucio 1501',              N'Cerrillos',        N'Metropolitana', '+56 2 2000 0006', 0),
 (N'Belleza Plus',      N'Mall Plaza Norte',     'PR-031', N'Av. Américo Vespucio 1737',              N'Huechuraba',       N'Metropolitana', '+56 2 2000 0007', 1),
 (N'Deportes Andes', N'Mall Plaza Vespucio',  'AD-014', N'Froilán Roa 7205',                       N'La Florida',       N'Metropolitana', '+56 2 2000 0008', 1),
 (N'Moda Central',       N'Portal Ñuñoa',         'TR-090', N'Irarrázaval 2698',                       N'Ñuñoa',            N'Metropolitana', '+56 2 2000 0009', 1),
 (N'Belleza Plus',      N'Mall Arauco Maipú',    'PR-112', N'Av. Américo Vespucio 399',               N'Maipú',            N'Metropolitana', '+56 2 2000 0010', 1),
 (N'Sol y Mar',N'Mall Plaza Trébol',    'MS-402', N'Av. Jorge Alessandri 3177',              N'Talcahuano',       N'Biobío',        '+56 2 2000 0011', 1),
 (N'Deportes Andes', N'Mall Alto Las Condes', 'AD-021', N'Av. Kennedy 9001',                       N'Las Condes',       N'Metropolitana', '+56 2 2000 0012', 1),
 (N'Deportes del Sur',       N'Mall Plaza Egaña',     'SP-160', N'Av. Larraín 5862',                       N'La Reina',         N'Metropolitana', '+56 2 2000 0013', 1),
 (N'Belleza Plus',      N'Mall Arauco Estación', 'PR-140', N'Av. Libertador Bernardo O''Higgins 3470',N'Estación Central', N'Metropolitana', '+56 2 2000 0014', 1)
) AS x(cliente, nombre, codigo, direccion, comuna, region, telefono, activo)
JOIN dmc.cliente c ON c.nombre_fantasia = x.cliente;
GO

INSERT INTO dmc.tecnico (rut, nombres, apellido_paterno, apellido_materno, email, telefono, activo) VALUES
 ('10.000.001-6', N'Alicia', N'Demo', N'Uno',    N'tecnico1@example.com', '+56 9 0000 1001', 1),
 ('10.000.002-4', N'Bruno',  N'Demo', N'Dos',    N'tecnico2@example.com', '+56 9 0000 1002', 1),
 ('10.000.003-2', N'Carla',  N'Demo', N'Tres',   N'tecnico3@example.com', '+56 9 0000 1003', 1),
 ('10.000.004-0', N'Diego',  N'Demo', N'Cuatro', N'tecnico4@example.com', '+56 9 0000 1004', 1),
 ('10.000.005-9', N'Elena',  N'Demo', N'Cinco',  N'tecnico5@example.com', '+56 9 0000 1005', 0);
GO

/* =====================================================================
   3. VISITAS DE EJEMPLO
   ===================================================================== */
-- Visitas V-2026-00001 … V-2026-00015 (13-08-2026 es "hoy" en el prototipo)
INSERT INTO dmc.visita (folio, cliente_id, sucursal_id, tecnico_id, motivo_codigo, estado,
                        fecha_programada, hora_programada, trabajo_solicitado,
                        responsable_nombre, responsable_telefono)
SELECT x.folio, s.cliente_id, s.id, t.id, x.motivo, x.estado,
       CAST(x.fecha AS date), CAST(x.hora AS time(0)), x.trabajo, x.responsable, x.telefono
FROM (VALUES
 ('V-2026-00001', N'Mall Arauco Estación', N'Carla Demo',   'REVISION',        'REAGENDADA', '2026-08-07', NULL,    N'Revisión de condiciones del pórtico principal.',                                   N'Persona Local Uno',   '+56 9 0000 2001'),
 ('V-2026-00002', N'Mall Alto Las Condes', N'Diego Demo',   'CALIBRACION',     'COMPLETADA', '2026-08-08', '10:00', N'Calibrar pórtico del acceso principal tras detección intermitente.',               N'Persona Local Dos',  '+56 9 0000 2002'),
 ('V-2026-00003', N'Mall Plaza Norte',     N'Bruno Demo', 'REVISION',        'REAGENDADA', '2026-08-09', NULL,    N'Revisar pórtico sin energía tras corte del mall.',                                 N'Persona Local Tres',   '+56 9 0000 2003'),
 ('V-2026-00004', N'Mall Plaza Trébol',    N'Elena Demo',   'REVISION',        'COMPLETADA', '2026-08-10', '14:00', N'Revisar detección de etiquetas blandas en acceso sur.',                            N'Persona Local Cuatro',  '+56 9 0000 2004'),
 ('V-2026-00005', N'Mall Arauco Maipú',    N'Elena Demo',   'CALIBRACION',     'COMPLETADA', '2026-08-10', '09:45', N'Recalibrar pórtico principal después de mover el mueble de cajas.',                N'Persona Local Uno',   '+56 9 0000 2001'),
 ('V-2026-00006', N'Mall Plaza Egaña',     N'Diego Demo',   'DES_INSTALACION', 'CANCELADA',  '2026-08-11', NULL,    N'Desinstalar pórtico por cierre de local.',                                         N'Persona Local Dos',  '+56 9 0000 2002'),
 ('V-2026-00007', N'Portal Ñuñoa',         N'Diego Demo',   'VISITA',          'COMPLETADA', '2026-08-11', '11:30', N'Preventiva trimestral: limpieza, prueba de etiquetas y conteo de alarmas.',        N'Persona Local Tres',   '+56 9 0000 2003'),
 ('V-2026-00008', N'Mall Plaza Vespucio',  N'Carla Demo',   'INSTALACION',     'COMPLETADA', '2026-08-12', '15:00', N'Instalar 2 pórticos AM en acceso principal.',                                      N'Persona Local Cuatro',  '+56 9 0000 2004'),
 ('V-2026-00009', N'Mall Marina Arauco',   N'Carla Demo',   'RE_INSTALACION',  'PENDIENTE',  '2026-08-12', '10:15', N'Reinstalar pórtico retirado por obras del mall.',                                  N'Persona Local Uno',   '+56 9 0000 2001'),
 ('V-2026-00010', N'Mall Plaza Oeste',     N'Bruno Demo', 'REVISION',        'REAGENDADA', '2026-08-12', NULL,    N'Revisar alarmas falsas en caja 3.',                                                N'Persona Local Dos',  '+56 9 0000 2002'),
 ('V-2026-00011', N'Mall Plaza Norte',     N'Bruno Demo', 'CALIBRACION',     'COMPLETADA', '2026-08-13', '08:30', N'Calibrar antenas y revisar contador de personas.',                                 N'Persona Local Tres',   '+56 9 0000 2003'),
 ('V-2026-00012', N'Mall Plaza Tobalaba',  N'Alicia Demo',  'CALIBRACION',     'PROGRAMADA', '2026-08-13', NULL,    N'3 antenas EAS con falsa alarma cada 10 min. Calibrar y registrar la ganancia.',    N'Persona Local Tres',   '+56 9 0000 2003'),
 ('V-2026-00013', N'Costanera Center',     N'Alicia Demo',  'INSTALACION',     'PROGRAMADA', '2026-08-13', '11:00', N'Instalar 2 pórticos AM en acceso principal y 1 contador de personas en caja.',     N'Persona Local Cuatro',  '+56 9 0000 2004'),
 ('V-2026-00014', N'Paseo Ahumada',        N'Alicia Demo',  'VISITA',          'PROGRAMADA', '2026-08-13', NULL,    N'Preventiva trimestral: limpieza de pórticos y prueba de etiquetas.',               N'Persona Local Dos',  '+56 9 0000 2002'),
 ('V-2026-00015', N'Parque Arauco',        N'Alicia Demo',  'REVISION',        'EN_CURSO',   '2026-08-13', '09:00', N'Revisar los 2 pórticos del acceso oriente: alarmas sin producto.',                 N'Persona Local Uno',   '+56 9 0000 2001')
) AS x(folio, sucursal, tecnico, motivo, estado, fecha, hora, trabajo, responsable, telefono)
JOIN dmc.sucursal s ON s.nombre = x.sucursal
JOIN dmc.tecnico  t ON t.nombre_completo = x.tecnico;
GO
ALTER SEQUENCE dmc.seq_folio_visita RESTART WITH 16;
GO

-- Ejecución en terreno de las visitas que el técnico sí abrió
INSERT INTO dmc.visita_ejecucion (visita_id, hora_inicio, hora_termino, responsable_nombre,
                                  responsable_rut, responsable_telefono, motivo_real_codigo,
                                  observaciones, comentario_interno, dispositivo, app_version, sincronizado_en)
SELECT v.id,
       DATEADD(minute, DATEDIFF(minute, 0, COALESCE(v.hora_programada, '09:30')), CAST(v.fecha_programada AS datetime2(0))),
       CASE WHEN v.estado = 'EN_CURSO' THEN NULL
            ELSE DATEADD(minute, 65 + DATEDIFF(minute, 0, COALESCE(v.hora_programada, '09:30')),
                         CAST(v.fecha_programada AS datetime2(0))) END,
       v.responsable_nombre, '11.111.111-1', v.responsable_telefono, v.motivo_codigo,
       CASE WHEN v.estado = 'COMPLETADA'
            THEN N'Trabajo recibido conforme por la tienda. Se dejó el sector limpio y se explicó al encargado el uso del control de prueba.'
            ELSE N'Observaciones aún no cerradas por el técnico.' END,
       CASE WHEN v.folio IN ('V-2026-00009','V-2026-00015')
            THEN N'El encargado pide avisar con una hora de anticipación: el acceso de servicio se cierra a las 18:00.'
            ELSE NULL END,
       N'Android · app 1.4.2', '1.4.2',
       CASE WHEN v.estado = 'COMPLETADA' THEN SYSDATETIME() ELSE NULL END
FROM dmc.visita v
WHERE v.estado <> 'PROGRAMADA';
GO

-- Trabajos realizados que quedaron registrados en la sección 2 del formulario
INSERT INTO dmc.visita_trabajo (visita_id, trabajo_codigo, detalle, orden)
SELECT v.id, x.trabajo, x.detalle, x.orden
FROM (VALUES
 ('V-2026-00002','CALIBRACION_ANTENAS', N'Ganancia dejada en 66% tras cambiar el cable de antena.', 1),
 ('V-2026-00002','CAMBIO_REPUESTO',     NULL, 2),
 ('V-2026-00004','MANTENCION',          N'Prueba con etiqueta patrón en los tres accesos.', 1),
 ('V-2026-00005','CALIBRACION_ANTENAS', NULL, 1),
 ('V-2026-00005','CAPACITACION',        N'Se explicó al encargado el uso del control de prueba.', 2),
 ('V-2026-00007','MANTENCION',          NULL, 1),
 ('V-2026-00008','INSTALACION_EQUIPO',  N'2 pórticos AM en el acceso principal, fijados a piso.', 1),
 ('V-2026-00008','CALIBRACION_ANTENAS', NULL, 2),
 ('V-2026-00009','RETIRO_EQUIPO',       N'El pórtico quedó en bodega de la tienda por obras del mall.', 1),
 ('V-2026-00011','CALIBRACION_ANTENAS', NULL, 1),
 ('V-2026-00011','MANTENCION',          N'Se revisó el contador antes de dejarlo en observación.', 2),
 ('V-2026-00015','MANTENCION',          NULL, 1)
) AS x(folio, trabajo, detalle, orden)
JOIN dmc.visita v ON v.folio = x.folio;
GO

INSERT INTO dmc.visita_trabajo_subtrabajo (visita_trabajo_id, etiqueta, cantidad, orden)
SELECT w.id, x.etiqueta, x.cantidad, x.orden
FROM (VALUES
 ('V-2026-00002','CALIBRACION_ANTENAS', N'Pórtico 1',1,1),
 ('V-2026-00002','CAMBIO_REPUESTO',     N'Antena completa',1,1),
 ('V-2026-00004','MANTENCION',          N'Prueba con etiqueta patrón',1,1),
 ('V-2026-00005','CALIBRACION_ANTENAS', N'Pórtico 1',1,1),
 ('V-2026-00007','MANTENCION',          N'Limpieza interna',1,1),
 ('V-2026-00007','MANTENCION',          N'Revisión de conexiones',1,2),
 ('V-2026-00007','MANTENCION',          N'Prueba con etiqueta patrón',1,3),
 ('V-2026-00008','INSTALACION_EQUIPO',  N'Pórtico nuevo',2,1),
 ('V-2026-00008','CALIBRACION_ANTENAS', N'Pórtico 1',1,1),
 ('V-2026-00008','CALIBRACION_ANTENAS', N'Pórtico 2',1,2),
 ('V-2026-00009','RETIRO_EQUIPO',       N'Pórtico completo',1,1),
 ('V-2026-00011','CALIBRACION_ANTENAS', N'Antena AM',1,1),
 ('V-2026-00011','MANTENCION',          N'Ajuste de sensibilidad',1,1),
 ('V-2026-00015','MANTENCION',          N'Revisión de conexiones',1,1)
) AS x(folio, trabajo, etiqueta, cantidad, orden)
JOIN dmc.visita v         ON v.folio = x.folio
JOIN dmc.visita_trabajo w ON w.visita_id = v.id AND w.trabajo_codigo = x.trabajo;
GO

-- Firma de la tienda en las visitas cerradas
INSERT INTO dmc.visita_firma (visita_id, rol, nombre, rut, imagen_url, firmado_en)
SELECT v.id, 'TIENDA', v.responsable_nombre, '11.111.111-1',
       CONCAT(N'/media/firmas/', v.folio, N'.png'),
       DATEADD(minute, 65 + DATEDIFF(minute, 0, COALESCE(v.hora_programada, '09:30')),
               CAST(v.fecha_programada AS datetime2(0)))
FROM dmc.visita v WHERE v.estado = 'COMPLETADA';
GO

-- Fotos (3 por visita ejecutada)
INSERT INTO dmc.visita_foto (visita_id, etiqueta, archivo_url, orden, tomada_en)
SELECT v.id, x.etiqueta, CONCAT(N'/media/fotos/', v.folio, N'-', x.i, N'.jpg'), x.i,
       DATEADD(minute, x.i * 11 + DATEDIFF(minute, 0, COALESCE(v.hora_programada, '09:30')),
               CAST(v.fecha_programada AS datetime2(0)))
FROM dmc.visita v
CROSS JOIN (VALUES (1, N'Antes'), (2, N'Durante'), (3, N'Después')) AS x(i, etiqueta)
WHERE v.estado <> 'PROGRAMADA';
GO

-- Problemas levantados en terreno
INSERT INTO dmc.problema (visita_id, tipo_codigo, estado, descripcion, solucion, orden, resuelto_en)
SELECT v.id, x.tipo, x.estado, x.descripcion, x.solucion, x.orden,
       CASE WHEN x.estado = 'RESUELTO'
            THEN DATEADD(minute, 60 + DATEDIFF(minute, 0, COALESCE(v.hora_programada, '09:30')),
                         CAST(v.fecha_programada AS datetime2(0))) END
FROM (VALUES
 ('V-2026-00015','FALSA_ALARMA',      'ABIERTO',   N'Pórtico del acceso oriente suena sin producto cada 10 minutos desde el lunes.', N'Bajar ganancia y reubicar el sensor derecho; queda en revisión con la tienda.',        1),
 ('V-2026-00011','DESCALIBRACION',    'RESUELTO',  N'Antena izquierda con ganancia sobre el rango recomendado.',                     N'Ganancia ajustada a 68% y prueba con etiqueta patrón conforme.',                      1),
 ('V-2026-00011','CONTADOR_FALLA',    'PENDIENTE', N'Contador de personas marca la mitad del flujo real en horario punta.',          N'Se solicitó sensor de recambio a bodega; queda cotizado.',                            2),
 ('V-2026-00010','FALSA_ALARMA',      'ABIERTO',   N'Alarmas falsas en caja 3 cada vez que pasa el carro de reposición.',            N'No se pudo intervenir: la tienda estaba en inventario. Se reagendó.',                 1),
 ('V-2026-00009','PLACAS_DANADAS',    'PENDIENTE', N'Placa Master del pórtico 2 quemada; el equipo no enciende.',                    N'Tarjeta cotizada el 06-08, sin llegada a bodega. La visita queda pendiente.',         1),
 ('V-2026-00009','ANTENA_NO_DETECTA', 'ABIERTO',   N'Pórtico 1 no detecta etiquetas AM a menos de 40 cm.',                           N'Depende del cambio de tarjeta del pórtico 2 para poder recalibrar.',                  2),
 ('V-2026-00008','CABLE_DANADO',      'RESUELTO',  N'Tramo de 40 cm de cable a la vista en zona de cajas, con riesgo de tirón.',     N'Se cubrió con canaleta de 20 mm y se dejó registro fotográfico.',                     1),
 ('V-2026-00008','ANTENA_NO_DETECTA', 'RESUELTO',  N'Antena nueva sin detección tras la instalación.',                               N'Se corrigió el conector del lazo y se validó con etiqueta patrón.',                   2),
 ('V-2026-00007','CONTADOR_FALLA',    'PENDIENTE', N'Contador de personas se reinicia solo dos veces al día.',                       N'Se sugiere cambio de fuente; queda a la espera de aprobación del cliente.',           1),
 ('V-2026-00005','DESCALIBRACION',    'RESUELTO',  N'Pórtico principal descalibrado tras mover el mueble de cajas.',                 N'Recalibrado y fijado; se explicó al encargado el uso del control de prueba.',         1),
 ('V-2026-00005','FALSA_ALARMA',      'ABIERTO',   N'Falsos positivos con carros metálicos en el acceso norte.',                     N'Se sugiere reubicar el pórtico 60 cm hacia el interior; requiere obra menor.',        2),
 ('V-2026-00004','ANTENA_NO_DETECTA', 'ABIERTO',   N'Pórtico del acceso sur no detecta etiquetas blandas.',                          N'Se sugiere cambio de lazo receptor; cotización enviada a coordinación.',              1),
 ('V-2026-00003','SIN_ENERGIA',       'ABIERTO',   N'El pórtico quedó sin alimentación tras el corte de energía del mall.',          N'Requiere que el mall habilite el circuito; visita reagendada.',                       1),
 ('V-2026-00002','ANTENA_NO_DETECTA', 'RESUELTO',  N'Detección intermitente en el pórtico del acceso principal.',                    N'Se reemplazó el cable de antena y se recalibró.',                                     1),
 ('V-2026-00001','PLACAS_DANADAS',    'PENDIENTE', N'Placa del contador con falla intermitente.',                                    N'Repuesto solicitado; se dejó el contador desconectado para evitar datos erróneos.',   1)
) AS x(folio, tipo, estado, descripcion, solucion, orden)
JOIN dmc.visita v ON v.folio = x.folio;
GO

-- Detalle jerárquico del problema (modelo / pieza + cantidad)
INSERT INTO dmc.problema_item (problema_id, etiqueta, cantidad)
SELECT p.id, x.etiqueta, x.cantidad
FROM (VALUES
 ('V-2026-00009','PLACAS_DANADAS', N'Master 9000',1),
 ('V-2026-00009','PLACAS_DANADAS', N'TX MDG',2),
 ('V-2026-00001','PLACAS_DANADAS', N'Slave 9000',1),
 ('V-2026-00015','FALSA_ALARMA',   N'Pórtico 1',1),
 ('V-2026-00011','DESCALIBRACION', N'Pórtico 1',1),
 ('V-2026-00011','CONTADOR_FALLA', N'Sensor',1)
) AS x(folio, tipo, etiqueta, cantidad)
JOIN dmc.visita   v ON v.folio = x.folio
JOIN dmc.problema p ON p.visita_id = v.id AND p.tipo_codigo = x.tipo;
GO

-- Motivos de reagendamiento que dejó el técnico
INSERT INTO dmc.reagendamiento (visita_id, fecha_anterior, hora_anterior, motivo, origen, tecnico_id)
SELECT v.id, v.fecha_programada, v.hora_programada, x.motivo, 'MOVIL', v.tecnico_id
FROM (VALUES
 ('V-2026-00010', N'La tienda estaba en inventario y no dejaron intervenir el acceso principal. Se acordó volver el jueves 20.'),
 ('V-2026-00003', N'Local cerrado por corte de energía del mall; no había cómo energizar el pórtico.'),
 ('V-2026-00001', N'Faltaba la tarjeta electrónica de repuesto; se reprogramó cuando bodega confirme la llegada.')
) AS x(folio, motivo)
JOIN dmc.visita v ON v.folio = x.folio;
GO
