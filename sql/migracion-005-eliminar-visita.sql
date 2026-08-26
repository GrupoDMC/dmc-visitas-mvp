/* =====================================================================
   DMC Contingencia · migración 005 — eliminar visita (borrado lógico)
   Microsoft SQL Server 2022 · esquema dmc

   Qué agrega, y para qué:

     1. dmc.visita.activo ................ una visita de prueba (cliente de
                                           prueba, ensayo del técnico) queda
                                           dando vueltas en el panel y en los
                                           gráficos para siempre si no hay
                                           forma de sacarla. "Eliminar" no
                                           borra la fila —el acta, las fotos,
                                           el video, la firma siguen ahí—: solo
                                           la deja con activo = 0. El panel, el
                                           celular del técnico y los gráficos
                                           de coordinación solo muestran y
                                           cuentan las que están en activo = 1.
     2. dmc.visita_eliminacion ........... quién eliminó cada visita, cuándo y
                                           en qué estado estaba. Es aparte de
                                           dmc.visita_estado_historial porque
                                           esto no es un cambio de estado: es
                                           sacar la visita de circulación.
     3. Las vistas de apoyo (sección 10 del DDL) pasan a excluir las
        inactivas, para que una visita eliminada no seed cuente en
        v_carga_tecnico, v_cumplimiento_dia, v_sucursal_fallas,
        v_visita_realizada, v_problema_abierto ni v_visita_cancelada_admin.

   Es idempotente: se puede correr varias veces sin romper nada.

   Uso:  sqlcmd -S servidor -d DMC_Contingencia -i sql/migracion-005-eliminar-visita.sql
   ===================================================================== */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

USE DMC_Contingencia;
GO

/* =====================================================================
   1. dmc.visita.activo
   ===================================================================== */
IF COL_LENGTH('dmc.visita', 'activo') IS NULL
    ALTER TABLE dmc.visita ADD activo bit NOT NULL CONSTRAINT df_visita_activo DEFAULT (1);
GO

-- Filtra por activo casi siempre junto al folio o al técnico, que ya tienen
-- su propio índice; esto solo ayuda al listado completo del panel.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_visita_activo' AND object_id = OBJECT_ID('dmc.visita'))
    CREATE INDEX ix_visita_activo ON dmc.visita (activo) INCLUDE (fecha_programada, estado);
GO

/* =====================================================================
   2. dmc.visita_eliminacion — auditoría del borrado lógico
   ---------------------------------------------------------------------
   El folio va duplicado a propósito: la fila de dmc.visita sigue existiendo
   (es borrado lógico), pero si algún día se necesita leer esta bitácora sin
   depender del join, el folio ya está ahí.
   ===================================================================== */
IF OBJECT_ID('dmc.visita_eliminacion', 'U') IS NULL
BEGIN
    CREATE TABLE dmc.visita_eliminacion (
        id            bigint       IDENTITY(1,1) NOT NULL,
        visita_id     bigint       NOT NULL,
        folio         varchar(16)  NOT NULL,
        estado_previo varchar(16)  NOT NULL,
        usuario_id    bigint       NOT NULL,
        eliminado_en  datetime2(0) NOT NULL CONSTRAINT df_visita_elim_en DEFAULT (SYSDATETIME()),
        CONSTRAINT pk_visita_eliminacion PRIMARY KEY (id),
        CONSTRAINT fk_visita_elim_visita  FOREIGN KEY (visita_id)  REFERENCES dmc.visita  (id),
        CONSTRAINT fk_visita_elim_usuario FOREIGN KEY (usuario_id) REFERENCES dmc.usuario (id)
    );

    CREATE INDEX ix_visita_elim_visita ON dmc.visita_eliminacion (visita_id);
END
GO

/* =====================================================================
   3. Vistas de apoyo: fuera las inactivas
   ===================================================================== */
CREATE OR ALTER VIEW dmc.v_problema_abierto AS
SELECT p.id, p.tipo_codigo, cp.nombre AS tipo, p.estado, p.descripcion, p.solucion,
       v.folio, v.fecha_programada, cm.nombre AS motivo,
       s.nombre AS sucursal, s.comuna, c.nombre_fantasia AS cliente,
       t.nombre_completo AS tecnico,
       CAST(CASE WHEN EXISTS (SELECT 1 FROM dmc.problema_visita_resolucion r WHERE r.problema_id = p.id)
                 THEN 1 ELSE 0 END AS bit) AS agendado
FROM dmc.problema p
JOIN dmc.visita   v  ON v.id  = p.visita_id
JOIN dmc.sucursal s  ON s.id  = v.sucursal_id
JOIN dmc.cliente  c  ON c.id  = v.cliente_id
JOIN dmc.tecnico  t  ON t.id  = v.tecnico_id
JOIN dmc.catalogo_problema cp ON cp.codigo = p.tipo_codigo
JOIN dmc.catalogo_motivo   cm ON cm.codigo = v.motivo_codigo
WHERE p.estado <> 'RESUELTO' AND v.activo = 1;
GO

CREATE OR ALTER VIEW dmc.v_carga_tecnico AS
SELECT t.id AS tecnico_id, t.nombre_completo AS tecnico, v.fecha_programada,
       COUNT(*) AS programadas,
       SUM(CASE WHEN v.estado = 'COMPLETADA' THEN 1 ELSE 0 END) AS realizadas,
       SUM(CASE WHEN v.estado IN ('REAGENDADA','PENDIENTE','CANCELADA','CANCELADA_ADMIN')
                THEN 1 ELSE 0 END) AS no_realizadas
FROM dmc.visita v
JOIN dmc.tecnico t ON t.id = v.tecnico_id
WHERE v.activo = 1
GROUP BY t.id, t.nombre_completo, v.fecha_programada;
GO

CREATE OR ALTER VIEW dmc.v_cumplimiento_dia AS
SELECT fecha_programada,
       COUNT(*) AS programadas,
       SUM(CASE WHEN estado = 'COMPLETADA' THEN 1 ELSE 0 END) AS cerradas,
       CAST(ROUND(100.0 * SUM(CASE WHEN estado = 'COMPLETADA' THEN 1 ELSE 0 END)
                  / NULLIF(COUNT(*), 0), 0) AS int) AS pct
FROM dmc.visita
WHERE activo = 1
GROUP BY fecha_programada;
GO

CREATE OR ALTER VIEW dmc.v_sucursal_fallas AS
SELECT s.id AS sucursal_id, s.nombre AS sucursal, s.comuna, c.nombre_fantasia AS cliente,
       COUNT(p.id) AS total,
       SUM(CASE WHEN p.estado <> 'RESUELTO' THEN 1 ELSE 0 END) AS sin_cerrar
FROM dmc.problema p
JOIN dmc.visita   v ON v.id = p.visita_id
JOIN dmc.sucursal s ON s.id = v.sucursal_id
JOIN dmc.cliente  c ON c.id = v.cliente_id
WHERE v.activo = 1
GROUP BY s.id, s.nombre, s.comuna, c.nombre_fantasia;
GO

CREATE OR ALTER VIEW dmc.v_visita_realizada AS
SELECT v.id AS visita_id, v.folio, v.tecnico_id, t.nombre_completo AS tecnico,
       v.fecha_programada, v.estado,
       c.nombre_fantasia AS cliente, s.nombre AS sucursal, s.direccion, s.comuna,
       cm.nombre AS motivo,
       e.hora_inicio, e.hora_termino, e.responsable_nombre, e.observaciones,
       DATEDIFF(minute, e.hora_inicio, e.hora_termino) AS duracion_min,
       (SELECT COUNT(*) FROM dmc.problema p WHERE p.visita_id = v.id) AS problemas,
       (SELECT COUNT(*) FROM dmc.visita_trabajo w WHERE w.visita_id = v.id) AS trabajos
FROM dmc.visita v
JOIN dmc.tecnico  t ON t.id = v.tecnico_id
JOIN dmc.sucursal s ON s.id = v.sucursal_id
JOIN dmc.cliente  c ON c.id = v.cliente_id
JOIN dmc.catalogo_motivo cm ON cm.codigo = v.motivo_codigo
LEFT JOIN dmc.visita_ejecucion e ON e.visita_id = v.id
WHERE v.estado IN ('COMPLETADA','PENDIENTE') AND v.activo = 1;
GO

CREATE OR ALTER VIEW dmc.v_visita_cancelada_admin AS
SELECT v.id AS visita_id, v.folio, v.fecha_programada, v.tecnico_id,
       t.nombre_completo AS tecnico,
       s.nombre AS sucursal, c.nombre_fantasia AS cliente,
       h.motivo, h.ocurrido_en AS cancelada_en,
       h.usuario_id AS cancelada_por, u.email AS cancelada_por_email
FROM dmc.visita v
JOIN dmc.tecnico  t ON t.id = v.tecnico_id
JOIN dmc.sucursal s ON s.id = v.sucursal_id
JOIN dmc.cliente  c ON c.id = v.cliente_id
CROSS APPLY (SELECT TOP 1 x.motivo, x.ocurrido_en, x.usuario_id
               FROM dmc.visita_estado_historial x
              WHERE x.visita_id = v.id AND x.estado = 'CANCELADA_ADMIN'
              ORDER BY x.ocurrido_en DESC, x.id DESC) h
LEFT JOIN dmc.usuario u ON u.id = h.usuario_id
WHERE v.estado = 'CANCELADA_ADMIN' AND v.activo = 1;
GO

PRINT 'Migracion 005 aplicada.';
GO
