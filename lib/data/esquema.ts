// Versión del esquema — dmc.schema_version (migración 025).
//
// La app da por hecho que la base tiene aplicadas todas las migraciones hasta
// VERSION_ESQUEMA: no hay caminos alternativos para una base atrasada. Cada
// migración nueva registra su número en dmc.schema_version y sube esta
// constante en el mismo commit.

/** La versión que este código necesita. */
export const VERSION_ESQUEMA = 26;

/** La versión aplicada en la base: la mayor registrada. Para una consulta. */
export const SQL_VERSION_ESQUEMA = `(SELECT MAX(version) FROM dmc.schema_version)`;
