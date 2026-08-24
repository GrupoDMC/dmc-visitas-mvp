#!/usr/bin/env node
// Repone en SQL Server las tres listas de fábrica (motivos, tipos de problema y
// trabajos, con sus subdetalles). Es idempotente: inserta lo que falta,
// reactiva lo desactivado y devuelve los nombres de fábrica a su valor
// original, sin tocar lo que se haya agregado desde el panel.
//
// Es lo primero que hay que correr contra una base recién creada: sin motivos
// no se puede programar una visita, porque dmc.visita tiene una FK contra
// dmc.catalogo_motivo.
//
//   npm run sembrar-catalogos                 # usa .env.development
//   npm run sembrar-catalogos -- --produccion # usa .env.production
//
// El mismo trabajo lo hace el botón "Restaurar catálogo por defecto" del panel
// (Maestros › Checklist), que es la vía normal una vez que la app está arriba.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { env, exit } from "node:process";
import sql from "mssql";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const fabrica = JSON.parse(readFileSync(join(raiz, "lib/data/catalogo-fabrica.json"), "utf8"));

for (const nombre of ["DB_SERVER", "DB_NAME", "DB_USER", "DB_PASSWORD"]) {
  if (!env[nombre]) {
    console.error(
      `Falta ${nombre}. Corre el script con el archivo de entorno cargado, por ejemplo:\n` +
        `  node --env-file=.env.development scripts/sembrar-catalogos.mjs`
    );
    exit(1);
  }
}

const destino = `${env.DB_SERVER}:${env.DB_PORT ?? 1433}/${env.DB_NAME}`;
console.log(`Sembrando catálogos en ${destino}…`);

const pool = await sql.connect({
  server: env.DB_SERVER,
  port: Number(env.DB_PORT ?? 1433),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  options: {
    encrypt: env.DB_ENCRYPT !== "false",
    trustServerCertificate: env.DB_TRUST_SERVER_CERT === "true",
  },
  connectionTimeout: 20_000,
  requestTimeout: 30_000,
});

/** MERGE de una entrada de catálogo por su código. */
async function merge(texto, params) {
  const req = pool.request();
  for (const [nombre, tipo, valor] of params) req.input(nombre, tipo, valor);
  await req.query(texto);
}

for (const m of fabrica.motivos) {
  await merge(
    `MERGE dmc.catalogo_motivo AS destino
     USING (SELECT @codigo AS codigo) AS origen ON destino.codigo = origen.codigo
     WHEN MATCHED THEN UPDATE SET nombre = @nombre, orden = @orden, activo = 1
     WHEN NOT MATCHED THEN INSERT (codigo, nombre, orden) VALUES (@codigo, @nombre, @orden);`,
    [
      ["codigo", sql.VarChar(40), m.codigo],
      ["nombre", sql.NVarChar(80), m.nombre],
      ["orden", sql.SmallInt, m.orden],
    ]
  );
}

for (const p of fabrica.problemas) {
  await merge(
    `MERGE dmc.catalogo_problema AS destino
     USING (SELECT @codigo AS codigo) AS origen ON destino.codigo = origen.codigo
     WHEN MATCHED THEN UPDATE SET nombre = @nombre, grupo_label = @grupo, singular = @singular,
                                  ayuda = @ayuda, orden = @orden, activo = 1
     WHEN NOT MATCHED THEN INSERT (codigo, nombre, grupo_label, singular, ayuda, orden)
                           VALUES (@codigo, @nombre, @grupo, @singular, @ayuda, @orden);`,
    [
      ["codigo", sql.VarChar(40), p.codigo],
      ["nombre", sql.NVarChar(80), p.nombre],
      ["grupo", sql.NVarChar(60), p.grupoLabel],
      ["singular", sql.NVarChar(30), p.singular],
      ["ayuda", sql.NVarChar(160), p.ayuda],
      ["orden", sql.SmallInt, p.orden],
    ]
  );
  for (const [i, etiqueta] of p.opciones.entries()) {
    await merge(
      `MERGE dmc.catalogo_problema_opcion AS destino
       USING (SELECT c.id AS problema_id, @etiqueta AS etiqueta
                FROM dmc.catalogo_problema c WHERE c.codigo = @codigo) AS origen
          ON destino.problema_id = origen.problema_id AND destino.etiqueta = origen.etiqueta
       WHEN MATCHED THEN UPDATE SET orden = @orden, activo = 1
       WHEN NOT MATCHED THEN INSERT (problema_id, etiqueta, orden)
                             VALUES (origen.problema_id, origen.etiqueta, @orden);`,
      [
        ["codigo", sql.VarChar(40), p.codigo],
        ["etiqueta", sql.NVarChar(80), etiqueta],
        ["orden", sql.SmallInt, i + 1],
      ]
    );
  }
}

for (const t of fabrica.trabajos) {
  await merge(
    `MERGE dmc.catalogo_trabajo AS destino
     USING (SELECT @codigo AS codigo) AS origen ON destino.codigo = origen.codigo
     WHEN MATCHED THEN UPDATE SET nombre = @nombre, grupo_label = @grupo, singular = @singular,
                                  orden = @orden, activo = 1
     WHEN NOT MATCHED THEN INSERT (codigo, nombre, grupo_label, singular, orden)
                           VALUES (@codigo, @nombre, @grupo, @singular, @orden);`,
    [
      ["codigo", sql.VarChar(40), t.codigo],
      ["nombre", sql.NVarChar(80), t.nombre],
      ["grupo", sql.NVarChar(60), t.grupoLabel],
      ["singular", sql.NVarChar(30), t.singular],
      ["orden", sql.SmallInt, t.orden],
    ]
  );
  for (const [i, etiqueta] of t.subtrabajos.entries()) {
    await merge(
      `MERGE dmc.catalogo_trabajo_subtrabajo AS destino
       USING (SELECT c.id AS trabajo_id, @etiqueta AS etiqueta
                FROM dmc.catalogo_trabajo c WHERE c.codigo = @codigo) AS origen
          ON destino.trabajo_id = origen.trabajo_id AND destino.etiqueta = origen.etiqueta
       WHEN MATCHED THEN UPDATE SET orden = @orden, activo = 1
       WHEN NOT MATCHED THEN INSERT (trabajo_id, etiqueta, orden)
                             VALUES (origen.trabajo_id, origen.etiqueta, @orden);`,
      [
        ["codigo", sql.VarChar(40), t.codigo],
        ["etiqueta", sql.NVarChar(80), etiqueta],
        ["orden", sql.SmallInt, i + 1],
      ]
    );
  }
}

const { recordset } = await pool.request().query(
  `SELECT (SELECT COUNT(*) FROM dmc.catalogo_motivo             WHERE activo = 1) AS motivos,
          (SELECT COUNT(*) FROM dmc.catalogo_problema           WHERE activo = 1) AS problemas,
          (SELECT COUNT(*) FROM dmc.catalogo_problema_opcion    WHERE activo = 1) AS opciones,
          (SELECT COUNT(*) FROM dmc.catalogo_trabajo            WHERE activo = 1) AS trabajos,
          (SELECT COUNT(*) FROM dmc.catalogo_trabajo_subtrabajo WHERE activo = 1) AS subtrabajos`
);
const c = recordset[0];
console.log(
  `Listo. Activos: ${c.motivos} motivos · ${c.problemas} tipos de problema (${c.opciones} subdetalles) · ` +
    `${c.trabajos} trabajos (${c.subtrabajos} subtrabajos).`
);

await pool.close();
