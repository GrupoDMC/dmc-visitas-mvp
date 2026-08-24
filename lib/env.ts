import "server-only";

// Lectura y validación de las variables de entorno del servidor.
// Nada de aquí puede llevar prefijo NEXT_PUBLIC_: son secretos de servidor.

export const enProduccion = process.env.NODE_ENV === "production";

/** Devuelve la variable ya recortada, o undefined si está vacía o solo espacios. */
export function env(nombre: string): string | undefined {
  const valor = process.env[nombre]?.trim();
  return valor ? valor : undefined;
}

export function envObligatoria(nombre: string, motivo: string): string {
  const valor = env(nombre);
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}. ${motivo}`);
  }
  return valor;
}

export function envBooleana(nombre: string, porDefecto: boolean): boolean {
  const valor = env(nombre)?.toLowerCase();
  if (valor === undefined) return porDefecto;
  return valor === "true" || valor === "1";
}

export function envNumero(nombre: string, porDefecto: number): number {
  const valor = env(nombre);
  if (valor === undefined) return porDefecto;
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${nombre} debe ser un número positivo; llegó "${valor}".`);
  }
  return n;
}

/** true cuando hay datos suficientes para abrir el pool de SQL Server. */
export function hayConexionSql(): boolean {
  return Boolean(env("DB_SERVER") && env("DB_NAME") && env("DB_USER") && env("DB_PASSWORD"));
}

/**
 * La aplicación ya no tiene modo de demostración: todo, incluido el login, sale
 * de SQL Server. Se comprueba al arrancar cualquier consulta para que la falta
 * de una variable se vea como un error explícito y no como una pantalla vacía.
 */
export function exigirConexionSql(): void {
  if (hayConexionSql()) return;
  throw new Error(
    "Faltan las credenciales de SQL Server. Define DB_SERVER, DB_NAME, DB_USER y DB_PASSWORD " +
      "en el entorno del despliegue (en Vercel: Project → Settings → Environment Variables)."
  );
}
